/**
 * get-cert.js
 * -----------
 * Obtains a Let's Encrypt TLS certificate for server.ekta-enterprises.com
 * using the ACME HTTP-01 challenge, entirely within Node.js.
 *
 * Run as Administrator (needed to bind port 80):
 *   node scripts/get-cert.js
 *
 * Output: server/certs/privkey.pem  +  server/certs/fullchain.pem
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const acme   = require('acme-client');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ── Configuration ─────────────────────────────────────────────────────────────
const DOMAIN       = process.env.ACME_DOMAIN || 'server.ekta-enterprises.com';
const EMAIL        = process.env.ACME_EMAIL  || 'admin@ekta-enterprises.com';
const CERTS_DIR    = path.join(__dirname, '..', 'certs');
const CERT_PATH    = path.join(CERTS_DIR, 'fullchain.pem');
const KEY_PATH     = path.join(CERTS_DIR, 'privkey.pem');
const ACCOUNT_PATH = path.join(CERTS_DIR, 'account.key.pem');

// Create certs dir if missing
if (!fs.existsSync(CERTS_DIR)) fs.mkdirSync(CERTS_DIR, { recursive: true });

// ── Token store for HTTP-01 challenges ────────────────────────────────────────
const challenges = {};

// Tiny HTTP server that answers ACME challenges on port 80
const challengeServer = http.createServer((req, res) => {
  const prefix = '/.well-known/acme-challenge/';
  if (req.url && req.url.startsWith(prefix)) {
    const token = req.url.slice(prefix.length);
    if (challenges[token]) {
      console.log(`[ACME] Responding to challenge for token: ${token}`);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenges[token]);
      return;
    }
  }
  res.writeHead(404);
  res.end('Not found');
});

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔐  Requesting Let's Encrypt certificate for: ${DOMAIN}\n`);

  // Start challenge server
  await new Promise((resolve, reject) => {
    challengeServer.listen(80, '0.0.0.0', resolve);
    challengeServer.on('error', reject);
  });
  console.log('[ACME] Challenge server listening on :80');

  // Load or generate ACME account key
  let accountKey;
  if (fs.existsSync(ACCOUNT_PATH)) {
    console.log('[ACME] Loading existing account key...');
    accountKey = fs.readFileSync(ACCOUNT_PATH);
  } else {
    console.log('[ACME] Generating new account key...');
    accountKey = await acme.crypto.createPrivateKey();
    fs.writeFileSync(ACCOUNT_PATH, accountKey);
  }

  // Create ACME client (production directory)
  const client = new acme.Client({
    directoryUrl: acme.directory.letsencrypt.production,
    accountKey,
  });

  // Register / retrieve account
  await client.createAccount({
    termsOfServiceAgreed: true,
    contact: [`mailto:${EMAIL}`],
  });
  console.log('[ACME] Account ready');

  // Generate domain private key + CSR
  console.log('[ACME] Generating domain key and CSR...');
  const [domainKey, csr] = await acme.crypto.createCsr({ commonName: DOMAIN });

  // Obtain certificate
  console.log('[ACME] Starting certificate order...');
  const cert = await client.auto({
    csr,
    email: EMAIL,
    termsOfServiceAgreed: true,
    challengePriority: ['http-01'],
    challengeCreateFn: async (authz, challenge, keyAuthorization) => {
      // Store the token so our HTTP server can answer it
      challenges[challenge.token] = keyAuthorization;
      console.log(`[ACME] Challenge created: token=${challenge.token}`);
    },
    challengeRemoveFn: async (authz, challenge) => {
      delete challenges[challenge.token];
    },
  });

  // Save files
  fs.writeFileSync(KEY_PATH,  domainKey);
  fs.writeFileSync(CERT_PATH, cert);
  console.log(`\n✅  Certificate saved!`);
  console.log(`    Key:  ${KEY_PATH}`);
  console.log(`    Cert: ${CERT_PATH}`);

  // Shut down challenge server
  challengeServer.close();

  // Show expiry
  const certParsed = new crypto.X509Certificate(cert);
  console.log(`\n📅  Valid until: ${certParsed.validTo}`);
  console.log('\n🚀  Restart your Node server — HTTPS will be active on :443\n');
}

main().catch((err) => {
  console.error('\n❌  Certificate acquisition failed:', err.message || err);
  challengeServer.close();
  process.exit(1);
});
