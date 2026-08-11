const Notification = require('../models/Notification');

class NotificationService {
  async create(userId, title, message, type = 'info', link = null, metadata = null) {
    return Notification.create({ user: userId, title, message, type, link, metadata });
  }

  async getUnread(userId) {
    return Notification.find({ user: userId, isRead: false }).sort('-createdAt').limit(20);
  }

  async markAsRead(notificationId, userId) {
    return Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { isRead: true },
      { new: true }
    );
  }

  async markAllAsRead(userId) {
    return Notification.updateMany({ user: userId, isRead: false }, { isRead: true });
  }

  async getAll(userId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const notifications = await Notification.find({ user: userId }).sort('-createdAt').skip(skip).limit(limit);
    const total = await Notification.countDocuments({ user: userId });
    return { notifications, total, page, pages: Math.ceil(total / limit) };
  }
}

module.exports = new NotificationService();
