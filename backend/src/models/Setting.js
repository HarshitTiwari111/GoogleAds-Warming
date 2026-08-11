const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  category: { type: String, enum: ['countries', 'bid_strategies', 'campaign_types', 'budgets', 'warming', 'general', 'google_ads'], required: true },
  description: { type: String },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

settingSchema.index({ category: 1 });

module.exports = mongoose.model('Setting', settingSchema);
