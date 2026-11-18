import { useEffect } from 'react';
import useAuth from './useAuth';
import liveLocationTracker from '../services/liveLocationTracker';

/**
 * Keeps live location tracking running app-wide for staff who have checked in
 * today. Admins are never tracked. Tracking stops on logout.
 */
const useLiveLocationTracking = (hasMarkedToday: boolean, isLoading: boolean) => {
  const { user, isAuthenticated } = useAuth();
  const isAdmin = !!user?.routeAccess?.includes('Admin');
  const shouldTrack = isAuthenticated && !!user && !isAdmin && !isLoading && hasMarkedToday;

  useEffect(() => {
    if (shouldTrack) {
      void liveLocationTracker.start();
    } else if (!isAuthenticated) {
      void liveLocationTracker.stop();
    }
  }, [shouldTrack, isAuthenticated]);
};

export default useLiveLocationTracking;
