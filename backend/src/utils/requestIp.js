/** Extracts the real client IP, honoring a reverse proxy's X-Forwarded-For header. */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

module.exports = getClientIp;
