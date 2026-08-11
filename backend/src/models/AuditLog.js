const mongoose = require('mongoose');

const AUDIT_ACTIONS = [
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'PASSWORD_CHANGE',
  'PROFILE_UPDATE',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DELETED',
  'ROLE_CHANGED',
  'ACCOUNT_LOCKED',
  'ACCOUNT_UNLOCKED',
  'SETTINGS_UPDATED',
  'ALERT_CLEARED',
  'ACCOUNT_SYNCED',
  '2FA_ENABLED',
  '2FA_DISABLED',
];

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  userName: {
    type: String,
  },
  userEmail: {
    type: String,
  },
  action: {
    type: String,
    required: true,
    enum: AUDIT_ACTIONS,
  },
  details: {
    type: String,
  },
  ipAddress: {
    type: String,
  },
  userAgent: {
    type: String,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: '90d',
    index: true,
  },
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
