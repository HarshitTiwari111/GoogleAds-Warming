const AlertHistory = require('../models/AlertHistory');

/**
 * Duplicate-alert prevention: checks whether the same campaign+rule already
 * alerted within its configured cooldown window. A FAILED delivery (Telegram
 * API error) does NOT count - otherwise a single failed send would silently
 * suppress every retry for the rest of the cooldown window, even though the
 * user never actually got notified. MUTED still counts, since the rule truly
 * did fire and was intentionally suppressed by the user's own preference.
 */
async function isInCooldown(campaignId, ruleType, cooldownMinutes) {
  const since = new Date(Date.now() - cooldownMinutes * 60 * 1000);
  const recent = await AlertHistory.findOne({
    campaignId,
    ruleType,
    sentAt: { $gte: since },
    status: { $ne: 'FAILED' },
  }).sort({ sentAt: -1 });

  return Boolean(recent);
}

/** Persists an alert attempt (sent or failed) to AlertHistory. */
async function recordHistory({
  campaignId,
  campaignName,
  ruleType,
  ruleName,
  recommendation,
  message,
  metricsSnapshot,
  status,
  telegramResponse,
}) {
  return AlertHistory.create({
    campaignId,
    campaignName,
    ruleType,
    ruleName,
    recommendation,
    message,
    metricsSnapshot,
    status,
    telegramResponse,
    sentAt: new Date(),
  });
}

/** Fetches the most recent alert for a campaign, if any - used by the dashboard. */
async function getLastAlert(campaignId) {
  return AlertHistory.findOne({ campaignId }).sort({ sentAt: -1 });
}

module.exports = {
  isInCooldown,
  recordHistory,
  getLastAlert,
};
