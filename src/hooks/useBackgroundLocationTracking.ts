import { useState, useEffect, useCallback } from 'react';
import backgroundLocationService from '../services/backgroundLocationService';
import useAuth from './useAuth';

interface BackgroundLocationState {
  isBackgroundTrackingEnabled: boolean;
  isBackgroundTrackingSupported: boolean;
  lastBackgroundUpdate: Date | null;
  error: string | null;
}

interface UseBackgroundLocationTracking {
  backgroundState: BackgroundLocationState;
  enableBackgroundTracking: () => Promise<boolean>;
  disableBackgroundTracking: () => void;
  setBackgroundUpdateInterval: (interval: number) => void;
  requestBackgroundPermissions: () => Promise<boolean>;
}

export const useBackgroundLocationTracking = (): UseBackgroundLocationTracking => {
  const { user, isAuthenticated } = useAuth();
  
  const [backgroundState, setBackgroundState] = useState<BackgroundLocationState>({
    isBackgroundTrackingEnabled: false,
    isBackgroundTrackingSupported: backgroundLocationService.isBackgroundTrackingSupported(),
    lastBackgroundUpdate: null,
    error: null
  });

  // Check if background tracking is supported
  useEffect(() => {
    const checkSupport = async () => {
      // Wait a bit for service worker to initialize
      setTimeout(() => {
        setBackgroundState(prev => ({
          ...prev,
          isBackgroundTrackingSupported: backgroundLocationService.isBackgroundTrackingSupported()
        }));
      }, 1000);
    };
    
    checkSupport();
  }, []);

  // Auto-start background tracking when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      // Auto-enable background tracking for authenticated users
      enableBackgroundTracking();
    } else {
      // Disable when user logs out
      disableBackgroundTracking();
    }
  }, [isAuthenticated, user]);

  // Listen for page visibility changes to optimize tracking
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && backgroundState.isBackgroundTrackingEnabled) {
        console.log('App went to background, background tracking should continue');
      } else if (document.visibilityState === 'visible') {
        console.log('App came to foreground');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [backgroundState.isBackgroundTrackingEnabled]);

  // Request necessary permissions for background tracking
  const requestBackgroundPermissions = useCallback(async (): Promise<boolean> => {
    try {
      // Request location permission
      const locationPermission = await new Promise<PermissionState>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve('granted'),
          () => resolve('denied'),
          { timeout: 5000 }
        );
      });

      if (locationPermission === 'denied') {
        setBackgroundState(prev => ({
          ...prev,
          error: 'Location permission is required for background tracking'
        }));
        return false;
      }

      // Request notification permission (for background tracking indication)
      if ('Notification' in window) {
        const notificationPermission = await Notification.requestPermission();
        if (notificationPermission === 'denied') {
          console.warn('Notification permission denied, background tracking may be limited');
        }
      }

      // Check if background sync is supported
      if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
        console.log('Background sync is supported');
      } else {
        console.log('Background sync not supported, using fallback methods');
      }

      setBackgroundState(prev => ({ ...prev, error: null }));
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to request permissions';
      setBackgroundState(prev => ({ ...prev, error: errorMessage }));
      return false;
    }
  }, []);

  // Enable background location tracking
  const enableBackgroundTracking = useCallback(async (): Promise<boolean> => {
    try {
      console.log('Attempting to enable background tracking...');
      
      if (!isAuthenticated) {
        const errorMsg = 'User must be authenticated to enable background tracking';
        console.error(errorMsg);
        setBackgroundState(prev => ({
          ...prev,
          error: errorMsg
        }));
        return false;
      }

      console.log('User is authenticated, requesting permissions...');
      // Request permissions first
      const permissionsGranted = await requestBackgroundPermissions();
      if (!permissionsGranted) {
        console.error('Permissions not granted');
        return false;
      }

      console.log('Permissions granted, starting background tracking...');
      // Start background tracking
      const success = await backgroundLocationService.startTracking();
      
      if (success) {
        console.log('Background tracking started successfully');
        setBackgroundState(prev => ({
          ...prev,
          isBackgroundTrackingEnabled: true,
          lastBackgroundUpdate: new Date(),
          error: null
        }));

        // Show notification to user that background tracking is enabled
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Background Location Tracking Enabled', {
            body: 'Your location will be tracked even when the app is not in use.',
            icon: '/favicon.ico',
            tag: 'background-tracking'
          });
        }

        console.log('Background location tracking enabled successfully');
        return true;
      } else {
        const errorMsg = 'Failed to start background location tracking';
        console.error(errorMsg);
        setBackgroundState(prev => ({
          ...prev,
          error: errorMsg
        }));
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to enable background tracking';
      console.error('Error enabling background tracking:', error);
      setBackgroundState(prev => ({
        ...prev,
        error: errorMessage,
        isBackgroundTrackingEnabled: false
      }));
      return false;
    }
  }, [isAuthenticated, requestBackgroundPermissions]);

  // Disable background location tracking
  const disableBackgroundTracking = useCallback((): void => {
    try {
      backgroundLocationService.stopTracking();
      
      setBackgroundState(prev => ({
        ...prev,
        isBackgroundTrackingEnabled: false,
        error: null
      }));

      console.log('Background location tracking disabled');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to disable background tracking';
      setBackgroundState(prev => ({ ...prev, error: errorMessage }));
    }
  }, []);

  // Set background update interval
  const setBackgroundUpdateInterval = useCallback((interval: number): void => {
    try {
      backgroundLocationService.setUpdateInterval(interval);
      console.log(`Background update interval set to ${interval}ms`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to set update interval';
      setBackgroundState(prev => ({ ...prev, error: errorMessage }));
    }
  }, []);

  // Listen for background location updates
  useEffect(() => {
    const handleLocationUpdate = () => {
      setBackgroundState(prev => ({
        ...prev,
        lastBackgroundUpdate: new Date()
      }));
    };

    // Listen for service worker messages
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'LOCATION_UPDATE') {
          handleLocationUpdate();
        }
      });
    }

    return () => {
      // Cleanup if needed
    };
  }, []);

  return {
    backgroundState,
    enableBackgroundTracking,
    disableBackgroundTracking,
    setBackgroundUpdateInterval,
    requestBackgroundPermissions
  };
};

export default useBackgroundLocationTracking;