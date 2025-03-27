import React from 'react';
import FormSkeletonLoader from './FormSkeletonLoader';
import TableSkeletonLoader from './TableSkeletonLoader';
import DashboardSkeletonLoader from './DashboardSkeletonLoader';

interface SkeletonProps {
  className?: string;
  height?: string;
  width?: string;
  rounded?: string;
}

// Add custom styles for animation to ensure a smoother transition
const animationStyles = `
@keyframes skeletonPulse {
  0% {
    opacity: 0.6;
  }
  50% {
    opacity: 0.8;
  }
  100% {
    opacity: 0.6;
  }
}

.skeleton-pulse {
  animation: skeletonPulse 1.5s ease-in-out infinite;
  transition: background-color 0.5s ease-in-out, opacity 0.3s ease-in-out;
}
`;

// Basic skeleton element with pulsing animation
export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  height = 'h-4',
  width = 'w-full',
  rounded = 'rounded-md'
}) => {
  return (
    <>
      <style>{animationStyles}</style>
      <div className={`skeleton-pulse bg-gray-200 dark:bg-gray-700 ${height} ${width} ${rounded} ${className}`}></div>
    </>
  );
};

// Skeleton for input fields with label
export const SkeletonInput: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div className={`space-y-2 ${className}`}>
      <Skeleton height="h-4" width="w-1/4" />
      <Skeleton height="h-10" />
    </div>
  );
};

// Skeleton for autocomplete fields
export const SkeletonAutocomplete: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div className={`space-y-2 ${className}`}>
      <Skeleton height="h-4" width="w-1/4" />
      <div className="relative">
        <Skeleton height="h-10" />
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <Skeleton height="h-4" width="w-4" rounded="rounded-full" />
        </div>
      </div>
    </div>
  );
};

// Skeleton for toggle switch
export const SkeletonToggle: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <Skeleton height="h-4" width="w-16" />
      <Skeleton height="h-6" width="w-12" rounded="rounded-full" />
      <Skeleton height="h-4" width="w-16" />
    </div>
  );
};

// Skeleton for item section
export const SkeletonItem: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div className={`border border-gray-200 dark:border-gray-700 rounded-lg mb-4 ${className}`}>
      <div className="p-4 bg-white dark:bg-gray-900 flex justify-between items-center">
        <Skeleton height="h-6" width="w-1/2" />
        <div className="flex space-x-2">
          <Skeleton height="h-6" width="w-6" rounded="rounded-md" />
          <Skeleton height="h-6" width="w-6" rounded="rounded-md" />
        </div>
      </div>
    </div>
  );
};

// Export all skeleton loader components
export {
  FormSkeletonLoader,
  TableSkeletonLoader,
  DashboardSkeletonLoader
};

// Default export - use this for the invoicing page for backward compatibility
const InvoicingSkeletonLoader: React.FC = () => {
  return <FormSkeletonLoader />;
};

export default InvoicingSkeletonLoader; 