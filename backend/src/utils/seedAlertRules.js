/**
 * Seeds the default set of alert rules described in the project spec.
 * Safe to re-run: uses upsert on `type` so existing rules aren't duplicated.
 * Usage: npm run seed:rules
 *
 * LANDING_CLICK_COUNT and GCLID_COUNT thresholds come from CLICK_FREQUENCY_LIMIT
 * and GCLID_COUNT_LIMIT (both default 4 - "4 ya usse zyada") instead of being
 * hardcoded, so they can be tuned via env without touching code.
 */
const AlertRules = require('../models/AlertRules');
const env = require('../config/env');
const logger = require('./logger');

const DEFAULT_RULES = [
  {
    name: 'High Landing Click Volume',
    type: 'LANDING_CLICK_COUNT',
    description: 'Fires when landing page visits for a campaign reach the threshold within the window.',
    threshold: env.alerts.clickFrequencyLimit,
    windowMinutes: 60,
    cooldownMinutes: 15,
  },
  {
    name: 'High Unique GCLID Volume',
    type: 'GCLID_COUNT',
    description: 'Fires when unique GCLIDs recorded for a campaign reach the threshold within the window.',
    threshold: env.alerts.gclidCountLimit,
    windowMinutes: 60,
    cooldownMinutes: 15,
  },
  {
    name: 'Spend Limit Exceeded',
    type: 'SPEND_LIMIT',
    description: 'Fires when campaign spend exceeds the configured limit.',
    threshold: env.alerts.defaultSpendLimit,
    windowMinutes: 60,
    cooldownMinutes: 15,
  },
  {
    name: 'High Clicks with Low GCLIDs',
    type: 'HIGH_CLICKS_LOW_GCLID',
    description: 'Fires when clicks are high but the unique GCLID count is disproportionately low (possible click fraud / traffic quality issue).',
    threshold: 40,
    secondaryThreshold: 8,
    windowMinutes: 60,
    cooldownMinutes: 15,
  },
  {
    name: 'High Spend with Zero Conversions',
    type: 'HIGH_SPEND_ZERO_CONVERSIONS',
    description: 'Fires when spend exceeds the configured limit while conversions remain at zero.',
    threshold: env.alerts.defaultSpendLimit,
    windowMinutes: 60,
    cooldownMinutes: 15,
  },
];

/** Upserts all default rules. Requires an already-open mongoose connection. */
async function seedDefaultRules() {
  for (const rule of DEFAULT_RULES) {
    await AlertRules.findOneAndUpdate(
      { type: rule.type },
      { $setOnInsert: rule },
      { upsert: true, new: true }
    );
    logger.info(`Ensured rule exists: ${rule.type}`);
  }
  logger.info('Alert rule seeding complete');
}

// CLI entrypoint: `npm run seed:rules` connects, seeds, and exits.
// Skipped when this module is require()'d from elsewhere (e.g. server boot).
if (require.main === module) {
  require('dotenv').config();
  const mongoose = require('mongoose');

  (async () => {
    await mongoose.connect(env.mongoUri);
    logger.info('Connected to MongoDB for seeding alert rules');
    await seedDefaultRules();
    await mongoose.disconnect();
    process.exit(0);
  })().catch((err) => {
    logger.error(`Seeding failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { seedDefaultRules, DEFAULT_RULES };
