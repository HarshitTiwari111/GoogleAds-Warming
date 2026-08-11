const express = require('express');
const router = express.Router();
const {
  generateReport,
  getReportsByAccount,
  getAllReports,
  getReport,
  exportCSV,
  exportPDF,
} = require('../controllers/reportController');

// Reports are built from the caller's own Google Ads cache, so any user can
// generate them for their own data.
router.route('/').get(getAllReports).post(generateReport);
router.get('/export/csv', exportCSV);
router.get('/export/pdf', exportPDF);
router.get('/account/:accountId', getReportsByAccount);
router.get('/:id', getReport);

module.exports = router;
