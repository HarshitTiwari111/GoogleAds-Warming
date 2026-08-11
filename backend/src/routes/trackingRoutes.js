const express = require('express');
const { trackVisit } = require('../controllers/trackingController');

const router = express.Router();

// GET supports a simple tracking-pixel/redirect style call from the landing page.
// POST supports a programmatic call (e.g. from a client-side analytics script).
router.get('/visit', trackVisit);
router.post('/visit', trackVisit);

module.exports = router;
