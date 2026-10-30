/* Push handling for the customer app's service worker (pulled in via workbox importScripts).
   Server payload (routes/push.js deliverToTokens): { title, message, url, data } */

self.addEventListener('push', (event) => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch (e) { payload = { title: 'Ekta Enterprises', message: event.data && event.data.text() }; }
    const data = payload.data || {};
    const url = payload.url || data.url || '/';

    event.waitUntil((async () => {
        // Let an open app show its own animated banner + refresh the tracker
        const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clientList.forEach(c => c.postMessage({ type: 'order-push', title: payload.title, body: payload.message, url, data }));

        // Browsers require a visible notification for every push
        await self.registration.showNotification(payload.title || 'Ekta Enterprises', {
            body: payload.message || '',
            tag: data.orderId ? `order-${data.orderId}` : undefined,
            renotify: !!data.orderId,
            vibrate: [30, 50, 30],
            data: { url },
        });
    })());
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil((async () => {
        const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const client = clientList.find(c => 'focus' in c);
        if (client) {
            await client.focus();
            client.postMessage({ type: 'navigate', url });
            return;
        }
        await self.clients.openWindow(url);
    })());
});
