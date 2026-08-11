const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.nodeEnv === 'production' ? 10 : 100,
  message: { success: false, message: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
app.use('/api/auth', authLimiter);

app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
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
