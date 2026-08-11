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

/**
 * Run one boot step without letting it take the process down.
 *
 * Seeding and index migration are best-effort: a failure leaves the server
 * running and diagnosable rather than crash-looping, which on a hosting
 * platform means no port, no health check, and no way to read the real error.
 */
async function bootStep(label, fn) {
  try {
    await fn();
  } catch (err) {
    logger.error(`[BOOT] ${label} failed: ${err.message}`);
  }
}

async function start() {
  const dbConnected = await connectDB();

  // Listen before seeding. The previous order meant a failed seed rejected
  // start() before app.listen() ever ran, so the platform saw no open port
  // and killed the container in a loop.
  app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port} [${env.nodeEnv}]`);

    if (!dbConnected) {
      logger.error('[BOOT] Started without a database — fix MONGODB_URI and redeploy. API routes that read or write data will fail until then.');
      return;
    }

    // Idempotent (upsert-based), so a fresh deploy works without a separate
    // manual seed step.
    (async () => {
      await bootStep('alert rule seeding', seedDefaultRules);
      await bootStep('admin user seeding', seedAdminUser);
      await bootStep('default settings seeding', seedDefaultSettings);
      await bootStep('index migration', migrateIndexes);

      // Started last: the jobs query collections the steps above create.
      startAllJobs();
    })();
  });
}

process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled rejection: ${err?.message || err}`);
});

start().catch((err) => {
  logger.error(`Fatal startup error: ${err.message}`);
  process.exit(1);
});
