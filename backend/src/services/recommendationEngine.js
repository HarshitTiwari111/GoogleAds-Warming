/**
 * Recommendation thresholds. Kept separate from AlertRules (which decide
 * WHETHER to alert) because a recommendation is also shown on the dashboard
 * for campaigns that haven't crossed an alert threshold yet.
 */
const HIGH_CLICKS_MIN = 40;
const LOW_GCLID_RATIO = 0.2; // gclidCount / clicks below this => traffic quality issue
const HEALTHY_GCLID_RATIO = 0.8; // gclidCount / clicks at/above this => strong conversion signal
const LOW_CLICKS_MAX = 20;

/**
 * Decides a single, human-readable optimization recommendation from a
 * campaign's current metrics. Priority order matters: a zero-conversion
 * overspend is always the most urgent signal.
 */
function getRecommendation({ clicks = 0, gclidCount = 0, spend = 0, conversions = 0, spendLimit }) {
  if (spendLimit != null && spend > spendLimit && conversions === 0) {
    return { action: 'Pause Campaign', status: 'CRITICAL' };
  }

  const ratio = clicks > 0 ? gclidCount / clicks : 0;

  if (clicks >= HIGH_CLICKS_MIN && ratio <= LOW_GCLID_RATIO) {
    return { action: 'Decrease Traffic Frequency', status: 'WARNING' };
  }

  if (clicks <= LOW_CLICKS_MAX && ratio >= HEALTHY_GCLID_RATIO) {
    return { action: 'Increase Traffic Frequency', status: 'HEALTHY' };
  }

  return { action: 'Monitor Campaign', status: 'HEALTHY' };
}

module.exports = {
  getRecommendation,
  HIGH_CLICKS_MIN,
  LOW_GCLID_RATIO,
  HEALTHY_GCLID_RATIO,
  LOW_CLICKS_MAX,
};
