const jwt = require('jsonwebtoken');
const User = require('../models/User');
const GoogleAdsCache = require('../models/GoogleAdsCache');
const googleAdsService = require('../services/googleAdsService');
const env = require('../config/env');
const { auditFromReq } = require('../utils/auditLogger');
const logger = require('../utils/logger');

/**
 * GET /api/settings/users-status - admin only: every user's Google Ads
 * connection status + last sync, for the "All Users" table on Settings.
 */
exports.getAllUsersStatus = async (req, res, next) => {
  try {
    const [users, accountCaches] = await Promise.all([
      User.find().select('name email role active googleAdsConfig.refreshToken googleAdsConfig.managerAccountId createdAt'),
      GoogleAdsCache.find({ type: 'accounts' }).select('userId lastSynced data'),
    ]);
    const cacheByUser = new Map(accountCaches.map((c) => [String(c.userId), c]));

    const data = users.map((u) => {
      const connected = !!u.googleAdsConfig?.refreshToken;
      // Sync info only counts while connected - stale caches stay hidden.
      const cache = connected ? cacheByUser.get(String(u._id)) : null;
      return {
        userId: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active !== false,
        connected,
        mccId: u.googleAdsConfig?.managerAccountId || '',
        syncedAccounts: (cache?.data || []).length,
        lastSynced: cache?.lastSynced || null,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

exports.getSettings = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('googleAdsConfig');
    const config = user.googleAdsConfig || {};
    const connected = !!config.refreshToken;

    // Last sync comes from this user's cached account snapshot. Only reported
    // while connected, so a stale cache can't imply a live connection.
    let lastSync = null;
    if (connected) {
      const cache = await GoogleAdsCache.findOne({ userId: req.user.id, type: 'accounts' }).select('lastSynced');
      lastSync = cache?.lastSynced || null;
    }

    res.json({
      isConnected: connected,
      hasRefreshToken: connected,
      mccIds: config.managerAccountIds || [],
      primaryMccId: config.managerAccountId || '',
      lastSync,
    });
  } catch (error) {
    next(error);
  }
};

/* ------------------------------------------------------------------ *
 * Multi-MCC management
 *
 * A single login can provision across several manager accounts. The saved
 * list is walked in order at creation time until one MCC accepts the new
 * client account, so ordering here is meaningful — the first entry is the
 * preferred MCC.
 * ------------------------------------------------------------------ */

/** GET /api/settings/mccs — the MCC list saved on this user's connection. */
exports.getMccIds = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('googleAdsConfig');
    res.json({
      success: true,
      data: {
        mccIds: user?.googleAdsConfig?.managerAccountIds || [],
        primaryMccId: user?.googleAdsConfig?.managerAccountId || '',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/settings/mccs — replace the saved MCC list.
 * Ids are normalised to digits only, since Google Ads accepts them both
 * hyphenated (123-456-7890) and bare, but the API only takes them bare.
 */
exports.updateMccIds = async (req, res, next) => {
  try {
    const incoming = Array.isArray(req.body?.mccIds) ? req.body.mccIds : [];
    const normalised = [...new Set(
      incoming
        .map((id) => String(id).replace(/\D/g, ''))
        .filter(Boolean)
    )];

    const user = await User.findById(req.user.id);
    if (!user.googleAdsConfig) user.googleAdsConfig = {};
    user.googleAdsConfig.managerAccountIds = normalised;
    // Keep the legacy single-value field pointing at the preferred MCC.
    user.googleAdsConfig.managerAccountId = normalised[0] || '';
    await user.save();

    auditFromReq(req, {
      userId: req.user.id,
      userName: user.name,
      userEmail: user.email,
      action: 'SETTINGS_UPDATED',
      details: `MCC list set to [${normalised.join(', ') || 'none'}]`,
    });

    res.json({ success: true, data: { mccIds: normalised, primaryMccId: normalised[0] || '' } });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/settings/mccs/discover — every manager account the connected
 * Google login can actually reach, so the operator picks from real options
 * instead of typing ids by hand.
 */
exports.discoverMccIds = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('googleAdsConfig');
    const refreshToken = user?.googleAdsConfig?.refreshToken;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Google Ads not connected' });
    }

    const mccIds = await googleAdsService.findAllMccIds(refreshToken);
    res.json({ success: true, data: { mccIds, saved: user?.googleAdsConfig?.managerAccountIds || [] } });
  } catch (error) {
    next(error);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const { disconnect } = req.body;
    if (disconnect) {
      const user = await User.findById(req.user.id);
      if (user.googleAdsConfig) {
        user.googleAdsConfig.refreshToken = '';
        user.googleAdsConfig.isConfigured = false;
      }
      await user.save();

      // Also drop this user's synced snapshot - Dashboard/Accounts/Reports
      // read from GoogleAdsCache, so leaving it would keep showing the old
      // account/campaign data even though the connection is gone.
      await GoogleAdsCache.deleteMany({ userId: req.user.id });

      // Fire-and-forget audit for settings update
      auditFromReq(req, { userId: req.user.id, userName: user.name, userEmail: user.email, action: 'SETTINGS_UPDATED', details: 'Google Ads disconnected' });

      return res.json({ message: 'Disconnected', isConnected: false });
    }
    res.json({ message: 'OK' });
  } catch (error) {
    next(error);
  }
};

/**
 * Where the OAuth proxy should send the user back to.
 *
 * Derived from the request itself, so a deployment works with no extra
 * configuration and can never send a half-formed value: the proxy rejects
 * anything that isn't an absolute origin, and a hosting platform that
 * interpolates a service *name* rather than a URL into FRONTEND_URL produced
 * exactly that failure.
 *
 * FRONTEND_URL stays supported as an explicit override for the case where the
 * frontend is served from a different domain than the API, but it is only used
 * when it is a full absolute URL.
 */
function resolveReturnUrl(req) {
  const configured = (env.frontendUrl || '').trim();
  if (/^https?:\/\/.+/i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }

  if (configured) {
    logger.warn(
      `[OAUTH] Ignoring FRONTEND_URL="${configured}" — it is not an absolute URL. ` +
      'Using the request origin instead. Set it to something like https://your-app.example.com, or leave it unset.'
    );
  }

  // `trust proxy` is enabled in app.js, so req.protocol reflects
  // X-Forwarded-Proto and this stays https behind a platform load balancer.
  return `${req.protocol}://${req.get('host')}`;
}

exports.generateAuthUrl = async (req, res, next) => {
  try {
    const returnUrl = resolveReturnUrl(req);
    const oauthBaseUrl = env.oauthProxyUrl || 'https://secure.dataram.workers.dev/auth/login';
    const url = `${oauthBaseUrl}?return_url=${encodeURIComponent(returnUrl)}`;
    logger.info(`[OAUTH] Auth URL generated with return_url=${returnUrl}`);
    res.json({ url });
  } catch (error) {
    next(error);
  }
};

exports.saveToken = async (req, res, next) => {
  try {
    const { refresh_token, token, credentials } = req.body;
    const receivedToken = refresh_token || token || credentials;

    if (!receivedToken) {
      return res.status(400).json({ message: 'No token provided' });
    }

    const user = await User.findById(req.user.id);
    if (!user.googleAdsConfig) user.googleAdsConfig = {};
    user.googleAdsConfig.refreshToken = receivedToken;
    user.googleAdsConfig.isConfigured = true;
    await user.save();

    // Fire-and-forget audit for settings update
    auditFromReq(req, { userId: req.user.id, userName: user.name, userEmail: user.email, action: 'SETTINGS_UPDATED', details: 'Google Ads token saved' });

    res.json({ message: 'Connected successfully', isConnected: true });
  } catch (error) {
    next(error);
  }
};

exports.debugToken = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('googleAdsConfig');
    const token = user?.googleAdsConfig?.refreshToken || '';
    const masked = token ? `****${token.slice(-4)}` : '';
    res.json({
      refreshToken: masked,
      managerAccountId: user?.googleAdsConfig?.managerAccountId || '',
      isConfigured: user?.googleAdsConfig?.isConfigured || false,
    });
  } catch (error) {
    next(error);
  }
};

exports.testWorkerApi = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('googleAdsConfig');
    const refreshToken = user?.googleAdsConfig?.refreshToken;

    if (!refreshToken) {
      return res.status(400).json({ error: 'No refresh token found' });
    }

    const WORKER = 'https://secure.dataram.workers.dev';
    const results = { tokenAvailable: !!refreshToken };

    // Step 1: listAccessibleCustomers
    try {
      const r1 = await fetch(`${WORKER}/api/v24/customers:listAccessibleCustomers`, {
        method: 'GET',
        headers: { 'x-user-refresh-token': refreshToken },
      });
      const t1 = await r1.text();
      results.accessibleCustomers = { status: r1.status, body: '[hidden]' };

      if (r1.ok) {
        const parsed = JSON.parse(t1);
        const customerIds = (parsed.resourceNames || []).map((rn) => rn.replace('customers/', ''));
        results.customerIds = customerIds;

        // Step 2: Try fetching customer info for first account
        if (customerIds.length > 0) {
          const cid = customerIds[0];
          const query = 'SELECT customer.id, customer.descriptive_name, customer.status FROM customer LIMIT 1';
          const r2 = await fetch(`${WORKER}/api/v24/customers/${cid}/googleAds:search`, {
            method: 'POST',
            headers: { 'x-user-refresh-token': refreshToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
          });
          const t2 = await r2.text();
          results.customerInfo = { status: r2.status, body: t2.substring(0, 500) };
        }
      }
    } catch (e) { results.error = e.message; }

    res.json(results);
  } catch (error) {
    next(error);
  }
};
