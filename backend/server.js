require('dotenv').config();

const env = require('./src/config/env');
const logger = require('./src/utils/logger');
const connectDB = require('./src/config/db');
const app = require('./src/app');
const { seedDefaultRules } = require('./src/utils/seedAlertRules');
const { seedAdminUser } = require('./src/utils/seedAdminUser');
const { seedDefaultSettings } = require('./src/controllers/appSettingsController');
const { migrateIndexes } = require('./src/utils/migrateIndexes');
const { startAllJobs } = require('./src/cron/scheduler');

async function start() {
  await connectDB();

  // Idempotent - safe to run on every boot (upsert-based), so a fresh
  // deploy works without a separate manual seed step.
  await seedDefaultRules();
  await seedAdminUser();
  // Option lists the creation forms read (countries, budgets, warming ramp).
  await seedDefaultSettings();
  await migrateIndexes();

  app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port} [${env.nodeEnv}]`);
    startAllJobs();
  });
}

process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled rejection: ${err.message}`);
});

start();
