const mongoose = require('mongoose');

const publishHistorySchema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  status: { type: String, enum: ['draft', 'ready', 'publishing', 'published', 'failed'], required: true },
  previousStatus: { type: String },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  errorMessage: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

publishHistorySchema.index({ campaign: 1 });
publishHistorySchema.index({ account: 1 });
publishHistorySchema.index({ createdAt: -1 });

module.exports = mongoose.model('PublishHistory', publishHistorySchema);
