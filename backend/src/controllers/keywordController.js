const Keyword = require('../models/Keyword');
const Campaign = require('../models/Campaign');
const campaignPushService = require('../services/campaignPushService');
const APIFeatures = require('../utils/apiFeatures');
const { asyncHandler } = require('../utils/helpers');
const { logActivity } = require('../middleware/activityLogger');

exports.getKeywords = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.params.campaignId) filter.campaign = req.params.campaignId;
  if (req.query.isNegative !== undefined) filter.isNegative = req.query.isNegative === 'true';

  const features = new APIFeatures(Keyword.find(filter), req.query)
    .search(['keyword'])
    .sort()
    .paginate();

  const keywords = await features.query.populate('campaign', 'campaignName');
  const countFilter = features.searchFilter ? { ...filter, ...features.searchFilter } : filter;
  const total = await Keyword.countDocuments(countFilter);

  res.json({
    success: true,
    data: keywords,
    pagination: { ...features.pagination, total, pages: Math.ceil(total / (features.pagination?.limit || 10)) }
  });
});

exports.createKeyword = asyncHandler(async (req, res) => {
  req.body.createdBy = req.user._id;
  if (req.params.campaignId) req.body.campaign = req.params.campaignId;

  // Saved locally first so typed work is never lost to a Google API failure,
  // then pushed — the outcome is recorded on the record rather than assumed.
  const keyword = await Keyword.create(req.body);

  const campaign = await Campaign.findById(keyword.campaign).populate('account');
  const target = await campaignPushService.resolveTarget(campaign, req.user);
  const sync = await campaignPushService.pushKeyword(keyword, target);
  Object.assign(keyword, sync);
  await keyword.save();

  await logActivity(req.user._id, 'keyword_created', 'keyword', keyword._id, `Keyword "${keyword.keyword}" added (${keyword.syncState})`, req.ip);

  res.status(201).json({
    success: true,
    data: keyword,
    message: keyword.syncState === 'synced'
      ? 'Keyword added and pushed to Google Ads'
      : `Keyword saved, but not in Google Ads — ${keyword.syncError}`,
  });
});

exports.createBulkKeywords = asyncHandler(async (req, res) => {
  const { keywords } = req.body;
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return res.status(400).json({ success: false, message: 'keywords must be a non-empty array' });
  }
  const keywordDocs = keywords.map(k => ({
    ...k,
    campaign: req.params.campaignId,
    createdBy: req.user._id
  }));
  const created = await Keyword.insertMany(keywordDocs);

  // One target and one ad group lookup for the whole batch.
  const campaign = await Campaign.findById(req.params.campaignId).populate('account');
  const target = await campaignPushService.resolveTarget(campaign, req.user);
  const adGroupCache = new Map();

  let synced = 0;
  const failures = [];
  for (const kw of created) {
    const sync = await campaignPushService.pushKeyword(kw, target, adGroupCache);
    Object.assign(kw, sync);
    await kw.save();
    if (sync.syncState === 'synced') synced += 1;
    else failures.push(`${kw.keyword}: ${sync.syncError}`);
  }

  await logActivity(req.user._id, 'keywords_bulk_created', 'keyword', null, `${created.length} keywords added, ${synced} pushed to Google Ads`, req.ip);

  res.status(201).json({
    success: true,
    data: created,
    synced,
    failures,
    message: synced === created.length
      ? `${synced} keyword(s) added and pushed to Google Ads`
      : `${created.length} saved, ${synced} pushed to Google Ads — ${failures[0] || 'see keyword list for details'}`,
  });
});

exports.updateKeyword = asyncHandler(async (req, res) => {
  const keyword = await Keyword.findById(req.params.id).populate({ path: 'campaign', select: 'owner' });
  if (!keyword) return res.status(404).json({ success: false, message: 'Keyword not found' });
  if (req.user.role !== 'admin' && keyword.campaign?.owner?.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }
  Object.assign(keyword, req.body);
  await keyword.save({ runValidators: true });
  res.json({ success: true, data: keyword });
});

exports.deleteKeyword = asyncHandler(async (req, res) => {
  const keyword = await Keyword.findById(req.params.id).populate({ path: 'campaign', select: 'owner' });
  if (!keyword) return res.status(404).json({ success: false, message: 'Keyword not found' });
  if (req.user.role !== 'admin' && keyword.campaign?.owner?.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }
  await Keyword.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Keyword deleted successfully' });
});
