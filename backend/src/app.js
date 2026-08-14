const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

const cookieParser = require('cookie-parser');
const env = require('./config/env');
const routes = require('./routes');
const sanitize = require('./middleware/sanitize');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', 1);

app.use(helmet());

const allowedOrigins = env.corsOrigin === '*' ? '*' : env.corsOrigin.split(',').map((o) => o.trim());
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Brute-force protection for the sign-in form.
 *
 * Three things this deliberately does not do, each of which locked out
 * legitimate operators before:
 *
 * - It counts only *failed* logins. Mounted across /api/auth it also counted
 *   /me and /refresh, which the app issues by itself on every page load and
 *   token expiry, so a user could exhaust the quota without ever typing a
 *   wrong password.
 * - It keys on the email as well as the IP. Two colleagues behind one office
 *   NAT share a public address, and one of them fumbling a password must not
 *   sign the other out.
 * - It is no longer ten. Ten failures is under three honest typos plus a
 *   password-manager retry; counting only failures makes a larger number safe.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.nodeEnv === 'production' ? 30 : 100,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email || '').toLowerCase()}`,
  message: {
    success: false,
    message: 'Too many failed sign-in attempts for this email. Please wait 15 minutes and try again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Only the sign-in attempt itself — the rest of /api/auth is ordinary
// authenticated traffic and belongs under the general limiter. Mounted after
// the body parser because the key includes the email: before express.json()
// runs, req.body is undefined and every account would share one bucket.
app.use('/api/auth/login', loginLimiter);
app.use(cookieParser());

app.use(sanitize);

// Serves public/tracking.js - the landing-page snippet that reports visits
// back to /api/tracking/visit. Public and unauthenticated by design.
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api', routes);

// In production, serve the built frontend from backend so both run on one domain
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (env.nodeEnv === 'production' && fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
