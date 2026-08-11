const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');

/**
 * Protects a route: requires a valid `Authorization: Bearer <token>` header.
 * Re-validates against the database on every request (loads the user and
 * checks `active`) rather than trusting the token payload alone, so a
 * deactivated user is locked out immediately instead of waiting for token
 * expiry.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, message: 'Missing or malformed Authorization header' });
  }

  try {
    const decoded = jwt.verify(token, env.auth.jwtSecret);
    const user = await User.findById(decoded.id);

    if (!user || !user.active) {
      return res.status(401).json({ success: false, message: 'Account no longer active' });
    }

    if (user.passwordChangedAt && decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
      return res.status(401).json({ success: false, message: 'Token expired due to password change' });
    }

    req.user = {
      // Both spellings are populated: the monitoring/provisioning code reads
      // `id` (string), the ported warming/farming code reads `_id` (ObjectId).
      id: user._id.toString(),
      _id: user._id,
      role: user.role,
      name: user.name,
      email: user.email,
    };
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

/** Restricts a route to one or more roles. Must run after requireAuth. */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
