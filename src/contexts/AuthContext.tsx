import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import constants from '../constants';

// Define user types
interface UserPowers {
  Read?: boolean;
  Write?: boolean;
  Delete?: boolean;
}

export interface User {
  id: number;
  name: string;
  username: string;
  number?: string;
  password: string;
  routeAccess: string[];
  powers: string[];
  token?: string;
  smCode?: string;
  subgroup?: {
    title: string;
    subgroupCode?: string;
  } | null;
  subgroups?: Array<{
    title: string;
    subgroupCode?: string;
  }>;
  defaultSeries?: {
    billing?: string;
    cashReceipt?: string;
    cashPayment?: string;
    godown?: string;
  };
  godownAccess?: string[];
  canSelectSeries?: boolean;
}

// Helper functions to handle the transition from subgroup to subgroups
export const getUserSubgroups = (user: User | null): Array<{title: string; subgroupCode?: string}> => {
  if (!user) return [];
  
  // If user has subgroups array, use that
  if (user.subgroups && user.subgroups.length > 0) {
    return user.subgroups;
  }
  
  // If user has old subgroup structure, convert to array format
  if (user.subgroup) {
    return [user.subgroup];
  }
  
  return [];
};

export const hasMultipleSubgroups = (user: User | null): boolean => {
  if (!user) return false;
  return !!(user.subgroups && user.subgroups.length > 1);
};

export const hasSingleSubgroup = (user: User | null): boolean => {
  if (!user) return false;
  
  // Check if user has exactly one subgroup (either in new or old format)
  if (user.subgroups && user.subgroups.length === 1) {
    return true;
  }
  
  if (user.subgroup && !user.subgroups) {
    return true;
  }
  
  return false;
};

// Get token from localStorage
const getToken = (): string | null => {
  return localStorage.getItem('token');
};

// Set token in localStorage
const setToken = (token: string): void => {
  localStorage.setItem('token', token);
};

// Remove token from localStorage
const removeToken = (): void => {
  localStorage.removeItem('token');
};

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (mobile: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasAccess: (route: string) => boolean;
  hasPower: (power: 'Read' | 'Write' | 'Delete') => boolean;
  getFirstAccessibleRoute: () => string;
  refreshUser: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Check if user is authenticated on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = getToken();
        if (!token) {
          setLoading(false);
          return;
        }

        const response = await fetch(constants.baseURL + '/api/checkIsAuth', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.authenticated && data.user) {
            setUser(data.user);
          } else {
            // If token is invalid, remove it
            removeToken();
          }
        } else {
          // If request fails, remove token
          removeToken();
        }
      } catch (error) {
        console.error('Authentication check failed:', error);
        removeToken();
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Login function
  const login = async (mobile: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch(constants.baseURL + '/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mobile,
          password,
        })
      });

      if (response.ok) {
        const userData = await response.json();
        
        if (userData.success && userData.token) {
          setToken(userData.token);
          setUser(userData.user);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  };

  // Logout function
  const logout = async () => {
    try {
      const token = getToken();
      const response = await fetch(constants.baseURL + '/api/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      // Clear user regardless of API success
      setUser(null);
      removeToken();
      localStorage.removeItem('user');
      
      // Use window.location instead of navigate for a full refresh
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
      setUser(null);
      removeToken();
      window.location.href = '/login';
    }
  };

  // Check if user has access to a specific route
  const hasAccess = (route: string): boolean => {
    if (!user) return false;
    
    // Admin has access to everything
    if (user.routeAccess.includes('Admin')) return true;
    
    // Check if user has specific route access
    return user.routeAccess.some(access => {
      // Handle variations in route naming
      if (route.includes('account-master') && access === 'Account Master') return true;
      if (route.includes('invoicing') && access === 'Invoicing') return true;
      if (route.includes('godown-transfer') && access === 'Godown Transfer') return true;
      if (route.includes('cash-receipt') && access === 'Cash Receipts') return true;
      if (route.includes('cash-payment') && access === 'Cash Payments') return true;
      
      return access === route;
    });
  };

  // Check if user has a specific power (Read, Write, Delete)
  const hasPower = (power: 'Read' | 'Write' | 'Delete'): boolean => {
    if (!user) return false;
    
    // Admin has all powers regardless of what's in the powers array
    if (user.routeAccess.includes('Admin')) return true;
    
    return user.powers.includes(power);
  };

  // Get the first route the user has access to
  const getFirstAccessibleRoute = (): string => {
    if (!user) return '/login';
    
    // Define route mappings from routeAccess to actual routes
    const routeMappings = {
      'Admin': '/add-user',
      'Account Master': '/account-master',
      'Invoicing': '/invoicing',
      'Godown Transfer': '/godown-transfer',
      'Cash Receipts': '/cash-receipt',
      'Cash Payments': '/cash-payment'
    };
    
    // Find the first route the user has access to
    for (const access of user.routeAccess) {
      const route = routeMappings[access as keyof typeof routeMappings];
      if (route) return route;
    }
    
    return '/login'; // Fallback to login if no access
  };

  // Add a function to refresh user data without logging out
  const refreshUser = async (): Promise<boolean> => {
    try {
      const token = getToken();
      if (!token) return false;

      const response = await fetch(constants.baseURL + '/api/checkIsAuth', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
          return true;
        } else {
          removeToken();
        }
      }
      return false;
    } catch (error) {
      console.error('Failed to refresh user data:', error);
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        logout,
        hasAccess,
        hasPower,
        getFirstAccessibleRoute,
        refreshUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};