import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import useAuth from './useAuth';
import constants from '../constants';

interface AttendanceCheckResult {
  hasMarkedToday: boolean;
  isLoading: boolean;
  shouldHideNavigation: boolean;
  isNavigating: boolean;
  setIsNavigating: (value: boolean) => void;
  refreshAttendanceStatus: () => Promise<void>;
}

const useAttendanceCheck = (): AttendanceCheckResult => {
  const [hasMarkedToday, setHasMarkedToday] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  // Helper function to get current date in Indian Standard Time
  const getIndianDate = () => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    const istTime = new Date(now.getTime() + istOffset);
    return istTime.toISOString().split('T')[0];
  };

  const checkTodayAttendance = async () => {
    if (!user || !isAuthenticated) {
      setIsLoading(false);
      return;
    }
    
    try {
      setIsLoading(true);
      const today = getIndianDate();
      const token = localStorage.getItem('token');
      
      if (!token) {
        setIsLoading(false);
        return;
      }
      
      const response = await fetch(`${constants.baseURL}/api/attendance/check-today`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ date: today, userId: user.id })
      });

      if (response.ok) {
        const data = await response.json();
        setHasMarkedToday(data.hasMarked);
        console.log('Attendance status updated:', data.hasMarked);
      } else {
        setHasMarkedToday(false);
      }
    } catch (error) {
      console.error('Error checking today attendance:', error);
      setHasMarkedToday(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user && isAuthenticated) {
      checkTodayAttendance();
    } else {
      setIsLoading(false);
    }
  }, [user, isAuthenticated]);

  // Determine if navigation should be hidden
  const shouldHideNavigation = (
    isAuthenticated && 
    !hasMarkedToday && 
    !isLoading &&
    location.pathname !== '/attendance' &&
    location.pathname !== '/login' &&
    location.pathname !== '/admin/attendance'
  );

  // Add a flag to prevent redirect loops during navigation
  const [isNavigating, setIsNavigating] = useState(false);
  
  useEffect(() => {
    // Reset navigation flag when location changes
    setIsNavigating(false);
  }, [location.pathname]);

  return {
    hasMarkedToday,
    isLoading,
    shouldHideNavigation: shouldHideNavigation && !isNavigating,
    isNavigating,
    setIsNavigating,
    refreshAttendanceStatus: async () => {
      console.log('Refreshing attendance status...');
      setIsNavigating(true);
      await checkTodayAttendance();
      // Force a small delay to ensure state is updated and components re-render
      await new Promise(resolve => setTimeout(resolve, 300));
      console.log('Attendance status refresh completed');
    }
  };
};

export default useAttendanceCheck;