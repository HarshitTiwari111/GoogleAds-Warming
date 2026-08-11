const mongoose = require('mongoose');
const env = require('../config/env');

/**
 * One document per landing page visit. Volume of these rows (per campaign,
 * within a time window) feeds the "Landing Click Count" rule.
 * `campaignId` matches Campaign.googleCampaignId by value (plain String).
 */
const landingClicksSchema = new mongoose.Schema(
  {
    campaignId: {
      type: String,
      required: true,
      index: true,
    },
    campaignName: {
      type: String,
      required: true,
    },
    gclid: {
      type: String,
      default: null,
      index: true,
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      required: true,
    },
    landingPageUrl: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: true }
);

landingClicksSchema.index({ campaignId: 1, timestamp: -1 });

// Auto-delete visits older than the retention window - only the rolling
// windowMinutes lookback (see landingClickService) ever needs recent rows.
landingClicksSchema.index({ timestamp: 1 }, { expireAfterSeconds: env.retention.landingClicksDays * 24 * 60 * 60 });

module.exports = mongoose.model('LandingClicks', landingClicksSchema);
