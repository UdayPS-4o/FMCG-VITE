import { useAuth as useAuthContext } from '../contexts/AuthContext';

const useAuth = () => {
  return useAuthContext();
};

export default useAuth; 