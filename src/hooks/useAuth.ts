import { useAuth as useAuthContext } from '../contexts/AuthContext';
export { getUserSubgroups, hasMultipleSubgroups, hasSingleSubgroup } from '../contexts/AuthContext';

const useAuth = () => {
  return useAuthContext();
};

export default useAuth; 