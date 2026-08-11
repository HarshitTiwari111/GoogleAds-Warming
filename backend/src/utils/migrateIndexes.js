/**
 * One-time migration: syncs every model's indexes to match its current
 * schema definition. Needed because AlertHistory/CampaignMetrics/
 * LandingClicks/GclidLogs (and now Campaign, with its unique/sparse
 * googleCampaignId index) can have indexes left over from an older schema
 * shape - MongoDB won't let a new index with the same key but different
 * options co-exist, so the old one must be dropped first. `syncIndexes()`
 * does exactly that: drops anything not in the schema, creates what's missing.
 *
 * Safe to re-run. Usage: npm run migrate:indexes
 */
const mongoose = require('mongoose');
const env = require('../config/env');
const logger = require('./logger');

const AlertHistory = require('../models/AlertHistory');
const CampaignMetrics = require('../models/CampaignMetrics');
const LandingClicks = require('../models/LandingClicks');
const GclidLogs = require('../models/GclidLogs');
const Campaign = require('../models/Campaign');
const User = require('../models/User');

async function migrateIndexes() {
  const models = [AlertHistory, CampaignMetrics, LandingClicks, GclidLogs, Campaign, User];
  for (const Model of models) {
    await Model.syncIndexes();
    logger.info(`Synced indexes for ${Model.modelName}`);
  }
}

if (require.main === module) {
  require('dotenv').config();

  (async () => {
    await mongoose.connect(env.mongoUri);
    logger.info('Connected to MongoDB for index migration');
    await migrateIndexes();
    await mongoose.disconnect();
    process.exit(0);
  })().catch((err) => {
    logger.error(`Index migration failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { migrateIndexes };
