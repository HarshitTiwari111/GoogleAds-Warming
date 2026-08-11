const mongoose = require('mongoose');

const keywordSchema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  keyword: { type: String, required: true, trim: true },
  matchType: { type: String, enum: ['broad', 'phrase', 'exact'], required: true, default: 'broad' },
  isNegative: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'paused', 'removed'], default: 'active' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

keywordSchema.index({ campaign: 1 });
keywordSchema.index({ matchType: 1 });
keywordSchema.index({ isNegative: 1 });

module.exports = mongoose.model('Keyword', keywordSchema);
