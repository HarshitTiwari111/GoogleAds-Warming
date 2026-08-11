/**
 * Lightweight NoSQL-injection guard: strips Mongo operator keys ($gt, $where,
 * etc.) from request input and neutralizes `$`/`{`/`}` characters in string
 * values, so user-supplied input can never be interpreted as a query operator.
 */
const sanitizeValue = (val) => {
  if (typeof val === 'string') {
    return val.replace(/\$/g, '').replace(/\{/g, '').replace(/\}/g, '');
  }
  if (Array.isArray(val)) return val.map(sanitizeValue);
  if (typeof val === 'object' && val !== null) {
    for (const key of Object.keys(val)) {
      if (key.startsWith('$')) {
        delete val[key];
      } else {
        val[key] = sanitizeValue(val[key]);
      }
    }
  }
  return val;
};

const sanitize = (req, res, next) => {
  if (req.body) req.body = sanitizeValue(req.body);
  if (req.query) req.query = sanitizeValue(req.query);
  if (req.params) req.params = sanitizeValue(req.params);
  next();
};

module.exports = sanitize;
