const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * Unified User model - single login (email + password) for both the
 * account-provisioning/warm-up automation side and the campaign-monitoring/
 * alerting side of the merged system.
 *
 * Roles: admin sees and manages everything across all users; user works
 * only with their own data (own accounts, own Google Ads connection, own
 * assigned campaigns and alerts).
 */
const ROLES = ['admin', 'user'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ROLES, default: 'user' },

    // Per-user Google Ads credential override (account-provisioning side).
    // Lets an admin/manager use their own Google Ads app/MCC instead of the
    // shared env-level credentials.
    googleAdsConfig: {
      clientId: { type: String, default: '' },
      clientSecret: { type: String, default: '' },
      developerToken: { type: String, default: '' },
      refreshToken: { type: String, default: '' },
      // Primary/default MCC. Kept for backwards compatibility — when
      // `managerAccountIds` is non-empty this is simply its first entry.
      managerAccountId: { type: String, default: '' },
      // Every MCC this user operates. Account creation walks this list in
      // order until one MCC accepts the new client account, which is what
      // makes a single login able to provision across several MCCs.
      managerAccountIds: { type: [String], default: [] },
      isConfigured: { type: Boolean, default: false },
      lastSyncedAt: { type: Date, default: null },
    },

    avatar: { type: String, default: '' },
    lastLogin: { type: Date },

    // Per-user Telegram alert routing (campaign-monitoring side). Falls back
    // to the shared env-level TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID when blank.
    telegramChatId: { type: String, default: '' },
    telegramBotToken: { type: String, default: '' },

    // Rule types this user doesn't want Telegram notifications for, even on
    // campaigns assigned to them. The rule still evaluates and is recorded
    // in AlertHistory (status MUTED) - only the Telegram send is skipped.
    mutedRuleTypes: { type: [String], default: [] },

    refreshTokens: [
      {
        token: { type: String, required: true },
        expiresAt: { type: Date, required: true },
        deviceInfo: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    knownDevices: [
      {
        deviceHash: String,
        browser: String,
        os: String,
        ip: String,
        lastSeen: { type: Date, default: Date.now },
      },
    ],

    twoFactorSecret: { type: String, select: false },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorBackupCodes: { type: [String], select: false },

    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    passwordChangedAt: { type: Date },

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.statics.ROLES = ROLES;

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  this.passwordChangedAt = Date.now();
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
