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

/** Cache the ad group per campaign so a batch resolves it once, not per item. */
async function getAdGroup(target, cache) {
  const key = `${target.customerId}:${target.googleCampaignId}`;
  if (cache?.has(key)) return cache.get(key);

  const resource = await googleAdsService.resolveAdGroup(
    target.customerId,
    target.googleCampaignId,
    target.refreshToken,
    target.loginCustomerId
  );
  cache?.set(key, resource);
  return resource;
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
    const adGroupResource = keywordDoc.isNegative ? null : await getAdGroup(target, cache);

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
    return { syncState: 'failed', syncError: err.message.slice(0, 300), googleResourceName: null };
  }
}

/** Push one ad copy as a Responsive Search Ad. */
async function pushAd(adDoc, target, cache) {
  if (!target.ok) {
    return { syncState: 'local-only', syncError: target.reason, googleResourceName: null };
  }

  try {
    const adGroupResource = await getAdGroup(target, cache);

    const resourceName = await googleAdsService.createResponsiveSearchAd(
      target.customerId,
      adGroupResource,
      {
        headlines: [adDoc.headline1, adDoc.headline2, adDoc.headline3].filter(Boolean),
        descriptions: [adDoc.description1, adDoc.description2].filter(Boolean),
        finalUrl: adDoc.finalUrl,
      },
      { refreshToken: target.refreshToken },
      target.loginCustomerId
    );

    logger.info(`[PUSH] Ad copy "${adDoc.headline1}" -> ${resourceName}`);
    return { syncState: 'synced', googleResourceName: resourceName || null, syncError: null };
  } catch (err) {
    logger.error(`[PUSH] Ad copy "${adDoc.headline1}" failed: ${err.message}`);
    return { syncState: 'failed', syncError: err.message.slice(0, 300), googleResourceName: null };
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
