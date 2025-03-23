import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Input from '../components/form/input/Input';
import FormComponent from '../components/form/Form';
import PageMeta from '../components/common/PageMeta';
import { useAuth } from '../hooks/useAuth';

const Login: React.FC = () => {
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { login, loading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!mobile || !password) {
      setError('Please enter both mobile number and password');
      return;
    }

    try {
      const success = await login(mobile, password);
      
      if (success) {
        navigate('/');
      } else {
        setError('Invalid mobile number or password');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Failed to log in. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <PageMeta 
        title="Login | FMCG Vite Admin Template" 
        description="Login page in FMCG Vite Admin Template" 
      />
      
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 max-w-md w-full">
        <div className="flex flex-col items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            Login to FMCG Admin
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Enter your credentials to access your account
          </p>
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-md">
            {error}
          </div>
        )}
        
        <FormComponent onSubmit={handleSubmit}>
          <div className="space-y-4">
            <Input
              id="mobile"
              label="Mobile Number"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              variant="outlined"
              autoComplete="tel"
              required
            />
            
            <Input
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              variant="outlined"
              autoComplete="current-password"
              required
            />
            
            <button
              type="submit"
              className="w-full py-2 px-4 bg-brand-500 text-white rounded-md hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700 transition-colors"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <span className="animate-spin mr-2 h-4 w-4 border-t-2 border-b-2 border-white rounded-full"></span>
                  Logging in...
                </span>
              ) : (
                'Login'
              )}
            </button>
          </div>
        </FormComponent>
      </div>
    </div>
  );
};

export default Login; 