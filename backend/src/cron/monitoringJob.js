const env = require('../config/env');
const logger = require('../utils/logger');
const Account = require('../models/Account');
const Campaign = require('../models/Campaign');
const Performance = require('../models/Performance');
const User = require('../models/User');
const googleAdsService = require('../services/googleAdsService');

async function getUserCredentials(userId) {
  const user = await User.findById(userId).select('googleAdsConfig');
  if (user?.googleAdsConfig?.isConfigured) {
    return user.googleAdsConfig;
  }
  return {};
}

/**
 * Requirement 1's warm-up period monitoring/reporting automation: for every
 * Account currently in warmup/active, backfill yesterday->today Performance
 * rows per campaign, and auto-promote warmup -> active once WARMUP_DAYS have
 * elapsed since warmupStartDate.
 */
let isRunning = false;

const monitoringJob = {
  async run() {
    // Guards against a slow run (many accounts, slow Google Ads API) still
    // being in flight when the next 6-hourly tick fires, which would let two
    // cycles write to the same Performance/Account docs concurrently.
    if (isRunning) {
      logger.warn('[MONITOR] Previous monitoring cycle still running - skipping this tick');
      return;
    }
    isRunning = true;

    try {
      await monitoringJob._run();
    } finally {
      isRunning = false;
    }
  },

  async _run() {
    const accounts = await Account.find({
      status: { $in: ['warmup', 'active'] },
      googleAdsCustomerId: { $ne: null },
    });

    logger.info(`[MONITOR] Found ${accounts.length} warmup/active account(s) to monitor`);

    for (const account of accounts) {
      try {
        const credentials = await getUserCredentials(account.createdBy);

        const campaigns = await Campaign.find({
          account: account._id,
          status: 'active',
          googleCampaignId: { $ne: null },
        });

        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        for (const campaign of campaigns) {
          try {
            const perfData = await googleAdsService.getCampaignPerformance(
              account.googleAdsCustomerId,
              campaign.googleCampaignId,
              yesterday,
              today,
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

            logger.info(`[MONITOR] Updated performance for campaign ${campaign.campaignName}`);
          } catch (error) {
            logger.error(`[MONITOR] Error monitoring campaign ${campaign._id}: ${error.message}`);
          }
        }

        if (account.status === 'warmup' && account.warmupStartDate) {
          const daysSinceStart = Math.floor(
            (Date.now() - new Date(account.warmupStartDate).getTime()) / 86400000
          );
          if (daysSinceStart >= env.warmupDays) {
            account.status = 'active';
            account.warmupEndDate = new Date();
            await account.save();
            logger.info(`[MONITOR] Account ${account.accountName} warmup completed - promoted to active`);
          }
        }
      } catch (error) {
        logger.error(`[MONITOR] Error processing account ${account._id}: ${error.message}`);
      }
    }
  },
};

module.exports = monitoringJob;
