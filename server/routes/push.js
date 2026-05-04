const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

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
                // Here we would use Firebase Admin SDK to send to FCM tokens
                console.log('Would send FCM notification to token:', row.token);
                // Currently FCM sending logic is skipped unless firebase-admin is setup.
                return Promise.resolve();
            }
        });

        await Promise.all(promises);
        res.status(200).json({ message: 'Notifications sent successfully.' });
    } catch (err) {
        console.error('Error sending notifications:', err);
        res.status(500).json({ error: 'Failed to send notifications.' });
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
                console.log('Would send FCM notification to admin token:', row.token);
                return Promise.resolve();
            }
        });

        await Promise.all(promises);
        console.log('Finished sending all notifications to admins.');
    } catch (err) {
        console.error('A critical error occurred during admin notification sending:', err);
    }
};

module.exports = { router, sendNotificationToAdmins };