import React from 'react';
import { Skeleton, SkeletonInput, SkeletonAutocomplete, SkeletonToggle } from './SkeletonLoader';

const FormSkeletonLoader: React.FC = () => {
  return (
    <div>
      {/* Form container */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm mb-6">
        {/* Top form fields - typically 3 in a row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <SkeletonInput />
          <SkeletonInput />
          <div className="flex items-center">
            <SkeletonToggle />
          </div>
        </div>

        {/* Middle form fields - typically 2 in a row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <SkeletonAutocomplete />
          <SkeletonInput />
        </div>

        {/* More form fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <SkeletonAutocomplete />
          <SkeletonInput />
        </div>

        {/* Optional section - can appear conditionally */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SkeletonInput />
        </div>
      </div>

      {/* Secondary section header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2 dark:text-white">Items</h2>
        <div className="relative max-w-md mb-4">
          <Skeleton height="h-10" width="w-full" />
        </div>
      </div>

      {/* Items or details list */}
      <div className="mb-6">
        {[...Array(3)].map((_, index) => (
          <div 
            key={index} 
            className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg"
          >
            <div className="p-4 bg-white dark:bg-gray-900 flex justify-between items-center">
              <Skeleton height="h-6" width="w-1/3" />
              <div className="flex space-x-2">
                <Skeleton height="h-6" width="w-6" rounded="rounded-md" />
                <Skeleton height="h-6" width="w-6" rounded="rounded-md" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add button */}
      <div className="mb-6">
        <Skeleton height="h-10" width="w-44" rounded="rounded-md" />
      </div>

      {/* Form actions - typically total + submit/cancel buttons */}
      <div className="flex justify-between items-center mb-6">
        <Skeleton height="h-8" width="w-40" />
        <div className="flex space-x-4">
          <Skeleton height="h-10" width="w-28" rounded="rounded-md" />
          <Skeleton height="h-10" width="w-24" rounded="rounded-md" />
        </div>
      </div>
    </div>
  );
};

export default FormSkeletonLoader; 