const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../utils/logger');
const { startCampaignMonitorJob } = require('./campaignMonitorJob');
const monitoringJob = require('./monitoringJob');
const reportingJob = require('./reportingJob');

/**
 * Central cron registry - replaces both source projects' separate scheduler
 * entrypoints. Called once from server.js after the HTTP server is listening.
 *
 * Registers:
 *   1. campaignMonitorJob (Requirement 2) - real-time CPS campaign monitoring
 *      + Telegram alerting, every minute by default (CAMPAIGN_FETCH_CRON).
 *   2. monitoringJob (Requirement 1) - warm-up period performance backfill +
 *      auto-promotion warmup -> active, every 6 hours by default (MONITORING_CRON).
 *   3. reportingJob (Requirement 1) - daily + weekly Report generation
 *      (DAILY_REPORT_CRON / WEEKLY_REPORT_CRON).
 */
function startAllJobs() {
  startCampaignMonitorJob(cron);

  cron.schedule(env.cron.monitoring, async () => {
    logger.info('[CRON] Running warm-up performance monitoring job...');
    try {
      await monitoringJob.run();
      logger.info('[CRON] Warm-up monitoring job completed');
    } catch (error) {
      logger.error(`[CRON] Warm-up monitoring job failed: ${error.message}`);
    }
  });
  logger.info(`[CRON] Warm-up monitoring job scheduled (cron: "${env.cron.monitoring}")`);

  cron.schedule(env.cron.dailyReport, async () => {
    logger.info('[CRON] Running daily report generation...');
    try {
      await reportingJob.runDaily();
      logger.info('[CRON] Daily report generation completed');
    } catch (error) {
      logger.error(`[CRON] Daily report generation failed: ${error.message}`);
    }
  });
  logger.info(`[CRON] Daily report job scheduled (cron: "${env.cron.dailyReport}")`);

  cron.schedule(env.cron.weeklyReport, async () => {
    logger.info('[CRON] Running weekly report generation...');
    try {
      await reportingJob.runWeekly();
      logger.info('[CRON] Weekly report generation completed');
    } catch (error) {
      logger.error(`[CRON] Weekly report generation failed: ${error.message}`);
    }
  });
  logger.info(`[CRON] Weekly report job scheduled (cron: "${env.cron.weeklyReport}")`);

  logger.info('[CRON] All scheduled jobs initialized');
}

module.exports = { startAllJobs };
