// Resolve .env relative to this file (not process.cwd()) so it loads
// correctly regardless of the directory the process happens to be started
// from (e.g. a process manager or launcher invoking `node backend/server.js`
// from somewhere other than the backend/ folder).
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

/**
 * Centralized, validated access to environment variables.
 * Every other module reads config through here instead of process.env directly,
 * so a missing/misconfigured value fails fast at boot instead of deep in a cron cycle.
 */

// Simulation mode: canonical var is GOOGLE_ADS_SIMULATION_MODE, but we also
// accept the legacy names used by the two source projects (SIMULATION_MODE
// from the account-provisioning project, GOOGLE_ADS_MOCK_MODE from the
// campaign-monitoring project) so existing deploy configs keep working.
function resolveSimulationMode() {
  const raw =
    process.env.GOOGLE_ADS_SIMULATION_MODE ??
    process.env.SIMULATION_MODE ??
    process.env.GOOGLE_ADS_MOCK_MODE ??
    'true';
  return String(raw).toLowerCase() === 'true';
}

// MCC / manager account id: GOOGLE_ADS_MANAGER_ACCOUNT_ID is canonical, but
// GOOGLE_ADS_LOGIN_CUSTOMER_ID (Project B's name for the same value) is
// accepted as an alias.
const managerAccountId =
  process.env.GOOGLE_ADS_MANAGER_ACCOUNT_ID || process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '';

const env = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/google-ads-automation',

  corsOrigin: process.env.CORS_ORIGIN || '*',

  oauthProxyUrl: process.env.OAUTH_PROXY_URL || 'https://secure.dataram.workers.dev/auth/login',

  // Where the OAuth callback page's "Go back to Settings" link/redirect
  // points - must match wherever the frontend is actually served (was
  // previously hardcoded to Project A's old CRA port, 3000).
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5180',

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-only-insecure-refresh-secret-change-me',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    seedAdminName: process.env.ADMIN_NAME || 'Admin',
    seedAdminEmail: (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase(),
    seedAdminPassword: process.env.ADMIN_PASSWORD || 'changeme123',
  },

  googleAds: {
    simulationMode: resolveSimulationMode(),
    clientId: process.env.GOOGLE_ADS_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN || '',
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID || '',
    managerAccountId,
    // Kept for the handful of places that historically read loginCustomerId.
    loginCustomerId: managerAccountId,
  },

  campaignDefaults: {
    dailyBudget: parseFloat(process.env.DEFAULT_DAILY_BUDGET) || 1,
    namePrefix: process.env.DEFAULT_CAMPAIGN_NAME_PREFIX || 'Warmup',
  },

  warmupDays: parseInt(process.env.WARMUP_DAYS, 10) || 14,

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    // Fallback destination for alerts on campaigns nobody has been assigned to
    // yet. Once a campaign is assigned, its alerts go to that media buyer's
    // own telegramChatId instead (see ruleEngine.js).
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },

  cron: {
    campaignFetch: process.env.CAMPAIGN_FETCH_CRON || '*/1 * * * *',
    monitoring: process.env.MONITORING_CRON || '0 */6 * * *',
    dailyReport: process.env.DAILY_REPORT_CRON || '0 0 * * *',
    weeklyReport: process.env.WEEKLY_REPORT_CRON || '0 1 * * 1',
  },

  alerts: {
    defaultCooldownMinutes: parseInt(process.env.DEFAULT_ALERT_COOLDOWN_MINUTES, 10) || 15,
    defaultSpendLimit: parseFloat(process.env.DEFAULT_SPEND_LIMIT) || 50,
    // "4 ya usse zyada" - click frequency / GCLID count threshold defaults.
    clickFrequencyLimit: parseInt(process.env.CLICK_FREQUENCY_LIMIT, 10) || 4,
    gclidCountLimit: parseInt(process.env.GCLID_COUNT_LIMIT, 10) || 4,
  },

  noClicksWarning: {
    // Default warning limit before auto-pause (can be overridden per campaign)
    defaultWarningLimit: parseInt(process.env.NO_CLICKS_WARNING_LIMIT, 10) || 3,
    // Monitoring period in minutes (how often to check for clicks)
    monitoringPeriodMinutes: parseInt(process.env.NO_CLICKS_MONITORING_PERIOD_MINUTES, 10) || 5,
  },

  // How long to keep time-series/log data before MongoDB auto-deletes it
  // (TTL indexes) - these collections grow every minute/click and would
  // otherwise fill up storage indefinitely.
  retention: {
    alertHistoryDays: parseInt(process.env.ALERT_HISTORY_RETENTION_DAYS, 10) || 30,
    campaignMetricsDays: parseInt(process.env.METRICS_RETENTION_DAYS, 10) || 30,
    landingClicksDays: parseInt(process.env.LANDING_CLICKS_RETENTION_DAYS, 10) || 30,
    gclidLogsDays: parseInt(process.env.GCLID_RETENTION_DAYS, 10) || 180,
  },

  email: {
    host: process.env.EMAIL_HOST || '',
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || '',
    from: process.env.EMAIL_FROM || '',
  },
};

// Fail fast if critical secrets are not configured in production
if (env.nodeEnv === 'production') {
  if (env.auth.jwtSecret === 'dev-only-insecure-secret-change-me') {
    throw new Error('JWT_SECRET must be set in production');
  }
  if (env.auth.refreshSecret === 'dev-only-insecure-refresh-secret-change-me') {
    throw new Error('JWT_REFRESH_SECRET must be set in production');
  }
  if (env.auth.seedAdminPassword === 'changeme123') {
    console.warn('[SECURITY] Default admin password is active — set ADMIN_PASSWORD env var');
  }
  if (env.corsOrigin === '*') {
    console.warn('[SECURITY] CORS_ORIGIN is set to wildcard (*) — set to your frontend domain');
  }
}

module.exports = env;
