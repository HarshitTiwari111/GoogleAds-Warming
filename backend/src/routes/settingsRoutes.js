const express = require('express');
const router = express.Router();
const {
  getSettings, updateSettings, generateAuthUrl, saveToken, testWorkerApi, debugToken, getAllUsersStatus,
  getMccIds, updateMccIds, discoverMccIds,
} = require('../controllers/settingsController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const validators = require('../middleware/validators');

router.get('/', getSettings);
router.get('/users-status', requireRole('admin'), getAllUsersStatus);
router.put('/', validators.settings.update, validate, updateSettings);
// Multi-MCC list for this user's Google Ads connection. `/mccs/discover`
// is declared first so it is not swallowed by a broader /mccs handler.
router.get('/mccs/discover', discoverMccIds);
router.get('/mccs', getMccIds);
router.put('/mccs', updateMccIds);

router.get('/oauth-url', generateAuthUrl);
router.post('/save-token', validators.settings.saveToken, validate, saveToken);
router.get('/test-worker', testWorkerApi);
router.get('/debug-token', debugToken);

module.exports = router;
