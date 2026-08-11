/**
 * Bootstraps the first admin account so there's a way to log in at all on a
 * fresh database. Safe to re-run: does nothing if an admin already exists.
 * Usage: npm run seed:admin
 */
const User = require('../models/User');
const env = require('../config/env');
const logger = require('./logger');

async function seedAdminUser() {
  // Legacy roles (manager/media_buyer/viewer) collapsed into 'user' when the
  // system moved to a two-role model - migrate any leftover docs at boot.
  const migrated = await User.updateMany(
    { role: { $nin: ['admin', 'user'] } },
    { $set: { role: 'user' } }
  );
  if (migrated.modifiedCount > 0) {
    logger.info(`Migrated ${migrated.modifiedCount} legacy-role user(s) to role 'user'`);
  }

  const existingAdmin = await User.findOne({ role: 'admin' });
  if (existingAdmin) {
    if (existingAdmin.lockedUntil || existingAdmin.failedLoginAttempts > 0) {
      existingAdmin.failedLoginAttempts = 0;
      existingAdmin.lockedUntil = undefined;
      await existingAdmin.save({ validateBeforeSave: false });
      logger.info(`Admin account unlocked (${existingAdmin.email})`);
    }
    return existingAdmin;
  }

  const admin = await User.create({
    name: env.auth.seedAdminName,
    email: env.auth.seedAdminEmail,
    password: env.auth.seedAdminPassword,
    role: 'admin',
    active: true,
  });

  logger.info(`Created initial admin account: ${admin.email}`);
  return admin;
}

if (require.main === module) {
  require('dotenv').config();
  const mongoose = require('mongoose');

  (async () => {
    await mongoose.connect(env.mongoUri);
    logger.info('Connected to MongoDB for admin seeding');
    await seedAdminUser();
    await mongoose.disconnect();
    process.exit(0);
  })().catch((err) => {
    logger.error(`Admin seeding failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { seedAdminUser };
