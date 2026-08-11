const express = require('express');
const router = express.Router();
const { login, getMe, updateProfile, changePassword, refreshToken, logout, getSessions } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const validators = require('../middleware/validators');

// There is no public registration: accounts are created by an admin from the
// Users page (POST /api/users). Sign-in is the only public auth route.
router.post('/login', validators.auth.login, validate, login);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
router.get('/me', requireAuth, getMe);
router.get('/sessions', requireAuth, getSessions);
router.put('/profile', validators.auth.updateProfile, validate, requireAuth, updateProfile);
router.put('/change-password', validators.auth.changePassword, validate, requireAuth, changePassword);

module.exports = router;
