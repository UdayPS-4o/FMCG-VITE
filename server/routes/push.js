const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const fs = require('fs');
const path = require('path');

const subscriptionsPath = path.join(__dirname, '../subscriptions.json');

// Make sure the subscriptions file exists
if (!fs.existsSync(subscriptionsPath)) {
    fs.writeFileSync(subscriptionsPath, JSON.stringify({}));
}

// VAPID keys should be stored as environment variables
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('You must set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables. You can use `npx web-push generate-vapid-keys` to generate a new set of keys.');
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
router.post('/subscribe', (req, res) => {
    const { subscription, userId } = req.body;

    if (!subscription || !userId) {
        return res.status(400).json({ error: 'Subscription and userId are required.' });
    }

    const subscriptions = JSON.parse(fs.readFileSync(subscriptionsPath, 'utf-8'));
    
    // Store subscription by user ID
    if (!subscriptions[userId]) {
        subscriptions[userId] = [];
    }
    subscriptions[userId].push(subscription);

    fs.writeFileSync(subscriptionsPath, JSON.stringify(subscriptions, null, 2));

    res.status(201).json({ message: 'Subscription saved.' });
});

// Send notification route
router.post('/send', (req, res) => {
    const { title, message, url } = req.body;
    const userId = req.user.id; 
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required.' });
    }

    const subscriptions = JSON.parse(fs.readFileSync(subscriptionsPath, 'utf-8'));
    const userSubscriptions = subscriptions[userId];

    if (!userSubscriptions || userSubscriptions.length === 0) {
        return res.status(404).json({ error: 'No subscriptions found for this user.' });
    }

    const notificationPayload = JSON.stringify({
        title: title || 'New Notification',
        message: message || 'You have a new notification.',
        url: url || '/'
    });

    const promises = userSubscriptions.map(sub => 
        webpush.sendNotification(sub, notificationPayload)
            .catch(err => {
                console.error(`Error sending notification to subscription for user ${userId}:`, err.statusCode, err.body);
                // Handle expired or invalid subscriptions
                if (err.statusCode === 410 || err.statusCode === 404) {
                    // Remove the invalid subscription
                    const updatedSubscriptions = userSubscriptions.filter(s => s.endpoint !== sub.endpoint);
                    subscriptions[userId] = updatedSubscriptions;
                    fs.writeFileSync(subscriptionsPath, JSON.stringify(subscriptions, null, 2));
                }
            })
    );

    Promise.all(promises)
        .then(() => res.status(200).json({ message: 'Notifications sent successfully.' }))
        .catch(err => {
            console.error('Error sending notifications:', err);
            res.status(500).json({ error: 'Failed to send notifications.' });
        });
});

const sendNotificationToAdmins = (payload) => {

    console.log(`-------------------------------------------
        Sending notification to admins with payload:
        -------------------------------------------`);
    console.log(payload);
    console.log(`-------------------------------------------`);

    const subscriptions = JSON.parse(fs.readFileSync(subscriptionsPath, 'utf-8'));
    const adminSubscriptions = subscriptions['admin'];

    if (!adminSubscriptions || adminSubscriptions.length === 0) {
        console.log('No admin subscriptions found. Cannot send notification.');
        return;
    }

    console.log(`Found ${adminSubscriptions.length} admin subscription(s).`);
    console.log('-------------------------------------------');
    console.log('Sending notification with payload:');
    console.log(payload);
    console.log('-------------------------------------------');

    // Flatten the payload for the service worker
    const notificationPayload = JSON.stringify({
        title: payload.title,
        message: payload.message,
        url: payload.data.url,
        data: {
            url: payload.data.url,
            endpoint: payload.data.endpoint,
            id: payload.data.id
        }
    });

    const promises = adminSubscriptions.map(sub => {
        console.log(`--> Sending to endpoint: ${sub.endpoint}`);
        return webpush.sendNotification(sub, notificationPayload)
            .then(sendResult => {
                console.log(`    ...Success! Result: ${sendResult.statusCode}`);
            })
            .catch(err => {
                console.error(`    ...Error for endpoint ${sub.endpoint}:`, err.statusCode, err.body);
                if (err.statusCode === 410 || err.statusCode === 404) {
                    console.log('    ...Subscription has expired or is invalid. Removing it.');
                    const updatedSubscriptions = adminSubscriptions.filter(s => s.endpoint !== sub.endpoint);
                    subscriptions['admin'] = updatedSubscriptions;
                    fs.writeFileSync(subscriptionsPath, JSON.stringify(subscriptions, null, 2));
                }
            });
    });

    Promise.all(promises)
        .then(() => console.log('Finished sending all notifications.'))
        .catch(err => console.error('A critical error occurred during notification sending:', err));
};

module.exports = { router, sendNotificationToAdmins };