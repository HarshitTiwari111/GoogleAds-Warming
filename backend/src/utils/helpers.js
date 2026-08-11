const crypto = require('crypto');
const asyncHandler = require('../middleware/asyncHandler');

/** SHA-256 hex digest — used to store refresh tokens without keeping the raw value. */
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

module.exports = {
  asyncHandler,
  hashToken,
};
