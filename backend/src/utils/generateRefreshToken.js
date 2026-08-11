/**
 * Standalone CLI helper (not used by the running server) to generate a
 * Google Ads OAuth refresh token via a local loopback server. Usage:
 *   node src/utils/generateRefreshToken.js
 * Requires GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET in .env.
 */
const http = require('http');
const url = require('url');
const https = require('https');
require('dotenv').config();

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:9000/callback';
const SCOPE = 'https://www.googleapis.com/auth/adwords';

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPE)}&access_type=offline&prompt=consent`;

console.log('\n=== Google Ads Refresh Token Generator ===\n');
console.log('Step 1: Open this URL in your browser:\n');
console.log(authUrl);
console.log('\nStep 2: Login and allow access');
console.log('Step 3: You will be redirected - the token will be generated automatically\n');
console.log('Waiting for callback...\n');

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname === '/callback') {
    const code = parsedUrl.query.code;

    if (!code) {
      res.writeHead(400);
      res.end('Error: No code received');
      return;
    }

    try {
      const postData = new URLSearchParams({
        code: code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString();

      const tokenReq = https.request({
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      }, (tokenRes) => {
        let data = '';
        tokenRes.on('data', (chunk) => { data += chunk; });
        tokenRes.on('end', () => {
          const tokens = JSON.parse(data);

          if (tokens.refresh_token) {
            console.log('=== SUCCESS ===');
            console.log('Refresh Token:', tokens.refresh_token);
            console.log('\nAdd this to your .env file:');
            console.log(`GOOGLE_ADS_REFRESH_TOKEN=${tokens.refresh_token}`);

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html><body style="font-family:sans-serif;text-align:center;padding:50px">
                <h1 style="color:green">Success!</h1>
                <p>Refresh token generated. Check your terminal.</p>
                <p style="background:#f0f0f0;padding:15px;border-radius:8px;word-break:break-all">
                  <strong>Refresh Token:</strong><br>${tokens.refresh_token}
                </p>
                <p>You can close this window now.</p>
              </body></html>
            `);
          } else {
            console.log('Error:', tokens);
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`<html><body><h1>Error</h1><pre>${JSON.stringify(tokens, null, 2)}</pre></body></html>`);
          }

          setTimeout(() => { server.close(); process.exit(0); }, 2000);
        });
      });

      tokenReq.write(postData);
      tokenReq.end();
    } catch (error) {
      console.error('Error:', error);
      res.writeHead(500);
      res.end('Error exchanging code');
    }
  }
});

server.listen(9000, () => {
  console.log('Callback server listening on http://localhost:9000');
});
