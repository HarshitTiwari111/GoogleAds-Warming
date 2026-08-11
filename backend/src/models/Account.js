const mongoose = require('mongoose');

/**
 * Merged Account model.
 *
 * Combines the two source projects' account records into one document:
 *  - Provisioning/monitoring side (Google-Ads-Automation): accountName,
 *    clientName/clientEmail, industry, website, currency, timeZone,
 *    campaignTemplate, warmupStartDate/warmupEndDate, notes, createdBy.
 *  - Warming/farming side (Warming-Farming): owner, sourceMccId,
 *    inviteEmail, billingBudget, dailyBudget, country, autoTagging,
 *    audienceUnknown, and the day-by-day warming schedule
 *    (warmingStage / warmingSchedule / warmingStartDate).
 *
 * `clientName` / `clientEmail` were required on the provisioning side but are
 * optional here, because the warming-side creation flow only asks for an
 * account name + invite email. `name` is kept as a read/write alias of
 * `accountName` so ported Warming-Farming code keeps working unchanged.
 */

// One day of the warming ramp: the daily budget the account should run at on
// that day, and whether that day has been applied yet.
const warmingDaySchema = new mongoose.Schema(
  {
    day: { type: Number, required: true },
    budget: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'completed', 'skipped'], default: 'pending' },
    completedAt: { type: Date },
  },
  { _id: false }
);

const accountSchema = new mongoose.Schema(
  {
    accountName: { type: String, required: true, trim: true },
    googleAdsCustomerId: { type: String, default: null, index: true },

    // Which MCC this account was actually created under. With multiple MCCs
    // configured, creation falls through the list until one succeeds, so the
    // winning MCC has to be recorded per-account — every later Google Ads call
    // for this customer must send it as `login-customer-id`.
    sourceMccId: { type: String, default: null, index: true },

    clientName: { type: String, trim: true, default: '' },
    clientEmail: { type: String, trim: true, default: '' },
    industry: { type: String, trim: true },
    website: { type: String, trim: true },

    // Google account invited to this Google Ads account (ADMIN access). The
    // invitation email is sent by Google itself — see
    // googleAdsService.sendAccountInvite.
    inviteEmail: { type: String, default: '', trim: true, lowercase: true },

    currency: { type: String, trim: true, uppercase: true, default: 'USD' },
    timeZone: { type: String, trim: true, default: 'Asia/Kolkata' },
    country: { type: String, default: 'India' },

    // Account-level spending limit pushed to Google Ads billing.
    billingBudget: { type: Number, default: 2 },
    // Daily budget used for campaigns created under this account.
    dailyBudget: { type: Number, default: 1 },

    autoTagging: { type: Boolean, default: false },
    audienceUnknown: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ['pending', 'created', 'warmup', 'warming', 'active', 'paused', 'suspended', 'ended', 'failed'],
      default: 'pending',
    },

    campaignTemplate: { type: String, default: 'warmup' },
    warmupStartDate: { type: Date, default: null },
    warmupEndDate: { type: Date, default: null },

    // Day-by-day warming ramp (Warming-Farming side).
    warmingStage: { type: Number, default: 0 },
    warmingSchedule: { type: [warmingDaySchema], default: [] },
    warmingStartDate: { type: Date, default: null },

    notes: { type: String },
    isDeleted: { type: Boolean, default: false },

    // `owner` is the media buyer the account belongs to; `createdBy` is who
    // actually created the record. They are usually the same user, but an
    // admin can create an account on someone else's behalf.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Warming-Farming called this field `name`; the provisioning side calls it
// `accountName`. Alias so both sets of ported code read and write the same
// underlying field.
accountSchema
  .virtual('name')
  .get(function () {
    return this.accountName;
  })
  .set(function (value) {
    this.accountName = value;
  });

accountSchema.index({ status: 1 });
accountSchema.index({ inviteEmail: 1 });
accountSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Account', accountSchema);
