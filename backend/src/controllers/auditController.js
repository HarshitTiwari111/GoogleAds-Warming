const asyncHandler = require('../middleware/asyncHandler');
const AuditLog = require('../models/AuditLog');

/** GET /api/audit-logs - Admin only: paginated, filterable audit log. */
const getAuditLogs = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
  const filter = {};

  if (req.query.action) filter.action = req.query.action;
  if (req.query.userId) filter.userId = req.query.userId;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    AuditLog.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

// Security-relevant actions a user may see about themselves.
const SELF_VISIBLE_ACTIONS = [
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'PASSWORD_CHANGE',
  'ACCOUNT_LOCKED',
  'ACCOUNT_UNLOCKED',
  '2FA_ENABLED',
  '2FA_DISABLED',
];

/** GET /api/audit-logs/me - any user: their own login/security history. */
const getMyAuditLogs = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
  const filter = { userId: req.user.id, action: { $in: SELF_VISIBLE_ACTIONS } };

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    AuditLog.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: logs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { getAuditLogs, getMyAuditLogs };
