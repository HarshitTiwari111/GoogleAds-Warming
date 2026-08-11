const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  entity: { type: String, required: true, enum: ['account', 'campaign', 'keyword', 'ad', 'user', 'settings', 'publish', 'warming'] },
  entityId: { type: mongoose.Schema.Types.ObjectId },
  details: { type: String },
  ipAddress: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

activityLogSchema.index({ user: 1 });
activityLogSchema.index({ entity: 1 });
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ action: 1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
