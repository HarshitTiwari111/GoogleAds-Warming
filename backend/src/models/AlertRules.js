const mongoose = require('mongoose');

/**
 * Rule types supported by the rule engine (services/ruleEngine.js).
 * Keeping this as a fixed enum (rather than free-form strings) means the
 * engine can safely switch on `type` without guarding against typos in the DB.
 */
const RULE_TYPES = [
  'LANDING_CLICK_COUNT',
  'GCLID_COUNT',
  'SPEND_LIMIT',
  'HIGH_CLICKS_LOW_GCLID',
  'HIGH_SPEND_ZERO_CONVERSIONS',
];

const alertRulesSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: RULE_TYPES,
    },
    description: {
      type: String,
      default: '',
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    // Primary numeric threshold. Meaning depends on `type`:
    //  - LANDING_CLICK_COUNT: min landing clicks in window
    //  - GCLID_COUNT: min unique gclids in window
    //  - SPEND_LIMIT / HIGH_SPEND_ZERO_CONVERSIONS: spend limit ($)
    //  - HIGH_CLICKS_LOW_GCLID: min clicks
    threshold: {
      type: Number,
      required: true,
    },
    // Only used by HIGH_CLICKS_LOW_GCLID: max gclid count that still counts as "low".
    secondaryThreshold: {
      type: Number,
      default: null,
    },
    // Rolling lookback window (minutes) used for count-based rules.
    windowMinutes: {
      type: Number,
      default: 60,
    },
    // Minutes to wait before the same campaign+rule can alert again.
    cooldownMinutes: {
      type: Number,
      default: 15,
    },
  },
  { timestamps: true }
);

alertRulesSchema.statics.RULE_TYPES = RULE_TYPES;

module.exports = mongoose.model('AlertRules', alertRulesSchema);
