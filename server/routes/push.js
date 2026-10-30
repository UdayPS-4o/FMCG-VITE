const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const admin = require('firebase-admin');
const { NOTIFICATION_TYPES } = require('../utils/notificationTypes');

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

const removeTokenFromOtherUsers = (token, userId) => {
    return new Promise((resolve, reject) => {
        const tokenStr = typeof token === 'string' ? token : JSON.stringify(token);
        db.run(`DELETE FROM push_tokens WHERE token = ? AND user_id != ?`, [tokenStr, userId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
};

const getTokensByUserIds = (userIds) => {
    if (!userIds.length) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
        const placeholders = userIds.map(() => '?').join(',');
        db.all(`SELECT * FROM push_tokens WHERE user_id IN (${placeholders})`, userIds, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
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
        // A device belongs to whoever logged in on it last: when a web user
        // subscribes as "user:<id>", drop any other owner of the same token
        // (including the legacy shared "admin" id) so it isn't notified twice
        // or for the wrong user.
        if (String(userId).startsWith('user:')) {
            await removeTokenFromOtherUsers(subscription, userId);
        }
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

const loadUsers = () => {
    try {
        return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'users.json'), 'utf8'));
    } catch (e) {
        console.error('Failed to read users.json for push targeting:', e.message);
        return [];
    }
};

const isAdminUser = (u) => Array.isArray(u.routeAccess) && u.routeAccess.includes('Admin');

// Send one payload ({ title, message, data }) to a list of push_tokens rows.
// Duplicate tokens (same device stored under two ids) are only notified once.
const deliverToTokens = async (rows, payload, label) => {
    const seen = new Set();
    const uniqueRows = rows.filter(row => {
        if (seen.has(row.token)) return false;
        seen.add(row.token);
        return true;
    });

    const notificationPayload = JSON.stringify({
        title: payload.title,
        message: payload.message,
        url: payload.data ? payload.data.url : '/',
        data: payload.data
    });

    const promises = uniqueRows.map(row => {
        if (row.type === 'webpush') {
            let sub;
            try { sub = JSON.parse(row.token); } catch(e) { sub = row.token; }
            if (!vapidPublicKey) return Promise.resolve();
            return webpush.sendNotification(sub, notificationPayload)
                .catch(async err => {
                    console.error(`Error sending ${label} notification:`, err.statusCode, err.body);
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
                        console.log(`Successfully sent FCM ${label} message:`, response);
                    })
                    .catch(async (error) => {
                        console.error(`Error sending FCM ${label} message:`, error);
                        if (error.code === 'messaging/invalid-registration-token' ||
                            error.code === 'messaging/registration-token-not-registered') {
                            await removeToken(row.token);
                        }
                    });
            } catch(e) {
                console.error(`Failed to send FCM ${label} message`, e);
                return Promise.resolve();
            }
        }
        return Promise.resolve();
    });

    await Promise.all(promises);
    return uniqueRows.length;
};

// Copy of a payload for a non-admin user: opens the relevant page instead of
// the approve URL, and tells sw.js not to show the "Approve" action.
const toUserPayload = (payload, notificationType) => {
    const typeInfo = NOTIFICATION_TYPES[notificationType] || {};
    return {
        ...payload,
        data: {
            ...(payload.data || {}),
            url: typeInfo.userUrl || '/',
            noApprove: true
        }
    };
};

// Does this user own the record the notification is about?
//   ownerUserId: users.json id (e.g. who marked attendance)
//   owner: the saved entry; matched on createdBy, or on its S/M code for
//          entries saved before createdBy existed
const isOwner = (u, { ownerUserId, owner } = {}) => {
    if (ownerUserId != null) return Number(u.id) === Number(ownerUserId);
    if (owner) {
        if (owner.createdBy != null) return Number(u.id) === Number(owner.createdBy);
        return !!(owner.sm && u.smCode && owner.sm === u.smCode);
    }
    return true; // not tied to a creator (e.g. WhatsApp messages)
};

/**
 * Notify admins (as before) plus non-admin users whose notificationAccess
 * (set from the Add User page) includes notificationType. When ownership
 * info is passed, non-admins only get notifications for their own records.
 */
const sendNotificationToAdmins = async (payload, notificationType, ownership) => {
    console.log(`-------------------------------------------
        Sending notification to admins with payload:
        -------------------------------------------`);
    console.log(payload, notificationType ? `(type: ${notificationType})` : '');

    try {
        const users = loadUsers();
        const adminIds = users.filter(isAdminUser).map(u => `user:${u.id}`);
        // 'admin' / 'ADMIN' are legacy ids from before per-user subscriptions
        const adminTokens = await getTokensByUserIds(['admin', 'ADMIN', ...adminIds]);

        let userTokens = [];
        if (notificationType) {
            const permittedIds = users
                .filter(u => !isAdminUser(u) && Array.isArray(u.notificationAccess) && u.notificationAccess.includes(notificationType))
                .filter(u => isOwner(u, ownership))
                .map(u => `user:${u.id}`);
            const adminTokenSet = new Set(adminTokens.map(r => r.token));
            userTokens = (await getTokensByUserIds(permittedIds)).filter(r => !adminTokenSet.has(r.token));
        }

        if (adminTokens.length === 0 && userTokens.length === 0) {
            console.log('No admin/user subscriptions found. Cannot send notification.');
            return;
        }

        await Promise.all([
            deliverToTokens(adminTokens, payload, 'admin'),
            deliverToTokens(userTokens, toUserPayload(payload, notificationType), 'user'),
        ]);
        console.log(`Finished sending notifications (${adminTokens.length} admin, ${userTokens.length} user devices).`);
    } catch (err) {
        console.error('A critical error occurred during admin notification sending:', err);
    }
};

/**
 * Notify specific web users (users.json ids) directly, e.g. reminders.
 */
const sendNotificationToUsers = async (userIds, payload, notificationType) => {
    try {
        const tokens = await getTokensByUserIds(userIds.map(id => `user:${id}`));
        if (tokens.length === 0) return 0;
        return await deliverToTokens(tokens, toUserPayload(payload, notificationType), 'user');
    } catch (err) {
        console.error('Error sending notification to users:', err);
        return 0;
    }
};

/**
 * Notify a customer-app shop (the app subscribes with its party code, e.g. "BC016").
 * payload: { title, message, data: { url, ... } }
 */
const sendNotificationToParty = async (partyCode, payload) => {
    if (!partyCode) return 0;
    try {
        const tokens = await getTokensByUserId(String(partyCode));
        if (tokens.length === 0) return 0;
        return await deliverToTokens(tokens, payload, `party ${partyCode}`);
    } catch (err) {
        console.error('Error sending notification to party:', err);
        return 0;
    }
};

// Upload image for push notifications
router.post('/upload-image', async (req, res) => {
    try {
        const { imageBase64, filename } = req.body;
        
        if (!imageBase64 || !filename) {
            return res.status(400).json({ error: 'Image data and filename are required' });
        }

        // Extract base64 data
        const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ error: 'Invalid base64 string' });
        }
        
        const fileExt = filename.split('.').pop();
        const newFilename = `push_img_${Date.now()}.${fileExt}`;
        const uploadDir = path.join(__dirname, '../../public/uploads');
        
        // Ensure upload directory exists
        try {
            await fsPromises.access(uploadDir);
        } catch (e) {
            await fsPromises.mkdir(uploadDir, { recursive: true });
        }
        
        const filePath = path.join(uploadDir, newFilename);
        const imageBuffer = Buffer.from(matches[2], 'base64');
        
        await fsPromises.writeFile(filePath, imageBuffer);
        
        const imageUrl = `/uploads/${newFilename}`;
        res.json({ url: imageUrl, success: true });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

module.exports = { router, sendNotificationToAdmins, sendNotificationToUsers, sendNotificationToParty };