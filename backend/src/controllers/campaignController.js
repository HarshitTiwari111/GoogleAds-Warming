const Campaign = require('../models/Campaign');
const Account = require('../models/Account');
const CampaignMetrics = require('../models/CampaignMetrics');
const User = require('../models/User');
const landingClickService = require('../services/landingClickService');
const gclidService = require('../services/gclidService');
const alertService = require('../services/alertService');
const recommendationEngine = require('../services/recommendationEngine');
const AlertRules = require('../models/AlertRules');
const Setting = require('../models/Setting');
const Keyword = require('../models/Keyword');
const Ad = require('../models/Ad');
const noClicksWarningService = require('../services/noClicksWarningService');
const googleAdsService = require('../services/googleAdsService');
const { logActivity } = require('../middleware/activityLogger');
const logger = require('../utils/logger');
const env = require('../config/env');

const DASHBOARD_WINDOW_MINUTES = 60;

// Two-role model: admins operate on every user's accounts/campaigns, users
// only on records under accounts they created.
function accountOwnershipFilter(reqUser) {
  return reqUser.role === 'admin' ? {} : { createdBy: reqUser.id };
}

/**
 * Scope a campaign query to what the caller may see: everything for an admin,
 * otherwise the campaigns of the MCC(s) on the caller's own Google Ads
 * connection, plus their own campaigns that have no MCC yet. Mirrors
 * accountController.mccScopeFilter so both lists agree.
 */
async function campaignScopeFilter(reqUser) {
  if (reqUser.role === 'admin') return {};

  const user = await User.findById(reqUser.id).select('googleAdsConfig.managerAccountIds');
  const mccIds = (user?.googleAdsConfig?.managerAccountIds || []).map(String).filter(Boolean);

  if (!mccIds.length) {
    const own = await Account.find({ createdBy: reqUser.id }).select('_id');
    return {
      $or: [
        { account: { $in: own.map((a) => a._id) } },
        { owner: reqUser._id },
        { createdBy: reqUser._id },
      ],
    };
  }

  return {
    $or: [
      { sourceMccId: { $in: mccIds } },
      { sourceMccId: { $in: [null, ''] }, $and: [{ $or: [{ owner: reqUser._id }, { createdBy: reqUser._id }] }] },
    ],
  };
}

function canAccessCampaign(reqUser, campaign) {
  if (reqUser.role === 'admin') return true;
  return !campaign.account || campaign.account.createdBy.toString() === reqUser.id;
}

// ---------------------------------------------------------------------------
// Provisioning-side CRUD (Project A)
// ---------------------------------------------------------------------------

/**
 * The daily budget a campaign runs at, in order of preference:
 *   1. the value the operator entered on the form,
 *   2. the parent account's configured daily budget,
 *   3. the workspace `default_daily_budget` setting,
 *   4. 1.00.
 * Deliberately never randomised — the operator sets exactly what they want.
 */
async function resolveDailyBudget(requested, account) {
  const asNumber = Number(requested);
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;

  if (Number(account?.dailyBudget) > 0) return Number(account.dailyBudget);

  const setting = await Setting.findOne({ key: 'default_daily_budget' });
  const fallback = Number(setting?.value);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 1.0;
}

exports.createCampaign = async (req, res, next) => {
  try {
    const {
      accountId, campaignName, campaignType, dailyBudget, biddingStrategy, targetLocations,
      keywords, adGroupName, adHeadlines, adDescriptions, assignedTo, device, country,
    } = req.body;

    const account = await Account.findOne({ _id: accountId, ...accountOwnershipFilter(req.user) });
    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const campaign = await Campaign.create({
      account: accountId,
      campaignName,
      campaignType: campaignType || 'warmup',
      dailyBudget: await resolveDailyBudget(dailyBudget, account),
      biddingStrategy: biddingStrategy || 'MAXIMIZE_CLICKS',
      targetLocations: targetLocations || [],
      keywords: keywords || [],
      adGroupName: adGroupName || 'Default Ad Group',
      adHeadlines: adHeadlines || [],
      adDescriptions: adDescriptions || [],
      device: device?.length ? device : ['all'],
      country: country?.length ? country : [account.country || 'India'],
      // Inherit the MCC the parent account lives under, so later Google Ads
      // calls for this campaign carry the right login-customer-id.
      sourceMccId: account.sourceMccId || null,
      startDate: new Date(),
      assignedTo: assignedTo || null,
      owner: account.owner || req.user._id,
      createdBy: req.user._id,
    });

    res.status(201).json(campaign);
  } catch (error) {
    next(error);
  }
};

exports.getCampaignsByAccount = async (req, res, next) => {
  try {
    const account = await Account.findOne({ _id: req.params.accountId, ...accountOwnershipFilter(req.user) });
    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }
    const campaigns = await Campaign.find({ account: req.params.accountId }).sort({ createdAt: -1 });
    res.json(campaigns);
  } catch (error) {
    next(error);
  }
};

exports.getCampaign = async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id).populate('account');
    if (!campaign || !canAccessCampaign(req.user, campaign)) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    res.json(campaign);
  } catch (error) {
    next(error);
  }
};

exports.updateCampaign = async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id).populate('account');
    if (!campaign || !canAccessCampaign(req.user, campaign)) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    // Explicit allowlist - keeps a caller from smuggling `account`,
    // `googleCampaignId`, or other internally-managed fields into the update.
    const {
      campaignName, campaignType, dailyBudget, biddingStrategy, targetLocations,
      keywords, adGroupName, adHeadlines, adDescriptions, status, startDate, endDate,
      device, country,
    } = req.body;
    const updates = {
      campaignName, campaignType, dailyBudget, biddingStrategy, targetLocations,
      keywords, adGroupName, adHeadlines, adDescriptions, status, startDate, endDate,
      device, country,
    };
    Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);

    const updated = await Campaign.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    // A budget change has to reach Google Ads too, or the dashboard and the
    // live campaign drift apart. Best-effort: the local edit still stands and
    // the response reports whether the push succeeded.
    let googleAdsBudgetSynced = null;
    if (updates.dailyBudget !== undefined && campaign.googleCampaignId && campaign.account?.googleAdsCustomerId) {
      try {
        await pushDailyBudgetToGoogleAds(req.user, campaign, updates.dailyBudget);
        googleAdsBudgetSynced = true;
      } catch (err) {
        logger.warn(`[BUDGET] Google Ads push failed for campaign ${campaign._id}: ${err.message}`);
        googleAdsBudgetSynced = false;
      }
    }

    res.json(googleAdsBudgetSynced === null ? updated : { ...updated.toObject(), googleAdsBudgetSynced });
  } catch (error) {
    next(error);
  }
};

/**
 * Look up the campaign's budget resource in Google Ads and set it to the new
 * daily amount. The budget resource name is not stored locally, so it is read
 * back from the campaign itself.
 */
async function pushDailyBudgetToGoogleAds(reqUser, campaign, dailyBudget) {
  const customerId = campaign.account.googleAdsCustomerId;
  const loginCustomerId = campaign.sourceMccId || campaign.account.sourceMccId || null;

  let refreshToken = null;
  const self = await User.findById(reqUser.id).select('googleAdsConfig');
  refreshToken = self?.googleAdsConfig?.refreshToken || null;
  if (!refreshToken && campaign.owner) {
    const owner = await User.findById(campaign.owner).select('googleAdsConfig');
    refreshToken = owner?.googleAdsConfig?.refreshToken || null;
  }
  if (!refreshToken) throw new Error('No connected Google Ads account available');

  const rows = await googleAdsService.workerQuery(
    customerId,
    `SELECT campaign.id, campaign_budget.resource_name FROM campaign WHERE campaign.id = ${campaign.googleCampaignId} LIMIT 1`,
    refreshToken,
    loginCustomerId
  );
  const budgetResource = rows[0]?.campaignBudget?.resourceName;
  if (!budgetResource) throw new Error('Could not resolve the campaign budget resource');

  await googleAdsService.updateCampaignBudgetAmount(customerId, budgetResource, dailyBudget, refreshToken, loginCustomerId);
}

/**
 * POST /api/campaigns/bulk/content
 *
 * Apply the same keywords and/or ad copies to many campaigns in one go, so an
 * operator setting up a batch of warm-up campaigns doesn't have to repeat the
 * same entry per campaign.
 *
 * Partial success is the normal outcome: a campaign the caller can't reach, or
 * one ad copy that fails validation, must not discard the rest. Every failure
 * is collected and reported alongside what did get written.
 */
exports.bulkAddContent = async (req, res, next) => {
  try {
    const { campaignIds, keywords = [], ads = [] } = req.body;

    if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Select at least one campaign' });
    }
    if (keywords.length === 0 && ads.length === 0) {
      return res.status(400).json({ success: false, message: 'Add at least one keyword or ad copy' });
    }

    // Resolve only the campaigns this caller may actually touch; anything else
    // is reported as skipped rather than silently ignored.
    const allowed = await Campaign.find({
      _id: { $in: campaignIds },
      ...(await campaignScopeFilter(req.user)),
    }).select('_id campaignName');

    const allowedIds = new Set(allowed.map((c) => String(c._id)));
    const skipped = campaignIds.filter((id) => !allowedIds.has(String(id)));

    const errors = [];
    let keywordsCreated = 0;
    let adsCreated = 0;

    for (const campaign of allowed) {
      if (keywords.length) {
        try {
          const docs = await Keyword.insertMany(
            keywords.map((k) => ({
              keyword: k.keyword,
              matchType: k.matchType || 'broad',
              isNegative: !!k.isNegative,
              campaign: campaign._id,
              createdBy: req.user._id,
            })),
            // Keep going past a bad row instead of aborting the whole batch.
            { ordered: false }
          );
          keywordsCreated += docs.length;
        } catch (err) {
          // insertMany with ordered:false still writes the valid rows.
          keywordsCreated += err.insertedDocs?.length || 0;
          errors.push(`${campaign.campaignName}: keywords — ${err.message.slice(0, 120)}`);
        }
      }

      for (const ad of ads) {
        try {
          await Ad.create({ ...ad, campaign: campaign._id, createdBy: req.user._id });
          adsCreated += 1;
        } catch (err) {
          errors.push(`${campaign.campaignName}: ad copy — ${err.message.slice(0, 120)}`);
        }
      }
    }

    await logActivity(
      req.user.id,
      'campaign_bulk_content',
      'campaign',
      null,
      `${keywordsCreated} keyword(s) and ${adsCreated} ad copy(ies) added across ${allowed.length} campaign(s)`,
      req.ip
    );

    res.json({
      success: true,
      data: {
        campaigns: allowed.length,
        keywordsCreated,
        adsCreated,
        skipped: skipped.length,
        errors,
      },
      message: `Added ${keywordsCreated} keyword(s) and ${adsCreated} ad copy(ies) to ${allowed.length} campaign(s)`,
    });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/campaigns/:id */
exports.deleteCampaign = async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id).populate('account');
    if (!campaign || !canAccessCampaign(req.user, campaign)) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    await Campaign.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Campaign deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/** PATCH /api/campaigns/:id/status — pause/resume without a full update. */
exports.updateCampaignStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const campaign = await Campaign.findById(req.params.id).populate('account');
    if (!campaign || !canAccessCampaign(req.user, campaign)) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    campaign.status = status;
    await campaign.save({ validateModifiedOnly: true });
    res.json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
};

exports.getAllCampaigns = async (req, res, next) => {
  try {
    // Admin sees every campaign; a user only those of their own MCC(s).
    const campaigns = await Campaign.find(await campaignScopeFilter(req.user))
      // googleAdsCustomerId is included so the Campaigns table can show which
      // ad account each campaign belongs to — a campaign id and a customer id
      // are different numbers, and without this the row shows no link between
      // them.
      .populate('account', 'accountName clientName status googleAdsCustomerId')
      .sort({ createdAt: -1 });
    res.json(campaigns);
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Monitoring-side dashboard endpoints (Project B)
// ---------------------------------------------------------------------------

/** Returns the most recent CampaignMetrics document for every distinct campaign. */
async function getLatestMetricsPerCampaign() {
  const results = await CampaignMetrics.aggregate([
    { $sort: { timestamp: -1 } },
    {
      $group: {
        _id: '$campaignId',
        doc: { $first: '$$ROOT' },
      },
    },
    { $replaceRoot: { newRoot: '$doc' } },
    { $sort: { campaignName: 1 } },
  ]);
  return results;
}

/**
 * GET /api/campaigns/monitoring
 * Dashboard summary: one card/row per campaign with live counts, current
 * recommendation, and last alert time. Users only see campaigns assigned to
 * them; admins see everything plus who each one is assigned to.
 */
exports.getMonitoringCampaigns = async (req, res, next) => {
  try {
    let latestMetrics = await getLatestMetricsPerCampaign();
    console.log(`[MONITORING] Latest metrics found: ${latestMetrics.length}`);
    if (latestMetrics.length === 0) {
      const dbCount = await CampaignMetrics.countDocuments();
      console.log(`[MONITORING] DEBUG - Total CampaignMetrics in DB: ${dbCount}`);
    }

    const assignments = await Campaign.find().populate('assignedTo', 'name email');
    console.log(`[MONITORING] Assignments found: ${assignments.length}`);
    console.log(`[MONITORING] Assignment keys:`, assignments.map(a => a.googleCampaignId).join(', '));
    const assignmentByCampaignId = new Map(assignments.map((a) => [a.googleCampaignId, a]));

    if (req.user.role !== 'admin') {
      latestMetrics = latestMetrics.filter((m) => {
        const assignment = assignmentByCampaignId.get(m.campaignId);
        return assignment?.assignedTo && String(assignment.assignedTo._id) === req.user.id;
      });
    }

    // Spend limit shown on cards should reflect whatever the user has configured
    // on the Rules page, not a stale hardcoded value.
    const spendLimitRule = await AlertRules.findOne({ type: 'SPEND_LIMIT' });
    const spendLimit = spendLimitRule ? spendLimitRule.threshold : env.alerts.defaultSpendLimit;

    const campaigns = await Promise.all(
      latestMetrics.map(async (metrics) => {
        const [landingClicks, gclidCount, lastAlert] = await Promise.all([
          landingClickService.countRecentVisits(metrics.campaignId, DASHBOARD_WINDOW_MINUTES),
          gclidService.countRecentGclids(metrics.campaignId, DASHBOARD_WINDOW_MINUTES),
          alertService.getLastAlert(metrics.campaignId),
        ]);

        const rec = recommendationEngine.getRecommendation({
          clicks: metrics.clicks,
          gclidCount,
          spend: metrics.spend,
          conversions: metrics.conversions,
          spendLimit,
        });

        let recommendation = rec.action;
        let status = rec.status;
        const assignment = assignmentByCampaignId.get(metrics.campaignId);
        const isAutoPaused = assignment?.noClicksWarning?.isAutoPaused;

        // If campaign is auto-paused, override status and recommendation
        let campaignStatus = metrics.status || 'ENABLED';
        if (isAutoPaused) {
          campaignStatus = 'PAUSED';
          status = 'CRITICAL';
          recommendation = 'Campaign auto-paused due to no clicks';
        }

        return {
          campaignId: metrics.campaignId,
          campaignName: metrics.campaignName,
          // Google Ads' own ENABLED/PAUSED/REMOVED - distinct from `status`
          // below, which is our health verdict (HEALTHY/WARNING/CRITICAL).
          campaignStatus,
          spend: metrics.spend,
          spendLimit,
          clicks: metrics.clicks,
          impressions: metrics.impressions,
          conversions: metrics.conversions,
          cpc: metrics.cpc,
          landingClicks,
          gclidCount,
          recommendation,
          status,
          lastAlertTime: lastAlert ? lastAlert.sentAt : null,
          timestamp: metrics.timestamp,
          assignedTo: assignment?.assignedTo
            ? { userId: assignment.assignedTo._id, name: assignment.assignedTo.name, email: assignment.assignedTo.email }
            : null,
          noClicksWarning: assignment?.noClicksWarning || {
            count: 0,
            warningLimit: 3,
            lastCheckedAt: null,
            pausedAt: null,
            pauseReason: null,
            isAutoPaused: false,
          },
        };
      })
    );

    res.json({ success: true, data: campaigns });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/campaigns/:campaignId/history
 * Time-series of raw metrics for a single campaign (for charting).
 * `:campaignId` here is the Google Ads campaign id (Campaign.googleCampaignId
 * / CampaignMetrics.campaignId), not the Mongo _id.
 */
exports.getCampaignHistory = async (req, res, next) => {
  try {
    const { campaignId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

    const history = await CampaignMetrics.find({ campaignId }).sort({ timestamp: -1 }).limit(limit);

    res.json({ success: true, data: history.reverse() });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/campaigns/:campaignId/assign - admin only: assign/unassign a campaign to a media buyer. */
exports.assignCampaign = async (req, res, next) => {
  try {
    const { campaignId } = req.params;
    const { userId } = req.body;

    if (userId) {
      const assignee = await User.findById(userId).select('_id');
      if (!assignee) {
        return res.status(400).json({ success: false, message: 'That user does not exist' });
      }
    }

    const campaign = await Campaign.findOneAndUpdate(
      { googleCampaignId: campaignId },
      { assignedTo: userId || null },
      { new: true }
    ).populate('assignedTo', 'name email');

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    res.json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// No-Clicks Auto-Warning & Auto-Pause Management
// ---------------------------------------------------------------------------

/** GET /api/campaigns/:campaignId/warning-status - Get warning status for a campaign */
exports.getWarningStatus = async (req, res, next) => {
  try {
    const { campaignId } = req.params;
    const warningStatus = await noClicksWarningService.getWarningStatus(campaignId);

    if (!warningStatus) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    res.json({ success: true, data: warningStatus });
  } catch (error) {
    next(error);
  }
};

/** POST /api/campaigns/:campaignId/resume - Manually resume an auto-paused campaign */
exports.resumeAutoPausedCampaign = async (req, res, next) => {
  try {
    const { campaignId } = req.params;

    const success = await noClicksWarningService.manuallyResumeCampaign(campaignId);

    if (!success) {
      return res.status(400).json({ success: false, message: 'Campaign not found or was not auto-paused' });
    }

    const updatedStatus = await noClicksWarningService.getWarningStatus(campaignId);
    res.json({ success: true, message: 'Campaign resumed and warnings reset', data: updatedStatus });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/campaigns/:campaignId/warning-limit - Update warning limit for a campaign */
exports.updateWarningLimit = async (req, res, next) => {
  try {
    const { campaignId } = req.params;
    const { warningLimit } = req.body;

    if (!warningLimit || warningLimit < 1) {
      return res.status(400).json({ success: false, message: 'Warning limit must be at least 1' });
    }

    const campaign = await Campaign.findOne({ googleCampaignId: campaignId });
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    campaign.noClicksWarning.warningLimit = warningLimit;
    await campaign.save();

    const updatedStatus = await noClicksWarningService.getWarningStatus(campaignId);
    res.json({ success: true, message: 'Warning limit updated', data: updatedStatus });
  } catch (error) {
    next(error);
  }
};
