// Immediately activate the service worker
self.addEventListener('install', event => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
    console.log('Push event received:', event);
    
    let data = { 
        title: 'New Notification',
        message: 'You have a new notification.',
        url: '/'
    };
    
    try {
        if (event.data) {
            data = event.data.json();
            console.log('Push data:', data);
        }
    } catch (e) {
        console.error('Error parsing push data:', e);
    }

    const { title, message, url } = data;

    const options = {
        body: message,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        data: { url: url || '/' },
        requireInteraction: true,
        vibrate: [200, 100, 200]
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
            .then(() => {
                console.log('Notification shown successfully');
            })
            .catch(error => {
                console.error('Error showing notification:', error);
            })
    );
});

self.addEventListener('notificationclick', event => {
    console.log('Notification clicked:', event);
    
    event.notification.close();

    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                for (const client of clientList) {
                    if (client.url === urlToOpen && 'focus' in client) {
                        return client.focus();
                    }
                }
                return self.clients.openWindow(urlToOpen);
            })
    );
}); 