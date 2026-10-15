const https = require('https');
const fs = require('fs');
const u = new URL('https://api.adcancel.online/api/agent/download?v=1.0.87');
const file = fs.createWriteStream('test_dl.js');
https.get({ hostname: u.hostname, port: 443, path: u.pathname + u.search, rejectUnauthorized: false }, (res) => {
    res.pipe(file);
    file.on('finish', () => { file.close(); console.log('Downloaded bytes:', fs.statSync('test_dl.js').size); });
}).on('error', (e) => console.log('error:', e));
