import { useEffect } from 'react';
import useAuth from './useAuth';
import { getVapidKey, subscribeToPush, urlBase64ToUint8Array } from '../services/pushService';

// Registers this device for push under "user:<id>" for whoever is logged in,
// so the server can deliver the notification types granted to that user
// on the Add User page (and admin notifications to admins).
const usePushSubscription = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user || user.id == null) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;

    const pushUserId = `user:${user.id}`;
    const sessionKey = `pushSubscribed:${pushUserId}`;
    if (sessionStorage.getItem(sessionKey)) return;

    (async () => {
      try {
        let permission = Notification.permission;
        if (permission === 'default') {
          permission = await Notification.requestPermission();
        }
        if (permission !== 'granted') return;

        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(getVapidKey()) as BufferSource,
          });
        }

        await subscribeToPush(subscription, pushUserId);
        sessionStorage.setItem(sessionKey, '1');
      } catch (err) {
        console.error('Push subscription failed:', err);
      }
    })();
  }, [user?.id]);
};

export default usePushSubscription;
