const UAParser = require('ua-parser-js');
const crypto = require('crypto');

function parseDevice(req) {
  const parser = new UAParser(req.headers['user-agent'] || '');
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const ip = req.ip || req.connection?.remoteAddress || '';

  const browserStr = `${browser.name || 'Unknown'} ${browser.version || ''}`.trim();
  const osStr = `${os.name || 'Unknown'} ${os.version || ''}`.trim();

  // Hash based on browser+OS combo (not IP, since IP changes)
  const deviceHash = crypto.createHash('sha256')
    .update(`${browser.name}|${browser.major}|${os.name}|${os.version}`)
    .digest('hex');

  return { deviceHash, browser: browserStr, os: osStr, ip };
}

module.exports = { parseDevice };
