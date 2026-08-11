const Account = require('../models/Account');
const User = require('../models/User');
const Campaign = require('../models/Campaign');
const Performance = require('../models/Performance');
const Report = require('../models/Report');
const GoogleAdsCache = require('../models/GoogleAdsCache');
const AlertHistory = require('../models/AlertHistory');
const CampaignMetrics = require('../models/CampaignMetrics');
const AlertRules = require('../models/AlertRules');
const googleAdsService = require('../services/googleAdsService');
const campaignService = require('../services/campaignService');
const { sendStatusChangeEmail, sendAccountCreatedEmail } = require('../services/emailService');
const notificationService = require('../services/notificationService');
const { logActivity } = require('../middleware/activityLogger');
const env = require('../config/env');
const logger = require('../utils/logger');

async function getUserCredentials(userId) {
  const user = await User.findById(userId).select('googleAdsConfig');
  if (user?.googleAdsConfig?.isConfigured) {
    return user.googleAdsConfig;
  }
  return {};
}

// Two-role model: admins operate on everyone's records, users only on their
// own. Spread this into a Mongo filter to scope a query accordingly.
function ownershipFilter(reqUser) {
  return reqUser.role === 'admin' ? {} : { createdBy: reqUser.id };
}

/**
 * Scope a query to what the caller is allowed to see.
 *
 * An admin sees everything. A user sees every record belonging to the MCCs on
 * their own Google Ads connection — so two media buyers sharing an MCC share
 * its accounts and campaigns — plus anything they created themselves that has
 * no MCC yet (a local draft, or a provisioning attempt that failed before an
 * MCC was chosen). With no MCCs configured this degrades to "own records
 * only", which is the safe direction.
 */
async function mccScopeFilter(reqUser) {
  if (reqUser.role === 'admin') return {};

  const user = await User.findById(reqUser.id).select('googleAdsConfig.managerAccountIds');
  const mccIds = (user?.googleAdsConfig?.managerAccountIds || []).map(String).filter(Boolean);

  if (!mccIds.length) return { createdBy: reqUser.id };

  return {
    $or: [
      { sourceMccId: { $in: mccIds } },
      { sourceMccId: { $in: [null, ''] }, createdBy: reqUser.id },
    ],
  };
}

/**
 * Fail fast when live provisioning is attempted with no MCC to create under.
 * Development stays permissive so the flow can be exercised without a real
 * Google Ads connection.
 */
async function assertMccSelectedForProduction({ requestedMccId, configuredMccIds, refreshToken }) {
  if (env.nodeEnv !== 'production') return;
  if (requestedMccId) return;
  if ((configuredMccIds || []).filter(Boolean).length) return;

  // Best-effort: a discovery failure counts as "no MCC", so the caller gets
  // the actionable message rather than a raw Google Ads transport error.
  const discovered = await googleAdsService.findAllMccIds(refreshToken).catch(() => []);
  if (discovered.length) return;

  const err = new Error(googleAdsService.NO_MCC_MESSAGE);
  err.statusCode = 400;
  throw err;
}

/**
 * Which refresh token should a request targeting a specific Google Ads
 * customer account use? A user always uses their own. An admin operating on
 * an account synced by ANOTHER user gets that owner's token, so the admin
 * can view/manage every user's campaigns without having direct Google Ads
 * access to them.
 */
async function resolveRefreshTokenForCustomer(reqUser, customerId) {
  const own = await User.findById(reqUser.id).select('googleAdsConfig');
  const ownToken = own?.googleAdsConfig?.refreshToken || null;
  if (reqUser.role !== 'admin') return ownToken;

  // Prefer the admin's own token when the account is in their own sync.
  if (ownToken) {
    const inOwnCache = await GoogleAdsCache.findOne({
      userId: reqUser.id, type: 'accounts', 'data.customerId': customerId,
    }).select('_id');
    if (inOwnCache) return ownToken;
  }

  // Otherwise use the token of whichever user synced this account. Several
  // users may have cached the same account (e.g. a stale cache left by a
  // now-disconnected user), so check every match and take the first owner
  // that still has a working connection.
  const ownerCaches = await GoogleAdsCache.find({
    type: 'accounts', 'data.customerId': customerId,
  }).select('userId');
  for (const cache of ownerCaches) {
    const owner = await User.findById(cache.userId).select('googleAdsConfig');
    if (owner?.googleAdsConfig?.refreshToken) return owner.googleAdsConfig.refreshToken;
  }
  return ownToken;
}

// Users whose Google Ads is currently connected. Only their synced data may
// surface anywhere - a disconnect can leave stale cache docs behind (older
// deploys didn't clear them), and those must not show as live data.
async function getConnectedUserIds() {
  const users = await User.find({ 'googleAdsConfig.refreshToken': { $nin: [null, ''] } }).select('_id');
  return users.map((u) => u._id);
}

// Merge the synced Google Ads cache of every CONNECTED user (admin view).
// Returns the combined rows plus the most recent sync time across users.
async function getMergedCache(type) {
  const connectedIds = await getConnectedUserIds();
  const caches = await GoogleAdsCache.find({ type, userId: { $in: connectedIds } });
  const data = caches.flatMap((c) => c.data || []);
  const lastSynced = caches.reduce(
    (latest, c) => (c.lastSynced && (!latest || c.lastSynced > latest) ? c.lastSynced : latest),
    null
  );
  return { data, lastSynced };
}

/**
 * Background 7-day performance backfill, fired (not awaited) right after a
 * new account's warm-up campaign goes live, so the dashboard has something
 * to show without the client waiting on it.
 */
async function generateInitialPerformance(account, credentials) {
  const campaigns = await Campaign.find({
    account: account._id,
    status: 'active',
    googleCampaignId: { $ne: null },
  });

  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const dateFrom = sevenDaysAgo.toISOString().split('T')[0];
  const dateTo = today.toISOString().split('T')[0];

  for (const campaign of campaigns) {
    try {
      const perfData = await googleAdsService.getCampaignPerformance(
        account.googleAdsCustomerId,
        campaign.googleCampaignId,
        dateFrom,
        dateTo,
        credentials
      );

      for (const dayData of perfData) {
        await Performance.findOneAndUpdate(
          {
            account: account._id,
            campaign: campaign._id,
            date: new Date(dayData.date),
          },
          {
            impressions: dayData.impressions,
            clicks: dayData.clicks,
            spend: dayData.spend,
            ctr: dayData.ctr,
            avgCpc: dayData.avgCpc,
            conversions: dayData.conversions,
          },
          { upsert: true, new: true }
        );
      }

      console.log(`[INIT] Generated performance data for campaign ${campaign.campaignName}`);
    } catch (error) {
      console.error(`[INIT] Error generating performance for campaign ${campaign._id}:`, error.message);
    }
  }

  // Generate initial daily report
  const performances = await Performance.find({
    account: account._id,
    date: { $gte: sevenDaysAgo, $lte: today },
  });

  if (performances.length > 0) {
    const metrics = performances.reduce(
      (acc, p) => {
        acc.totalImpressions += p.impressions;
        acc.totalClicks += p.clicks;
        acc.totalSpend += p.spend;
        acc.totalConversions += p.conversions;
        return acc;
      },
      { totalImpressions: 0, totalClicks: 0, totalSpend: 0, avgCtr: 0, avgCpc: 0, totalConversions: 0 }
    );

    if (metrics.totalImpressions > 0) {
      metrics.avgCtr = (metrics.totalClicks / metrics.totalImpressions) * 100;
    }
    if (metrics.totalClicks > 0) {
      metrics.avgCpc = metrics.totalSpend / metrics.totalClicks;
    }

    await Report.create({
      account: account._id,
      reportType: 'daily',
      dateFrom: sevenDaysAgo,
      dateTo: today,
      metrics,
      status: 'ready',
      generatedBy: 'auto',
      createdBy: account.createdBy,
    });

    console.log(`[INIT] Generated initial report for ${account.accountName}`);
  }
}

/**
 * Create an Account record, provision it on Google Ads, spin up and start its
 * warm-up campaign at the operator's daily budget, then move the account
 * through pending -> created -> warmup.
 *
 * The Account row is written first and always survives: if Google Ads rejects
 * the request the account is marked 'failed' with the reason, rather than
 * being lost or left stuck in an intermediate state. That means the record
 * (including the budgets and invite email entered here) is still editable and
 * retryable from the UI.
 */
exports.createAccount = async (req, res, next) => {
  try {
    const {
      accountName, clientName, clientEmail, industry, website, campaignTemplate,
      currency, timeZone, country, inviteEmail, dailyBudget, billingBudget, mccId,
    } = req.body;

    // On a live deployment an account must belong to a known MCC. Locally this
    // is allowed, so the flow can be exercised without a Google connection.
    const creator = await User.findById(req.user.id).select('googleAdsConfig');
    await assertMccSelectedForProduction({
      requestedMccId: mccId,
      configuredMccIds: creator?.googleAdsConfig?.managerAccountIds,
      refreshToken: creator?.googleAdsConfig?.refreshToken,
    });

    const account = await Account.create({
      accountName,
      clientName,
      clientEmail,
      industry,
      website,
      country: country || undefined,
      // Google emails this address the account access invitation.
      inviteEmail: inviteEmail || '',
      currency: currency || undefined,
      timeZone: timeZone || undefined,
      // Operator-set budgets — `|| undefined` so a blank field falls back to
      // the schema default instead of writing NaN.
      dailyBudget: Number(dailyBudget) > 0 ? Number(dailyBudget) : undefined,
      billingBudget: Number(billingBudget) > 0 ? Number(billingBudget) : undefined,
      campaignTemplate: campaignTemplate || 'warmup',
      status: 'pending',
      // Ownership drives every per-user scoped query (dashboard, warming,
      // campaigns), so both fields are set at creation.
      owner: req.user._id,
      createdBy: req.user.id,
    });

    const credentials = await getUserCredentials(req.user.id);

    try {
      const customerId = await googleAdsService.createAccount(account, credentials);
      account.googleAdsCustomerId = customerId;
      account.status = 'created';
      await account.save();

      // The warm-up campaign starts automatically, at this account's budget.
      await campaignService.createWarmupCampaign(account, credentials);
      account.status = 'warmup';
      account.warmupStartDate = new Date();
      await account.save();

      // Best-effort notification - never blocks or fails the request.
      const notifyTarget = await User.findById(req.user.id).select('email');
      if (notifyTarget) {
        sendStatusChangeEmail(notifyTarget.email, account, 'pending', 'warmup').catch(() => {});
      }

      // Fire-and-forget 7-day performance backfill - not awaited.
      generateInitialPerformance(account, credentials).catch((err) =>
        console.error('[INIT] Background performance generation failed:', err.message)
      );

      return res.status(201).json(account);
    } catch (apiError) {
      const errorDetails = apiError.errors?.[0]?.message || apiError.message;
      logger.warn(`Google Ads provisioning failed for "${account.accountName}": ${errorDetails}`);
      account.status = 'failed';
      account.notes = `API Error: ${errorDetails}. Manual setup required.`;
      await account.save();
      return res.status(502).json({ message: `Account setup failed: ${errorDetails}`, account });
    }
  } catch (error) {
    next(error);
  }
};

exports.syncAccount = async (req, res, next) => {
  try {
    const account = await Account.findOne({ _id: req.params.id, createdBy: req.user.id });
    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const credentials = await getUserCredentials(req.user.id);
    await generateInitialPerformance(account, credentials);

    res.json({ message: 'Performance data synced and report generated' });
  } catch (error) {
    next(error);
  }
};

exports.getAllAccounts = async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const filter = await mccScopeFilter(req.user);
    if (status) filter.status = status;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { accountName: { $regex: escaped, $options: 'i' } },
        { clientName: { $regex: escaped, $options: 'i' } },
      ];
    }

    const accounts = await Account.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(accounts);
  } catch (error) {
    next(error);
  }
};

exports.getAccount = async (req, res, next) => {
  try {
    const account = await Account.findOne({ _id: req.params.id, ...(await mccScopeFilter(req.user)) })
      .populate('createdBy', 'name email');
    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }
    res.json(account);
  } catch (error) {
    next(error);
  }
};

exports.updateAccount = async (req, res, next) => {
  try {
    const oldAccount = await Account.findOne({ _id: req.params.id, ...ownershipFilter(req.user) });
    if (!oldAccount) {
      return res.status(404).json({ message: 'Account not found' });
    }
    const oldStatus = oldAccount.status;

    // Explicit allowlist - keeps a caller from smuggling `createdBy`,
    // `googleAdsCustomerId`, or other internally-managed fields into the
    // update via extra body keys.
    const { accountName, clientName, clientEmail, industry, website, currency, timeZone, notes, campaignTemplate, status } = req.body;
    const updates = { accountName, clientName, clientEmail, industry, website, currency, timeZone, notes, campaignTemplate, status };
    Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);

    const account = await Account.findOneAndUpdate(
      { _id: req.params.id, ...ownershipFilter(req.user) },
      updates,
      { new: true, runValidators: true }
    );

    if (req.body.status && req.body.status !== oldStatus) {
      const user = await User.findById(req.user.id).select('email');
      if (user) {
        sendStatusChangeEmail(user.email, account, oldStatus, req.body.status).catch(() => {});
      }
    }

    res.json(account);
  } catch (error) {
    next(error);
  }
};

exports.deleteAccount = async (req, res, next) => {
  try {
    const account = await Account.findOneAndDelete({ _id: req.params.id, ...ownershipFilter(req.user) });
    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }
    res.json({ message: 'Account deleted' });
  } catch (error) {
    next(error);
  }
};

exports.getGoogleAdsAccounts = async (req, res, next) => {
  try {
    // Admin sees every user's synced accounts; a user sees only their own.
    if (req.user.role === 'admin') {
      const merged = await getMergedCache('accounts');
      if (merged.data.length > 0) {
        return res.json({ data: merged.data, lastSynced: merged.lastSynced });
      }
      return res.json({ data: [], lastSynced: null, message: 'No data yet. Click Sync to fetch from Google Ads.' });
    }

    // A disconnected user's leftover cache must not show as live data.
    const me = await User.findById(req.user.id).select('googleAdsConfig');
    if (!me?.googleAdsConfig?.refreshToken) {
      return res.json({ data: [], lastSynced: null, message: 'Google Ads not connected. Connect from Settings.' });
    }

    const cached = await GoogleAdsCache.findOne({ userId: req.user.id, type: 'accounts' });
    if (cached && cached.data.length > 0) {
      return res.json({ data: cached.data, lastSynced: cached.lastSynced });
    }
    return res.json({ data: [], lastSynced: null, message: 'No data yet. Click Sync to fetch from Google Ads.' });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/accounts/google-ads/campaigns
 *
 * Every campaign from the synced snapshot, across all of the caller's linked
 * accounts. The per-account live fetch already existed, but nothing exposed
 * the whole cached set, so the Campaigns page had no way to show the campaigns
 * that actually belong to the linked MCC.
 */
exports.getSyncedCampaigns = async (req, res, next) => {
  try {
    if (req.user.role === 'admin') {
      const merged = await getMergedCache('campaigns');
      return res.json({ data: merged.data, lastSynced: merged.lastSynced });
    }

    // A disconnected user's leftover cache must not show as live data.
    const me = await User.findById(req.user.id).select('googleAdsConfig');
    if (!me?.googleAdsConfig?.refreshToken) {
      return res.json({ data: [], lastSynced: null, message: 'Google Ads not connected. Connect from Settings.' });
    }

    const cached = await GoogleAdsCache.findOne({ userId: req.user.id, type: 'campaigns' });
    return res.json({ data: cached?.data || [], lastSynced: cached?.lastSynced || null });
  } catch (error) {
    next(error);
  }
};

exports.getGoogleAdsCampaigns = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const rawMcc = req.query.mccId;
    const mccId = rawMcc && rawMcc !== 'null' && rawMcc !== 'undefined' ? rawMcc : null;
    const refreshToken = await resolveRefreshTokenForCustomer(req.user, customerId);

    if (!refreshToken) {
      return res.status(400).json({ message: 'Google Ads not connected.' });
    }

    const campaigns = await googleAdsService.fetchCampaignsForAccount(customerId, refreshToken, mccId || undefined);
    res.json(campaigns);
  } catch (error) {
    next(error);
  }
};

exports.getCampaignDevicePerformance = async (req, res, next) => {
  try {
    const { customerId, campaignId } = req.params;
    if (!NUMERIC_ID.test(campaignId)) return res.status(400).json({ message: 'Invalid campaign ID' });
    const rawMcc = req.query.mccId;
    const mccId = rawMcc && rawMcc !== 'null' && rawMcc !== 'undefined' ? rawMcc : null;
    const refreshToken = await resolveRefreshTokenForCustomer(req.user, customerId);
    if (!refreshToken) return res.status(400).json({ message: 'Google Ads not connected.' });
    const data = await googleAdsService.fetchCampaignDevicePerformance(customerId, campaignId, refreshToken, mccId || undefined);
    res.json(data);
  } catch (error) { next(error); }
};

exports.getCampaignGeoPerformance = async (req, res, next) => {
  try {
    const { customerId, campaignId } = req.params;
    if (!NUMERIC_ID.test(campaignId)) return res.status(400).json({ message: 'Invalid campaign ID' });
    const rawMcc = req.query.mccId;
    const mccId = rawMcc && rawMcc !== 'null' && rawMcc !== 'undefined' ? rawMcc : null;
    const refreshToken = await resolveRefreshTokenForCustomer(req.user, customerId);
    if (!refreshToken) return res.status(400).json({ message: 'Google Ads not connected.' });
    const data = await googleAdsService.fetchCampaignGeoPerformance(customerId, campaignId, refreshToken, mccId || undefined);
    res.json(data);
  } catch (error) { next(error); }
};

exports.getCampaignAdCopies = async (req, res, next) => {
  try {
    const { customerId, campaignId } = req.params;
    if (!NUMERIC_ID.test(campaignId)) return res.status(400).json({ message: 'Invalid campaign ID' });
    const rawMcc = req.query.mccId;
    const mccId = rawMcc && rawMcc !== 'null' && rawMcc !== 'undefined' ? rawMcc : null;
    const refreshToken = await resolveRefreshTokenForCustomer(req.user, customerId);
    if (!refreshToken) return res.status(400).json({ message: 'Google Ads not connected.' });
    const data = await googleAdsService.fetchCampaignAdCopies(customerId, campaignId, refreshToken, mccId || undefined);
    res.json(data);
  } catch (error) { next(error); }
};

exports.getCampaignAudiencePerformance = async (req, res, next) => {
  try {
    const { customerId, campaignId } = req.params;
    if (!NUMERIC_ID.test(campaignId)) return res.status(400).json({ message: 'Invalid campaign ID' });
    const rawMcc = req.query.mccId;
    const mccId = rawMcc && rawMcc !== 'null' && rawMcc !== 'undefined' ? rawMcc : null;
    const refreshToken = await resolveRefreshTokenForCustomer(req.user, customerId);
    if (!refreshToken) return res.status(400).json({ message: 'Google Ads not connected.' });
    const data = await googleAdsService.fetchCampaignAudiencePerformance(customerId, campaignId, refreshToken, mccId || undefined);
    res.json(data);
  } catch (error) { next(error); }
};

exports.getCampaignDemographics = async (req, res, next) => {
  try {
    const { customerId, campaignId } = req.params;
    if (!NUMERIC_ID.test(campaignId)) return res.status(400).json({ message: 'Invalid campaign ID' });
    const rawMcc = req.query.mccId;
    const mccId = rawMcc && rawMcc !== 'null' && rawMcc !== 'undefined' ? rawMcc : null;
    const refreshToken = await resolveRefreshTokenForCustomer(req.user, customerId);
    if (!refreshToken) return res.status(400).json({ message: 'Google Ads not connected.' });
    const data = await googleAdsService.fetchCampaignDemographics(customerId, campaignId, refreshToken, mccId || undefined);
    res.json(data);
  } catch (error) { next(error); }
};

exports.getCampaignExclusions = async (req, res, next) => {
  try {
    const { customerId, campaignId } = req.params;
    if (!NUMERIC_ID.test(campaignId)) return res.status(400).json({ message: 'Invalid campaign ID' });
    const rawMcc = req.query.mccId;
    const mccId = rawMcc && rawMcc !== 'null' && rawMcc !== 'undefined' ? rawMcc : null;
    const refreshToken = await resolveRefreshTokenForCustomer(req.user, customerId);
    if (!refreshToken) return res.status(400).json({ message: 'Google Ads not connected.' });
    const data = await googleAdsService.fetchCampaignExclusions(customerId, campaignId, refreshToken, mccId || undefined);
    res.json(data);
  } catch (error) { next(error); }
};

exports.getCampaignKeywords = async (req, res, next) => {
  try {
    const { customerId, campaignId } = req.params;
    if (!NUMERIC_ID.test(campaignId)) return res.status(400).json({ message: 'Invalid campaign ID' });
    const rawMcc = req.query.mccId;
    const mccId = rawMcc && rawMcc !== 'null' && rawMcc !== 'undefined' ? rawMcc : null;
    const refreshToken = await resolveRefreshTokenForCustomer(req.user, customerId);
    if (!refreshToken) return res.status(400).json({ message: 'Google Ads not connected.' });
    const data = await googleAdsService.fetchCampaignKeywords(customerId, campaignId, refreshToken, mccId || undefined);
    res.json(data);
  } catch (error) { next(error); }
};

const NUMERIC_ID = /^\d+$/;
const VALID_ACTIONS = ['edit', 'remove', 'pause', 'enable'];
const VALID_DEVICE_TYPES = ['MOBILE', 'DESKTOP', 'TABLET', 'CONNECTED_TV'];

/**
 * GET /api/accounts/google-ads/:customerId/search-terms
 *
 * The search terms an account actually served against. Optionally narrowed to
 * one campaign via ?campaignId=, and to a window via ?days= (7/14/30).
 */
exports.getSearchTerms = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const { campaignId, days } = req.query;
    if (campaignId && !NUMERIC_ID.test(campaignId)) {
      return res.status(400).json({ message: 'Invalid campaign ID' });
    }

    const rawMcc = req.query.mccId;
    const mccId = rawMcc && rawMcc !== 'null' && rawMcc !== 'undefined' ? rawMcc : null;
    const refreshToken = await resolveRefreshTokenForCustomer(req.user, customerId);
    if (!refreshToken) return res.status(400).json({ message: 'Google Ads not connected.' });

    const data = await googleAdsService.fetchSearchTerms(customerId, refreshToken, mccId || undefined, {
      days,
      campaignId: campaignId || null,
    });
    res.json(data);
  } catch (error) { next(error); }
};

/**
 * POST /api/accounts/google-ads/:customerId/campaigns/:campaignId/negative-keywords
 *
 * Exclude one or more terms at campaign level, so the exclusion covers every
 * ad group in the campaign.
 */
exports.addNegativeKeywords = async (req, res, next) => {
  try {
    const { customerId, campaignId } = req.params;
    if (!NUMERIC_ID.test(campaignId)) return res.status(400).json({ message: 'Invalid campaign ID' });

    const incoming = Array.isArray(req.body?.keywords) ? req.body.keywords : [];
    const keywords = incoming
      .map((k) => (typeof k === 'string' ? { text: k } : k))
      .filter((k) => k && typeof k.text === 'string' && k.text.trim())
      .map((k) => ({ text: k.text.trim(), matchType: k.matchType || 'EXACT' }));

    if (!keywords.length) {
      return res.status(400).json({ message: 'Provide at least one keyword' });
    }

    const rawMcc = req.query.mccId;
    const mccId = rawMcc && rawMcc !== 'null' && rawMcc !== 'undefined' ? rawMcc : null;
    const refreshToken = await resolveRefreshTokenForCustomer(req.user, customerId);
    if (!refreshToken) return res.status(400).json({ message: 'Google Ads not connected.' });

    const result = await googleAdsService.addNegativeKeywords(
      customerId, campaignId, keywords, refreshToken, mccId || undefined
    );

    await logActivity(
      req.user.id, 'negative_keywords_added', 'campaign', null,
      `${keywords.length} negative keyword(s) added to campaign ${campaignId}`, req.ip
    );

    res.json({
      success: true,
      message: `${keywords.length} negative keyword(s) added`,
      added: keywords.length,
      result,
    });
  } catch (error) {
    logger.error(`Negative keyword mutate failed: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.mutateCampaignKeyword = async (req, res, next) => {
  try {
    const { customerId, adGroupId, criterionId } = req.params;
    const { action, updates } = req.body;
    if (!NUMERIC_ID.test(customerId) || !NUMERIC_ID.test(adGroupId) || !NUMERIC_ID.test(criterionId)) {
      return res.status(400).json({ message: 'Invalid ID format — must be numeric.' });
    }
    if (!VALID_ACTIONS.includes(action)) {
      return res.status(400).json({ message: `Invalid action: ${action}` });
    }
    const rawMcc = req.query.mccId;
    const mccId = rawMcc && rawMcc !== 'null' && rawMcc !== 'undefined' ? rawMcc : null;
    if (mccId && !NUMERIC_ID.test(mccId)) return res.status(400).json({ message: 'Invalid mccId.' });
    const refreshToken = await resolveRefreshTokenForCustomer(req.user, customerId);
    if (!refreshToken) return res.status(400).json({ message: 'Google Ads not connected.' });
    const result = await googleAdsService.mutateCampaignKeyword(customerId, adGroupId, criterionId, action, refreshToken, mccId || undefined, updates);
    res.json({ success: true, result });
  } catch (error) { next(error); }
};

exports.mutateCampaignAd = async (req, res, next) => {
  try {
    const { customerId, adGroupId, adId } = req.params;
    const { action, updates } = req.body;
    if (!NUMERIC_ID.test(customerId) || !NUMERIC_ID.test(adGroupId) || !NUMERIC_ID.test(adId)) {
      return res.status(400).json({ message: 'Invalid ID format — must be numeric.' });
    }
    if (!VALID_ACTIONS.includes(action)) {
      return res.status(400).json({ message: `Invalid action: ${action}` });
    }
    const rawMcc = req.query.mccId;
    const mccId = rawMcc && rawMcc !== 'null' && rawMcc !== 'undefined' ? rawMcc : null;
    if (mccId && !NUMERIC_ID.test(mccId)) return res.status(400).json({ message: 'Invalid mccId.' });
    const refreshToken = await resolveRefreshTokenForCustomer(req.user, customerId);
    if (!refreshToken) return res.status(400).json({ message: 'Google Ads not connected.' });
    const result = await googleAdsService.mutateCampaignAd(customerId, adGroupId, adId, action, refreshToken, mccId || undefined, updates);
    res.json({ success: true, result });
  } catch (error) { next(error); }
};

exports.mutateCampaignDevice = async (req, res, next) => {
  try {
    const { customerId, campaignId } = req.params;
    const { deviceType, bidModifier, action } = req.body;
    if (!NUMERIC_ID.test(customerId) || !NUMERIC_ID.test(campaignId)) {
      return res.status(400).json({ message: 'Invalid ID format — must be numeric.' });
    }
    if (!VALID_DEVICE_TYPES.includes(deviceType)) {
      return res.status(400).json({ message: `Invalid device type: ${deviceType}` });
    }
    const rawMcc = req.query.mccId;
    const mccId = rawMcc && rawMcc !== 'null' && rawMcc !== 'undefined' ? rawMcc : null;
    if (mccId && !NUMERIC_ID.test(mccId)) return res.status(400).json({ message: 'Invalid mccId.' });
    const refreshToken = await resolveRefreshTokenForCustomer(req.user, customerId);
    if (!refreshToken) return res.status(400).json({ message: 'Google Ads not connected.' });
    const result = await googleAdsService.mutateCampaignDevice(customerId, campaignId, deviceType, bidModifier, action, refreshToken, mccId || undefined);
    res.json({ success: true, result });
  } catch (error) { next(error); }
};

exports.syncGoogleAds = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('googleAdsConfig');
    const refreshToken = user?.googleAdsConfig?.refreshToken;

    if (!refreshToken) {
      return res.status(400).json({ message: 'Google Ads not connected.' });
    }

    res.json({ message: 'Sync started. Data will appear shortly.' });

    // Background sync — response already sent
    (async () => {
      try {
        const accessibleIds = await googleAdsService.listAccessibleCustomers(refreshToken);
        const allAccounts = [];
        const allCampaigns = [];

        for (const aid of accessibleIds) {
          let clients = [];
          try {
            clients = await googleAdsService.fetchClientAccounts(aid, refreshToken);
          } catch (err) {
            logger.error(`fetchClientAccounts failed for ${aid}: ${err.message}`);
          }

          if (clients.length > 0) {
            for (const client of clients) {
              allAccounts.push({
                customerId: client.customerId,
                name: client.name,
                managerAccountId: aid,
                isManager: false,
              });
            }

            const BATCH = 10;
            for (let i = 0; i < clients.length; i += BATCH) {
              const batch = clients.slice(i, i + BATCH);
              const results = await Promise.allSettled(
                batch.map((c) =>
                  googleAdsService.fetchCampaignsForAccount(c.customerId, refreshToken, aid)
                    .then((camps) => {
                      camps.forEach((camp) => { camp.accountName = c.name; });
                      return camps;
                    })
                )
              );
              for (const r of results) {
                if (r.status === 'fulfilled' && r.value) allCampaigns.push(...r.value);
              }
            }
          } else {
            allAccounts.push({ customerId: aid, name: 'Account ' + aid, managerAccountId: null, isManager: true });
          }
        }

        await GoogleAdsCache.findOneAndUpdate(
          { userId: req.user.id, type: 'accounts' },
          { data: allAccounts, lastSynced: new Date() },
          { upsert: true }
        );
        await GoogleAdsCache.findOneAndUpdate(
          { userId: req.user.id, type: 'campaigns' },
          { data: allCampaigns, lastSynced: new Date() },
          { upsert: true }
        );

        logger.info(`Sync complete: ${allAccounts.length} accounts, ${allCampaigns.length} campaigns`);
      } catch (err) {
        logger.error(`Background sync failed: ${err.message}`);
      }
    })();
  } catch (error) {
    next(error);
  }
};

/**
 * Helper: create a single Google Ads client account, trying every MCC the
 * caller has available, then optionally send an email invite via
 * CustomerUserAccessInvitation and spin up warm-up campaigns.
 *
 * `dailyBudget` and `billingBudget` are always supplied by the caller — the
 * budget an account runs at is an operator decision, never generated.
 *
 * Returns { resourceName, newCustomerId, mccId, invited, ... }.
 */
async function createSingleGoogleAdsAccount({
  mccId,
  configuredMccIds,
  accountName,
  currencyCode,
  timeZone,
  emailAddress,
  accessRole,
  refreshToken,
  campaignsPerAccount,
  geoTargets,
  dailyBudget,
  campaignBudget,
  billingBudget,
}) {
  // Walks the candidate MCC list and returns the one that accepted the
  // account, so every later call for this customer can send the right
  // login-customer-id.
  const created = await googleAdsService.createClientAccount(refreshToken, {
    name: accountName,
    currencyCode: currencyCode || 'USD',
    timeZone: timeZone || 'Asia/Kolkata',
    mccId,
    configuredMccIds,
  });

  const newCustomerId = created.customerId;
  const usedMccId = created.mccId;
  const resourceName = created.resourceName;
  logger.info(`Account created: resourceName=${resourceName}, newCustomerId=${newCustomerId}, mcc=${usedMccId}`);

  // Auto-link MCC billing to new account.
  if (newCustomerId) {
    try {
      const billingResult = await googleAdsService.setupBillingForClient(newCustomerId, usedMccId, refreshToken);
      if (billingResult) {
        logger.info(`[BILLING] Billing linked for ${newCustomerId}`);
      }
    } catch (billingErr) {
      logger.warn(`[BILLING] Failed for ${newCustomerId}: ${billingErr.message}`);
    }

    // Apply the operator's account-level spending limit.
    if (billingBudget != null && billingBudget !== '') {
      try {
        await googleAdsService.setupAccountBilling(newCustomerId, billingBudget, refreshToken, usedMccId);
        logger.info(`[BILLING] Spending limit ${billingBudget} applied to ${newCustomerId}`);
      } catch (limitErr) {
        logger.warn(`[BILLING] Spending limit failed for ${newCustomerId}: ${limitErr.message}`);
      }
    }
  }

  // The Google Ads access invitation — Google itself emails the address, and
  // accepting it grants ADMIN access to the new account.
  let invited = false;
  let inviteResponse = null;
  if (emailAddress && newCustomerId) {
    try {
      inviteResponse = await googleAdsService.sendAccountInvite(newCustomerId, emailAddress, accessRole || 'ADMIN', refreshToken, usedMccId);
      invited = true;
      logger.info(`Invite sent to ${emailAddress} for account ${newCustomerId}: ${JSON.stringify(inviteResponse)}`);
    } catch (inviteErr) {
      logger.error(`Invite failed for ${newCustomerId}: ${inviteErr.message}`);
      inviteResponse = { error: inviteErr.message };
    }

    // Separate courtesy email from this dashboard's own SMTP sender, with the
    // new account's details.
    try {
      await sendAccountCreatedEmail(emailAddress, {
        accountName,
        customerId: newCustomerId,
        currency: currencyCode || 'USD',
        timeZone: timeZone || 'Asia/Kolkata',
      });
      logger.info(`[EMAIL] Account creation email sent to ${emailAddress} for ${newCustomerId}`);
    } catch (emailErr) {
      logger.warn(`[EMAIL] Failed to send creation email to ${emailAddress}: ${emailErr.message}`);
    }
  }

  // Auto-create warm-up campaigns at the requested budget. `campaignBudget` is
  // the per-campaign daily spend; it falls back to the account's own daily
  // budget when the operator left it blank.
  const numCampaigns = Math.min(Math.max(Number(campaignsPerAccount) || 1, 1), 10);
  const budgetPerCampaign =
    Number(campaignBudget) > 0 ? Number(campaignBudget)
      : Number(dailyBudget) > 0 ? Number(dailyBudget)
        : 1;
  let campaignsCreatedCount = 0;
  const createdCampaigns = [];

  if (newCustomerId) {
    const creds = { refreshToken };
    for (let c = 1; c <= numCampaigns; c++) {
      try {
        const label = numCampaigns > 1 ? `Warmup_${accountName}_${c}` : `Warmup_${accountName}`;

        const budgetResource = await googleAdsService.createCampaignBudget(
          newCustomerId, Math.round(budgetPerCampaign * 1_000_000), creds, usedMccId
        );

        const campaignResource = await googleAdsService.createCampaign(
          newCustomerId,
          { name: label, networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false } },
          budgetResource, creds, usedMccId
        );

        const adGroupResource = await googleAdsService.createAdGroup(
          newCustomerId, campaignResource,
          { name: `Ad Group ${c}`, cpcBidMicros: 500000 },
          creds, usedMccId
        );

        await googleAdsService.createKeywords(
          newCustomerId, adGroupResource,
          ['brand awareness', 'digital marketing', 'online advertising'],
          creds, usedMccId
        );

        await googleAdsService.createResponsiveSearchAd(
          newCustomerId, adGroupResource,
          {
            headlines: ['Best Digital Marketing', 'Grow Your Business', 'Online Advertising'],
            descriptions: ['Reach new customers with targeted ads.', 'Start your campaign today.'],
            finalUrl: 'https://example.com',
          },
          creds, usedMccId
        );

        if (geoTargets?.length) {
          await googleAdsService.createCampaignCriteria(newCustomerId, campaignResource, geoTargets, creds, usedMccId);
        }

        await googleAdsService.enableCampaign(newCustomerId, campaignResource, creds, usedMccId);
        campaignsCreatedCount++;
        createdCampaigns.push({
          name: label,
          googleCampaignId: String(campaignResource).split('/').pop() || null,
          budgetResource,
        });
        logger.info(`[AUTO-CAMPAIGN] Campaign ${c}/${numCampaigns} created for ${newCustomerId} at ${budgetPerCampaign}/day`);
      } catch (campErr) {
        logger.error(`[AUTO-CAMPAIGN] Campaign ${c}/${numCampaigns} failed for ${newCustomerId}: ${campErr.message}`);
      }
    }
  }

  return {
    resourceName,
    newCustomerId,
    mccId: usedMccId,
    invited,
    inviteResponse,
    campaignCreated: campaignsCreatedCount > 0,
    campaignsCreatedCount,
    createdCampaigns,
    // What each warm-up campaign was actually created at.
    campaignBudget: budgetPerCampaign,
  };
}

/**
 * Persist an account provisioned through the Google Ads flow, plus a local
 * Campaign document per warm-up campaign that was actually created.
 *
 * Without this the provisioned accounts existed only in Google Ads and in the
 * synced cache — they would not appear on the Accounts, Warming, Keywords,
 * Ad Copies or Publish pages, all of which read local documents.
 */
async function persistProvisionedAccount(result, { userId, accountName, currencyCode, timeZone, emailAddress, country, dailyBudget, billingBudget }) {
  const account = await Account.create({
    accountName,
    googleAdsCustomerId: result.newCustomerId || null,
    sourceMccId: result.mccId || null,
    inviteEmail: emailAddress || '',
    clientEmail: emailAddress || '',
    currency: currencyCode || 'USD',
    timeZone: timeZone || 'Asia/Kolkata',
    country: country || 'India',
    // Account-level daily budget, distinct from the per-campaign budget below.
    dailyBudget: Number(dailyBudget) > 0 ? Number(dailyBudget) : result.campaignBudget,
    billingBudget: billingBudget != null && billingBudget !== '' ? Number(billingBudget) : undefined,
    status: result.newCustomerId ? 'created' : 'failed',
    owner: userId,
    createdBy: userId,
  });

  for (const camp of result.createdCampaigns || []) {
    await Campaign.create({
      campaignName: camp.name,
      // Omit rather than store null — the unique index only covers real ids.
      ...(camp.googleCampaignId && { googleCampaignId: camp.googleCampaignId }),
      account: account._id,
      sourceMccId: result.mccId || null,
      dailyBudget: result.campaignBudget,
      status: 'active',
      country: [country || 'India'],
      device: ['all'],
      owner: userId,
      createdBy: userId,
    });
  }

  return account;
}

exports.createGoogleAdsAccount = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('googleAdsConfig');
    const refreshToken = user?.googleAdsConfig?.refreshToken;

    if (!refreshToken) {
      return res.status(400).json({ message: 'Google Ads not connected.' });
    }

    const {
      accountName, currencyCode, timeZone, emailAddress, accessRole, geoTargets,
      mccId, country, dailyBudget, campaignBudget, billingBudget, campaignsPerAccount,
    } = req.body;

    if (!accountName) {
      return res.status(400).json({ message: 'Account name is required.' });
    }

    await assertMccSelectedForProduction({
      requestedMccId: mccId,
      configuredMccIds: user?.googleAdsConfig?.managerAccountIds,
      refreshToken,
    });

    const result = await createSingleGoogleAdsAccount({
      // An explicitly chosen MCC wins; otherwise every MCC saved on this
      // user's connection is tried in turn.
      mccId,
      configuredMccIds: user?.googleAdsConfig?.managerAccountIds,
      accountName, currencyCode, timeZone, emailAddress, accessRole, refreshToken, geoTargets,
      campaignsPerAccount,
      dailyBudget,
      campaignBudget,
      billingBudget,
    });

    const account = await persistProvisionedAccount(result, {
      userId: req.user.id,
      accountName, currencyCode, timeZone, emailAddress, country, dailyBudget, billingBudget,
    });

    let message = 'Account created successfully!';
    if (emailAddress && result.invited) {
      message = `Account created and invite sent to ${emailAddress}!`;
    } else if (emailAddress) {
      // Say why. "Invite could not be sent" on its own left no way to tell a
      // rejected address from a transient failure.
      const reason = describeInviteError(result.inviteResponse?.error || 'unknown error', emailAddress);
      message = `Account created, but the invite to ${emailAddress} failed — ${reason}`;
    }
    if (result.campaignsCreatedCount > 0) {
      message += ` ${result.campaignsCreatedCount} warm-up campaign(s) live at ${result.campaignBudget}/day.`;
    }

    res.status(201).json({
      message,
      resourceName: result.resourceName,
      newCustomerId: result.newCustomerId,
      mccId: result.mccId,
      invited: result.invited,
      // Structured so the UI can flag a failed invite rather than reporting
      // the whole creation as a plain success.
      inviteFailed: Boolean(emailAddress && !result.invited),
      inviteError: result.inviteResponse?.error || null,
      inviteResponse: result.inviteResponse,
      campaignCreated: result.campaignCreated,
      account,
    });
  } catch (error) {
    next(error);
  }
};

exports.bulkCreateGoogleAdsAccounts = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('googleAdsConfig');
    const refreshToken = user?.googleAdsConfig?.refreshToken;

    if (!refreshToken) {
      return res.status(400).json({ message: 'Google Ads not connected.' });
    }

    const {
      count, prefix, currencyCode, timeZone, emailAddress, accessRole, campaignsPerAccount, geoTargets,
      mccId, country, dailyBudget, campaignBudget, billingBudget,
    } = req.body;
    const numAccounts = Math.min(Math.max(Number(count) || 1, 1), 50);
    const namePrefix = prefix || 'Account';
    const configuredMccIds = user?.googleAdsConfig?.managerAccountIds;
    const userId = req.user.id;

    // Checked before responding — a bulk run is fire-and-forget, so a missing
    // MCC has to surface now rather than only in the logs.
    await assertMccSelectedForProduction({ requestedMccId: mccId, configuredMccIds, refreshToken });

    res.json({ message: `Creating ${numAccounts} accounts (${campaignsPerAccount || 1} campaign(s) each) in background...`, total: numAccounts });

    (async () => {
      let created = 0;
      let invited = 0;
      let totalCampaigns = 0;
      let failed = 0;
      // A bulk run answers before it starts, so anything that goes wrong has
      // to reach the operator some other way than the HTTP response.
      const inviteErrors = [];

      for (let i = 1; i <= numAccounts; i++) {
        const accountName = `${namePrefix} ${i}`;
        try {
          const result = await createSingleGoogleAdsAccount({
            mccId,
            configuredMccIds,
            accountName,
            currencyCode, timeZone, emailAddress, accessRole, refreshToken,
            campaignsPerAccount, geoTargets,
            dailyBudget, campaignBudget, billingBudget,
          });

          await persistProvisionedAccount(result, {
            userId, accountName, currencyCode, timeZone, emailAddress, country, dailyBudget, billingBudget,
          });

          created++;
          if (result.invited) invited++;
          else if (emailAddress) {
            inviteErrors.push(`${accountName}: ${result.inviteResponse?.error || 'unknown error'}`);
          }
          totalCampaigns += result.campaignsCreatedCount || 0;
          logger.info(`Bulk: created "${accountName}" (${result.newCustomerId} @ MCC ${result.mccId}) — ${result.campaignsCreatedCount} campaign(s)${result.invited ? ' + invite' : ''}`);
        } catch (err) {
          failed++;
          logger.error(`Bulk: failed "${accountName}": ${err.message}`);
        }

        if (i < numAccounts) await new Promise((r) => setTimeout(r, 500));
      }

      logger.info(`Bulk done: ${created} created, ${invited} invited, ${totalCampaigns} campaigns, ${failed} failed out of ${numAccounts}`);

      // Report the outcome in-app. Without this a run where every invite was
      // rejected looked identical to a fully successful one.
      const summary = `${created}/${numAccounts} account(s) created, ${totalCampaigns} campaign(s)`;
      if (inviteErrors.length || failed) {
        const detail = inviteErrors.length
          ? ` ${inviteErrors.length} invite(s) failed — ${describeInviteError(inviteErrors[0].split(': ').slice(1).join(': '), emailAddress)}`
          : '';
        await notificationService.create(
          userId,
          'Bulk account creation finished with problems',
          `${summary}. ${failed} failed.${detail}`,
          'error'
        );
      } else {
        await notificationService.create(userId, 'Bulk account creation complete', summary, 'success');
      }
    })();
  } catch (error) {
    next(error);
  }
};

/**
 * Turn a raw Google Ads invitation error into something an operator can act
 * on. Google returns these as opaque enum codes inside the message.
 */
function describeInviteError(message, emailAddress) {
  if (message.includes('ALREADY_HAS_PENDING_INVITATION')) {
    return `An invitation is already pending for ${emailAddress}. Ask them to check their email (including spam).`;
  }
  if (message.includes('ALREADY_HAS_ACCESS')) {
    return `${emailAddress} already has access to this account.`;
  }
  if (message.includes('INVALID_EMAIL')) {
    return `${emailAddress} is not a valid Google account.`;
  }
  return message;
}

/**
 * POST /api/accounts/google-ads/invite — invite an email address to a Google
 * Ads customer id directly.
 */
exports.sendInvite = async (req, res, next) => {
  // Read outside the try so the catch can still name the address in its
  // error message.
  const { customerId, emailAddress, accessRole, mccId: clientMccId } = req.body;
  try {
    if (!customerId || !emailAddress) {
      return res.status(400).json({ success: false, message: 'customerId and emailAddress are required' });
    }
    const user = await User.findById(req.user.id).select('googleAdsConfig');
    const refreshToken = user?.googleAdsConfig?.refreshToken;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Google Ads not connected' });
    }

    // Prefer the MCC the caller named, then the account's own recorded MCC,
    // then the user's configured list, then discovery.
    let mccId = clientMccId;
    if (!mccId) {
      const account = await Account.findOne({ googleAdsCustomerId: String(customerId) }).select('sourceMccId');
      mccId = account?.sourceMccId || null;
    }
    if (!mccId) {
      const [candidate] = await googleAdsService.resolveMccIds({
        refreshToken,
        configuredMccIds: user?.googleAdsConfig?.managerAccountIds,
      });
      mccId = candidate;
    }
    if (!mccId) {
      return res.status(400).json({ success: false, message: 'No MCC found' });
    }

    const result = await googleAdsService.sendAccountInvite(customerId, emailAddress, accessRole || 'ADMIN', refreshToken, mccId);
    res.json({ success: true, message: `Invitation sent to ${emailAddress}`, data: result });
  } catch (error) {
    logger.error(`Invite error: ${error.message}`);
    res.status(400).json({ success: false, message: describeInviteError(error.message, emailAddress) });
  }
};

/**
 * GET /api/accounts/:id/invitations
 *
 * What Google actually holds for this account: pending invitations and users
 * who already have access. Answers "did my invite go out?" with Google's own
 * record instead of a guess.
 */
exports.getAccountAccess = async (req, res, next) => {
  try {
    const account = await Account.findOne({ _id: req.params.id, ...(await mccScopeFilter(req.user)) });
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }
    if (!account.googleAdsCustomerId) {
      return res.status(400).json({ success: false, message: 'Account is not linked to Google Ads yet' });
    }

    // An admin may be looking at an account synced by another user, so fall
    // back to the owner's connection.
    let tokenUser = await User.findById(req.user.id).select('googleAdsConfig');
    if (!tokenUser?.googleAdsConfig?.refreshToken && account.owner) {
      tokenUser = await User.findById(account.owner).select('googleAdsConfig');
    }
    const refreshToken = tokenUser?.googleAdsConfig?.refreshToken;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Google Ads not connected' });
    }

    const data = await googleAdsService.fetchAccountAccess(
      account.googleAdsCustomerId,
      refreshToken,
      account.sourceMccId
    );

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/accounts/:id/invite — invite against a stored account record,
 * defaulting to the address saved on it. Uses the MCC the account was
 * actually created under, and falls back to the owner's Google connection
 * when an admin triggers the invite for someone else's account.
 */
exports.sendAccountInvite = async (req, res, next) => {
  let email;
  try {
    const account = await Account.findOne({ _id: req.params.id, ...ownershipFilter(req.user) });
    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    email = req.body?.email || req.body?.emailAddress || account.inviteEmail;
    if (!email) {
      return res.status(400).json({ success: false, message: 'No invite email set for this account' });
    }
    if (!account.googleAdsCustomerId) {
      return res.status(400).json({ success: false, message: 'Account is not linked to Google Ads yet' });
    }

    let tokenUser = await User.findById(req.user.id).select('googleAdsConfig');
    if (!tokenUser?.googleAdsConfig?.refreshToken && account.owner) {
      tokenUser = await User.findById(account.owner).select('googleAdsConfig');
    }
    const refreshToken = tokenUser?.googleAdsConfig?.refreshToken;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'No connected Google Ads user available to send the invitation' });
    }

    await googleAdsService.sendAccountInvite(
      account.googleAdsCustomerId,
      email,
      req.body?.accessRole || 'ADMIN',
      refreshToken,
      account.sourceMccId
    );

    // Remember the address so the next invite for this account defaults to it.
    if (email !== account.inviteEmail) {
      account.inviteEmail = email;
      await account.save();
    }

    await logActivity(req.user.id, 'invite_sent', 'account', account._id, `Google Ads invite sent to ${email} for ${account.accountName}`, req.ip);
    res.json({ success: true, message: `Invitation sent to ${email}` });
  } catch (error) {
    logger.error(`Account invite error: ${error.message}`);
    res.status(400).json({ success: false, message: describeInviteError(error.message, email) });
  }
};

exports.getDashboardStats = async (req, res, next) => {
  try {
    // Admin dashboard aggregates every user's synced data; a user's
    // dashboard only reflects their own Google Ads cache.
    let cachedAccounts;
    let lastSynced;
    let campaignsData;
    let usersSection = null;
    let userBreakdown = null;

    // The caller's own Google Ads connection status ("My Google Ads").
    const me = await User.findById(req.user.id).select('googleAdsConfig');
    const myConnection = { connected: !!me?.googleAdsConfig?.refreshToken };

    if (req.user.role === 'admin') {
      const [accountsMerged, campaignsMerged, allUsers, allAccountCaches, allCampaignCaches] = await Promise.all([
        getMergedCache('accounts'),
        getMergedCache('campaigns'),
        User.find().select('name email role active googleAdsConfig.refreshToken'),
        GoogleAdsCache.find({ type: 'accounts' }),
        GoogleAdsCache.find({ type: 'campaigns' }),
      ]);
      cachedAccounts = accountsMerged.data;
      lastSynced = accountsMerged.lastSynced;
      campaignsData = campaignsMerged.data;

      const accCacheByUser = new Map(allAccountCaches.map((c) => [String(c.userId), c]));
      const campCacheByUser = new Map(allCampaignCaches.map((c) => [String(c.userId), c]));

      // Per-user performance breakdown for the admin dashboard. Data only
      // counts for currently CONNECTED users - a disconnected user's stale
      // cache must not show as if it were live.
      userBreakdown = allUsers.map((u) => {
        const uid = String(u._id);
        const isConnected = !!u.googleAdsConfig?.refreshToken;
        const accCache = isConnected ? accCacheByUser.get(uid) : null;
        const camps = isConnected ? (campCacheByUser.get(uid)?.data || []) : [];
        return {
          userId: uid,
          name: u.name,
          email: u.email,
          role: u.role,
          active: u.active !== false,
          googleAdsConnected: isConnected,
          lastSynced: accCache?.lastSynced || null,
          accounts: (accCache?.data || []).length,
          campaigns: camps.length,
          spend: +camps.reduce((s, c) => s + (Number(c.spend) || 0), 0).toFixed(2),
          clicks: camps.reduce((s, c) => s + (Number(c.clicks) || 0), 0),
          conversions: camps.reduce((s, c) => s + (Number(c.conversions) || 0), 0),
        };
      });

      usersSection = {
        total: allUsers.length,
        active: allUsers.filter((u) => u.active !== false).length,
        googleAdsConnected: allUsers.filter((u) => !!u.googleAdsConfig?.refreshToken).length,
      };
    } else if (!myConnection.connected) {
      // Disconnected: never surface a leftover stale cache as live data.
      cachedAccounts = [];
      lastSynced = null;
      campaignsData = [];
    } else {
      const cached = await GoogleAdsCache.findOne({ userId: req.user.id, type: 'accounts' });
      cachedAccounts = cached?.data || [];
      lastSynced = cached?.lastSynced || null;

      const cachedCampaigns = await GoogleAdsCache.findOne({ userId: req.user.id, type: 'campaigns' });
      campaignsData = cachedCampaigns?.data || [];
    }

    let alertFilter = {};
    if (req.user.role !== 'admin') {
      const assigned = await Campaign.find({ assignedTo: req.user.id }, 'googleCampaignId');
      const assignedIds = assigned.map((c) => c.googleCampaignId).filter(Boolean);
      alertFilter = { campaignId: { $in: assignedIds } };
    }

    const [recentAlerts, activeRules, totalAlerts] = await Promise.all([
      AlertHistory.find(alertFilter).sort({ createdAt: -1 }).limit(5).lean(),
      AlertRules.countDocuments({ enabled: true }),
      AlertHistory.countDocuments(alertFilter),
    ]);

    const enabledCampaigns = campaignsData.filter((c) => c.status === 'ENABLED');
    const pausedCampaigns = campaignsData.filter((c) => c.status === 'PAUSED');

    const totalSpend = campaignsData.reduce((sum, c) => sum + (Number(c.spend) || 0), 0);
    const totalClicks = campaignsData.reduce((sum, c) => sum + (Number(c.clicks) || 0), 0);
    const totalImpressions = campaignsData.reduce((sum, c) => sum + (Number(c.impressions) || 0), 0);
    const totalConversions = campaignsData.reduce((sum, c) => sum + (Number(c.conversions) || 0), 0);

    const topCampaignsBySpend = [...campaignsData]
      .sort((a, b) => (b.spend || 0) - (a.spend || 0))
      .slice(0, 5);

    const mccIds = [...new Set(cachedAccounts.map((a) => a.managerAccountId).filter(Boolean))];

    // Derive account status from campaign data
    const campaignsByAccount = {};
    for (const c of campaignsData) {
      if (!c.customerId) continue;
      if (!campaignsByAccount[c.customerId]) campaignsByAccount[c.customerId] = [];
      campaignsByAccount[c.customerId].push(c);
    }

    let withActiveCampaigns = 0;
    let allPaused = 0;
    let noCampaigns = 0;
    const clientAccounts = cachedAccounts.filter((a) => !a.isManager);
    for (const acc of clientAccounts) {
      const camps = campaignsByAccount[acc.customerId];
      if (!camps || camps.length === 0) {
        noCampaigns++;
      } else if (camps.some((c) => c.status === 'ENABLED')) {
        withActiveCampaigns++;
      } else {
        allPaused++;
      }
    }

    res.json({
      accounts: {
        total: cachedAccounts.length,
        withActiveCampaigns,
        allPaused,
        noCampaigns,
        managers: cachedAccounts.filter((a) => a.isManager).length,
        mccIds,
        lastSynced,
      },
      campaigns: {
        total: campaignsData.length,
        enabled: enabledCampaigns.length,
        paused: pausedCampaigns.length,
      },
      metrics: {
        totalSpend: +totalSpend.toFixed(2),
        totalClicks,
        totalImpressions,
        totalConversions,
        avgCpc: totalClicks > 0 ? +(totalSpend / totalClicks).toFixed(2) : 0,
        avgCtr: totalImpressions > 0 ? +((totalClicks / totalImpressions) * 100).toFixed(2) : 0,
      },
      alerts: {
        total: totalAlerts,
        activeRules,
        recent: recentAlerts,
      },
      topCampaigns: topCampaignsBySpend,
      // Caller's own Google Ads connection state ("My Google Ads" card).
      googleAds: myConnection,
      // Admin only: system-wide user stats + per-user performance breakdown.
      ...(usersSection ? { users: usersSection, userBreakdown } : {}),
    });
  } catch (error) {
    next(error);
  }
};
