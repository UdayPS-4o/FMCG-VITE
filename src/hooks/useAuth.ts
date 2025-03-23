import { useState, useEffect } from 'react';

interface User {
  subgroup: {
    title: string;
    subgroupCode: string;
  };
}

const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In a real app, this would fetch the user from an API or local storage
    // For now, we'll just simulate a user
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  return { user, loading };
};

export default useAuth; 