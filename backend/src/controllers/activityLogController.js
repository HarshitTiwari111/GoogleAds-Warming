const ActivityLog = require('../models/ActivityLog');
const APIFeatures = require('../utils/apiFeatures');
const { asyncHandler } = require('../utils/helpers');

exports.getLogs = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const userFilter = isAdmin ? {} : { user: req.user._id };

  const features = new APIFeatures(ActivityLog.find(userFilter), req.query)
    .search(['action', 'details'])
    .filter()
    .sort()
    .paginate();

  const logs = await features.query.populate('user', 'name email');
  const countFilter = { ...userFilter, ...(features.searchFilter || {}) };
  const total = await ActivityLog.countDocuments(countFilter);

  res.json({
    success: true,
    data: logs,
    pagination: { ...features.pagination, total, pages: Math.ceil(total / (features.pagination?.limit || 10)) }
  });
});
