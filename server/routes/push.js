const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const admin = require('firebase-admin');

// Initialize Firebase Admin using the explicit file path
try {
    const serviceAccount = require('../db/app/firebase.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (e) {
    console.error('Firebase admin initialization failed:', e.message);
}

// Initialize SQLite Database
const dbPath = path.join(__dirname, '../db/push_tokens.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening push_tokens database', err.message);
    } else {
        db.run(`CREATE TABLE IF NOT EXISTS push_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            token TEXT NOT NULL,
            type TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, token)
        )`);
    }
});

// Helper functions for DB access
const saveToken = (userId, token, type) => {
    return new Promise((resolve, reject) => {
        const tokenStr = typeof token === 'string' ? token : JSON.stringify(token);
        db.run(`INSERT OR IGNORE INTO push_tokens (user_id, token, type) VALUES (?, ?, ?)`, 
            [userId, tokenStr, type], 
            function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            }
        );
    });
};

const getTokensByUserId = (userId) => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM push_tokens WHERE user_id = ?`, [userId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const removeToken = (token) => {
    return new Promise((resolve, reject) => {
        const tokenStr = typeof token === 'string' ? token : JSON.stringify(token);
        db.run(`DELETE FROM push_tokens WHERE token = ?`, [tokenStr], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

// VAPID keys should be stored as environment variables
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('You must set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables to use Web Push. You can use `npx web-push generate-vapid-keys` to generate a new set of keys.');
} else {
    webpush.setVapidDetails(
        'mailto:admin@example.com', // Replace with your admin email
        vapidPublicKey,
        vapidPrivateKey
    );
}

// Route to get the VAPID public key
router.get('/vapidPublicKey', (req, res) => {
    res.send(vapidPublicKey);
});

// Route to get all registered push tokens
router.get('/tokens', async (req, res) => {
    try {
        db.all(`SELECT * FROM push_tokens ORDER BY created_at DESC`, [], (err, rows) => {
            if (err) return res.status(500).json({ error: 'Failed to fetch tokens' });
            res.json(rows);
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch tokens' });
    }
});

// Subscribe route
router.post('/subscribe', async (req, res) => {
    const { subscription, userId, type } = req.body;

    if (!subscription || !userId) {
        return res.status(400).json({ error: 'Subscription and userId are required.' });
    }

    try {
        await saveToken(userId, subscription, type || 'webpush');
        res.status(201).json({ message: 'Subscription saved.' });
    } catch (err) {
        console.error('Error saving subscription', err);
        res.status(500).json({ error: 'Failed to save subscription.' });
    }
});

// Send notification route
router.post('/send', async (req, res) => {
    const { title, message, url } = req.body;
    const userId = req.user && req.user.id ? req.user.id : req.body.userId; 
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required.' });
    }

    try {
        const tokens = await getTokensByUserId(userId);
        if (!tokens || tokens.length === 0) {
            return res.status(404).json({ error: 'No subscriptions found for this user.' });
        }

        const notificationPayload = JSON.stringify({
            title: title || 'New Notification',
            message: message || 'You have a new notification.',
            url: url || '/'
        });

        const promises = tokens.map(row => {
            if (row.type === 'webpush') {
                let sub;
                try { sub = JSON.parse(row.token); } catch(e) { sub = row.token; }
                if (!vapidPublicKey) return Promise.resolve(); // Skip if VAPID not set
                return webpush.sendNotification(sub, notificationPayload)
                    .catch(async err => {
                        console.error(`Error sending notification to subscription for user ${userId}:`, err.statusCode, err.body);
                        if (err.statusCode === 410 || err.statusCode === 404) {
                            await removeToken(row.token);
                        }
                    });
            } else if (row.type === 'fcm') {
                // Use Firebase Admin SDK to send to FCM tokens
                try {
                    const messagePayload = {
                        notification: {
                            title: title || 'New Notification',
                            body: message || 'You have a new notification.'
                        },
                        token: row.token,
                        data: { url: url || '/' }
                    };
                    return admin.messaging().send(messagePayload)
                        .then((response) => {
                            console.log('Successfully sent FCM message:', response);
                        })
                        .catch(async (error) => {
                            console.error('Error sending FCM message:', error);
                            if (error.code === 'messaging/invalid-registration-token' ||
                                error.code === 'messaging/registration-token-not-registered') {
                                await removeToken(row.token);
                            }
                        });
                } catch(e) {
                    console.error('Failed to send FCM', e);
                    return Promise.resolve();
                }
            }
        });

        await Promise.all(promises);
        res.status(200).json({ message: 'Notifications sent successfully.' });
    } catch (err) {
        console.error('Error sending notifications:', err);
        res.status(500).json({ error: 'Failed to send notifications.' });
    }
});

// Send notification to ALL devices route
router.post('/send-all', async (req, res) => {
    const { title, message, url } = req.body;
    try {
        db.all(`SELECT * FROM push_tokens`, [], async (err, tokens) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (!tokens || tokens.length === 0) return res.status(404).json({ error: 'No subscriptions found' });

            const notificationPayload = JSON.stringify({
                title: title || 'New Notification',
                message: message || 'You have a new notification.',
                url: url || '/'
            });

            const promises = tokens.map(row => {
                if (row.type === 'webpush') {
                    let sub;
                    try { sub = JSON.parse(row.token); } catch(e) { sub = row.token; }
                    if (!vapidPublicKey) return Promise.resolve();
                    return webpush.sendNotification(sub, notificationPayload)
                        .catch(async err => {
                            if (err.statusCode === 410 || err.statusCode === 404) {
                                await removeToken(row.token);
                            }
                        });
                } else if (row.type === 'fcm') {
                    try {
                        const messagePayload = {
                            notification: { title: title || 'New Notification', body: message || 'You have a new notification.' },
                            token: row.token,
                            data: { url: url || '/' }
                        };
                        return admin.messaging().send(messagePayload)
                            .catch(async (error) => {
                                if (error.code === 'messaging/invalid-registration-token' ||
                                    error.code === 'messaging/registration-token-not-registered') {
                                    await removeToken(row.token);
                                }
                            });
                    } catch(e) { return Promise.resolve(); }
                }
            });

            await Promise.all(promises);
            res.status(200).json({ message: 'Notifications sent to all devices successfully.' });
        });
    } catch (err) {
        console.error('Error sending to all:', err);
        res.status(500).json({ error: 'Failed to send notifications.' });
    }
});

// GET advanced suite metadata
router.get('/metadata', (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const p = path.join(__dirname, '..', 'db', 'users.json');
        const users = JSON.parse(fs.readFileSync(p, 'utf8'));
        res.json({ users });
    } catch(err) {
        res.status(500).json({ error: 'Failed to fetch metadata' });
    }
});

// Send advanced suite notification (variables + targeting)
router.post('/send-advanced', async (req, res) => {
    const { title, message, url, imageUrl, targetMode, targetValue } = req.body;
    try {
        const fs = require('fs');
        const path = require('path');
        
        const loadJson = (filename) => {
            try {
                const p = path.join(__dirname, '..', 'db', filename);
                return JSON.parse(fs.readFileSync(p, 'utf8'));
            } catch(e) { return null; }
        };

        const usersData = loadJson('users.json') || [];
        const balanceDataRaw = loadJson('balance.json');
        const balanceData = balanceDataRaw?.data || [];

        db.all(`SELECT * FROM push_tokens`, [], async (err, allTokens) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (!allTokens || allTokens.length === 0) return res.status(404).json({ error: 'No subscriptions found' });

            let targetTokens = [];
            
            if (targetMode === 'ALL') {
                targetTokens = allTokens;
            } else if (targetMode === 'USER') {
                targetTokens = allTokens.filter(t => t.user_id === targetValue);
            } else if (targetMode === 'SUBGROUP') {
                const targetSubgroup = (targetValue || '').toLowerCase();
                const matchedUsers = usersData.filter(u => u.subgroup && (u.subgroup.title || '').toLowerCase() === targetSubgroup);
                const matchedUsernames = matchedUsers.map(u => u.username);
                targetTokens = allTokens.filter(t => matchedUsernames.includes(t.user_id));
            }

            if (targetTokens.length === 0) {
                return res.status(404).json({ error: `No devices matched the targeting criteria (${targetMode}: ${targetValue}).` });
            }

            const promises = targetTokens.map(row => {
                const userObj = usersData.find(u => u.username === row.user_id) || {};
                const name = userObj.name || row.user_id;
                
                const balObj = balanceData.find(b => b.partycode === row.user_id);
                const balance = balObj ? balObj.result : "N/A";

                const personalTitle = (title || 'New Notification')
                    .replace(/\{\{name\}\}/gi, name)
                    .replace(/\{\{balance\}\}/gi, balance);
                    
                const personalMessage = (message || '')
                    .replace(/\{\{name\}\}/gi, name)
                    .replace(/\{\{balance\}\}/gi, balance);

                if (row.type === 'webpush') {
                    let sub;
                    try { sub = JSON.parse(row.token); } catch(e) { sub = row.token; }
                    if (!vapidPublicKey) return Promise.resolve();
                    
                    const notificationPayload = JSON.stringify({
                        title: personalTitle,
                        message: personalMessage,
                        url: url || '/',
                        image: imageUrl || undefined
                    });

                    return webpush.sendNotification(sub, notificationPayload)
                        .catch(async err => {
                            if (err.statusCode === 410 || err.statusCode === 404) {
                                await removeToken(row.token);
                            }
                        });
                } else if (row.type === 'fcm') {
                    try {
                        const messagePayload = {
                            notification: { 
                                title: personalTitle, 
                                body: personalMessage
                            },
                            token: row.token,
                            data: { url: url || '/' }
                        };
                        if (imageUrl) {
                            messagePayload.notification.imageUrl = imageUrl;
                        }
                        
                        return admin.messaging().send(messagePayload)
                            .catch(async (error) => {
                                if (error.code === 'messaging/invalid-registration-token' ||
                                    error.code === 'messaging/registration-token-not-registered') {
                                    await removeToken(row.token);
                                }
                            });
                    } catch(e) { return Promise.resolve(); }
                }
            });

            await Promise.all(promises);
            res.status(200).json({ message: `Notifications dispatched to ${targetTokens.length} devices.` });
        });
    } catch (err) {
        console.error('Error sending advanced push:', err);
        res.status(500).json({ error: 'Failed to dispatch advanced notifications.' });
    }
});

const sendNotificationToAdmins = async (payload) => {
    console.log(`-------------------------------------------
        Sending notification to admins with payload:
        -------------------------------------------`);
    console.log(payload);

    try {
        const adminTokens = await getTokensByUserId('admin');
        if (!adminTokens || adminTokens.length === 0) {
            console.log('No admin subscriptions found. Cannot send notification.');
            return;
        }

        const notificationPayload = JSON.stringify({
            title: payload.title,
            message: payload.message,
            url: payload.data ? payload.data.url : '/',
            data: payload.data
        });

        const promises = adminTokens.map(row => {
            if (row.type === 'webpush') {
                let sub;
                try { sub = JSON.parse(row.token); } catch(e) { sub = row.token; }
                if (!vapidPublicKey) return Promise.resolve();
                return webpush.sendNotification(sub, notificationPayload)
                    .catch(async err => {
                        console.error(`Error sending admin notification:`, err.statusCode, err.body);
                        if (err.statusCode === 410 || err.statusCode === 404) {
                            await removeToken(row.token);
                        }
                    });
            } else if (row.type === 'fcm') {
                try {
                    const messagePayload = {
                        notification: {
                            title: payload.title || 'New Notification',
                            body: payload.message || 'You have a new notification.'
                        },
                        token: row.token,
                        data: {
                            url: payload.data && payload.data.url ? String(payload.data.url) : '/',
                            ...(payload.data ? Object.fromEntries(
                                Object.entries(payload.data).map(([k, v]) => [k, String(v)])
                            ) : {})
                        }
                    };
                    return admin.messaging().send(messagePayload)
                        .then((response) => {
                            console.log('Successfully sent FCM admin message:', response);
                        })
                        .catch(async (error) => {
                            console.error('Error sending FCM admin message:', error);
                            if (error.code === 'messaging/invalid-registration-token' ||
                                error.code === 'messaging/registration-token-not-registered') {
                                await removeToken(row.token);
                            }
                        });
                } catch(e) {
                    console.error('Failed to send FCM admin message', e);
                    return Promise.resolve();
                }
            }
        });

        await Promise.all(promises);
        console.log('Finished sending all notifications to admins.');
    } catch (err) {
        console.error('A critical error occurred during admin notification sending:', err);
    }
};

module.exports = { router, sendNotificationToAdmins };