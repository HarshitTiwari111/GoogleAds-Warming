const express = require('express');
const router = express.Router();
const {
  getPerformanceByAccount,
  getPerformanceSummary,
  getOverallPerformance,
} = require('../controllers/performanceController');
const { validate } = require('../middleware/validate');
const validators = require('../middleware/validators');

router.get('/overall', validators.performance.getMetrics, validate, getOverallPerformance);
router.get('/:accountId', validators.performance.accountParam, validators.performance.getMetrics, validate, getPerformanceByAccount);
router.get('/:accountId/summary', validators.performance.accountParam, validators.performance.getMetrics, validate, getPerformanceSummary);

module.exports = router;
