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

// Reports database reachability too: the server intentionally starts even
// when Mongo is unreachable, so "the site loads" is not on its own proof that
// the deployment is healthy.
router.get('/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const dbState = states[mongoose.connection.readyState] || 'unknown';
  const dbOk = mongoose.connection.readyState === 1;

  res.status(dbOk ? 200 : 503).json({
    success: dbOk,
    message: dbOk ? 'OK' : 'Database unavailable',
    database: dbState,
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
router.use('/settings', requireAuth, settingsRoutes);
router.use('/alerts', requireAuth, alertRoutes);
router.use('/rules', requireAuth, ruleRoutes);
router.use('/users', requireAuth, userRoutes);
router.use('/audit-logs', requireAuth, auditRoutes);

module.exports = router;
