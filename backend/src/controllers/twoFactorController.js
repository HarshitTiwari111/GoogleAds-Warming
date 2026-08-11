const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const asyncHandler = require('../middleware/asyncHandler');
const User = require('../models/User');

/** POST /api/auth/2fa/setup - Generate TOTP secret and QR code. */
const setup2FA = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  if (user.twoFactorEnabled) {
    return res.status(400).json({ success: false, message: '2FA is already enabled' });
  }

  const secret = speakeasy.generateSecret({
    name: 'Google Ads Dashboard (' + user.email + ')',
    length: 20,
  });

  // Store secret temporarily (2FA not enabled until verify step)
  user.twoFactorSecret = secret.base32;
  await user.save({ validateBeforeSave: false });

  const qrCode = await qrcode.toDataURL(secret.otpauth_url);

  res.json({ qrCode, secret: secret.base32 });
});

/** POST /api/auth/2fa/verify - Verify TOTP token and enable 2FA. */
const verify2FA = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, message: 'Verification token is required' });
  }

  const user = await User.findById(req.user.id).select('+twoFactorSecret');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  if (!user.twoFactorSecret) {
    return res.status(400).json({ success: false, message: 'Call setup first' });
  }

  const isValid = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token,
    window: 1,
  });

  if (!isValid) {
    return res.status(400).json({ success: false, message: 'Invalid verification code' });
  }

  // Generate 10 backup codes
  const backupCodes = [];
  const hashedCodes = [];
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(4).toString('hex'); // 8-char hex string
    backupCodes.push(code);
    hashedCodes.push(await bcrypt.hash(code, 10));
  }

  user.twoFactorEnabled = true;
  user.twoFactorBackupCodes = hashedCodes;
  await user.save({ validateBeforeSave: false });

  res.json({ success: true, backupCodes });
});

/** POST /api/auth/2fa/disable - Disable 2FA (requires password confirmation). */
const disable2FA = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, message: 'Password is required' });
  }

  const user = await User.findById(req.user.id).select('+password');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return res.status(400).json({ success: false, message: 'Invalid password' });
  }

  user.twoFactorSecret = undefined;
  user.twoFactorEnabled = false;
  user.twoFactorBackupCodes = [];
  await user.save({ validateBeforeSave: false });

  res.json({ success: true, message: '2FA has been disabled' });
});

/** GET /api/auth/2fa/status - Check if 2FA is enabled. */
const status2FA = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  res.json({ enabled: user.twoFactorEnabled });
});

module.exports = { setup2FA, verify2FA, disable2FA, status2FA };
