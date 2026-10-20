const fs = require('fs').promises;
const path = require('path');

// Reads the GSP / GST portal credentials stored in <DBF_FOLDER_PATH>/data/sv.vcc.
// sv.vcc is a VFP table whose field types the usual DBF libraries can't read, so it is parsed by hand.
async function readGstCredentials() {
  const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
  if (!DBF_FOLDER_PATH) {
    const err = new Error('DBF_FOLDER_PATH environment variable not set.');
    err.status = 500;
    throw err;
  }
  const svPath = path.join(DBF_FOLDER_PATH, 'data', 'sv.vcc');
  const buf = await fs.readFile(svPath);
  const headerLength = buf.readUInt16LE(8);
  let pos = 32;
  const fields = [];
  while (buf[pos] !== 0x0D && pos < buf.length) {
    const name = buf.toString('utf8', pos, pos + 11).replace(/\0/g, '').trim();
    const type = String.fromCharCode(buf[pos + 11]);
    let length = buf[pos + 16];
    if (length === 0 && type === 'C') length = 256;
    fields.push({ name, type, length });
    pos += 32;
  }
  pos = headerLength + 1; // start of records + skip deleted flag
  const record = {};
  fields.forEach((f) => {
    record[f.name] = buf.toString('utf8', pos, pos + f.length).replace(/\0/g, '').trim();
    pos += f.length;
  });

  return {
    aspid: record.ASPID || '',
    password: record.ASPPWD || '',
    gstin: record.PARTYGST || '',
    // SV_CL_ID (SMS client id) is used as the GST portal username; strip wrapping quotes
    username: (record.SV_CL_ID || '').replace(/^['"]|['"]$/g, ''),
    gstpwd: record.GSTPWD || '',
  };
}

module.exports = { readGstCredentials };
