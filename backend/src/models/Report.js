const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
    reportType: { type: String, enum: ['daily', 'weekly', 'warmup_summary'], default: 'daily' },
    dateFrom: { type: Date, required: true },
    dateTo: { type: Date, required: true },
    metrics: {
      totalImpressions: { type: Number, default: 0 },
      totalClicks: { type: Number, default: 0 },
      totalSpend: { type: Number, default: 0 },
      avgCtr: { type: Number, default: 0 },
      avgCpc: { type: Number, default: 0 },
      totalConversions: { type: Number, default: 0 },
    },
    status: { type: String, enum: ['generating', 'ready', 'failed'], default: 'generating' },
    generatedBy: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Report', reportSchema);
