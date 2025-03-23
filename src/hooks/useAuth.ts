import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import constants from '../constants';

interface User {
  id: number;
  name: string;
  routeAccess: string[];
  powers: string[];
  username: string;
  subgroup: {
    title: string;
    subgroupCode?: string;
  } | null;
  authenticated: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (mobile: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  hasAccess: (route: string) => boolean;
  hasPower: (power: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${constants.baseURL}/api/checkiskAuth`, {
        credentials: 'include', // Important for sending cookies
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (mobile: string, password: string): Promise<boolean> => {
    setLoading(true);
    try {
      const response = await fetch(`${constants.baseURL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mobile, password }),
        credentials: 'include', // Important for receiving cookies
      });

      if (response.ok) {
        await checkAuth(); // Refresh user data after login
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await fetch(`${constants.baseURL}/logout`, {
        credentials: 'include',
      });
      setUser(null);
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const hasAccess = (route: string): boolean => {
    if (!user) return false;
    
    // Admin has access to everything
    if (user.routeAccess.includes('Admin')) return true;
    
    // Check if user has access to the specific route
    return user.routeAccess.includes(route);
  };

  const hasPower = (power: string): boolean => {
    if (!user) return false;
    return user.powers.includes(power);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasAccess, hasPower }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};

export default useAuth; 