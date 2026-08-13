const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const {
  createCampaign,
  getCampaignsByAccount,
  getCampaign,
  updateCampaign,
  getAllCampaigns,
  getMonitoringCampaigns,
  getCampaignHistory,
  assignCampaign,
  getWarningStatus,
  resumeAutoPausedCampaign,
  updateWarningLimit,
  deleteCampaign,
  updateCampaignStatus,
  bulkAddContent,
  pushCampaignContent,
  getAdApprovalStatus,
} = require('../controllers/campaignController');

// Provisioning-side CRUD (Project A) - every user creates/edits campaigns
// under their own accounts; admins can touch everything.
router.route('/').get(getAllCampaigns).post(createCampaign);
router.get('/account/:accountId', getCampaignsByAccount);

// Apply keywords / ad copies to many campaigns at once. Declared before the
// /:id routes so "bulk" is never read as a campaign id.
router.post('/bulk/content', bulkAddContent);
// Retry: push this campaign's not-yet-synced keywords and ad copies.
router.post('/:campaignId/push-content', pushCampaignContent);
// Google's own approval verdict on this campaign's ads, plus billing state.
router.get('/:campaignId/ad-status', getAdApprovalStatus);

// Monitoring-side dashboard endpoints (Project B).
router.get('/monitoring', getMonitoringCampaigns);
router.get('/:campaignId/history', getCampaignHistory);
router.put('/:campaignId/assign', requireRole('admin'), assignCampaign);

// No-Clicks Auto-Warning & Auto-Pause Management
router.get('/:campaignId/warning-status', getWarningStatus);
router.post('/:campaignId/resume', resumeAutoPausedCampaign);
router.put('/:campaignId/warning-limit', updateWarningLimit);

router.patch('/:id/status', updateCampaignStatus);
router.route('/:id').get(getCampaign).put(updateCampaign).delete(deleteCampaign);

module.exports = router;
