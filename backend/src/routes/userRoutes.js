const express = require('express');
const {
  getUsers,
  createUser,
  updateUser,
  deactivateUser,
  deleteUser,
  getMyProfile,
  updateMyProfile,
} = require('../controllers/userController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const validators = require('../middleware/validators');

const router = express.Router();

// Self-service profile - any authenticated user (requireAuth applied in routes/index.js).
router.get('/me', getMyProfile);
router.put('/me', validators.users.updateProfile, validate, updateMyProfile);

// Admin-only user management.
router.get('/', requireRole('admin'), getUsers);
router.post('/', validators.users.create, validate, requireRole('admin'), createUser);
router.put('/:id', validators.users.update, validate, requireRole('admin'), updateUser);
router.delete('/:id', validators.users.delete, validate, requireRole('admin'), deactivateUser);
router.delete('/:id/permanent', validators.users.delete, validate, requireRole('admin'), deleteUser);

module.exports = router;
