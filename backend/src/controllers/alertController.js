const asyncHandler = require('../middleware/asyncHandler');
const AlertHistory = require('../models/AlertHistory');
const Campaign = require('../models/Campaign');
const { auditFromReq } = require('../utils/auditLogger');

/**
 * GET /api/alerts
 * Paginated alert history for the dashboard's "Alert History" panel.
 * Non-admin users only see alerts for campaigns assigned to them.
 * Supports ?campaignId=, ?campaignName= (partial match),
 * ?ruleType=, ?dateFrom=, ?dateTo= (all optional, combinable).
 */
const getAlertHistory = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  // Higher cap than the default page size so the export feature can pull
  // everything matching the current filters in one request.
  const limit = Math.min(parseInt(req.query.limit, 10) || 25, 2000);
  const filter = {};

  if (req.query.campaignId) filter.campaignId = req.query.campaignId;
  if (req.query.campaignName) {
    const escaped = req.query.campaignName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.campaignName = { $regex: escaped, $options: 'i' };
  }
  if (req.query.ruleType) filter.ruleType = req.query.ruleType;

  if (req.query.dateFrom || req.query.dateTo) {
    filter.sentAt = {};
    if (req.query.dateFrom) filter.sentAt.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) filter.sentAt.$lte = new Date(req.query.dateTo);
  }

  if (req.user.role !== 'admin') {
    const assigned = await Campaign.find({ assignedTo: req.user.id }, 'googleCampaignId');
    const assignedIds = assigned.map((c) => c.googleCampaignId).filter(Boolean);
    filter.campaignId = filter.campaignId
      ? (assignedIds.includes(filter.campaignId) ? filter.campaignId : '__none__')
      : { $in: assignedIds };
  }

  const [items, total] = await Promise.all([
    AlertHistory.find(filter)
      .sort({ sentAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    AlertHistory.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

const clearAlertHistory = asyncHandler(async (req, res) => {
  const CampaignMetrics = require('../models/CampaignMetrics');
  const d1 = await AlertHistory.deleteMany({});
  const d2 = await CampaignMetrics.deleteMany({});
  const d3 = await Campaign.deleteMany({});
  // Fire-and-forget audit for clearing alerts
  auditFromReq(req, { userId: req.user.id, userName: req.user.name, userEmail: req.user.email, action: 'ALERT_CLEARED', details: `Cleared ${d1.deletedCount} alerts, ${d2.deletedCount} metrics, ${d3.deletedCount} campaigns`, metadata: { alerts: d1.deletedCount, metrics: d2.deletedCount, campaigns: d3.deletedCount } });

  res.json({ success: true, deleted: { alerts: d1.deletedCount, metrics: d2.deletedCount, campaigns: d3.deletedCount } });
});

module.exports = { getAlertHistory, clearAlertHistory };
