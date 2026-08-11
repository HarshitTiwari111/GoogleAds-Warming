const fs = require('fs');
const path = require('path');
const winston = require('winston');

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `[${ts}] ${level}: ${stack || message}`;
});

// Cloud platforms (Render, etc.) capture stdout/stderr, not files on an
// ephemeral filesystem - console must always be on, or deploy failures are
// invisible. File logging is a local-dev convenience only.
const transports = [
  new winston.transports.Console({
    format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat),
  }),
];

if (process.env.NODE_ENV !== 'production') {
  const logsDir = path.join(__dirname, '../../logs');
  fs.mkdirSync(logsDir, { recursive: true });

  transports.push(
    new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logsDir, 'combined.log') })
  );
}

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), logFormat),
  transports,
});

module.exports = logger;
