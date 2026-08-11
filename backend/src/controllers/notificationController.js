const notificationService = require('../services/notificationService');
const { asyncHandler } = require('../utils/helpers');

exports.getNotifications = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const result = await notificationService.getAll(req.user._id, page, limit);
  res.json({ success: true, data: result });
});

exports.getUnreadNotifications = asyncHandler(async (req, res) => {
  const notifications = await notificationService.getUnread(req.user._id);
  res.json({ success: true, data: notifications });
});

exports.markAsRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markAsRead(req.params.id, req.user._id);
  if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
  res.json({ success: true, data: notification });
});

exports.markAllAsRead = asyncHandler(async (req, res) => {
  await notificationService.markAllAsRead(req.user._id);
  res.json({ success: true, message: 'All notifications marked as read' });
});
