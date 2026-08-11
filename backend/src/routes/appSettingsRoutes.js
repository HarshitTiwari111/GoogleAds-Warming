const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const {
  getSettings,
  getSetting,
  upsertSetting,
  deleteSetting,
  seedDefaults,
} = require('../controllers/appSettingsController');

// Reads are open to every signed-in user — the creation forms need these
// option lists. Writes change workspace-wide behaviour, so they are admin-only.
router.get('/', getSettings);
router.get('/:key', getSetting);
router.post('/', requireRole('admin'), upsertSetting);
router.post('/seed', requireRole('admin'), seedDefaults);
router.delete('/:key', requireRole('admin'), deleteSetting);

module.exports = router;
