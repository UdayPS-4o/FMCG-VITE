import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageMeta from "../../components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";
import constants from '../../constants';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [mobile, setMobile] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If token is present in cookies, redirect to /account-master
    const checkAuthentication = async () => {
      try {
        const response = await fetch(constants.baseURL + '/api/checkIsAuth', {
          method: 'GET',
          credentials: 'include', // Ensure cookies are sent with the request
        });

        if (response.ok) {
          const data = await response.json();
          console.log(data);

          if (data.authenticated) {
            // If user is authenticated, redirect to /account-master
            window.location.href = '/account-master';
          }
        } else {
          console.error('Failed to authenticate user.');
        }
      } catch (error) {
        // Handle error if the user is not authenticated
        console.error('Authentication check failed:', error);
      }
    };
    checkAuthentication();
  }, []);

  // Handle form submission
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      const response = await fetch(constants.baseURL + '/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mobile,
          password,
        }),
        credentials: 'include', // Ensure cookies (token) are included in the request
      });

      if (response.ok) {
        // If login is successful, redirect to /account-master
        navigate('/account-master');
      } else {
        const errorMessage = await response.text();
        setError(errorMessage);
      }
    } catch (err) {
      console.error('Login request failed:', err);
      setError('An error occurred during login. Please try again.');
    }
  };

  return (
    <>
      <PageMeta
        title="Login | Ekta Enterprises"
        description="Login page for Ekta Enterprises FMCG application"
      />
      <AuthLayout>
        <div className="bg-white/90 dark:bg-gray-800/90 p-8 rounded-lg shadow-xl backdrop-blur-sm">
          <div className="mb-5 sm:mb-8 text-center">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Welcome to Ekta Enterprises
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Enter your mobile and password to sign in!
            </p>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
                  Mobile <span className="text-error-500">*</span>
                </label>
                <input
                  type="text"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-brand-500 focus:border-brand-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-brand-500 dark:focus:border-brand-500"
                  placeholder="Enter your mobile number"
                  required
                />
              </div>
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
                  Password <span className="text-error-500">*</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-brand-500 focus:border-brand-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-brand-500 dark:focus:border-brand-500"
                  placeholder="Enter your password"
                  required
                />
              </div>
              {error && (
                <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                  {error}
                </div>
              )}
              <div>
                <button
                  type="submit"
                  className="w-full text-white bg-brand-600 hover:bg-brand-700 focus:ring-4 focus:outline-none focus:ring-brand-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-brand-600 dark:hover:bg-brand-700 dark:focus:ring-brand-800"
                >
                  Sign in
                </button>
              </div>
            </div>
          </form>
        </div>
      </AuthLayout>
    </>
  );
};

export default Login; 