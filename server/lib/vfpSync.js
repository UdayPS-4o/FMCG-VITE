// Writes sync records into the live DBFs through the VFP program server/vfp/SYNCAPPEND.EXE.
//
// For each target table a temp DBF is created by cloning the main table's header (so the
// columns are exactly the main table's), the new rows are written into it, and SYNCAPPEND.EXE
// then locks the main tables, checks duplicates, assigns voucher numbers and runs APPEND FROM.
// Voucher numbers are passed as placeholders (see vrPlaceholders) and resolved by VFP.

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { DbfORM } = require('../dbf-orm');

const VFP_DIR = path.join(__dirname, '..', 'vfp');
const SYNC_EXE = process.env.VFP_SYNC_EXE || path.join(VFP_DIR, 'SYNCAPPEND.EXE');
const CONFIG_FPW = path.join(VFP_DIR, 'CONFIG.FPW');
// VFP runtime DLLs; the EXE finds them in its own folder (PATH alone is not enough).
const VFP_RUNTIME_DIR = process.env.VFP_RUNTIME_DIR || VFP_DIR; // VFP9R.DLL, VFP9RENU.DLL, MSVCR71.DLL sit next to the EXE
const JOB_ROOT = path.join(os.tmpdir(), 'fmcg-vfp-sync');
const EXE_TIMEOUT_MS = 5 * 60 * 1000;

const dataDir = () => path.join(process.env.DBF_FOLDER_PATH, 'data');

// One job at a time, so two syncs never compete for the same voucher numbers or locks.
let queue = Promise.resolve();

/**
 * Hands out voucher placeholders such as "CR-#00001". VFP replaces each distinct placeholder
 * with the next real number for its prefix, in every character column of every temp table.
 */
function vrPlaceholders() {
  let seq = 0;
  return (prefix) => `${prefix}-#${String(++seq).padStart(5, '0')}`;
}

// Empty copy of a main DBF: same header (fields, codepage, VFP backlink), zero records.
async function cloneEmptyDbf(mainPath, tempPath) {
  const fh = await fsp.open(mainPath, 'r');
  try {
    const head = Buffer.alloc(32);
    await fh.read(head, 0, 32, 0);
    const headerLength = head.readUInt16LE(8);
    const header = Buffer.alloc(headerLength);
    await fh.read(header, 0, headerLength, 0);
    header.writeUInt32LE(0, 4);      // record count
    header[28] &= ~0x03;             // no structural CDX, no memo file for the temp copy
    await fsp.writeFile(tempPath, Buffer.concat([header, Buffer.from([0x1a])]));
  } finally {
    await fh.close();
  }
}

function parseResult(text) {
  const out = { status: 'ERROR', message: '', duplicates: [], vr: {}, appended: {} };
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i < 0) continue;
    const key = line.slice(0, i);
    const val = line.slice(i + 1);
    if (key === 'STATUS') out.status = val.trim();
    else if (key === 'MSG') out.message = val.trim();
    else if (key === 'DUP') out.duplicates.push(val.trim());
    else if (key === 'VR') {
      const [ph, real] = val.split('=');
      out.vr[ph.trim()] = (real || '').trim();
    } else if (key === 'APPENDED') {
      const [tbl, n] = val.split('=');
      out.appended[tbl.trim()] = parseInt(n, 10) || 0;
    }
  }
  return out;
}

function runExe(jobDir) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PATH: `${VFP_RUNTIME_DIR};${process.env.PATH || ''}` };
    execFile(SYNC_EXE, [`-C${CONFIG_FPW}`, jobDir], { env, cwd: VFP_DIR, timeout: EXE_TIMEOUT_MS, windowsHide: true },
      (err) => (err && err.killed ? reject(new Error(`SYNCAPPEND.EXE timed out after ${EXE_TIMEOUT_MS / 1000}s`)) : resolve()));
  });
}

async function runJobNow({ label, tables, vrTable, dupRules = [] }) {
  if (!fs.existsSync(SYNC_EXE)) {
    throw new Error(`${SYNC_EXE} not found. Build it with: python server\\vfp\\build.py`);
  }
  const jobDir = path.join(JOB_ROOT, `${label}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
  await fsp.mkdir(jobDir, { recursive: true });

  const lines = [`DATA=${dataDir()}`];
  for (const { name, rows } of tables) {
    const tempPath = path.join(jobDir, `${name}.DBF`);
    await cloneEmptyDbf(path.join(dataDir(), `${name}.DBF`), tempPath);
    if (rows.length > 0) {
      const orm = new DbfORM(tempPath);
      await orm.open();
      try {
        await orm.insertMany(rows);
      } finally {
        // DbfORM.close() doesn't wait for the handle; VFP opens this file EXCLUSIVE next.
        const file = orm.dbf;
        orm.dbf = null;
        if (file) await file.close();
      }
    }
    lines.push(`TABLE=${name}`);
  }
  if (vrTable) lines.push(`VRTABLE=${vrTable}`);
  // TAB-separated: key expressions may contain "|"
  for (const r of dupRules) lines.push(['DUP=' + r.table, r.key, r.filter || '.T.'].join('\t'));
  await fsp.writeFile(path.join(jobDir, 'JOB.TXT'), lines.join('\r\n') + '\r\n');

  const started = Date.now();
  console.log(`[vfpSync] ${label}: running SYNCAPPEND.EXE for ${tables.map((t) => `${t.name}(${t.rows.length})`).join(', ')}`);
  await runExe(jobDir);

  let result;
  try {
    result = parseResult(await fsp.readFile(path.join(jobDir, 'RESULT.TXT'), 'latin1'));
  } catch {
    result = { status: 'ERROR', message: 'SYNCAPPEND.EXE wrote no RESULT.TXT', duplicates: [], vr: {}, appended: {} };
  }
  console.log(`[vfpSync] ${label}: ${result.status} in ${Date.now() - started} ms. ${result.message}`);

  if (result.status === 'OK' || result.status === 'DUPLICATE') {
    await fsp.rm(jobDir, { recursive: true, force: true }).catch(() => {});
  } else {
    result.message = `${result.message} (job kept in ${jobDir})`;
  }
  return result;
}

/**
 * Append rows to main DBFs through SYNCAPPEND.EXE. Jobs are serialized.
 * @param {object} job
 * @param {string} job.label      name used in logs and the job folder
 * @param {{name:string, rows:object[]}[]} job.tables  target tables, appended in this order
 * @param {string} [job.vrTable]  table whose VR column numbers the vouchers (usually 'CASH')
 * @param {{table:string, key:string, filter?:string}[]} [job.dupRules]  VFP expressions; any match aborts the job
 * @returns {Promise<{status:'OK'|'DUPLICATE'|'ERROR', message:string, duplicates:string[], vr:object, appended:object}>}
 */
function runAppendJob(job) {
  const run = queue.then(() => runJobNow(job));
  queue = run.catch(() => {});
  return run;
}

module.exports = { runAppendJob, vrPlaceholders };
