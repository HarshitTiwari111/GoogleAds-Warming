// mergeParams so the campaign-scoped mount (/campaigns/:campaignId/ads)
// exposes :campaignId to the controller alongside the flat /ads mount.
const express = require('express');
const router = express.Router({ mergeParams: true });
const { getAds, createAd, getAd, updateAd, deleteAd } = require('../controllers/adController');

router.route('/').get(getAds).post(createAd);
router.route('/:id').get(getAd).put(updateAd).delete(deleteAd);

module.exports = router;
