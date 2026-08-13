const express = require('express');
const mongoose = require('mongoose');
const { requireAuth } = require('../middleware/auth');

const authRoutes = require('./authRoutes');
const twoFactorRoutes = require('./twoFactorRoutes');
const trackingRoutes = require('./trackingRoutes');
const accountRoutes = require('./accountRoutes');
const campaignRoutes = require('./campaignRoutes');
const performanceRoutes = require('./performanceRoutes');
const reportRoutes = require('./reportRoutes');
const settingsRoutes = require('./settingsRoutes');
const { oauthCallback } = require('../controllers/settingsController');
const alertRoutes = require('./alertRoutes');
const ruleRoutes = require('./ruleRoutes');
const userRoutes = require('./userRoutes');
const auditRoutes = require('./auditRoutes');

// Ported from the warming/farming project.
const keywordRoutes = require('./keywordRoutes');
const adRoutes = require('./adRoutes');
const publishRoutes = require('./publishRoutes');
const warmingRoutes = require('./warmingRoutes');
const notificationRoutes = require('./notificationRoutes');
const activityLogRoutes = require('./activityLogRoutes');
const appSettingsRoutes = require('./appSettingsRoutes');
const dashboardRoutes = require('./dashboardRoutes');

const router = express.Router();

const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];
const dbStatus = () => ({
  state: DB_STATES[mongoose.connection.readyState] || 'unknown',
  ok: mongoose.connection.readyState === 1,
});

/**
 * The commit this process is running, resolved once at boot.
 *
 * Deploying the frontend build without restarting the backend leaves the two
 * on different code, and the symptom — a fix that visibly shipped but doesn't
 * take effect — is indistinguishable from the fix not working. This makes the
 * running backend say which commit it is, so that is one request to check.
 *
 * Render and similar platforms expose the commit in the environment; a plain
 * VPS deploy has a git checkout instead, so fall back to asking git.
 */
const startedAt = new Date();

const commit = (() => {
  const fromEnv = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || process.env.SOURCE_COMMIT;
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    // eslint-disable-next-line global-require
    return require('child_process')
      .execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    // No git checkout and no env var — an upload-only deploy. Not an error.
    return 'unknown';
  }
})();

/**
 * Liveness — "the process is up". Always 200 so a platform health check marks
 * the deploy live and its logs and this endpoint stay reachable.
 *
 * Deliberately not tied to the database: gating this on Mongo means a bad
 * MONGODB_URI leaves the deploy hanging on the health check forever, which
 * hides the very error you need to read. The `database` field reports the
 * real state instead.
 */
router.get('/health', (req, res) => {
  const db = dbStatus();
  res.json({
    success: true,
    message: db.ok ? 'OK' : 'Running, but the database is unreachable',
    database: db.state,
    commit,
    // When this process last started. Uploading files over FTP does not
    // reload a running Node process, so an old startedAt is the clearest sign
    // that the code on disk is not the code being served.
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness — "the app can actually serve data". 503 while the database is
 * down. Use this one for load-balancer routing decisions, not for the
 * platform's deploy gate.
 */
router.get('/health/ready', (req, res) => {
  const db = dbStatus();
  res.status(db.ok ? 200 : 503).json({
    success: db.ok,
    message: db.ok ? 'Ready' : 'Database unavailable',
    database: db.state,
    timestamp: new Date().toISOString(),
  });
});

// Public routes: login/register, and the landing-page tracking pixel.
router.use('/auth', authRoutes);
router.use('/auth/2fa', requireAuth, twoFactorRoutes);
router.use('/tracking', trackingRoutes);

// Protected routes.
router.use('/accounts', requireAuth, accountRoutes);

// Campaign-scoped keyword/ad-copy collections. Mounted before the campaign
// router so /campaigns/:campaignId/keywords is not captured by its /:id route.
router.use('/campaigns/:campaignId/keywords', requireAuth, keywordRoutes);
router.use('/campaigns/:campaignId/ads', requireAuth, adRoutes);
router.use('/campaigns', requireAuth, campaignRoutes);

// Flat collections for the standalone Keywords / Ad Copies pages.
router.use('/keywords', requireAuth, keywordRoutes);
router.use('/ads', requireAuth, adRoutes);

router.use('/publish', requireAuth, publishRoutes);
router.use('/warming', requireAuth, warmingRoutes);
router.use('/notifications', requireAuth, notificationRoutes);
router.use('/activity-logs', requireAuth, activityLogRoutes);
// Workspace-wide option lists and defaults (distinct from /settings, which is
// the caller's own Google Ads connection).
router.use('/app-settings', requireAuth, appSettingsRoutes);
router.use('/dashboard', requireAuth, dashboardRoutes);
router.use('/performance', requireAuth, performanceRoutes);
router.use('/reports', requireAuth, reportRoutes);
// Settings = each user's own Google Ads connection, so every user gets it.
// Public by necessity: Google redirects the browser straight here with no
// Authorization header. The caller is identified by the signed `state` the
// consent URL carried, and the code exchange happens server-side.
router.get('/settings/oauth-callback', oauthCallback);

router.use('/settings', requireAuth, settingsRoutes);
router.use('/alerts', requireAuth, alertRoutes);
router.use('/rules', requireAuth, ruleRoutes);
router.use('/users', requireAuth, userRoutes);
router.use('/audit-logs', requireAuth, auditRoutes);

module.exports = router;
