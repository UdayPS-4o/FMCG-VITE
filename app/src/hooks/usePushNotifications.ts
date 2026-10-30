import { useState, useEffect } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { useStore } from '../context/StoreContext';
import { APP_NAVIGATE_EVENT, ORDER_PUSH_EVENT, PENDING_NAV_KEY, type OrderPushDetail } from '../lib/orderEvents';

// The hook is used in App and Profile; in-app listeners must only be added once
let inAppListenersAdded = false;
let swMessageListenerAdded = false;

const emitOrderPush = (detail: OrderPushDetail) =>
  window.dispatchEvent(new CustomEvent<OrderPushDetail>(ORDER_PUSH_EVENT, { detail }));
const emitNavigate = (url?: string) => {
  if (!url) return;
  // Kept until the router picks it up (app may still be starting after a notification tap)
  sessionStorage.setItem(PENDING_NAV_KEY, url);
  window.dispatchEvent(new CustomEvent<string>(APP_NAVIGATE_EVENT, { detail: url }));
};

export const usePushNotifications = () => {
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const { user } = useStore();

  useEffect(() => {
    // Web: the service worker (public/push-sw.js) forwards pushes and notification taps
    if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator && !swMessageListenerAdded) {
      swMessageListenerAdded = true;
      navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
        const m = e.data || {};
        if (m.type === 'order-push') emitOrderPush({ title: m.title, body: m.body, url: m.url, orderId: m.data?.orderId, status: m.data?.status });
        if (m.type === 'navigate') emitNavigate(m.url);
      });
    }

    if (Capacitor.isNativePlatform()) {
      registerPush();
    } else {
      // Handle PWA / Web Push Notifications if needed
      registerWebPush();
    }
  }, []);

  useEffect(() => {
    if (user && fcmToken) {
      const BASE_URL = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api/app', '') : 'http://localhost:8000';
      // Send token to backend
      fetch(`${BASE_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('app_token')}`
        },
        body: JSON.stringify({
          subscription: fcmToken,
          userId: user.partyCode,
          type: Capacitor.isNativePlatform() ? 'fcm' : 'webpush'
        })
      }).catch(console.error);
    }
  }, [fcmToken, user]);

  const registerPush = async () => {
    try {
      let permStatus = await PushNotifications.checkPermissions();

      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        console.warn('User denied push notification permissions');
        return;
      }

      // Listeners go in before register() so the first token event isn't missed
      PushNotifications.addListener('registration', (token) => {
        console.log('Push registration success, token: ' + token.value);
        setFcmToken(token.value);
      });

      PushNotifications.addListener('registrationError', (error: any) => {
        console.error('Error on registration: ' + JSON.stringify(error));
      });

      if (!inAppListenersAdded) {
        inAppListenersAdded = true;
        // App open: show the animated in-app banner and refresh order screens
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          const d = (notification.data || {}) as Record<string, string>;
          emitOrderPush({ title: notification.title || 'Ekta Enterprises', body: notification.body || '', url: d.url, orderId: d.orderId, status: d.status });
        });
        // Notification tapped (app in background / closed): open the order
        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          const d = (action.notification.data || {}) as Record<string, string>;
          emitNavigate(d.url);
        });
      }

      await PushNotifications.register();
    } catch (error) {
      console.error('Error registering push notifications', error);
    }
  };

  // Helper to convert VAPID key for Web Push
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const registerWebPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push messaging is not supported by this browser.');
      return;
    }

    try {
      const permissionResult = await Notification.requestPermission();
      if (permissionResult !== 'granted') {
        console.warn('Web Push permission denied');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const VAPID_PUBLIC_KEY = "BMoDDiSzf7AavViREU6_M0Yez44WtpEUUi52Fkscvfd6uI1UfLXXGdzMOTDHbyATt5apBAe6o-eDgYBb33khRmI";
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
        console.log('Web Push subscription successful');
      }

      setFcmToken(JSON.stringify(subscription));
    } catch (error) {
      console.error('Error registering web push notifications', error);
    }
  };

  return { fcmToken, registerPush, registerWebPush };
};
