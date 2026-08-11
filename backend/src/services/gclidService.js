const logger = require('../utils/logger');
const GclidLogs = require('../models/GclidLogs');

/**
 * Records a gclid exactly once. Relies on the unique index on `gclid`
 * (see models/GclidLogs.js) rather than a find-then-insert check, so this
 * stays correct under concurrent requests hitting the tracking endpoint.
 *
 * @returns {Promise<{ isNew: boolean, doc: object }>}
 */
async function recordGclid({ gclid, campaignId, campaignName, landingPageUrl, ipAddress }) {
  if (!gclid) {
    return { isNew: false, doc: null };
  }

  try {
    const doc = await GclidLogs.create({
      gclid,
      campaignId,
      campaignName,
      landingPageUrl,
      ipAddress,
    });
    return { isNew: true, doc };
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate gclid - already tracked, not an error condition.
      const existing = await GclidLogs.findOne({ gclid });
      return { isNew: false, doc: existing };
    }
    logger.error(`Failed to record gclid ${gclid}: ${error.message}`);
    throw error;
  }
}

/**
 * Counts unique gclids for a campaign recorded within the last `windowMinutes`.
 * Used by the rule engine for GCLID_COUNT and HIGH_CLICKS_LOW_GCLID rules.
 */
async function countRecentGclids(campaignId, windowMinutes) {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  return GclidLogs.countDocuments({ campaignId, firstSeenAt: { $gte: since } });
}

module.exports = {
  recordGclid,
  countRecentGclids,
};
