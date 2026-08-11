const Setting = require('../models/Setting');
const { asyncHandler } = require('../utils/helpers');
const { logActivity } = require('../middleware/activityLogger');

/**
 * Org-wide key/value settings (countries, bid strategies, campaign types,
 * default budgets, the default warming ramp).
 *
 * Distinct from /api/settings, which is each user's own Google Ads
 * connection. These values are shared across the workspace, so writes are
 * admin-only while reads are open to any signed-in user (the forms that
 * consume them need the option lists).
 */

exports.getSettings = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  const settings = await Setting.find(filter).sort('category key');
  res.json({ success: true, data: settings });
});

exports.getSetting = asyncHandler(async (req, res) => {
  const setting = await Setting.findOne({ key: req.params.key });
  if (!setting) return res.status(404).json({ success: false, message: 'Setting not found' });
  res.json({ success: true, data: setting });
});

exports.upsertSetting = asyncHandler(async (req, res) => {
  const { key, value, category, description } = req.body;
  if (!key || value === undefined || !category) {
    return res.status(400).json({ success: false, message: 'key, value and category are required' });
  }

  const setting = await Setting.findOneAndUpdate(
    { key },
    { value, category, description, updatedBy: req.user._id },
    { new: true, upsert: true, runValidators: true }
  );

  await logActivity(req.user.id, 'setting_updated', 'settings', setting._id, `Setting ${key} updated`, req.ip);
  res.json({ success: true, data: setting });
});

exports.deleteSetting = asyncHandler(async (req, res) => {
  const setting = await Setting.findOneAndDelete({ key: req.params.key });
  if (!setting) return res.status(404).json({ success: false, message: 'Setting not found' });
  res.json({ success: true, message: 'Setting deleted successfully' });
});

/** Seed the option lists the creation forms depend on. Idempotent. */
exports.seedDefaults = asyncHandler(async (req, res) => {
  await exports.seedDefaultSettings();
  res.json({ success: true, message: 'Default settings seeded successfully' });
});

const DEFAULT_SETTINGS = [
  {
    key: 'countries',
    value: ['India', 'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'United Arab Emirates', 'Singapore'],
    category: 'countries',
    description: 'Available countries',
  },
  {
    key: 'bid_strategies',
    value: ['manual_cpc', 'maximize_clicks', 'maximize_conversions', 'target_cpa', 'target_roas', 'target_impression_share'],
    category: 'bid_strategies',
    description: 'Available bid strategies',
  },
  {
    key: 'campaign_types',
    value: ['search', 'display', 'video', 'shopping', 'app', 'smart', 'performance_max'],
    category: 'campaign_types',
    description: 'Available campaign types',
  },
  {
    key: 'default_daily_budget',
    value: 1,
    category: 'budgets',
    description: 'Default campaign daily budget pre-filled on creation forms',
  },
  {
    key: 'default_billing_budget',
    value: 2,
    category: 'budgets',
    description: 'Default account-level spending limit pre-filled on creation forms',
  },
  {
    key: 'warming_schedule',
    value: [
      { day: 1, budget: 500 }, { day: 2, budget: 700 }, { day: 3, budget: 1000 },
      { day: 4, budget: 1200 }, { day: 5, budget: 1500 }, { day: 6, budget: 1800 },
      { day: 7, budget: 2000 }, { day: 8, budget: 2500 }, { day: 9, budget: 3000 },
      { day: 10, budget: 3500 },
    ],
    category: 'warming',
    description: 'Default warming ramp — editable per account at start time',
  },
];

/** Called on boot so a fresh deployment has working option lists. */
exports.seedDefaultSettings = async () => {
  for (const d of DEFAULT_SETTINGS) {
    // setOnInsert only: an operator's edited value must survive restarts.
    await Setting.updateOne({ key: d.key }, { $setOnInsert: d }, { upsert: true });
  }
};
