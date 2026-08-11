const mongoose = require('mongoose');

/**
 * Merged Campaign model.
 *
 * Combines three previously separate shapes:
 *  - Provisioning (Google-Ads-Automation, Project A): account, campaignType,
 *    dailyBudget, biddingStrategy, targetLocations, keywords, adGroupName,
 *    adHeadlines/adDescriptions, startDate/endDate.
 *  - Monitoring (Google-Ads-Automation, Project B): googleCampaignId as the
 *    join key onto CampaignMetrics / LandingClicks / GclidLogs /
 *    AlertHistory (all of which store it as a plain String, not a ref),
 *    plus `assignedTo` for per-media-buyer dashboard/alert routing and the
 *    no-clicks auto-warning counters.
 *  - Warming/farming (Warming-Farming): owner, sourceMccId, rolled-up
 *    performance counters (clicks/impressions/ctr/spend/cpc/conversions),
 *    device + country targeting, and the publish lifecycle
 *    (publishedAt / failedReason).
 *
 * On every monitoring poll cycle googleAdsService upserts a bare-bones
 * Campaign doc (id + name only) purely for the assignment registry, using
 * `$setOnInsert` so it never clobbers fields already set by the provisioning
 * or warming flow.
 */
const campaignSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
    // Deliberately no `default: null`. A sparse unique index only skips
    // documents where the field is ABSENT — an explicit null still counts as
    // a value, so every locally-created campaign that has not been pushed to
    // Google Ads yet would collide on null. Uniqueness is enforced by the
    // partial index below, which only covers real string ids.
    googleCampaignId: { type: String, default: undefined },
    campaignName: { type: String, required: true },
    campaignType: { type: String, enum: ['warmup', 'standard', 'custom'], default: 'warmup' },

    // MCC the parent account lives under — every Google Ads call for this
    // campaign must send it as `login-customer-id`.
    sourceMccId: { type: String, default: null, index: true },

    status: {
      type: String,
      enum: ['draft', 'pending', 'active', 'paused', 'published', 'completed', 'ended', 'failed'],
      default: 'draft',
    },

    // Set explicitly by the user at creation time (see campaignService
    // .resolveDailyBudget) — never randomised.
    dailyBudget: { type: Number, default: 1.0 },
    biddingStrategy: { type: String, default: 'MAXIMIZE_CLICKS' },
    targetLocations: [{ type: String }],
    keywords: [{ type: String }],
    adGroupName: { type: String },
    adHeadlines: [{ type: String }],
    adDescriptions: [{ type: String }],
    startDate: { type: Date },
    endDate: { type: Date },

    // Targeting (warming side).
    device: { type: [String], enum: ['all', 'mobile', 'desktop', 'tablet'], default: ['all'] },
    country: { type: [String], default: ['India'] },

    // Publish lifecycle (warming side) — see publishController.
    publishedAt: { type: Date },
    failedReason: { type: String },

    // Rolled-up performance, refreshed from Google Ads. ctr/cpc are derived
    // in the pre-save hook below.
    clicks: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    ctr: { type: Number, default: 0 },
    spend: { type: Number, default: 0 },
    cpc: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },

    // Assignment registry (monitoring side) — which media buyer owns this
    // campaign's alerts/dashboard visibility.
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    // Media buyer the campaign belongs to (warming side ownership scoping).
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // No-clicks auto-warning and auto-pause tracking.
    noClicksWarning: {
      count: { type: Number, default: 0 }, // Current warning count
      warningLimit: { type: Number, default: 3 }, // Auto-pause after this many warnings
      lastCheckedAt: { type: Date, default: null }, // When we last checked for clicks
      pausedAt: { type: Date, default: null }, // When campaign was auto-paused (if applicable)
      pauseReason: { type: String, default: null }, // Reason for auto-pause
      isAutoPaused: { type: Boolean, default: false }, // True if paused by the auto-warning system
    },
  },
  { timestamps: true }
);

// ctr/cpc are derived from clicks/impressions/spend. Writes that go through
// create()/save() keep them consistent; bulk updateOne/updateMany writes in
// the metrics pollers compute them inline instead.
campaignSchema.pre('save', function (next) {
  this.ctr = this.impressions > 0 ? (this.clicks / this.impressions) * 100 : 0;
  this.cpc = this.clicks > 0 ? this.spend / this.clicks : 0;
  next();
});

// Unique only among campaigns that actually carry a Google Ads id; any number
// of local-only campaigns may exist without one.
campaignSchema.index(
  { googleCampaignId: 1 },
  { unique: true, partialFilterExpression: { googleCampaignId: { $type: 'string' } } }
);
campaignSchema.index({ account: 1 });
campaignSchema.index({ status: 1 });
campaignSchema.index({ country: 1 });
campaignSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Campaign', campaignSchema);
