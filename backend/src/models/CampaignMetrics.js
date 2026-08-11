const mongoose = require('mongoose');
const env = require('../config/env');

/**
 * One document per campaign per poll cycle (every minute).
 * Historical rows are kept (not upserted) so trend/time-series queries work.
 * `campaignId` matches Campaign.googleCampaignId by value (plain String,
 * not an ObjectId ref) - see models/Campaign.js for why.
 */
const campaignMetricsSchema = new mongoose.Schema(
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
    // Google Ads campaign.status: ENABLED, PAUSED, or REMOVED. Defaults to
    // ENABLED for mock data / older rows that predate this field.
    status: {
      type: String,
      enum: ['ENABLED', 'PAUSED', 'REMOVED'],
      default: 'ENABLED',
    },
    spend: {
      type: Number,
      required: true,
      default: 0,
    },
    clicks: {
      type: Number,
      required: true,
      default: 0,
    },
    impressions: {
      type: Number,
      required: true,
      default: 0,
    },
    conversions: {
      type: Number,
      required: true,
      default: 0,
    },
    cpc: {
      type: Number,
      required: true,
      default: 0,
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: true }
);

campaignMetricsSchema.index({ campaignId: 1, timestamp: -1 });

// Auto-delete metrics rows older than the retention window - only recent
// history is needed for the dashboard's per-campaign charts.
campaignMetricsSchema.index({ timestamp: 1 }, { expireAfterSeconds: env.retention.campaignMetricsDays * 24 * 60 * 60 });

module.exports = mongoose.model('CampaignMetrics', campaignMetricsSchema);
