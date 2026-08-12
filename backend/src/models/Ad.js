const mongoose = require('mongoose');

const adSchema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  headline1: { type: String, required: true, maxlength: 30, trim: true },
  headline2: { type: String, required: true, maxlength: 30, trim: true },
  headline3: { type: String, maxlength: 30, trim: true },
  description1: { type: String, required: true, maxlength: 90, trim: true },
  description2: { type: String, maxlength: 90, trim: true },
  finalUrl: { type: String, required: true, trim: true, match: [/^https?:\/\//, 'finalUrl must start with http:// or https://'] },
  status: { type: String, enum: ['active', 'paused', 'removed'], default: 'active' },

  // Whether this ad copy actually reached Google Ads. The local write succeeds
  // independently of the push, so an ad saved here but rejected by Google must
  // not silently look live.
  googleResourceName: { type: String, default: null },
  syncState: {
    type: String,
    enum: ['pending', 'synced', 'failed', 'local-only'],
    default: 'pending',
  },
  syncError: { type: String, default: null },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

adSchema.index({ campaign: 1 });
adSchema.index({ status: 1 });

module.exports = mongoose.model('Ad', adSchema);
