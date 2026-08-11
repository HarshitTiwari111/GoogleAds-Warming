const mongoose = require('mongoose');

const googleAdsCacheSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['accounts', 'campaigns'], required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: [] },
  lastSynced: { type: Date, default: Date.now },
});

googleAdsCacheSchema.index({ userId: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('GoogleAdsCache', googleAdsCacheSchema);
