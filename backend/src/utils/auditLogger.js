const AuditLog = require('../models/AuditLog');
const logger = require('./logger');

async function logAudit({ userId, userName, userEmail, action, details, ipAddress, userAgent, metadata }) {
  try {
    await AuditLog.create({ userId, userName, userEmail, action, details, ipAddress, userAgent, metadata });
  } catch (err) {
    logger.error(`Audit log failed: ${err.message}`);
  }
}

// Convenience: extract IP and UA from Express req
function auditFromReq(req, data) {
  return logAudit({
    ...data,
    ipAddress: req.ip || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent'] || '',
  });
}

module.exports = { logAudit, auditFromReq };
