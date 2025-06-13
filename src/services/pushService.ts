import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const VAPID_PUBLIC_KEY = "BMoDDiSzf7AavViREU6_M0Yez44WtpEUUi52Fkscvfd6uI1UfLXXGdzMOTDHbyATt5apBAe6o-eDgYBb33khRmI";

if (!VAPID_PUBLIC_KEY) {
    console.error('VITE_VAPID_PUBLIC_KEY is not set in environment variables');
}

// Convert base64 VAPID key to Uint8Array
export const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

export const getVapidKey = () => VAPID_PUBLIC_KEY;

export const subscribeToPush = async (subscription: PushSubscription, userId: string) => {
    try {
        console.log('Attempting to subscribe with subscription:', subscription);
        const response = await axios.post(`${API_URL}/api/push/subscribe`, {
            subscription,
            userId
        });
        console.log('Subscription response:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error subscribing to push notifications:', error);
        throw error;
    }
};

export const sendPushNotification = async (userId: string, title: string, message: string, url?: string) => {
    try {
        const response = await axios.post(`${API_URL}/api/push/send`, {
            userId,
            title,
            message,
            url
        });
        return response.data;
    } catch (error) {
        console.error('Error sending push notification:', error);
        throw error;
    }
}; 