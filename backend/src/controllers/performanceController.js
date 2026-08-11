const mongoose = require('mongoose');
const Performance = require('../models/Performance');
const Account = require('../models/Account');

const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

// Two-role model: admins read performance for anyone's accounts, users only
// for accounts they created.
function ownershipFilter(reqUser) {
  return reqUser.role === 'admin' ? {} : { createdBy: reqUser.id };
}

exports.getPerformanceByAccount = async (req, res, next) => {
  try {
    const account = await Account.findOne({ _id: req.params.accountId, ...ownershipFilter(req.user) });
    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const { from, to } = req.query;
    if (from && !YYYY_MM_DD.test(from)) return res.status(400).json({ message: 'Invalid from date format. Use YYYY-MM-DD.' });
    if (to && !YYYY_MM_DD.test(to)) return res.status(400).json({ message: 'Invalid to date format. Use YYYY-MM-DD.' });
    const filter = { account: req.params.accountId };

    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const data = await Performance.find(filter)
      .populate('campaign', 'campaignName')
      .sort({ date: -1 });

    res.json(data);
  } catch (error) {
    next(error);
  }
};

exports.getPerformanceSummary = async (req, res, next) => {
  try {
    const account = await Account.findOne({ _id: req.params.accountId, ...ownershipFilter(req.user) });
    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const summary = await Performance.aggregate([
      { $match: { account: mongoose.Types.ObjectId.createFromHexString(req.params.accountId) } },
      {
        $group: {
          _id: null,
          totalImpressions: { $sum: '$impressions' },
          totalClicks: { $sum: '$clicks' },
          totalSpend: { $sum: '$spend' },
          avgCtr: { $avg: '$ctr' },
          avgCpc: { $avg: '$avgCpc' },
          totalConversions: { $sum: '$conversions' },
          days: { $sum: 1 },
        },
      },
    ]);

    res.json(summary[0] || {
      totalImpressions: 0,
      totalClicks: 0,
      totalSpend: 0,
      avgCtr: 0,
      avgCpc: 0,
      totalConversions: 0,
      days: 0,
    });
  } catch (error) {
    next(error);
  }
};

exports.getOverallPerformance = async (req, res, next) => {
  try {
    const { days = 7 } = req.query;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - parseInt(days));

    const userAccounts = await Account.find(ownershipFilter(req.user)).select('_id');
    const accountIds = userAccounts.map(a => a._id);

    const data = await Performance.aggregate([
      { $match: { date: { $gte: fromDate }, account: { $in: accountIds } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          impressions: { $sum: '$impressions' },
          clicks: { $sum: '$clicks' },
          spend: { $sum: '$spend' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json(data);
  } catch (error) {
    next(error);
  }
};
