const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const asyncHandler = require('../middleware/asyncHandler');
const env = require('../config/env');
const User = require('../models/User');
const { auditFromReq } = require('../utils/auditLogger');
const { parseDevice } = require('../utils/deviceDetector');
const { sendTelegramMessage } = require('../services/telegramService');
const logger = require('../utils/logger');

const REFRESH_COOKIE = 'gads_refresh';
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

function signAccessToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, env.auth.jwtSecret, {
    expiresIn: env.auth.accessExpiresIn,
  });
}

function signRefreshToken(user) {
  return jwt.sign({ id: user._id }, env.auth.refreshSecret, {
    expiresIn: env.auth.jwtExpiresIn, // 7d
  });
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_MAX_AGE,
    path: '/api/auth',
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
  });
}

function toSafeUser(user) {
  return { id: user._id, name: user.name, email: user.email, role: user.role };
}

/** POST /api/auth/register - public. Role always defaults to 'user' here. */
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'name, email and password are required' });
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return res.status(400).json({ success: false, message: 'User already exists' });
  }

  const user = await User.create({ name, email, password });

  // Generate token pair
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  // Hash and store refresh token
  const hashedRefresh = await bcrypt.hash(refreshToken, 10);
  user.refreshTokens.push({
    token: hashedRefresh,
    expiresAt: new Date(Date.now() + REFRESH_MAX_AGE),
    deviceInfo: req.headers['user-agent'] || '',
  });
  await user.save({ validateBeforeSave: false });

  setRefreshCookie(res, refreshToken);

  // Fire-and-forget audit
  auditFromReq(req, { userId: user._id, userName: user.name, userEmail: user.email, action: 'USER_CREATED', details: 'New user registered' });

  res.status(201).json({ token: accessToken, user: toSafeUser(user) });
});

/** POST /api/auth/login - body { email, password }. */
const login = asyncHandler(async (req, res) => {
  const { email, password, twoFactorToken } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'email and password are required' });
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !user.active) {
    return res.status(400).json({ success: false, message: 'Invalid credentials' });
  }

  if (user.lockedUntil && user.lockedUntil > Date.now()) {
    return res.status(423).json({ success: false, message: 'Account temporarily locked. Try again later.' });
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= 5) {
      user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      // Fire-and-forget audit for account lock
      auditFromReq(req, { userId: user._id, userName: user.name, userEmail: user.email, action: 'ACCOUNT_LOCKED', details: 'Account locked after 5 failed attempts' });
    }
    await user.save({ validateBeforeSave: false });

    // Fire-and-forget audit for failed login
    auditFromReq(req, { userId: user._id, userName: user.name, userEmail: user.email, action: 'LOGIN_FAILED', details: 'Invalid password' });

    // Alert on multiple consecutive failed attempts (3+)
    if (user.failedLoginAttempts >= 3 && user.telegramChatId) {
      const device = parseDevice(req);
      const failedMsg = [
        '⚠️ Multiple failed login attempts',
        '',
        `Account: ${user.email}`,
        `Attempts: ${user.failedLoginAttempts}`,
        `IP: ${device.ip}`,
        `Time: ${new Date().toLocaleString()}`,
        '',
        'Your account will be locked after 5 failed attempts.',
      ].join('\n');
      // Fire-and-forget - don't slow down the response
      sendTelegramMessage(failedMsg, user.telegramChatId, user.telegramBotToken || env.telegram.botToken)
        .catch((err) => logger.error('Failed to send login-failed Telegram alert:', err.message));
    }

    return res.status(400).json({ success: false, message: 'Invalid credentials' });
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;

  // --- Two-Factor Authentication check ---
  if (user.twoFactorEnabled) {
    if (!twoFactorToken) {
      // Password correct but 2FA required - signal frontend to show 2FA form
      await user.save({ validateBeforeSave: false });
      return res.status(200).json({ success: false, requires2FA: true, message: 'Two-factor authentication required' });
    }

    // Load 2FA secrets for verification
    const user2FA = await User.findById(user._id).select('+twoFactorSecret +twoFactorBackupCodes');

    // Try TOTP verification first
    let twoFactorValid = speakeasy.totp.verify({
      secret: user2FA.twoFactorSecret,
      encoding: 'base32',
      token: twoFactorToken,
      window: 1,
    });

    // If TOTP fails, try backup codes
    if (!twoFactorValid && user2FA.twoFactorBackupCodes && user2FA.twoFactorBackupCodes.length > 0) {
      for (let i = 0; i < user2FA.twoFactorBackupCodes.length; i++) {
        const matches = await bcrypt.compare(twoFactorToken, user2FA.twoFactorBackupCodes[i]);
        if (matches) {
          twoFactorValid = true;
          // Remove used backup code (one-time use)
          user2FA.twoFactorBackupCodes.splice(i, 1);
          await user2FA.save({ validateBeforeSave: false });
          break;
        }
      }
    }

    if (!twoFactorValid) {
      return res.status(400).json({ success: false, message: 'Invalid two-factor code' });
    }
  }

  // Purge expired refresh tokens while we're here
  user.refreshTokens = user.refreshTokens.filter((rt) => rt.expiresAt > new Date());

  // Generate token pair
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  // Hash and store refresh token
  const hashedRefresh = await bcrypt.hash(refreshToken, 10);
  user.refreshTokens.push({
    token: hashedRefresh,
    expiresAt: new Date(Date.now() + REFRESH_MAX_AGE),
    deviceInfo: req.headers['user-agent'] || '',
  });

  // --- Device detection & new-device alerts ---
  const device = parseDevice(req);
  const existingDevice = user.knownDevices.find((d) => d.deviceHash === device.deviceHash);

  if (existingDevice) {
    // Known device - update last seen and IP
    existingDevice.lastSeen = new Date();
    existingDevice.ip = device.ip;
  } else {
    // New device detected
    user.knownDevices.push({
      deviceHash: device.deviceHash,
      browser: device.browser,
      os: device.os,
      ip: device.ip,
      lastSeen: new Date(),
    });

    // Keep only the 10 most recent devices
    if (user.knownDevices.length > 10) {
      user.knownDevices.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
      user.knownDevices = user.knownDevices.slice(0, 10);
    }

    // Notify about new device login
    if (user.telegramChatId) {
      const newDeviceMsg = [
        '🔔 New device login detected',
        '',
        `Account: ${user.email}`,
        `Browser: ${device.browser}`,
        `OS: ${device.os}`,
        `IP: ${device.ip}`,
        `Time: ${new Date().toLocaleString()}`,
        '',
        'If this wasn\'t you, change your password immediately.',
      ].join('\n');
      // Fire-and-forget - don't slow down the login response
      sendTelegramMessage(newDeviceMsg, user.telegramChatId, user.telegramBotToken || env.telegram.botToken)
        .catch((err) => logger.error('Failed to send new-device Telegram alert:', err.message));
    } else {
      logger.info(`New device login for ${user.email}: ${device.browser} on ${device.os} from ${device.ip}`);
    }
  }

  await user.save({ validateBeforeSave: false });

  setRefreshCookie(res, refreshToken);

  // Fire-and-forget audit for successful login
  auditFromReq(req, { userId: user._id, userName: user.name, userEmail: user.email, action: 'LOGIN', details: 'Successful login' });

  res.json({ token: accessToken, user: toSafeUser(user) });
});

/**
 * POST /api/auth/refresh - public (no auth middleware).
 * Reads refresh token from HttpOnly cookie, rotates it, returns new access token.
 */
const refreshTokenHandler = asyncHandler(async (req, res) => {
  const incomingToken = req.cookies?.[REFRESH_COOKIE];
  if (!incomingToken) {
    return res.status(401).json({ success: false, message: 'No refresh token provided' });
  }

  let decoded;
  try {
    decoded = jwt.verify(incomingToken, env.auth.refreshSecret);
  } catch {
    clearRefreshCookie(res);
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }

  const user = await User.findById(decoded.id);
  if (!user || !user.active) {
    clearRefreshCookie(res);
    return res.status(401).json({ success: false, message: 'Account no longer active' });
  }

  // Find the matching stored token by comparing hashes
  let matchIndex = -1;
  for (let i = 0; i < user.refreshTokens.length; i++) {
    const matches = await bcrypt.compare(incomingToken, user.refreshTokens[i].token);
    if (matches) {
      matchIndex = i;
      break;
    }
  }

  if (matchIndex === -1) {
    // Token not found - possible reuse attack. Invalidate ALL refresh tokens
    // for this user as a safety measure.
    user.refreshTokens = [];
    await user.save({ validateBeforeSave: false });
    clearRefreshCookie(res);
    return res.status(401).json({ success: false, message: 'Refresh token reuse detected' });
  }

  // Remove old token (rotation)
  user.refreshTokens.splice(matchIndex, 1);

  // Purge expired tokens
  user.refreshTokens = user.refreshTokens.filter((rt) => rt.expiresAt > new Date());

  // Issue new pair
  const newAccessToken = signAccessToken(user);
  const newRefreshToken = signRefreshToken(user);

  const hashedRefresh = await bcrypt.hash(newRefreshToken, 10);
  user.refreshTokens.push({
    token: hashedRefresh,
    expiresAt: new Date(Date.now() + REFRESH_MAX_AGE),
    deviceInfo: req.headers['user-agent'] || '',
  });

  await user.save({ validateBeforeSave: false });

  setRefreshCookie(res, newRefreshToken);
  res.json({ token: newAccessToken, user: toSafeUser(user) });
});

/**
 * POST /api/auth/logout - public (uses cookie).
 * Removes the refresh token from the user's stored tokens and clears the cookie.
 */
const logout = asyncHandler(async (req, res) => {
  const incomingToken = req.cookies?.[REFRESH_COOKIE];

  if (incomingToken) {
    try {
      const decoded = jwt.verify(incomingToken, env.auth.refreshSecret);
      const user = await User.findById(decoded.id);

      if (user) {
        // Find and remove the matching token
        const remaining = [];
        for (const rt of user.refreshTokens) {
          const matches = await bcrypt.compare(incomingToken, rt.token);
          if (!matches) remaining.push(rt);
        }
        user.refreshTokens = remaining;
        await user.save({ validateBeforeSave: false });

        // Fire-and-forget audit for logout
        auditFromReq(req, { userId: user._id, userName: user.name, userEmail: user.email, action: 'LOGOUT', details: 'User logged out' });
      }
    } catch {
      // Token invalid/expired - just clear the cookie, no DB cleanup needed
    }
  }

  clearRefreshCookie(res);
  res.json({ success: true, message: 'Logged out successfully' });
});

/** GET /api/auth/me - re-validates against the DB rather than trusting the JWT payload alone. */
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user || !user.active) {
    return res.status(401).json({ success: false, message: 'Account no longer active' });
  }
  res.json(toSafeUser(user));
});

/** PUT /api/auth/profile */
const updateProfile = asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  if (email && email.toLowerCase() !== user.email) {
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ success: false, message: 'Email already in use' });
    user.email = email.toLowerCase();
  }
  if (name) user.name = name;
  await user.save();

  // Fire-and-forget audit for profile update
  auditFromReq(req, { userId: req.user.id, userName: user.name, userEmail: user.email, action: 'PROFILE_UPDATE', details: 'Profile updated' });

  res.json(toSafeUser(user));
});

/** PUT /api/auth/change-password */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Current and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
  }

  const user = await User.findById(req.user.id).select('+password');
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return res.status(400).json({ success: false, message: 'Current password is incorrect' });
  }

  user.password = newPassword;
  // Invalidate all refresh tokens on password change
  user.refreshTokens = [];
  await user.save();

  // Fire-and-forget audit for password change
  auditFromReq(req, { userId: req.user.id, userName: user.name, userEmail: user.email, action: 'PASSWORD_CHANGE', details: 'Password changed' });

  res.json({ success: true, message: 'Password changed successfully' });
});

/**
 * GET /api/auth/sessions - the caller's active (non-expired) sessions,
 * derived from their stored refresh tokens. Powers the Security page.
 */
const getSessions = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('refreshTokens');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const now = Date.now();
  const sessions = (user.refreshTokens || [])
    .filter((t) => t.expiresAt && t.expiresAt.getTime() > now)
    .map((t) => ({
      id: t._id,
      deviceInfo: t.deviceInfo || 'Unknown device',
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ success: true, data: sessions });
});

module.exports = { register, login, getMe, updateProfile, changePassword, refreshToken: refreshTokenHandler, logout, getSessions };
