const mongoose = require('mongoose');

const performanceSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
    date: { type: Date, required: true },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    spend: { type: Number, default: 0 },
    ctr: { type: Number, default: 0 },
    avgCpc: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    qualityScore: { type: Number, default: null },
    searchImpressionShare: { type: Number, default: null },
  },
  { timestamps: true }
);

performanceSchema.index({ account: 1, campaign: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Performance', performanceSchema);
