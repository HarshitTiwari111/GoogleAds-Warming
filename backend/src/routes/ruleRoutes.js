const express = require('express');
const { requireRole } = require('../middleware/auth');
const { getRules, createRule, updateRule, deleteRule } = require('../controllers/ruleController');

const router = express.Router();

// Alert rules are system-wide (shared across every account/campaign), so
// changing thresholds is admin-only - users can still view them (needed by
// Rules page display and Profile's per-rule mute toggles).
router.get('/', getRules);
router.post('/', requireRole('admin'), createRule);
router.put('/:id', requireRole('admin'), updateRule);
router.delete('/:id', requireRole('admin'), deleteRule);

module.exports = router;
