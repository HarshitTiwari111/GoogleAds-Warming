const Campaign = require('../models/Campaign');
const PublishHistory = require('../models/PublishHistory');
const User = require('../models/User');
const googleAdsService = require('../services/googleAdsService');
const notificationService = require('../services/notificationService');
const { asyncHandler } = require('../utils/helpers');
const { logActivity } = require('../middleware/activityLogger');
const logger = require('../utils/logger');

/** Admins publish anything; a user only publishes campaigns they own. */
function canPublish(reqUser, campaign) {
  if (reqUser.role === 'admin') return true;
  const owner = campaign.owner || campaign.createdBy;
  return owner?.toString() === reqUser.id;
}

/**
 * Resolve the Google Ads credentials for a campaign: the caller's own token
 * where possible, falling back to the campaign owner's connection so an admin
 * can publish on a media buyer's behalf.
 */
async function resolveRefreshToken(reqUser, campaign) {
  const self = await User.findById(reqUser.id).select('googleAdsConfig');
  if (self?.googleAdsConfig?.refreshToken) return self.googleAdsConfig.refreshToken;

  const ownerId = campaign.owner || campaign.createdBy;
  if (ownerId) {
    const owner = await User.findById(ownerId).select('googleAdsConfig');
    if (owner?.googleAdsConfig?.refreshToken) return owner.googleAdsConfig.refreshToken;
  }
  return null;
}

/**
 * POST /api/publish/:campaignId — take a campaign live in Google Ads.
 *
 * Every attempt is recorded in PublishHistory (publishing -> published or
 * failed) so a failed publish leaves an auditable trail rather than a
 * campaign silently stuck mid-flight.
 */
exports.publishCampaign = asyncHandler(async (req, res) => {
  const campaign = await Campaign.findById(req.params.campaignId).populate('account');
  if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
  if (!canPublish(req.user, campaign)) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }
  if (campaign.status === 'published') {
    return res.status(400).json({ success: false, message: 'Campaign is already published' });
  }

  const account = campaign.account;
  const previousStatus = campaign.status;

  await PublishHistory.create({
    campaign: campaign._id,
    account: account?._id,
    status: 'publishing',
    previousStatus,
    publishedBy: req.user.id,
  });

  try {
    const customerId = account?.googleAdsCustomerId;
    if (!customerId) throw new Error('Account is not linked to a Google Ads customer id');
    if (!campaign.googleCampaignId) throw new Error('Campaign has no Google Ads campaign id');

    const refreshToken = await resolveRefreshToken(req.user, campaign);
    if (!refreshToken) throw new Error('No connected Google Ads account available to publish with');

    // The MCC the account was created under has to travel with the request as
    // login-customer-id, or Google rejects it as inaccessible.
    const loginCustomerId = campaign.sourceMccId || account.sourceMccId || null;

    await googleAdsService.enableCampaign(
      customerId,
      `customers/${customerId}/campaigns/${campaign.googleCampaignId}`,
      { refreshToken },
      loginCustomerId
    );

    campaign.status = 'published';
    campaign.publishedAt = new Date();
    campaign.failedReason = undefined;
    await campaign.save();

    await PublishHistory.create({
      campaign: campaign._id,
      account: account._id,
      status: 'published',
      previousStatus: 'publishing',
      publishedBy: req.user.id,
    });

    await logActivity(req.user.id, 'campaign_published', 'publish', campaign._id, `Campaign ${campaign.campaignName} published`, req.ip);
    await notificationService.create(req.user.id, 'Campaign Published', `${campaign.campaignName} has been published successfully`, 'success');

    res.json({ success: true, data: campaign, message: 'Campaign published successfully' });
  } catch (error) {
    logger.error(`Publish failed for ${campaign._id}: ${error.message}`);

    campaign.status = 'failed';
    campaign.failedReason = error.message;
    await campaign.save();

    await PublishHistory.create({
      campaign: campaign._id,
      account: account?._id,
      status: 'failed',
      previousStatus: 'publishing',
      publishedBy: req.user.id,
      errorMessage: error.message,
    });

    await notificationService.create(req.user.id, 'Publish Failed', `Failed to publish ${campaign.campaignName}: ${error.message}`, 'error');

    res.status(502).json({ success: false, message: 'Failed to publish campaign', error: error.message });
  }
});

/** GET /api/publish/history[/:campaignId] */
exports.getPublishHistory = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.params.campaignId) filter.campaign = req.params.campaignId;

  const history = await PublishHistory.find(filter)
    .populate('campaign', 'campaignName')
    .populate('account', 'accountName')
    .populate('publishedBy', 'name')
    .sort('-createdAt')
    .limit(500);

  res.json({ success: true, data: history });
});
