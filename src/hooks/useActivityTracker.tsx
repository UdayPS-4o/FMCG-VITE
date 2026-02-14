import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import useAuth from './useAuth';
import constants from '../constants';

const useActivityTracker = () => {
    const location = useLocation();
    const { user } = useAuth();
    const startTimeRef = useRef<number>(Date.now());
    const currentPageRef = useRef<string>(location.pathname);

    const logActivity = async (data: {
        page: string;
        action: string;
        duration?: number;
        nextPage?: string;
    }) => {
        if (!user) return;

        try {
            const token = localStorage.getItem('token');
            await fetch(`${constants.baseURL}/api/activity/log`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    userId: user.id,
                    userName: user.name,
                    ...data
                })
            });
        } catch (error) {
            console.error('Failed to log activity:', error);
        }
    };

    useEffect(() => {
        // When location changes (or component unmounts), log the PREVIOUS page visit
        const endTime = Date.now();
        const duration = endTime - startTimeRef.current;
        const previousPage = currentPageRef.current;
        const nextPage = location.pathname;

        if (previousPage !== nextPage && user) {
            logActivity({
                page: previousPage,
                action: 'Viewed Page',
                duration,
                nextPage
            });
        }

        // Update refs for the new page
        startTimeRef.current = Date.now();
        currentPageRef.current = location.pathname;

    }, [location, user]);

    return { logActivity };
};

export default useActivityTracker;
