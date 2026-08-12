const mongoose = require('mongoose');

const keywordSchema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  keyword: { type: String, required: true, trim: true },
  matchType: { type: String, enum: ['broad', 'phrase', 'exact'], required: true, default: 'broad' },
  isNegative: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'paused', 'removed'], default: 'active' },

  // Whether this keyword actually reached Google Ads. Kept per-record because
  // the local write succeeds independently of the push — a keyword saved here
  // but rejected by Google must not silently look live.
  googleResourceName: { type: String, default: null },
  syncState: {
    type: String,
    enum: ['pending', 'synced', 'failed', 'local-only'],
    default: 'pending',
  },
  syncError: { type: String, default: null },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

keywordSchema.index({ campaign: 1 });
keywordSchema.index({ matchType: 1 });
keywordSchema.index({ isNegative: 1 });

module.exports = mongoose.model('Keyword', keywordSchema);
