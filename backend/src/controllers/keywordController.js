const Keyword = require('../models/Keyword');
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
  const keyword = await Keyword.create(req.body);
  await logActivity(req.user._id, 'keyword_created', 'keyword', keyword._id, `Keyword "${keyword.keyword}" added`, req.ip);
  res.status(201).json({ success: true, data: keyword });
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
  await logActivity(req.user._id, 'keywords_bulk_created', 'keyword', null, `${created.length} keywords added`, req.ip);
  res.status(201).json({ success: true, data: created });
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
