const express = require('express');
const router = express.Router();
const { publishCampaign, getPublishHistory } = require('../controllers/publishController');

router.get('/history', getPublishHistory);
router.get('/history/:campaignId', getPublishHistory);
router.post('/:campaignId', publishCampaign);

module.exports = router;
