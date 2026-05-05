import { useState, useEffect } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { useStore } from '../context/StoreContext';

export const usePushNotifications = () => {
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const { user } = useStore();

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      registerPush();
    } else {
      // Handle PWA / Web Push Notifications if needed
      registerWebPush();
    }
  }, []);

  useEffect(() => {
    if (user && fcmToken) {
      // Send token to backend
      fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('app_token')}`
        },
        body: JSON.stringify({
          subscription: fcmToken,
          userId: user.partyCode,
          type: 'fcm'
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

      await PushNotifications.register();

      PushNotifications.addListener('registration', (token) => {
        console.log('Push registration success, token: ' + token.value);
        setFcmToken(token.value);
      });

      PushNotifications.addListener('registrationError', (error: any) => {
        console.error('Error on registration: ' + JSON.stringify(error));
      });

      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push received: ' + JSON.stringify(notification));
      });

      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('Push action performed: ' + JSON.stringify(notification));
      });
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
