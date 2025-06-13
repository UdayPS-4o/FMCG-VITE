// Immediately activate the service worker
self.addEventListener('install', event => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
    console.log('Push received:', event);

    let payload = {
        title: 'Default Title',
        message: 'Default message',
        url: '/'
    };

    if (event.data) {
        try {
            payload = event.data.json();
            console.log('Push data parsed:', payload);
        } catch (e) {
            console.error('Failed to parse push data:', e);
        }
    }

    const { title, message, url } = payload;

    const options = {
        body: message,
        icon: '/favicon.png',
        badge: '/favicon.png',
        data: payload.data || { url: url || '/' },
        requireInteraction: true,
        vibrate: [200, 100, 200],
        actions: [
            {
                action: 'approve',
                title: 'Approve',
                icon: '/icons/approve-icon.svg'
            }
        ]
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();

    if (event.action === 'approve') {
        const urlToOpen = event.notification.data.url;
        if (!urlToOpen) {
            console.error('No URL found in notification data for approval.');
            return;
        }

        event.waitUntil(
            fetch(urlToOpen)
            .then(response => {
                if (!response.ok) {
                    return response.text().then(text => {
                        // Try to extract error message from HTML if present
                        const errorMatch = text.match(/<p>(.*?)<\/p>/);
                        throw new Error(errorMatch ? errorMatch[1] : `HTTP error! status: ${response.status}`);
                    });
                }
                return response.text();
            })
            .then(html => {
                // Check if the response contains success indicators
                const isSuccess = html.includes('Successfully Approved!') || 
                                html.includes('already been approved');
                
                if (!isSuccess) {
                    throw new Error('Approval response did not indicate success');
                }

                // Show success notification
                return self.registration.showNotification('Approval Success', {
                    body: 'The entry has been successfully approved!',
                    icon: '/favicon.png',
                    badge: '/favicon.png',
                    vibrate: [200, 100, 200]
                });
            })
            .catch(error => {
                console.error('Approval failed:', error);
                return self.registration.showNotification('Approval Failed', {
                    body: error.message || 'Failed to approve the entry. Please try again.',
                    icon: '/favicon.png',
                    badge: '/favicon.png',
                    vibrate: [200, 100, 200]
                });
            })
        );
    } else {
        const urlToOpen = event.notification.data.url;
        if (urlToOpen) {
            console.log(`Opening URL: ${urlToOpen}`);
            event.waitUntil(clients.openWindow(urlToOpen));
        } else {
            console.error('No URL found in notification data.');
            event.waitUntil(clients.openWindow('/'));
        }
    }
}); 