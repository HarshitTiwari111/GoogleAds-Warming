const asyncHandler = require('../middleware/asyncHandler');
const User = require('../models/User');
const GoogleAdsCache = require('../models/GoogleAdsCache');
const { auditFromReq } = require('../utils/auditLogger');

function toSafeUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    googleAdsConfig: user.googleAdsConfig
      ? { isConfigured: user.googleAdsConfig.isConfigured, managerAccountId: user.googleAdsConfig.managerAccountId }
      : undefined,
    telegramChatId: user.telegramChatId,
    hasTelegramBot: !!user.telegramBotToken,
    mutedRuleTypes: user.mutedRuleTypes,
    active: user.active,
    createdAt: user.createdAt,
  };
}

/** GET /api/users - admin only: list every user account. */
const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find().sort({ createdAt: 1 });
  res.json({ success: true, data: users.map(toSafeUser) });
});

/** POST /api/users - admin only: create a new user account. */
const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, telegramChatId, telegramBotToken } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'name, email, and password are required' });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(409).json({ success: false, message: 'That email is already registered' });
  }

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password,
    role: User.ROLES.includes(role) ? role : 'user',
    telegramChatId: telegramChatId || '',
    telegramBotToken: telegramBotToken || '',
  });

  // Fire-and-forget audit for user creation
  auditFromReq(req, { userId: user._id, userName: user.name, userEmail: user.email, action: 'USER_CREATED', details: `User created by admin ${req.user.id}` });

  res.status(201).json({ success: true, data: toSafeUser(user) });
});

/** PUT /api/users/:id - admin only: update name/role/telegram fields/active, optionally reset password. */
const updateUser = asyncHandler(async (req, res) => {
  const { name, role, telegramChatId, telegramBotToken, active, password } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const oldRole = user.role;

  if (name !== undefined) user.name = name;
  if (role !== undefined && User.ROLES.includes(role)) user.role = role;
  if (telegramChatId !== undefined) user.telegramChatId = telegramChatId;
  if (telegramBotToken !== undefined) user.telegramBotToken = telegramBotToken;
  if (active !== undefined) user.active = active;
  if (password) user.password = password;

  await user.save();

  // Fire-and-forget audit - distinguish role change from general update
  if (role !== undefined && role !== oldRole) {
    auditFromReq(req, { userId: user._id, userName: user.name, userEmail: user.email, action: 'ROLE_CHANGED', details: `Role changed from ${oldRole} to ${role}`, metadata: { oldRole, newRole: role } });
  } else {
    auditFromReq(req, { userId: user._id, userName: user.name, userEmail: user.email, action: 'USER_UPDATED', details: `User updated by admin ${req.user.id}` });
  }

  res.json({ success: true, data: toSafeUser(user) });
});

/** DELETE /api/users/:id - admin only: deactivate (soft-delete) an account. */
const deactivateUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ success: false, message: "You can't deactivate your own account" });
  }

  const user = await User.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  // Fire-and-forget audit for user deactivation
  auditFromReq(req, { userId: user._id, userName: user.name, userEmail: user.email, action: 'USER_DELETED', details: `User deactivated by admin ${req.user.id}` });

  res.json({ success: true, data: toSafeUser(user) });
});

/**
 * DELETE /api/users/:id/permanent - admin only: permanently delete a user
 * and their synced Google Ads cache. Guards: can't delete yourself, can't
 * delete the last remaining admin.
 */
const deleteUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ success: false, message: "You can't delete your own account" });
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (user.role === 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      return res.status(400).json({ success: false, message: "Can't delete the last admin account" });
    }
  }

  await Promise.all([
    User.deleteOne({ _id: user._id }),
    GoogleAdsCache.deleteMany({ userId: user._id }),
  ]);

  auditFromReq(req, { userId: user._id, userName: user.name, userEmail: user.email, action: 'USER_DELETED', details: `User permanently deleted by admin ${req.user.id}` });

  res.json({ success: true, message: 'User deleted permanently' });
});

/** GET /api/users/me - any logged-in user: their own profile. */
const getMyProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  res.json({ success: true, data: toSafeUser(user) });
});

/** PUT /api/users/me - any logged-in user: self-service Telegram bot token + chat ID + muted rules. */
const updateMyProfile = asyncHandler(async (req, res) => {
  const { telegramChatId, telegramBotToken, mutedRuleTypes } = req.body;
  const update = {};
  if (telegramChatId !== undefined) update.telegramChatId = telegramChatId || '';
  if (telegramBotToken !== undefined) update.telegramBotToken = telegramBotToken || '';
  if (mutedRuleTypes !== undefined) update.mutedRuleTypes = mutedRuleTypes;

  const user = await User.findByIdAndUpdate(req.user.id, update, { new: true, runValidators: true });
  res.json({ success: true, data: toSafeUser(user) });
});

module.exports = { getUsers, createUser, updateUser, deactivateUser, deleteUser, getMyProfile, updateMyProfile };
