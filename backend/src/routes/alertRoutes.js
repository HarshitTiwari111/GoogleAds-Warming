const express = require('express');
const { getAlertHistory, clearAlertHistory } = require('../controllers/alertController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const validators = require('../middleware/validators');

const router = express.Router();

router.get('/', validators.alerts.getHistory, validate, getAlertHistory);
router.delete('/clear', requireRole('admin'), clearAlertHistory);

module.exports = router;
