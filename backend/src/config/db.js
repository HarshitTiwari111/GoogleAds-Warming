const mongoose = require('mongoose');
const dns = require('dns');
const env = require('./env');
const logger = require('../utils/logger');

// Some Windows/ISP DNS resolvers fail to resolve MongoDB Atlas SRV records
// reliably - pinning to public resolvers avoids intermittent connection
// failures in local development.
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  // Non-fatal - fall back to system DNS.
}

const connectDB = async (retries = 5) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      mongoose.set('strictQuery', true);
      const conn = await mongoose.connect(env.mongoUri, {
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        minPoolSize: 2,
        heartbeatFrequencyMS: 10000,
        retryReads: true,
        retryWrites: true,
        connectTimeoutMS: 15000,
      });
      logger.info(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected. Mongoose will auto-reconnect...');
      });
      mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB reconnected successfully');
      });
      mongoose.connection.on('error', (err) => {
        logger.error(`MongoDB connection error: ${err.message}`);
      });
      return true;
    } catch (error) {
      logger.error(`MongoDB connection attempt ${attempt}/${retries} failed: ${error.message}`);

      // "bad auth" is a credentials problem, not a transient one — retrying
      // four more times just delays the real message by half a minute.
      if (/bad auth|Authentication failed/i.test(error.message)) {
        logger.error(
          'MongoDB rejected the credentials. Check the username/password in MONGODB_URI, ' +
          'that the database user exists in Atlas -> Database Access, and that any special ' +
          'characters in the password are URL-encoded (@ -> %40, # -> %23, / -> %2F).'
        );
        return false;
      }

      if (attempt < retries) {
        const waitSec = attempt * 3;
        logger.warn(`Retrying MongoDB connection in ${waitSec}s...`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
      }
    }
  }

  logger.error('Could not reach MongoDB. The server will still start so logs and /api/health stay reachable, but every request that touches the database will fail.');
  return false;
};

module.exports = connectDB;
