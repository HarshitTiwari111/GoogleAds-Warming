const env = require('../config/env');
const logger = require('../utils/logger');
const googleAdsService = require('../services/googleAdsService');
const ruleEngine = require('../services/ruleEngine');
const noClicksWarningService = require('../services/noClicksWarningService');

let isRunning = false;

/**
 * Full workflow, run once per cycle (Requirement 2):
 *   Fetch Campaign Data -> Store Data -> Evaluate Rules ->
 *   Generate Recommendation -> Send Telegram Alert -> Store Alert History
 *
 * The isRunning guard prevents overlapping cycles if a fetch+evaluate pass
 * ever takes longer than the cron interval (e.g. a slow Google Ads API call).
 */
async function runMonitoringCycle() {
  if (isRunning) {
    logger.warn('Previous campaign monitor cycle still running - skipping this tick');
    return;
  }

  isRunning = true;
  const startedAt = Date.now();

  try {
    const metricsDocs = await googleAdsService.fetchAndStoreCampaignMetrics();
    const activeRules = await ruleEngine.getActiveRules();

    if (activeRules.length === 0) {
      logger.warn('No active alert rules configured - run "npm run seed:rules" to load defaults');
    }

    for (const metricsDoc of metricsDocs) {
      try {
        // Run existing rule engine evaluation
        await ruleEngine.evaluateAndAlert(metricsDoc, activeRules);

        // Run no-clicks auto-warning and auto-pause logic
        await noClicksWarningService.processNoClicksWarning(metricsDoc);
      } catch (error) {
        // One campaign's rule evaluation blowing up (e.g. a DB hiccup) must
        // not skip every other campaign still left in this cycle.
        logger.error(`Monitoring cycle failed for campaign ${metricsDoc.campaignName}: ${error.message}`);
      }
    }

    logger.info(`Campaign monitor cycle complete in ${Date.now() - startedAt}ms (${metricsDocs.length} campaigns)`);
  } catch (error) {
    logger.error(`Campaign monitor cycle failed: ${error.message}`);
  } finally {
    isRunning = false;
  }
}

/** Registers the cron job. Call once, from cron/scheduler.js. */
function startCampaignMonitorJob(cron) {
  cron.schedule(env.cron.campaignFetch, runMonitoringCycle);
  logger.info(`Campaign monitor job scheduled (cron: "${env.cron.campaignFetch}")`);
}

module.exports = { startCampaignMonitorJob, runMonitoringCycle };
