const express = require('express');
const router = express.Router();
const { setup2FA, verify2FA, disable2FA, status2FA } = require('../controllers/twoFactorController');

router.get('/status', status2FA);
router.post('/setup', setup2FA);
router.post('/verify', verify2FA);
router.post('/disable', disable2FA);

module.exports = router;
