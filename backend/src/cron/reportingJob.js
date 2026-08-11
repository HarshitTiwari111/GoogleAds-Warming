const logger = require('../utils/logger');
const Account = require('../models/Account');
const Performance = require('../models/Performance');
const Report = require('../models/Report');

const reportingJob = {
  async runDaily() {
    const accounts = await Account.find({
      status: { $in: ['warmup', 'active'] },
    });

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const endOfDay = new Date(yesterday);
    endOfDay.setHours(23, 59, 59, 999);

    for (const account of accounts) {
      try {
        const performances = await Performance.find({
          account: account._id,
          date: { $gte: yesterday, $lte: endOfDay },
        });

        if (performances.length === 0) continue;

        const metrics = this.calculateMetrics(performances);

        await Report.create({
          account: account._id,
          reportType: 'daily',
          dateFrom: yesterday,
          dateTo: endOfDay,
          metrics,
          status: 'ready',
          generatedBy: 'auto',
          createdBy: account.createdBy,
        });

        logger.info(`[REPORT] Daily report generated for ${account.accountName}`);
      } catch (error) {
        logger.error(`[REPORT] Error generating daily report for ${account._id}: ${error.message}`);
      }
    }
  },

  async runWeekly() {
    const accounts = await Account.find({
      status: { $in: ['warmup', 'active'] },
    });

    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1);
    endDate.setHours(23, 59, 59, 999);

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);

    for (const account of accounts) {
      try {
        const performances = await Performance.find({
          account: account._id,
          date: { $gte: startDate, $lte: endDate },
        });

        if (performances.length === 0) continue;

        const metrics = this.calculateMetrics(performances);

        await Report.create({
          account: account._id,
          reportType: 'weekly',
          dateFrom: startDate,
          dateTo: endDate,
          metrics,
          status: 'ready',
          generatedBy: 'auto',
          createdBy: account.createdBy,
        });

        logger.info(`[REPORT] Weekly report generated for ${account.accountName}`);
      } catch (error) {
        logger.error(`[REPORT] Error generating weekly report for ${account._id}: ${error.message}`);
      }
    }
  },

  calculateMetrics(performances) {
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

    return metrics;
  },
};

module.exports = reportingJob;
