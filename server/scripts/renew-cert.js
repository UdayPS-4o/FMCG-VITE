/**
 * renew-cert.js
 * -------------
 * Renews a Let's Encrypt TLS certificate for one or more domains
 * using the ACME HTTP-01 challenge, entirely within Node.js.
 *
 * ✅ Supports multiple domains (SANs) via ACME_DOMAINS env var
 * ✅ Checks existing cert expiry (skips if > 30 days remaining)
 * ✅ Saves privkey.pem + fullchain.pem to server/certs/
 * ✅ Restarts PM2 app after renewal (if pm2 is running)
 *
 * Run as Administrator (needed to bind port 80):
 *   node scripts/renew-cert.js
 *
 * Or via npm:
 *   npm run renew-cert
 *
 * Force renewal even if cert is valid:
 *   node scripts/renew-cert.js --force
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const acme   = require('acme-client');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ── Configuration ──────────────────────────────────────────────────────────────
// Support comma-separated list of domains:
//   ACME_DOMAINS=server.ekta-enterprises.com,test.ekta-enterprises.com,app.ekta-enterprises.com
const DOMAINS_RAW    = process.env.ACME_DOMAINS || process.env.ACME_DOMAIN || 'server.ekta-enterprises.com';
const DOMAINS        = DOMAINS_RAW.split(',').map(d => d.trim()).filter(Boolean);
const PRIMARY_DOMAIN = DOMAINS[0];
const EMAIL          = process.env.ACME_EMAIL || 'admin@ekta-enterprises.com';
const CERTS_DIR      = path.join(__dirname, '..', 'certs');
const CERT_PATH      = path.join(CERTS_DIR, 'fullchain.pem');
const KEY_PATH       = path.join(CERTS_DIR, 'privkey.pem');
const ACCOUNT_PATH   = path.join(CERTS_DIR, 'account.key.pem');
const PM2_APP_NAME   = process.env.PM2_APP_NAME || 'app'; // pm2 app name to restart

// Create certs dir if missing
if (!fs.existsSync(CERTS_DIR)) fs.mkdirSync(CERTS_DIR, { recursive: true });

// ── Token store for HTTP-01 challenges ─────────────────────────────────────────
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

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n\uD83D\uDD10  Let's Encrypt Certificate Renewal");
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`    Domains : ${DOMAINS.join(', ')}`);
  console.log(`    Email   : ${EMAIL}`);
  console.log(`    Certs   : ${CERTS_DIR}\n`);

  // ── Check existing cert expiry ────────────────────────────────────────────
  if (fs.existsSync(CERT_PATH)) {
    try {
      const existingCert = fs.readFileSync(CERT_PATH, 'utf8');
      const x509 = new crypto.X509Certificate(existingCert);
      const expiresAt = new Date(x509.validTo);
      const daysLeft  = Math.floor((expiresAt - Date.now()) / 86_400_000);
      console.log(`\u2139\uFE0F   Current cert expires: ${x509.validTo} (${daysLeft} days left)`);
      if (daysLeft > 30 && !process.argv.includes('--force')) {
        console.log('\u2705  Certificate is still valid for > 30 days. Skipping renewal.');
        console.log('    Use --force to renew anyway.\n');
        process.exit(0);
      }
      if (daysLeft <= 0) {
        console.log('\u26A0\uFE0F   Certificate has EXPIRED. Renewing now...\n');
      } else {
        console.log('\uD83D\uDD04  Certificate expires soon or --force used. Renewing...\n');
      }
    } catch (_) {
      console.log('\u26A0\uFE0F   Could not parse existing cert. Proceeding with fresh issuance.\n');
    }
  } else {
    console.log('\uD83D\uDCCB  No existing certificate found. Issuing new one...\n');
  }

  // ── Start challenge server on :80 ─────────────────────────────────────────
  await new Promise((resolve, reject) => {
    challengeServer.listen(80, '0.0.0.0', resolve);
    challengeServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error('\n\u274C  Port 80 is already in use.');
        console.error('    Stop your server first, then re-run this script.');
        console.error('    If using pm2:  pm2 stop ' + PM2_APP_NAME);
        console.error('    Then re-run:   node scripts/renew-cert.js\n');
      }
      reject(err);
    });
  });
  console.log('[ACME] Challenge server listening on :80');

  // ── Load or generate ACME account key ────────────────────────────────────
  let accountKey;
  if (fs.existsSync(ACCOUNT_PATH)) {
    console.log('[ACME] Loading existing account key...');
    accountKey = fs.readFileSync(ACCOUNT_PATH);
  } else {
    console.log('[ACME] Generating new account key...');
    accountKey = await acme.crypto.createPrivateKey();
    fs.writeFileSync(ACCOUNT_PATH, accountKey);
  }

  // ── Create ACME client (Let's Encrypt production) ─────────────────────────
  const client = new acme.Client({
    directoryUrl: acme.directory.letsencrypt.production,
    accountKey,
  });

  await client.createAccount({
    termsOfServiceAgreed: true,
    contact: [`mailto:${EMAIL}`],
  });
  console.log('[ACME] Account ready');

  // ── Generate domain private key + CSR (with SANs for all domains) ─────────
  console.log('[ACME] Generating domain key and CSR...');
  const altNames = DOMAINS.slice(1);
  const csrOptions = { commonName: PRIMARY_DOMAIN };
  if (altNames.length > 0) csrOptions.altNames = altNames;
  const [domainKey, csr] = await acme.crypto.createCsr(csrOptions);

  // ── Obtain certificate ────────────────────────────────────────────────────
  console.log('[ACME] Starting certificate order...');
  const cert = await client.auto({
    csr,
    email: EMAIL,
    termsOfServiceAgreed: true,
    challengePriority: ['http-01'],
    challengeCreateFn: async (authz, challenge, keyAuthorization) => {
      challenges[challenge.token] = keyAuthorization;
      console.log(`[ACME]   Challenge created for: ${authz.identifier.value}`);
    },
    challengeRemoveFn: async (authz, challenge) => {
      delete challenges[challenge.token];
    },
  });

  // ── Save certificate files ────────────────────────────────────────────────
  fs.writeFileSync(KEY_PATH,  domainKey);
  fs.writeFileSync(CERT_PATH, cert);

  console.log('\n\u2705  Certificate saved!');
  console.log(`    Key  -> ${KEY_PATH}`);
  console.log(`    Cert -> ${CERT_PATH}`);

  const certParsed = new crypto.X509Certificate(cert);
  console.log(`\n\uD83D\uDCC5  Valid until: ${certParsed.validTo}`);
  console.log(`    Domains  : ${DOMAINS.join(', ')}\n`);

  challengeServer.close();

  // ── Restart PM2 app ───────────────────────────────────────────────────────
  try {
    console.log(`\uD83D\uDD04  Restarting PM2 app "${PM2_APP_NAME}"...`);
    execSync(`pm2 restart ${PM2_APP_NAME}`, { stdio: 'inherit' });
    console.log(`\u2705  PM2 app restarted.\n`);
  } catch (_) {
    console.log('\u2139\uFE0F   PM2 restart skipped (pm2 not found or app not running).');
    console.log('    Manually restart your server to apply the new certificate.\n');
  }

  console.log('\uD83D\uDE80  Done! HTTPS is now active on :443\n');
}

main().catch((err) => {
  console.error('\n\u274C  Certificate renewal failed:', err.message || err);
  if (err.message && (err.message.includes('acme') || err.message.includes('challenge'))) {
    console.error('\n\uD83D\uDCA1  Common fixes:');
    console.error('    1. Port 80 must be publicly accessible from the internet');
    console.error('    2. DNS A-record for each domain must point to this server IP');
    console.error('    3. Disable any firewall/router blocking port 80 temporarily');
    console.error('    4. Stop any other process using port 80 (e.g., pm2 stop app)');
    console.error('    5. Check ACME_DOMAINS in .env covers all your subdomains\n');
  }
  challengeServer.close();
  process.exit(1);
});
