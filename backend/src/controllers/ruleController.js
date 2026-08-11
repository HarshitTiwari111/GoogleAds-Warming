const asyncHandler = require('../middleware/asyncHandler');
const AlertRules = require('../models/AlertRules');

/** GET /api/rules */
const getRules = asyncHandler(async (req, res) => {
  const rules = await AlertRules.find().sort({ createdAt: 1 });
  res.json({ success: true, data: rules });
});

const ALLOWED_FIELDS = ['name', 'type', 'description', 'enabled', 'threshold', 'secondaryThreshold', 'windowMinutes', 'cooldownMinutes'];

function pickAllowedFields(body) {
  const updates = {};
  ALLOWED_FIELDS.forEach((key) => {
    if (body[key] !== undefined) updates[key] = body[key];
  });
  return updates;
}

/** POST /api/rules */
const createRule = asyncHandler(async (req, res) => {
  const rule = await AlertRules.create(pickAllowedFields(req.body));
  res.status(201).json({ success: true, data: rule });
});

/** PUT /api/rules/:id */
const updateRule = asyncHandler(async (req, res) => {
  const rule = await AlertRules.findByIdAndUpdate(req.params.id, pickAllowedFields(req.body), {
    new: true,
    runValidators: true,
  });

  if (!rule) {
    return res.status(404).json({ success: false, message: 'Rule not found' });
  }

  res.json({ success: true, data: rule });
});

/** DELETE /api/rules/:id */
const deleteRule = asyncHandler(async (req, res) => {
  const rule = await AlertRules.findByIdAndDelete(req.params.id);

  if (!rule) {
    return res.status(404).json({ success: false, message: 'Rule not found' });
  }

  res.json({ success: true, data: rule });
});

module.exports = { getRules, createRule, updateRule, deleteRule };
