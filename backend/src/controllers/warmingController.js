const warmingService = require('../services/warmingService');
const Account = require('../models/Account');
const notificationService = require('../services/notificationService');
const { asyncHandler } = require('../utils/helpers');

/** Admins see every account's warming ramp; a user only sees their own. */
function ownershipFilter(reqUser) {
  return reqUser.role === 'admin' ? {} : { $or: [{ owner: reqUser._id }, { createdBy: reqUser._id }] };
}

async function findAccessibleAccount(reqUser, accountId) {
  return Account.findOne({ _id: accountId, ...ownershipFilter(reqUser) });
}

/**
 * POST /api/warming/:accountId/start
 * Body may carry either an explicit `customSchedule` array or a generator
 * spec `{ days, startBudget, endBudget }` — both let the operator set exactly
 * the budgets they want.
 */
exports.startWarming = asyncHandler(async (req, res) => {
  const account = await findAccessibleAccount(req.user, req.params.accountId);
  if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

  const { customSchedule, days, startBudget, endBudget } = req.body || {};
  const scheduleSpec =
    customSchedule || (days || startBudget || endBudget ? { days, startBudget, endBudget } : null);

  const updated = await warmingService.startWarming(account._id, req.user.id, scheduleSpec);
  await notificationService.create(req.user.id, 'Warming Started', `Warming process started for ${updated.accountName}`, 'info');
  res.json({ success: true, data: updated });
});

exports.advanceWarming = asyncHandler(async (req, res) => {
  const account = await findAccessibleAccount(req.user, req.params.accountId);
  if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

  const result = await warmingService.advanceWarming(account._id, req.user.id);
  if (result.completed) {
    await notificationService.create(req.user.id, 'Warming Completed', `Warming completed for ${result.account.accountName}`, 'success');
  }
  res.json({ success: true, data: result });
});

exports.getWarmingStatus = asyncHandler(async (req, res) => {
  const account = await findAccessibleAccount(req.user, req.params.accountId);
  if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

  const status = await warmingService.getWarmingStatus(account._id);
  res.json({ success: true, data: status });
});

/** GET /api/warming — every account currently mid-ramp, with progress. */
exports.getAllWarmingAccounts = asyncHandler(async (req, res) => {
  const accounts = await Account.find({
    status: 'warming',
    isDeleted: false,
    ...ownershipFilter(req.user),
  }).sort('-warmingStartDate');

  const statuses = await Promise.all(accounts.map((a) => warmingService.getWarmingStatus(a._id)));
  res.json({ success: true, data: statuses });
});

/** GET /api/warming/schedule/preview?days=&startBudget=&endBudget= */
exports.previewSchedule = asyncHandler(async (req, res) => {
  const { days, startBudget, endBudget } = req.query;
  const schedule = days || startBudget || endBudget
    ? warmingService.buildSchedule({ days, startBudget, endBudget })
    : await warmingService.getDefaultSchedule();
  res.json({ success: true, data: schedule });
});

exports.resetWarming = asyncHandler(async (req, res) => {
  const account = await findAccessibleAccount(req.user, req.params.accountId);
  if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

  account.warmingStage = 0;
  account.warmingSchedule = [];
  account.warmingStartDate = null;
  account.status = 'pending';
  await account.save();

  res.json({ success: true, data: account, message: 'Warming reset successfully' });
});
