const express = require('express');
const router = express.Router();
const { validate } = require('../middleware/validate');
const validators = require('../middleware/validators');
const {
  createAccount,
  getAllAccounts,
  getAccount,
  updateAccount,
  deleteAccount,
  getDashboardStats,
  syncAccount,
  getGoogleAdsAccounts,
  getGoogleAdsCampaigns,
  getSyncedCampaigns,
  getCampaignDevicePerformance,
  getCampaignGeoPerformance,
  getCampaignAdCopies,
  getCampaignAudiencePerformance,
  getCampaignDemographics,
  getCampaignExclusions,
  getCampaignKeywords,
  getSearchTerms,
  addNegativeKeywords,
  mutateCampaignKeyword,
  mutateCampaignAd,
  mutateCampaignDevice,
  syncGoogleAds,
  createGoogleAdsAccount,
  bulkCreateGoogleAdsAccounts,
  sendInvite,
  sendAccountInvite,
} = require('../controllers/accountController');

router.get('/stats', getDashboardStats);
router.get('/google-ads', getGoogleAdsAccounts);
// Declared before /google-ads/:customerId/... so "campaigns" is not parsed as a customer id.
router.get('/google-ads/campaigns', getSyncedCampaigns);
router.get('/google-ads/:customerId/campaigns', validators.accounts.customerParam, validate, getGoogleAdsCampaigns);
router.get('/google-ads/:customerId/campaigns/:campaignId/devices', validators.accounts.campaignParam, validate, getCampaignDevicePerformance);
router.get('/google-ads/:customerId/campaigns/:campaignId/geo', validators.accounts.campaignParam, validate, getCampaignGeoPerformance);
router.get('/google-ads/:customerId/campaigns/:campaignId/ads', validators.accounts.campaignParam, validate, getCampaignAdCopies);
router.get('/google-ads/:customerId/campaigns/:campaignId/audience', validators.accounts.campaignParam, validate, getCampaignAudiencePerformance);
router.get('/google-ads/:customerId/campaigns/:campaignId/demographics', validators.accounts.campaignParam, validate, getCampaignDemographics);
router.get('/google-ads/:customerId/campaigns/:campaignId/exclusions', validators.accounts.campaignParam, validate, getCampaignExclusions);
router.get('/google-ads/:customerId/campaigns/:campaignId/keywords', validators.accounts.campaignParam, validate, getCampaignKeywords);
// Search terms report, and turning a wasteful term into a campaign-level
// negative keyword.
router.get('/google-ads/:customerId/search-terms', validators.accounts.customerParam, validate, getSearchTerms);
router.post('/google-ads/:customerId/campaigns/:campaignId/negative-keywords', validators.accounts.campaignParam, validate, addNegativeKeywords);
// All operations below act on the caller's own data (their own accounts,
// their own Google Ads connection/cache), so every authenticated user may
// use them - admins additionally see everyone's data inside the controllers.
router.post('/google-ads/:customerId/adgroups/:adGroupId/criteria/:criterionId/mutate', validators.accounts.mutateKeyword, validate, mutateCampaignKeyword);
router.post('/google-ads/:customerId/adgroups/:adGroupId/ads/:adId/mutate', validators.accounts.mutateAd, validate, mutateCampaignAd);
router.post('/google-ads/:customerId/campaigns/:campaignId/device-bid', validators.accounts.mutateCampaignDevice, validate, mutateCampaignDevice);
router.post('/google-ads/sync', syncGoogleAds);
router.post('/google-ads/create', validators.accounts.create, validate, createGoogleAdsAccount);
router.post('/google-ads/bulk-create', validators.accounts.bulkCreate, validate, bulkCreateGoogleAdsAccounts);
router.post('/google-ads/invite', validators.accounts.invite, validate, sendInvite);
router.route('/').get(getAllAccounts).post(validators.accounts.create, validate, createAccount);
router.post('/:id/sync', validators.accounts.idParam, validate, syncAccount);
// Invite against a stored account, defaulting to the address saved on it.
router.post('/:id/invite', validators.accounts.inviteAccount, validate, sendAccountInvite);
router.route('/:id')
  .get(validators.accounts.idParam, validate, getAccount)
  .put(validators.accounts.idParam, validate, updateAccount)
  .delete(validators.accounts.idParam, validate, deleteAccount);

module.exports = router;
