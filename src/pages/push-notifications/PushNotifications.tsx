import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToPush, urlBase64ToUint8Array, getVapidKey } from '../../services/pushService';
import { toast } from 'react-toastify';

const PushNotifications: React.FC = () => {
    const { user } = useAuth();
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [serviceWorkerRegistration, setServiceWorkerRegistration] = useState<ServiceWorkerRegistration | null>(null);

    useEffect(() => {
        // Check for existing service worker registration
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
                setServiceWorkerRegistration(registration);
                // Check if already subscribed
                registration.pushManager.getSubscription().then(subscription => {
                    setIsSubscribed(!!subscription);
                });
            });
        }
    }, []);

    const handleSubscription = async () => {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        const isStandalone = 'standalone' in navigator && (navigator as any).standalone === true;

        // Standard check for browser support
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            // If on iOS, but not added to home screen, show specific instructions.
            // This is the ONLY way to get push notifications on iOS.
            if (isIOS && !isStandalone) {
                toast.info(
                    'To enable notifications on your iPhone, you must first add this app to your Home Screen from the Safari share menu.'
                );
            } else {
                toast.error('Push notifications are not supported by your browser.');
            }
            console.warn('PushManager not supported. This is expected on desktop Safari or non-homescreen iOS web apps.');
            return;
        }

        const vapidPublicKey = getVapidKey();
        if (!vapidPublicKey) {
            toast.error('Push notification configuration is missing.');
            return;
        }

        setLoading(true);

        try {
            if (!serviceWorkerRegistration) {
                const registration = await navigator.serviceWorker.ready;
                setServiceWorkerRegistration(registration);
            }

            const registration = serviceWorkerRegistration || await navigator.serviceWorker.ready;
            let subscription = await registration.pushManager.getSubscription();

            if (subscription) {
                toast.info('You are already subscribed to notifications.');
                setIsSubscribed(true);
                return;
            }

            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                toast.warn('Permission for notifications was denied.');
                return;
            }

            console.log('Using VAPID key:', vapidPublicKey);
            const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
            console.log('Converted applicationServerKey:', applicationServerKey);

            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey,
            });

            console.log('Push Subscription:', subscription);

            await subscribeToPush(subscription, user.username);
            toast.success('Successfully subscribed to notifications!');
            setIsSubscribed(true);
        } catch (error: any) {
            console.error('Subscription error:', error);
            toast.error(error.message || 'Failed to subscribe to notifications.');
            
            // If subscription fails, unsubscribe to clean up
            try {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.getSubscription();
                if (subscription) {
                    await subscription.unsubscribe();
                }
            } catch (cleanupError) {
                console.error('Cleanup error:', cleanupError);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">Push Notifications</h1>
            <p className="mb-4">
                Click the button below to subscribe to push notifications. You will receive updates directly on your device.
            </p>
            <button
                onClick={handleSubscription}
                disabled={isSubscribed || loading}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:bg-gray-400"
            >
                {loading ? 'Subscribing...' : isSubscribed ? 'Subscribed' : 'Subscribe to Notifications'}
            </button>
        </div>
    );
};

export default PushNotifications; 