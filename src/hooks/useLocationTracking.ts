import { useEffect, useCallback, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import locationService from '../services/locationService';

interface LocationTrackingState {
  isTracking: boolean;
  lastPosition: GeolocationPosition | null;
  error: string | null;
}

export const useLocationTracking = () => {
  const { isAuthenticated, user } = useAuth();
  const [state, setState] = useState<LocationTrackingState>({
    isTracking: false,
    lastPosition: null,
    error: null
  });

  // Start location tracking
  const startTracking = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setState(prev => ({ ...prev, error: 'User not authenticated' }));
      return false;
    }

    try {
      setState(prev => ({ ...prev, error: null }));
      const success = await locationService.startTracking();
      
      if (success) {
        setState(prev => ({ 
          ...prev, 
          isTracking: true,
          lastPosition: locationService.getLastKnownPosition()
        }));
        return true;
      }
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start location tracking';
      setState(prev => ({ ...prev, error: errorMessage, isTracking: false }));
      return false;
    }
  }, [isAuthenticated, user]);

  // Stop location tracking
  const stopTracking = useCallback(() => {
    locationService.stopTracking();
    setState(prev => ({ ...prev, isTracking: false, lastPosition: null }));
  }, []);

  // Update location manually
  const updateLocation = useCallback(async () => {
    try {
      await locationService.updateLocation();
      setState(prev => ({ 
        ...prev, 
        lastPosition: locationService.getLastKnownPosition(),
        error: null
      }));
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update location';
      setState(prev => ({ ...prev, error: errorMessage }));
      return false;
    }
  }, []);

  // Get current location once
  const getCurrentLocation = useCallback(async (): Promise<GeolocationPosition | null> => {
    try {
      const position = await locationService.getCurrentLocation();
      setState(prev => ({ ...prev, lastPosition: position, error: null }));
      return position;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get current location';
      setState(prev => ({ ...prev, error: errorMessage }));
      return null;
    }
  }, []);

  // Set update interval
  const setUpdateInterval = useCallback((interval: number) => {
    locationService.setUpdateInterval(interval);
  }, []);

  // Auto-start tracking when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      startTracking();
    } else {
      stopTracking();
    }

    // Cleanup on unmount
    return () => {
      stopTracking();
    };
  }, [isAuthenticated, user, startTracking, stopTracking]);

  // Update state when location service state changes
  useEffect(() => {
    const checkTrackingState = () => {
      const isServiceTracking = locationService.isTrackingActive();
      const lastPos = locationService.getLastKnownPosition();
      
      setState(prev => ({
        ...prev,
        isTracking: isServiceTracking,
        lastPosition: lastPos
      }));
    };

    // Check state periodically
    const interval = setInterval(checkTrackingState, 5000); // Check every 5 seconds
    
    return () => clearInterval(interval);
  }, []);

  return {
    isTracking: state.isTracking,
    lastPosition: state.lastPosition,
    error: state.error,
    startTracking,
    stopTracking,
    updateLocation,
    getCurrentLocation,
    setUpdateInterval
  };
};

export default useLocationTracking;