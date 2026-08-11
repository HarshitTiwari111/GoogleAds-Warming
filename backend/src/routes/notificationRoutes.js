const express = require('express');
const router = express.Router();
const {
  getNotifications,
  getUnreadNotifications,
  markAsRead,
  markAllAsRead,
} = require('../controllers/notificationController');

router.get('/', getNotifications);
router.get('/unread', getUnreadNotifications);
router.put('/read-all', markAllAsRead);
router.put('/:id/read', markAsRead);

module.exports = router;
