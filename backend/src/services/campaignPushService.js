const User = require('../models/User');
const googleAdsService = require('./googleAdsService');
const logger = require('../utils/logger');

/**
 * Pushes locally-authored keywords and ad copies into Google Ads.
 *
 * The dashboard writes them to its own database first — that must always
 * succeed, so an operator never loses typed work to a Google API failure — and
 * the push is a second step whose outcome is recorded on the record itself.
 * Before this existed, everything added here stayed local and never appeared
 * in Google Ads at all.
 */

/**
 * Everything needed to talk to Google Ads about one campaign, or a reason why
 * we can't. Never throws: callers use the reason to mark the record
 * 'local-only' rather than failing the request.
 */
async function resolveTarget(campaign, reqUser) {
  const account = campaign.account;

  if (!campaign.googleCampaignId) {
    return { ok: false, reason: 'Campaign is not linked to a Google Ads campaign yet' };
  }
  if (!account?.googleAdsCustomerId) {
    return { ok: false, reason: 'Account is not linked to a Google Ads customer id' };
  }

  // The caller's own connection, falling back to the campaign owner's so an
  // admin acting on someone else's campaign still works.
  let refreshToken = null;
  const self = await User.findById(reqUser.id).select('googleAdsConfig');
  refreshToken = self?.googleAdsConfig?.refreshToken || null;

  if (!refreshToken) {
    const ownerId = campaign.owner || campaign.createdBy || account.owner;
    if (ownerId) {
      const owner = await User.findById(ownerId).select('googleAdsConfig');
      refreshToken = owner?.googleAdsConfig?.refreshToken || null;
    }
  }
  if (!refreshToken) {
    return { ok: false, reason: 'Google Ads is not connected — connect it under Settings' };
  }

  return {
    ok: true,
    customerId: account.googleAdsCustomerId,
    googleCampaignId: campaign.googleCampaignId,
    // Every call for a client account must carry the MCC it lives under.
    loginCustomerId: campaign.sourceMccId || account.sourceMccId || null,
    refreshToken,
  };
}

/**
 * Cache the ad group so a batch resolves it once, not per item.
 *
 * Keyed by final URL as well as campaign, because ads for different websites
 * must land in different ad groups — caching on the campaign alone would send
 * the whole batch to whichever website happened to be pushed first.
 *
 * The entry also tracks how many more ads the group takes. Google caps an ad
 * group at three ads, so a batch larger than that has to move on to the next
 * group; without this the cache would keep handing back a full one and every
 * ad past the third would fail with RESOURCE_LIMIT.
 */
async function getAdGroup(target, cache, finalUrl) {
  const key = `${target.customerId}:${target.googleCampaignId}:${finalUrl || ''}`;
  const cached = cache?.get(key);
  if (cached && cached.remaining > 0) return cached;

  const resolved = await googleAdsService.resolveAdGroup(
    target.customerId,
    target.googleCampaignId,
    target.refreshToken,
    target.loginCustomerId,
    finalUrl
  );
  cache?.set(key, resolved);
  return resolved;
}

/**
 * Push one keyword. Returns the fields to persist — the caller decides when to
 * save, so a failed push still leaves a usable local record explaining why.
 */
async function pushKeyword(keywordDoc, target, cache) {
  if (!target.ok) {
    return { syncState: 'local-only', syncError: target.reason, googleResourceName: null };
  }

  try {
    // Negatives go on the campaign, so they need no ad group.
    const adGroupResource = keywordDoc.isNegative ? null : (await getAdGroup(target, cache)).resourceName;

    const resourceName = await googleAdsService.pushKeyword({
      customerId: target.customerId,
      adGroupResource,
      googleCampaignId: target.googleCampaignId,
      keyword: keywordDoc.keyword,
      matchType: keywordDoc.matchType,
      isNegative: keywordDoc.isNegative,
      refreshToken: target.refreshToken,
      loginCustomerId: target.loginCustomerId,
    });

    logger.info(`[PUSH] Keyword "${keywordDoc.keyword}" -> ${resourceName}`);
    return { syncState: 'synced', googleResourceName: resourceName, syncError: null };
  } catch (err) {
    logger.error(`[PUSH] Keyword "${keywordDoc.keyword}" failed: ${err.message}`);
    return { syncState: 'failed', syncError: err.message.slice(0, 600), googleResourceName: null };
  }
}

/** Push one ad copy as a Responsive Search Ad. */
async function pushAd(adDoc, target, cache) {
  if (!target.ok) {
    return { syncState: 'local-only', syncError: target.reason, googleResourceName: null };
  }

  try {
    // Grouped by destination: Google disapproves an ad whose website differs
    // from the rest of its ad group.
    const adGroup = await getAdGroup(target, cache, adDoc.finalUrl);

    const resourceName = await googleAdsService.createResponsiveSearchAd(
      target.customerId,
      adGroup.resourceName,
      {
        headlines: [adDoc.headline1, adDoc.headline2, adDoc.headline3].filter(Boolean),
        descriptions: [adDoc.description1, adDoc.description2].filter(Boolean),
        finalUrl: adDoc.finalUrl,
      },
      { refreshToken: target.refreshToken },
      target.loginCustomerId
    );

    // One slot of this ad group is now taken; the next ad in the batch moves
    // on once it runs out.
    adGroup.remaining -= 1;

    logger.info(`[PUSH] Ad copy "${adDoc.headline1}" -> ${resourceName}`);
    return { syncState: 'synced', googleResourceName: resourceName || null, syncError: null };
  } catch (err) {
    // The cached ad group may be why this failed — if Google says it is full,
    // reusing it would fail every remaining ad in the batch the same way.
    if (/RESOURCE_LIMIT/.test(err.message)) {
      cache?.delete(`${target.customerId}:${target.googleCampaignId}:${adDoc.finalUrl || ''}`);
    }
    logger.error(`[PUSH] Ad copy "${adDoc.headline1}" failed: ${err.message}`);
    return { syncState: 'failed', syncError: err.message.slice(0, 600), googleResourceName: null };
  }
}

/**
 * Push everything for a campaign that isn't in Google Ads yet.
 *
 * Records created before pushing existed sit at syncState 'pending' — never
 * attempted rather than rejected — and re-typing them would be the only other
 * way to get them live. Already-synced records are skipped so this is safe to
 * run repeatedly and won't duplicate anything in the account.
 */
async function pushCampaignContent(campaign, reqUser, { Keyword, Ad }) {
  const target = await resolveTarget(campaign, reqUser);
  const cache = new Map();

  const notSynced = { campaign: campaign._id, syncState: { $ne: 'synced' } };
  const [keywords, ads] = await Promise.all([
    Keyword.find(notSynced),
    Ad.find(notSynced),
  ]);

  let pushed = 0;
  const errors = [];

  for (const kw of keywords) {
    const sync = await pushKeyword(kw, target, cache);
    Object.assign(kw, sync);
    await kw.save();
    if (sync.syncState === 'synced') pushed += 1;
    else errors.push(`keyword "${kw.keyword}" — ${sync.syncError}`);
  }

  for (const ad of ads) {
    const sync = await pushAd(ad, target, cache);
    Object.assign(ad, sync);
    await ad.save();
    if (sync.syncState === 'synced') pushed += 1;
    else errors.push(`ad "${ad.headline1}" — ${sync.syncError}`);
  }

  return { attempted: keywords.length + ads.length, pushed, errors };
}

module.exports = { resolveTarget, pushKeyword, pushAd, pushCampaignContent };
