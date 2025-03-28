import React, { useEffect, useState } from 'react';

interface ToastProps {
  isVisible?: boolean;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  onClose?: () => void;
}

const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  duration = 3000,
  onClose,
  isVisible = true,
}) => {
  const [isShowing, setIsShowing] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setIsShowing(true);
      const timer = setTimeout(() => {
        setIsShowing(false);
        if (onClose) onClose();
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  if (!isShowing) return null;

  // Tailwind classes for each variant
  const variantClasses = {
    success: {
      container: "bg-green-50 border-green-500 dark:bg-green-900/20 dark:border-green-500/50",
      icon: "text-green-500",
      text: "text-green-800 dark:text-green-100",
    },
    error: {
      container: "bg-red-50 border-red-500 dark:bg-red-900/20 dark:border-red-500/50",
      icon: "text-red-500",
      text: "text-red-800 dark:text-red-100",
    },
    warning: {
      container: "bg-yellow-50 border-yellow-500 dark:bg-yellow-900/20 dark:border-yellow-500/50",
      icon: "text-yellow-500",
      text: "text-yellow-800 dark:text-yellow-100",
    },
    info: {
      container: "bg-blue-50 border-blue-500 dark:bg-blue-900/20 dark:border-blue-500/50",
      icon: "text-blue-500",
      text: "text-blue-800 dark:text-blue-100",
    },
  };

  // Icon for each variant
  const icons = {
    success: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    warning: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    info: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  const fadeInAnimation = `
    @keyframes fadeInDown {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;

  return (
    <div 
      className="fixed right-4 z-50"
      style={{
        top: '150px',
        animation: 'fadeInDown 0.5s ease-out forwards'
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: fadeInAnimation }} />
      <div className={`flex items-center p-4 mb-4 border-l-4 rounded-lg shadow-md ${variantClasses[type].container}`}>
        <div className={`inline-flex items-center justify-center flex-shrink-0 w-8 h-8 ${variantClasses[type].icon}`}>
          {icons[type]}
        </div>
        <div className="ml-3 text-sm font-medium">
          <span className={variantClasses[type].text}>{message}</span>
        </div>
        <button
          type="button"
          className={`ml-auto -mx-1.5 -my-1.5 rounded-lg p-1.5 inline-flex h-8 w-8 ${variantClasses[type].text} hover:bg-gray-100 dark:hover:bg-gray-700`}
          onClick={() => {
            setIsShowing(false);
            if (onClose) onClose();
          }}
        >
          <span className="sr-only">Close</span>
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default Toast; 