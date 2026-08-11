const ActivityLog = require('../models/ActivityLog');

const logActivity = async (userId, action, entity, entityId, details, ipAddress, metadata) => {
  try {
    await ActivityLog.create({ user: userId, action, entity, entityId, details, ipAddress, metadata });
  } catch (error) {
    console.error('Activity logging failed:', error.message);
  }
};

const activityMiddleware = (action, entity) => {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        const entityId = data?.data?._id || req.params.id;
        logActivity(req.user._id, action, entity, entityId, null, req.ip);
      }
      return originalJson(data);
    };
    next();
  };
};

module.exports = { logActivity, activityMiddleware };
