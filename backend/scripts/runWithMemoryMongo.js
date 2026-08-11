/**
 * Spins up a throwaway in-memory MongoDB (no local `mongod` install needed)
 * and boots the server against it. Data is lost when the process exits -
 * for quick local testing only, not for real use.
 * Usage: npm run dev:memory
 */
const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');

(async () => {
  const mongod = await MongoMemoryServer.create();
  const mongoUri = mongod.getUri();
  process.env.MONGODB_URI = mongoUri;

  // Save URI to file so seed script can use it
  const uriFile = path.join(__dirname, '../.mongo-uri');
  fs.writeFileSync(uriFile, mongoUri, 'utf-8');

  console.log(`[dev:memory] In-memory MongoDB started at ${mongoUri}`);

  process.on('SIGINT', async () => {
    await mongod.stop();
    fs.unlinkSync(uriFile);
    process.exit(0);
  });

  require('../server.js');
})();
