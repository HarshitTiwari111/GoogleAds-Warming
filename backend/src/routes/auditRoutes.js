const express = require('express');
const { requireRole } = require('../middleware/auth');
const { getAuditLogs, getMyAuditLogs } = require('../controllers/auditController');

const router = express.Router();

// GET /api/audit-logs/me - any user: own login/security history (Security page)
router.get('/me', getMyAuditLogs);

// GET /api/audit-logs - admin only
router.get('/', requireRole('admin'), getAuditLogs);

module.exports = router;
