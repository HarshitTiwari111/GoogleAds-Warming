const Campaign = require('../models/Campaign');
const CampaignMetrics = require('../models/CampaignMetrics');
const logger = require('../utils/logger');
const googleAdsService = require('./googleAdsService');

/**
 * Service for handling no-clicks auto-warning and auto-pause automation.
 * - Monitors campaigns for zero clicks in configured periods
 * - Increments warning count when no clicks detected
 * - Auto-pauses campaign when warning count reaches limit
 * - Resets warning count when clicks resume
 */

/**
 * Check if a campaign has received any clicks in the past monitoring period
 * Monitoring period is defined as the last check interval (default: 5 minutes)
 */
async function hasCampaignReceivedClicks(campaignId, monitoringPeriodMinutes = 5) {
  try {
    const timeWindow = new Date(Date.now() - monitoringPeriodMinutes * 60 * 1000);

    const metrics = await CampaignMetrics.findOne({
      campaignId,
      timestamp: { $gte: timeWindow },
      clicks: { $gt: 0 }, // At least 1 click
    }).sort({ timestamp: -1 });

    return !!metrics;
  } catch (error) {
    logger.error(`Error checking clicks for campaign ${campaignId}: ${error.message}`);
    return null; // null means error, don't process
  }
}

/**
 * Increment warning count for a campaign with no clicks
 */
async function incrementWarningCount(campaignId) {
  try {
    const campaign = await Campaign.findOne({ googleCampaignId: campaignId });
    if (!campaign) {
      logger.warn(`Campaign ${campaignId} not found in database`);
      return null;
    }

    campaign.noClicksWarning.count += 1;
    campaign.noClicksWarning.lastCheckedAt = new Date();
    await campaign.save();

    logger.info(`[NO_CLICKS_WARNING] Campaign "${campaign.campaignName}" (${campaignId}): warning count incremented to ${campaign.noClicksWarning.count}/${campaign.noClicksWarning.warningLimit}`);

    return campaign.noClicksWarning.count;
  } catch (error) {
    logger.error(`Error incrementing warning count for campaign ${campaignId}: ${error.message}`);
    return null;
  }
}

/**
 * Reset warning count when clicks resume
 */
async function resetWarningCount(campaignId) {
  try {
    const campaign = await Campaign.findOne({ googleCampaignId: campaignId });
    if (!campaign) {
      logger.warn(`Campaign ${campaignId} not found in database`);
      return null;
    }

    if (campaign.noClicksWarning.count > 0) {
      const previousCount = campaign.noClicksWarning.count;
      campaign.noClicksWarning.count = 0;
      campaign.noClicksWarning.lastCheckedAt = new Date();
      await campaign.save();

      logger.info(`[NO_CLICKS_WARNING_RESET] Campaign "${campaign.campaignName}" (${campaignId}): clicks resumed, warning count reset from ${previousCount} to 0`);
    }

    return campaign.noClicksWarning.count;
  } catch (error) {
    logger.error(`Error resetting warning count for campaign ${campaignId}: ${error.message}`);
    return null;
  }
}

/**
 * Auto-pause campaign when warning limit is reached
 */
async function autoPauseCampaign(campaignId, googleCustomerId = null) {
  try {
    const campaign = await Campaign.findOne({ googleCampaignId: campaignId });
    if (!campaign) {
      logger.warn(`Campaign ${campaignId} not found in database`);
      return false;
    }

    if (campaign.noClicksWarning.isAutoPaused) {
      logger.debug(`Campaign ${campaignId} is already auto-paused`);
      return true;
    }

    // Pause in Google Ads if customerId available
    if (googleCustomerId && campaign.account) {
      try {
        await googleAdsService.pauseCampaign(googleCustomerId, campaignId);
        logger.info(`[AUTO_PAUSE] Google Ads campaign "${campaign.campaignName}" (${campaignId}) paused via API`);
      } catch (apiError) {
        logger.error(`Failed to pause campaign in Google Ads: ${apiError.message}`);
        // Continue with DB update even if API fails
      }
    }

    // Update DB status
    campaign.status = 'paused';
    campaign.noClicksWarning.isAutoPaused = true;
    campaign.noClicksWarning.pausedAt = new Date();
    campaign.noClicksWarning.pauseReason = `Auto-paused: No clicks detected for ${campaign.noClicksWarning.count} consecutive monitoring periods (warning limit: ${campaign.noClicksWarning.warningLimit})`;
    await campaign.save();

    logger.info(`[AUTO_PAUSE] Campaign "${campaign.campaignName}" (${campaignId}): Database status updated to PAUSED`);
    logger.info(`[AUTO_PAUSE_REASON] ${campaign.noClicksWarning.pauseReason}`);

    return true;
  } catch (error) {
    logger.error(`Error auto-pausing campaign ${campaignId}: ${error.message}`);
    return false;
  }
}

/**
 * Process campaign to check for clicks and manage warnings
 * This is called during each monitoring cycle
 */
async function processNoClicksWarning(metricsDoc, googleCustomerId = null) {
  try {
    const campaignId = metricsDoc.campaignId;
    const campaignName = metricsDoc.campaignName;

    // Check if campaign has received clicks in recent period
    const hasClicks = await hasCampaignReceivedClicks(campaignId, 5); // 5 minute window

    if (hasClicks === null) {
      // Error occurred, skip this campaign
      logger.warn(`Skipping no-clicks warning check for ${campaignName} due to error`);
      return;
    }

    if (hasClicks) {
      // Clicks detected - reset warning
      await resetWarningCount(campaignId);
      return;
    }

    // No clicks detected - increment warning
    const campaign = await Campaign.findOne({ googleCampaignId: campaignId });
    if (!campaign) return;

    const warningCount = await incrementWarningCount(campaignId);
    if (warningCount === null) return;

    // Check if warning limit reached
    if (warningCount >= campaign.noClicksWarning.warningLimit) {
      logger.warn(`[NO_CLICKS_AUTO_PAUSE] Campaign "${campaignName}" reached warning limit (${warningCount}/${campaign.noClicksWarning.warningLimit})`);
      await autoPauseCampaign(campaignId, googleCustomerId);
    }
  } catch (error) {
    logger.error(`Error processing no-clicks warning: ${error.message}`);
  }
}

/**
 * Manually resume a previously auto-paused campaign
 */
async function manuallyResumeCampaign(campaignId) {
  try {
    const campaign = await Campaign.findOne({ googleCampaignId: campaignId });
    if (!campaign) {
      logger.warn(`Campaign ${campaignId} not found`);
      return false;
    }

    if (!campaign.noClicksWarning.isAutoPaused) {
      logger.debug(`Campaign ${campaignId} was not auto-paused`);
      return false;
    }

    campaign.status = 'active';
    campaign.noClicksWarning.isAutoPaused = false;
    campaign.noClicksWarning.count = 0;
    campaign.noClicksWarning.pausedAt = null;
    campaign.noClicksWarning.pauseReason = null;
    await campaign.save();

    logger.info(`[MANUAL_RESUME] Campaign "${campaign.campaignName}" (${campaignId}) manually resumed and warnings reset`);
    return true;
  } catch (error) {
    logger.error(`Error manually resuming campaign ${campaignId}: ${error.message}`);
    return false;
  }
}

/**
 * Get warning status for a campaign
 */
async function getWarningStatus(campaignId) {
  try {
    const campaign = await Campaign.findOne({ googleCampaignId: campaignId });
    if (!campaign) return null;

    return {
      campaignId,
      campaignName: campaign.campaignName,
      warningCount: campaign.noClicksWarning.count,
      warningLimit: campaign.noClicksWarning.warningLimit,
      isAutoPaused: campaign.noClicksWarning.isAutoPaused,
      lastCheckedAt: campaign.noClicksWarning.lastCheckedAt,
      pausedAt: campaign.noClicksWarning.pausedAt,
      pauseReason: campaign.noClicksWarning.pauseReason,
    };
  } catch (error) {
    logger.error(`Error getting warning status for campaign ${campaignId}: ${error.message}`);
    return null;
  }
}

module.exports = {
  hasCampaignReceivedClicks,
  incrementWarningCount,
  resetWarningCount,
  autoPauseCampaign,
  processNoClicksWarning,
  manuallyResumeCampaign,
  getWarningStatus,
};
