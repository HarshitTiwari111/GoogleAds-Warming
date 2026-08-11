const env = require('../config/env');
const logger = require('../utils/logger');
const AlertRules = require('../models/AlertRules');
const Campaign = require('../models/Campaign');
const landingClickService = require('./landingClickService');
const gclidService = require('./gclidService');
const recommendationEngine = require('./recommendationEngine');
const alertService = require('./alertService');
const telegramService = require('./telegramService');

async function getActiveRules() {
  return AlertRules.find({ enabled: true });
}

/**
 * Evaluates every active rule against a single campaign's latest metrics.
 * Landing-click/gclid counts are cached per distinct windowMinutes so rules
 * sharing a window don't issue duplicate DB queries.
 *
 * @returns {Promise<Array>} triggered rule results, each with a recommendation
 *          and a metrics snapshot ready to hand to the Telegram/history layer.
 */
async function evaluateCampaign(metricsDoc, rules) {
  const triggered = [];
  const countCache = new Map();

  async function getCounts(windowMinutes) {
    if (countCache.has(windowMinutes)) return countCache.get(windowMinutes);
    const [landingClicks, gclidCount] = await Promise.all([
      landingClickService.countRecentVisits(metricsDoc.campaignId, windowMinutes),
      gclidService.countRecentGclids(metricsDoc.campaignId, windowMinutes),
    ]);
    const counts = { landingClicks, gclidCount };
    countCache.set(windowMinutes, counts);
    return counts;
  }

  for (const rule of rules) {
    const { landingClicks, gclidCount } = await getCounts(rule.windowMinutes);
    let isTriggered = false;

    switch (rule.type) {
      case 'LANDING_CLICK_COUNT':
        isTriggered = landingClicks >= rule.threshold;
        break;
      case 'GCLID_COUNT':
        isTriggered = gclidCount >= rule.threshold;
        break;
      case 'SPEND_LIMIT':
        isTriggered = metricsDoc.spend > rule.threshold;
        break;
      case 'HIGH_CLICKS_LOW_GCLID':
        isTriggered = metricsDoc.clicks >= rule.threshold && gclidCount <= (rule.secondaryThreshold ?? 0);
        break;
      case 'HIGH_SPEND_ZERO_CONVERSIONS':
        isTriggered = metricsDoc.spend > rule.threshold && metricsDoc.conversions === 0;
        break;
      default:
        isTriggered = false;
    }

    if (!isTriggered) continue;

    const spendLimitForRecommendation =
      rule.type === 'SPEND_LIMIT' || rule.type === 'HIGH_SPEND_ZERO_CONVERSIONS'
        ? rule.threshold
        : env.alerts.defaultSpendLimit;

    const rec = recommendationEngine.getRecommendation({
      clicks: metricsDoc.clicks,
      gclidCount,
      spend: metricsDoc.spend,
      conversions: metricsDoc.conversions,
      spendLimit: spendLimitForRecommendation,
    });

    triggered.push({
      rule,
      recommendation: rec.action,
      healthStatus: rec.status,
      metricsSnapshot: {
        spend: metricsDoc.spend,
        clicks: metricsDoc.clicks,
        landingClicks,
        gclidCount,
        conversions: metricsDoc.conversions,
      },
    });
  }

  return triggered;
}

/**
 * Full per-campaign pipeline stage: evaluate rules, skip anything still in
 * cooldown, send Telegram alerts for the rest, and record every attempt to
 * AlertHistory (sent or failed).
 */
async function evaluateAndAlert(metricsDoc, rules) {
  const triggeredResults = await evaluateCampaign(metricsDoc, rules);
  if (triggeredResults.length === 0) return triggeredResults;

  // Resolve once per campaign (not per rule) which bot + chat this
  // campaign's alerts should go through: the assigned media buyer's own
  // bot/chat, falling back to the shared admin bot if unassigned or unset.
  // A lookup failure here shouldn't cancel alerting outright - fall back to
  // the shared/default bot rather than losing this campaign's alerts.
  let campaignDoc = null;
  try {
    campaignDoc = await Campaign.findOne({ googleCampaignId: metricsDoc.campaignId }).populate(
      'assignedTo',
      'telegramChatId telegramBotToken mutedRuleTypes name'
    );
  } catch (error) {
    logger.error(`Failed to look up assignment for campaign ${metricsDoc.campaignName}: ${error.message} - falling back to the shared bot`);
  }
  const chatId = campaignDoc?.assignedTo?.telegramChatId || env.telegram.chatId;
  const botToken = campaignDoc?.assignedTo?.telegramBotToken || env.telegram.botToken;
  const mutedRuleTypes = campaignDoc?.assignedTo?.mutedRuleTypes || [];

  for (const result of triggeredResults) {
    const { rule, recommendation, metricsSnapshot } = result;

    // Isolated per rule: one bad Telegram send or a transient AlertHistory
    // write failure must not abort alerting for this campaign's *other*
    // triggered rules, or (via the caller's loop) for every other campaign
    // still left in this monitoring cycle.
    try {
      const inCooldown = await alertService.isInCooldown(metricsDoc.campaignId, rule.type, rule.cooldownMinutes);
      if (inCooldown) {
        logger.debug(`Skipping alert for ${metricsDoc.campaignName} [${rule.type}] - in cooldown`);
        continue;
      }

      const alertData = {
        campaignName: metricsDoc.campaignName,
        spend: metricsSnapshot.spend,
        clicks: metricsSnapshot.clicks,
        landingClicks: metricsSnapshot.landingClicks,
        gclidCount: metricsSnapshot.gclidCount,
        recommendation,
        timestamp: metricsDoc.timestamp,
      };

      // The rule still fires and gets logged - only the Telegram send is
      // skipped, per the assigned buyer's own notification preference.
      if (mutedRuleTypes.includes(rule.type)) {
        await alertService.recordHistory({
          campaignId: metricsDoc.campaignId,
          campaignName: metricsDoc.campaignName,
          ruleType: rule.type,
          ruleName: rule.name,
          recommendation,
          message: telegramService.formatAlertMessage(alertData),
          metricsSnapshot,
          status: 'MUTED',
          telegramResponse: 'Muted by media buyer notification preferences',
        });
        logger.info(`Alert [${rule.type}] for ${metricsDoc.campaignName}: muted by user preference`);
        continue;
      }

      const { ok, description, message } = await telegramService.sendAlert(alertData, chatId, botToken);

      await alertService.recordHistory({
        campaignId: metricsDoc.campaignId,
        campaignName: metricsDoc.campaignName,
        ruleType: rule.type,
        ruleName: rule.name,
        recommendation,
        message,
        metricsSnapshot,
        status: ok ? 'SENT' : 'FAILED',
        telegramResponse: description,
      });

      logger.info(
        `Alert [${rule.type}] for ${metricsDoc.campaignName}: ${recommendation} (telegram ${ok ? 'sent' : 'FAILED: ' + description})`
      );
    } catch (error) {
      logger.error(`Alert processing failed for ${metricsDoc.campaignName} [${rule.type}]: ${error.message}`);
    }
  }

  return triggeredResults;
}

module.exports = {
  getActiveRules,
  evaluateCampaign,
  evaluateAndAlert,
};
