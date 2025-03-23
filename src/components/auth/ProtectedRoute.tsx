import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

interface ProtectedRouteProps {
  requiredRouteAccess?: string;
  requiredPower?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  requiredRouteAccess,
  requiredPower,
}) => {
  const { user, loading, hasAccess, hasPower } = useAuth();

  if (loading) {
    // You could use a loading spinner here
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  // Check if user is authenticated
  if (!user || !user.authenticated) {
    return <Navigate to="/login" />;
  }

  // Check route access permission if specified
  if (requiredRouteAccess && !hasAccess(requiredRouteAccess)) {
    return <Navigate to="/unauthorized" />;
  }

  // Check power permission if specified
  if (requiredPower && !hasPower(requiredPower)) {
    return <Navigate to="/unauthorized" />;
  }

  // If all checks pass, render the child routes
  return <Outlet />;
};

export default ProtectedRoute; 