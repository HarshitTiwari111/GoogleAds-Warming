const Account = require('../models/Account');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /api/dashboard/stats — local (database-backed) overview of accounts,
 * campaigns, budgets and recent activity.
 *
 * This is the warming/farming side's dashboard. It is deliberately separate
 * from /api/accounts/stats, which reports on the *synced Google Ads* snapshot
 * for the monitoring side — the two answer different questions and the UI
 * shows both.
 */
exports.getStats = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  // An admin sees every owned record; a user sees only their own.
  const scope = isAdmin ? { owner: { $ne: null } } : { owner: req.user._id };

  const [
    totalAccounts,
    activeAccounts,
    pausedAccounts,
    pendingAccounts,
    warmingAccounts,
    totalCampaigns,
    activeCampaigns,
    pausedCampaigns,
    draftCampaigns,
    publishedCampaigns,
  ] = await Promise.all([
    Account.countDocuments(scope),
    Account.countDocuments({ ...scope, status: 'active' }),
    Account.countDocuments({ ...scope, status: 'paused' }),
    Account.countDocuments({ ...scope, status: 'pending' }),
    Account.countDocuments({ ...scope, status: 'warming' }),
    Campaign.countDocuments(scope),
    Campaign.countDocuments({ ...scope, status: 'active' }),
    Campaign.countDocuments({ ...scope, status: 'paused' }),
    Campaign.countDocuments({ ...scope, status: 'draft' }),
    Campaign.countDocuments({ ...scope, status: 'published' }),
  ]);

  const [budgetResult] = await Campaign.aggregate([
    { $match: { ...scope, status: { $in: ['active', 'published'] } } },
    { $group: { _id: null, totalBudget: { $sum: '$dailyBudget' }, totalSpend: { $sum: '$spend' }, totalClicks: { $sum: '$clicks' }, totalImpressions: { $sum: '$impressions' } } },
  ]);

  const [campaignsByStatus, campaignsByDevice, campaignsByCountry] = await Promise.all([
    Campaign.aggregate([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Campaign.aggregate([{ $match: scope }, { $unwind: '$device' }, { $group: { _id: '$device', count: { $sum: 1 } } }]),
    Campaign.aggregate([{ $match: scope }, { $unwind: '$country' }, { $group: { _id: '$country', count: { $sum: 1 } } }]),
  ]);

  const recentActivity = await ActivityLog.find(isAdmin ? {} : { user: req.user._id })
    .populate('user', 'name')
    .sort('-createdAt')
    .limit(10);

  let adminStats = {};
  let userBreakdown = [];

  if (isAdmin) {
    const allUsers = await User.find({}, 'name email role googleAdsConfig.refreshToken googleAdsConfig.managerAccountIds googleAdsConfig.lastSyncedAt');

    const connectedUsers = allUsers.filter((u) => !!u.googleAdsConfig?.refreshToken).length;
    const totalMccIds = allUsers.reduce((sum, u) => sum + (u.googleAdsConfig?.managerAccountIds?.length || 0), 0);
    adminStats = { connectedUsers, totalUsers: allUsers.length, totalMccIds };

    const countByOwner = (rows) =>
      rows.reduce((map, r) => map.set(String(r._id), r), new Map());

    const [acctCounts, campCounts] = await Promise.all([
      Account.aggregate([
        { $match: { owner: { $ne: null } } },
        { $group: { _id: '$owner', total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }, paused: { $sum: { $cond: [{ $eq: ['$status', 'paused'] }, 1, 0] } } } },
      ]),
      Campaign.aggregate([
        { $match: { owner: { $ne: null } } },
        { $group: { _id: '$owner', total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }, paused: { $sum: { $cond: [{ $eq: ['$status', 'paused'] }, 1, 0] } } } },
      ]),
    ]);

    const acctMap = countByOwner(acctCounts);
    const campMap = countByOwner(campCounts);
    const empty = { total: 0, active: 0, paused: 0 };

    userBreakdown = allUsers.map((u) => {
      const uid = String(u._id);
      const ac = acctMap.get(uid) || empty;
      const ca = campMap.get(uid) || empty;
      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        connected: !!u.googleAdsConfig?.refreshToken,
        mccIds: u.googleAdsConfig?.managerAccountIds || [],
        lastSync: u.googleAdsConfig?.lastSyncedAt || null,
        accounts: { total: ac.total, active: ac.active, paused: ac.paused },
        campaigns: { total: ca.total, active: ca.active, paused: ca.paused },
      };
    });
  }

  res.json({
    success: true,
    data: {
      stats: {
        totalAccounts,
        activeAccounts,
        pausedAccounts,
        pendingAccounts,
        warmingAccounts,
        totalCampaigns,
        activeCampaigns,
        pausedCampaigns,
        draftCampaigns,
        publishedCampaigns,
        totalDailyBudget: budgetResult?.totalBudget || 0,
        totalSpend: budgetResult?.totalSpend || 0,
        totalClicks: budgetResult?.totalClicks || 0,
        totalImpressions: budgetResult?.totalImpressions || 0,
        ...adminStats,
      },
      charts: { campaignsByStatus, campaignsByDevice, campaignsByCountry },
      recentActivity,
      userBreakdown,
    },
  });
});
