// mergeParams so the campaign-scoped mount (/campaigns/:campaignId/keywords)
// exposes :campaignId to the controller alongside the flat /keywords mount.
const express = require('express');
const router = express.Router({ mergeParams: true });
const {
  getKeywords,
  createKeyword,
  createBulkKeywords,
  updateKeyword,
  deleteKeyword,
} = require('../controllers/keywordController');

router.route('/').get(getKeywords).post(createKeyword);
router.post('/bulk', createBulkKeywords);
router.route('/:id').put(updateKeyword).delete(deleteKeyword);

module.exports = router;
