const express = require('express');
const router = express.Router();
const {
  startWarming,
  advanceWarming,
  getWarmingStatus,
  getAllWarmingAccounts,
  previewSchedule,
  resetWarming,
} = require('../controllers/warmingController');

router.get('/', getAllWarmingAccounts);
// Registered before /:accountId/... so "schedule" is never read as an id.
router.get('/schedule/preview', previewSchedule);
router.post('/:accountId/start', startWarming);
router.post('/:accountId/advance', advanceWarming);
router.post('/:accountId/reset', resetWarming);
router.get('/:accountId', getWarmingStatus);

module.exports = router;
