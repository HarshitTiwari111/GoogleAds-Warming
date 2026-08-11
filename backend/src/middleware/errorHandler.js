const logger = require('../utils/logger');

/**
 * Translate the database layer's errors into the right HTTP status and a
 * message the caller can act on. Without this a bad id or a missing required
 * field surfaces as an opaque 500, which reads as a server fault when it is
 * really a bad request.
 */
function classifyError(err) {
  if (err.name === 'ValidationError' && err.errors) {
    const fields = Object.values(err.errors).map((e) => e.message);
    return { statusCode: 400, message: fields.join('; ') || 'Validation failed' };
  }

  if (err.name === 'CastError') {
    return { statusCode: 400, message: `Invalid value for "${err.path}"` };
  }

  // Unique-index violation.
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    return { statusCode: 409, message: `That ${field} is already in use` };
  }

  return null;
}

/** Central Express error handler - keeps controllers free of try/catch boilerplate. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const classified = classifyError(err);
  const statusCode = classified?.statusCode || err.statusCode || 500;

  logger.error(`${req.method} ${req.originalUrl} -> ${err.message}`);

  const clientMessage =
    classified?.message ||
    ((statusCode >= 500 && !err.statusCode) ? 'Internal Server Error' : err.message || 'Internal Server Error');

  res.status(statusCode).json({
    success: false,
    message: clientMessage,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({ success: false, message: 'Route not found' });
}

module.exports = { errorHandler, notFoundHandler };
