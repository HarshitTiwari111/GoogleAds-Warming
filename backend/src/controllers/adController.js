const Ad = require('../models/Ad');
const Campaign = require('../models/Campaign');
const campaignPushService = require('../services/campaignPushService');
const APIFeatures = require('../utils/apiFeatures');
const { asyncHandler } = require('../utils/helpers');
const { logActivity } = require('../middleware/activityLogger');

exports.getAds = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.params.campaignId) filter.campaign = req.params.campaignId;

  const features = new APIFeatures(Ad.find(filter), req.query)
    .search(['headline1', 'headline2', 'headline3'])
    .sort()
    .paginate();

  const ads = await features.query.populate('campaign', 'campaignName');
  const countFilter = features.searchFilter ? { ...filter, ...features.searchFilter } : filter;
  const total = await Ad.countDocuments(countFilter);

  res.json({
    success: true,
    data: ads,
    pagination: { ...features.pagination, total, pages: Math.ceil(total / (features.pagination?.limit || 10)) }
  });
});

exports.createAd = asyncHandler(async (req, res) => {
  req.body.createdBy = req.user._id;
  if (req.params.campaignId) req.body.campaign = req.params.campaignId;

  // Saved locally first so typed work is never lost to a Google API failure,
  // then pushed as a Responsive Search Ad.
  const ad = await Ad.create(req.body);

  const campaign = await Campaign.findById(ad.campaign).populate('account');
  const target = await campaignPushService.resolveTarget(campaign, req.user);
  const sync = await campaignPushService.pushAd(ad, target);
  Object.assign(ad, sync);
  await ad.save();

  await logActivity(req.user._id, 'ad_created', 'ad', ad._id, `Ad copy created (${ad.syncState})`, req.ip);

  res.status(201).json({
    success: true,
    data: ad,
    message: ad.syncState === 'synced'
      ? 'Ad copy created and pushed to Google Ads'
      : `Ad copy saved, but not in Google Ads — ${ad.syncError}`,
  });
});

exports.getAd = asyncHandler(async (req, res) => {
  const ad = await Ad.findById(req.params.id).populate({ path: 'campaign', select: 'campaignName owner' });
  if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
  if (req.user.role !== 'admin' && ad.campaign?.owner?.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }
  res.json({ success: true, data: ad });
});

exports.updateAd = asyncHandler(async (req, res) => {
  const ad = await Ad.findById(req.params.id).populate({ path: 'campaign', select: 'owner' });
  if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
  if (req.user.role !== 'admin' && ad.campaign?.owner?.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }
  Object.assign(ad, req.body);
  await ad.save({ runValidators: true });
  await logActivity(req.user._id, 'ad_updated', 'ad', ad._id, `Ad copy updated`, req.ip);
  res.json({ success: true, data: ad });
});

exports.deleteAd = asyncHandler(async (req, res) => {
  const ad = await Ad.findById(req.params.id).populate({ path: 'campaign', select: 'owner' });
  if (!ad) return res.status(404).json({ success: false, message: 'Ad not found' });
  if (req.user.role !== 'admin' && ad.campaign?.owner?.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }
  await Ad.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Ad deleted successfully' });
});
