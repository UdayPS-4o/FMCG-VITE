import React from 'react';
import { Link } from 'react-router-dom';
import PageMeta from '../components/common/PageMeta';

const Unauthorized: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <PageMeta 
        title="Unauthorized | FMCG Vite Admin Template" 
        description="Unauthorized access page in FMCG Vite Admin Template" 
      />
      
      <div className="text-center p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm max-w-md w-full">
        <div className="text-red-500 mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
          Access Denied
        </h1>
        
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          You don't have permission to access this page. Please contact your administrator if you believe this is a mistake.
        </p>
        
        <div className="flex justify-center space-x-4">
          <Link
            to="/"
            className="px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Unauthorized; 