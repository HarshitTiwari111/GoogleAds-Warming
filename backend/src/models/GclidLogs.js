const mongoose = require('mongoose');
const env = require('../config/env');

/**
 * One document per UNIQUE gclid ever seen. The unique index on `gclid` is
 * the actual duplicate-prevention mechanism (see gclidService.recordGclid).
 * `campaignId` matches Campaign.googleCampaignId by value (plain String).
 */
const gclidLogsSchema = new mongoose.Schema(
  {
    gclid: {
      type: String,
      required: true,
      unique: true,
    },
    campaignId: {
      type: String,
      required: true,
      index: true,
    },
    campaignName: {
      type: String,
      required: true,
    },
    landingPageUrl: {
      type: String,
      default: '',
    },
    ipAddress: {
      type: String,
      default: '',
    },
    firstSeenAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Auto-delete gclid records older than the retention window. Real Google
// Ads gclids are unique per click and never legitimately recur, so a long
// retention (default 180 days) bounds storage growth without risking a
// stale click being miscounted as "new" again in practice.
gclidLogsSchema.index({ firstSeenAt: 1 }, { expireAfterSeconds: env.retention.gclidLogsDays * 24 * 60 * 60 });

module.exports = mongoose.model('GclidLogs', gclidLogsSchema);
