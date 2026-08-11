const { body, query, param } = require('express-validator');

const auth = {
  register: [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }).withMessage('Name too long'),
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
      .matches(/[a-z]/).withMessage('Password must contain a lowercase letter')
      .matches(/[0-9]/).withMessage('Password must contain a number'),
  ],
  login: [
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
    body('twoFactorToken').optional().isString().isLength({ min: 6, max: 8 }).withMessage('Invalid 2FA token'),
  ],
  changePassword: [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
      .matches(/[A-Z]/).withMessage('Must contain an uppercase letter')
      .matches(/[a-z]/).withMessage('Must contain a lowercase letter')
      .matches(/[0-9]/).withMessage('Must contain a number'),
  ],
  updateProfile: [
    body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
    body('email').optional().trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  ],
};

const users = {
  create: [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').optional().isIn(['admin', 'user']).withMessage('Invalid role'),
  ],
  update: [
    param('id').isMongoId().withMessage('Invalid user ID'),
    body('name').optional().trim().isLength({ min: 1, max: 100 }),
    body('email').optional().trim().isEmail().normalizeEmail(),
    body('role').optional().isIn(['admin', 'user']).withMessage('Invalid role'),
    body('active').optional().isBoolean(),
  ],
  updateProfile: [
    body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters'),
    body('email').optional().trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  ],
  delete: [
    param('id').isMongoId().withMessage('Invalid user ID'),
  ],
};

const alerts = {
  getHistory: [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer').toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100').toInt(),
    query('type').optional().isString().trim(),
  ],
};

const performance = {
  getMetrics: [
    query('from').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be YYYY-MM-DD format'),
    query('to').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be YYYY-MM-DD format'),
    query('campaignId').optional().isString().trim(),
  ],
  accountParam: [
    param('accountId').isString().trim().notEmpty().withMessage('Account ID is required'),
  ],
};

const accounts = {
  customerParam: [
    param('customerId').matches(/^\d+$/).withMessage('Customer ID must be numeric'),
  ],
  campaignParam: [
    param('customerId').matches(/^\d+$/).withMessage('Customer ID must be numeric'),
    param('campaignId').matches(/^\d+$/).withMessage('Campaign ID must be numeric'),
  ],
  mutateKeyword: [
    param('customerId').matches(/^\d+$/).withMessage('Customer ID must be numeric'),
    param('adGroupId').matches(/^\d+$/).withMessage('Ad Group ID must be numeric'),
    param('criterionId').matches(/^\d+$/).withMessage('Criterion ID must be numeric'),
  ],
  mutateAd: [
    param('customerId').matches(/^\d+$/).withMessage('Customer ID must be numeric'),
    param('adGroupId').matches(/^\d+$/).withMessage('Ad Group ID must be numeric'),
    param('adId').matches(/^\d+$/).withMessage('Ad ID must be numeric'),
  ],
  mutateCampaignDevice: [
    param('customerId').matches(/^\d+$/).withMessage('Customer ID must be numeric'),
    param('campaignId').matches(/^\d+$/).withMessage('Campaign ID must be numeric'),
  ],
  idParam: [
    param('id').isMongoId().withMessage('Invalid account ID'),
  ],
  // The account name field is `accountName` on every creation endpoint.
  create: [
    body('accountName').trim().notEmpty().withMessage('Account name is required').isLength({ max: 200 }).withMessage('Account name too long'),
    body('googleAdsCustomerId').optional().isString().matches(/^\d+$/).withMessage('Customer ID must be numeric'),
    body('emailAddress').optional({ values: 'falsy' }).trim().isEmail().withMessage('Invite email must be a valid email address'),
    // Budgets are operator-supplied; reject nonsense rather than silently
    // provisioning an account at an unintended spend level.
    body('dailyBudget').optional({ values: 'falsy' }).isFloat({ min: 0.01, max: 1000000 }).withMessage('Daily budget must be a positive amount'),
    body('campaignBudget').optional({ values: 'falsy' }).isFloat({ min: 0.01, max: 1000000 }).withMessage('Campaign budget must be a positive amount'),
    body('billingBudget').optional({ values: 'falsy' }).isFloat({ min: 0.01, max: 100000000 }).withMessage('Billing budget must be a positive amount'),
    body('mccId').optional({ values: 'falsy' }).isString().matches(/^\d{6,}$/).withMessage('MCC ID must be numeric'),
    body('campaignsPerAccount').optional({ values: 'falsy' }).isInt({ min: 1, max: 10 }).withMessage('Campaigns per account must be between 1 and 10'),
  ],
  bulkCreate: [
    body('count').isInt({ min: 1, max: 50 }).withMessage('Count must be between 1 and 50'),
    body('prefix').optional({ values: 'falsy' }).trim().isLength({ max: 200 }).withMessage('Prefix too long'),
    body('emailAddress').optional({ values: 'falsy' }).trim().isEmail().withMessage('Invite email must be a valid email address'),
    body('dailyBudget').optional({ values: 'falsy' }).isFloat({ min: 0.01, max: 1000000 }).withMessage('Daily budget must be a positive amount'),
    body('campaignBudget').optional({ values: 'falsy' }).isFloat({ min: 0.01, max: 1000000 }).withMessage('Campaign budget must be a positive amount'),
    body('billingBudget').optional({ values: 'falsy' }).isFloat({ min: 0.01, max: 100000000 }).withMessage('Billing budget must be a positive amount'),
    body('mccId').optional({ values: 'falsy' }).isString().matches(/^\d{6,}$/).withMessage('MCC ID must be numeric'),
    body('campaignsPerAccount').optional({ values: 'falsy' }).isInt({ min: 1, max: 10 }).withMessage('Campaigns per account must be between 1 and 10'),
  ],
  // Direct invite by customer id — the address field is `emailAddress`.
  invite: [
    body('customerId').isString().matches(/^\d+$/).withMessage('Customer ID must be numeric'),
    body('emailAddress').trim().isEmail().withMessage('Valid email is required'),
    body('accessRole').optional({ values: 'falsy' }).isIn(['ADMIN', 'STANDARD', 'READ_ONLY', 'EMAIL_ONLY']).withMessage('Unsupported access role'),
  ],
  // Invite against a stored account — the address is optional because it
  // falls back to the one saved on the account.
  inviteAccount: [
    param('id').isMongoId().withMessage('Invalid account ID'),
    body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Valid email is required'),
    body('emailAddress').optional({ values: 'falsy' }).trim().isEmail().withMessage('Valid email is required'),
  ],
};

const settings = {
  update: [
    body('refreshToken').optional().isString(),
    body('mccId').optional().matches(/^\d{10}$/).withMessage('MCC ID must be 10 digits'),
    body('customerIds').optional().isArray(),
    body('customerIds.*').optional().isString().matches(/^\d+$/).withMessage('Customer IDs must be numeric'),
  ],
  // The OAuth proxy hands the frontend a refresh token (not an auth code),
  // which reaches us as refresh_token/token/credentials - accept any one.
  saveToken: [
    body('refresh_token').optional().isString(),
    body('token').optional().isString(),
    body('credentials').optional().isString(),
    body().custom((b) => {
      if (!b || (!b.refresh_token && !b.token && !b.credentials)) {
        throw new Error('No token provided');
      }
      return true;
    }),
  ],
};

module.exports = { auth, users, alerts, performance, accounts, settings };
