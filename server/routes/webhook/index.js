const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

router.post('/whatsapp', (req, res) => {
    console.log('\n[WHATSAPP WEBHOOK] Received status update:');
    console.dir(req.body, { depth: null });
    
    const logFile = path.join(__dirname, '..', '..', '..', 'whatsapp_webhook_status.json');
    let statuses = {};
    
    if (fs.existsSync(logFile)) {
        try {
            statuses = JSON.parse(fs.readFileSync(logFile, 'utf8'));
        } catch (e) {
            statuses = {};
        }
    }
    
    // Extract fields based on CXBot webhook structure
    const msgId = req.body.messageId || req.body.msgId;
    let status = req.body.status;
    if (!status && req.body.statuses && req.body.statuses.status) {
        status = req.body.statuses.status;
    }
    
    if (msgId && status) {
        statuses[msgId] = {
            status: status,
            updatedAt: new Date().toISOString(),
            raw: req.body
        };
    } else {
        // If we can't parse it, just log it under a timestamp
        statuses['unknown_' + Date.now()] = req.body;
    }
    
    fs.writeFileSync(logFile, JSON.stringify(statuses, null, 2));
    res.status(200).send('OK');
});

module.exports = router;
