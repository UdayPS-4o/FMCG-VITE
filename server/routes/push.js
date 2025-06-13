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
    const { userId, title, message, url } = req.body;

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

module.exports = router; 