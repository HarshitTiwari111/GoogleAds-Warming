const LandingClicks = require('../models/LandingClicks');

/** Persists a single landing page visit. */
async function recordVisit({ campaignId, campaignName, gclid, ipAddress, userAgent, landingPageUrl }) {
  return LandingClicks.create({
    campaignId,
    campaignName,
    gclid: gclid || null,
    ipAddress,
    userAgent,
    landingPageUrl,
  });
}

/**
 * Counts landing page visits for a campaign within the last `windowMinutes`.
 * Used by the rule engine for the LANDING_CLICK_COUNT rule.
 */
async function countRecentVisits(campaignId, windowMinutes) {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  return LandingClicks.countDocuments({ campaignId, timestamp: { $gte: since } });
}

module.exports = {
  recordVisit,
  countRecentVisits,
};
