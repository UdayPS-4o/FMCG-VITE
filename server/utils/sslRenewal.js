/**
 * sslRenewal.js
 * -------------
 * Automated Zero-Downtime SSL Certificate Manager using Let's Encrypt (ACME)
 *
 * Features:
 *  1. Intercepts HTTP-01 challenge requests directly on Port 80 express redirect server.
 *  2. Periodically checks certificate expiration (every 12 hours).
 *  3. Automatically requests certificate renewal when remaining validity is < 30 days.
 *  4. Hot-reloads the TLS context on the live HTTPS server (`httpsServer.setSecureContext`)
 *     so certificates update seamlessly with ZERO downtime and NO server restart required.
 */

'use strict';

const acme   = require('acme-client');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const tls    = require('tls');

// ── In-Memory Token Store for HTTP-01 ACME Challenges ───────────────────────
const acmeChallenges = {};

/**
 * Express middleware to answer HTTP-01 ACME challenge requests on Port 80
 */
function acmeChallengeMiddleware(req, res, next) {
  const prefix = '/.well-known/acme-challenge/';
  if (req.url && req.url.startsWith(prefix)) {
    const token = req.url.slice(prefix.length);
    if (acmeChallenges[token]) {
      console.log(`[SSL-AUTO] 🔐 Responding to ACME challenge token: ${token}`);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(acmeChallenges[token]);
      return;
    }
  }
  next();
}

/**
 * Checks current certificate expiration date (in days remaining)
 */
function getCertDaysRemaining(certPath) {
  if (!fs.existsSync(certPath)) return 0;
  try {
    const certPem = fs.readFileSync(certPath, 'utf8');
    const x509 = new crypto.X509Certificate(certPem);
    const expiresAt = new Date(x509.validTo);
    return Math.floor((expiresAt - Date.now()) / 86_400_000);
  } catch (err) {
    console.error('[SSL-AUTO] Error reading existing SSL certificate:', err.message);
    return 0;
  }
}

/**
 * Renews the SSL Certificate using Let's Encrypt and hot-reloads the HTTPS server
 */
async function renewCertificate(httpsServer) {
  const DOMAIN       = process.env.ACME_DOMAIN || process.env.ACME_DOMAINS || 'server.ekta-enterprises.com';
  const PRIMARY_DOMAIN = DOMAIN.split(',')[0].trim();
  const EMAIL        = process.env.ACME_EMAIL || 'admin@ekta-enterprises.com';
  const CERTS_DIR    = path.join(__dirname, '..', 'certs');
  const CERT_PATH    = process.env.SSL_CERT_PATH || path.join(CERTS_DIR, 'fullchain.pem');
  const KEY_PATH     = process.env.SSL_KEY_PATH  || path.join(CERTS_DIR, 'privkey.pem');
  const ACCOUNT_PATH = path.join(CERTS_DIR, 'account.key.pem');

  if (!fs.existsSync(CERTS_DIR)) fs.mkdirSync(CERTS_DIR, { recursive: true });

  console.log(`[SSL-AUTO] 🔄 Requesting SSL Certificate renewal for ${PRIMARY_DOMAIN}...`);

  // Load or generate ACME account key
  let accountKey;
  if (fs.existsSync(ACCOUNT_PATH)) {
    accountKey = fs.readFileSync(ACCOUNT_PATH);
  } else {
    console.log('[SSL-AUTO] Generating new ACME account key...');
    accountKey = await acme.crypto.createPrivateKey();
    fs.writeFileSync(ACCOUNT_PATH, accountKey);
  }

  // Create ACME client
  const client = new acme.Client({
    directoryUrl: acme.directory.letsencrypt.production,
    accountKey,
  });

  await client.createAccount({
    termsOfServiceAgreed: true,
    contact: [`mailto:${EMAIL}`],
  });

  // Generate domain private key and CSR
  const [domainKey, csr] = await acme.crypto.createCsr({ commonName: PRIMARY_DOMAIN });

  // Obtain certificate via ACME client
  const cert = await client.auto({
    csr,
    email: EMAIL,
    termsOfServiceAgreed: true,
    challengePriority: ['http-01'],
    challengeCreateFn: async (authz, challenge, keyAuthorization) => {
      acmeChallenges[challenge.token] = keyAuthorization;
      console.log(`[SSL-AUTO] Challenge created for token: ${challenge.token}`);
    },
    challengeRemoveFn: async (authz, challenge) => {
      delete acmeChallenges[challenge.token];
    },
  });

  // Save cert files
  fs.writeFileSync(KEY_PATH, domainKey);
  fs.writeFileSync(CERT_PATH, cert);

  const x509 = new crypto.X509Certificate(cert);
  console.log(`[SSL-AUTO] ✅ Certificate renewed successfully! Valid until: ${x509.validTo}`);

  // Hot-reload TLS context on live HTTPS server (Zero Downtime)
  if (httpsServer && typeof httpsServer.setSecureContext === 'function') {
    try {
      const newSecureContext = tls.createSecureContext({
        key: fs.readFileSync(KEY_PATH),
        cert: fs.readFileSync(CERT_PATH),
      });
      httpsServer.setSecureContext(newSecureContext);
      console.log('[SSL-AUTO] 🚀 Live HTTPS server TLS context updated dynamically!');
    } catch (err) {
      console.error('[SSL-AUTO] Failed to hot-reload TLS context:', err.message);
    }
  }
}

/**
 * Checks cert status and triggers renewal if valid for < 30 days.
 */
async function checkAndRenew(httpsServer) {
  const CERTS_DIR = path.join(__dirname, '..', 'certs');
  const CERT_PATH = process.env.SSL_CERT_PATH || path.join(CERTS_DIR, 'fullchain.pem');
  const daysLeft  = getCertDaysRemaining(CERT_PATH);

  console.log(`[SSL-AUTO] Certificate Status: ${daysLeft} days remaining.`);

  if (daysLeft < 30) {
    console.log(`[SSL-AUTO] Certificate expires in ${daysLeft} days (< 30 days). Auto-renewing now...`);
    try {
      await renewCertificate(httpsServer);
    } catch (err) {
      console.error('[SSL-AUTO] ❌ Auto-renewal failed:', err.message || err);
    }
  }
}

/**
 * Initializes automatic SSL renewal watcher.
 * Runs check on startup and schedules periodic checks every 12 hours.
 */
function initAutoSslRenewal(httpsServer) {
  // Initial check after 10 seconds of server boot
  setTimeout(() => {
    checkAndRenew(httpsServer);
  }, 10_000);

  // Periodic check every 12 hours (12 * 60 * 60 * 1000 ms)
  const TWELVE_HOURS = 12 * 60 * 60 * 1000;
  setInterval(() => {
    checkAndRenew(httpsServer);
  }, TWELVE_HOURS);

  console.log('[SSL-AUTO] Automated SSL renewal manager active (checks every 12h).');
}

module.exports = {
  acmeChallengeMiddleware,
  initAutoSslRenewal,
  checkAndRenew,
};
