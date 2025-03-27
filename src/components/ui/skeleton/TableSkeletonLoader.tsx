import React from 'react';
import { Skeleton } from './SkeletonLoader';

const TableSkeletonLoader: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-6 overflow-hidden">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full overflow-hidden">
        {/* Table header section */}
        <div className="flex justify-between items-center mb-6">
          <Skeleton height="h-8" width="w-48" />
          <div className="flex space-x-3">
            <Skeleton height="h-10" width="w-32" rounded="rounded-md" />
            <Skeleton height="h-10" width="w-32" rounded="rounded-md" />
            <Skeleton height="h-10" width="w-10" rounded="rounded-md" />
          </div>
        </div>

        {/* Search and filter row */}
        <div className="flex flex-wrap gap-4 mb-6 items-center">
          <div className="relative flex-grow max-w-md">
            <Skeleton height="h-10" width="w-full" rounded="rounded-md" />
          </div>
          <div className="flex space-x-2">
            <Skeleton height="h-10" width="w-24" rounded="rounded-md" />
            <Skeleton height="h-10" width="w-24" rounded="rounded-md" />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <div className="min-w-full rounded-md">
            {/* Table header */}
            <div className="bg-gray-100 dark:bg-gray-700 rounded-t-md">
              <div className="grid grid-cols-6 gap-2 py-3">
                <div className="px-4 flex items-center">
                  <Skeleton height="h-5" width="w-5" rounded="rounded-md" className="mr-2" />
                  <Skeleton height="h-5" width="w-20" />
                </div>
                {[...Array(5)].map((_, index) => (
                  <div key={index} className="px-4 flex items-center justify-between">
                    <Skeleton height="h-5" width="w-24" />
                    <Skeleton height="h-4" width="w-4" />
                  </div>
                ))}
              </div>
            </div>

            {/* Table rows */}
            {[...Array(10)].map((_, rowIndex) => (
              <div 
                key={rowIndex} 
                className={`grid grid-cols-6 gap-2 py-4 border-b border-gray-200 dark:border-gray-700 ${
                  rowIndex % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900'
                }`}
              >
                <div className="px-4 flex items-center">
                  <Skeleton height="h-5" width="w-5" rounded="rounded-md" className="mr-2" />
                  <Skeleton height="h-5" width={`w-${20 + (rowIndex % 3) * 8}`} />
                </div>
                {[...Array(5)].map((_, colIndex) => (
                  <div key={colIndex} className="px-4">
                    <Skeleton height="h-5" width={`w-${30 + (colIndex * 10)}`} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap justify-between items-center mt-6 gap-4">
          <div className="flex items-center space-x-2">
            <Skeleton height="h-8" width="w-24" rounded="rounded-md" />
            <Skeleton height="h-8" width="w-16" rounded="rounded-md" />
          </div>
          <div className="flex items-center space-x-1">
            <Skeleton height="h-9" width="w-9" rounded="rounded-md" />
            {[...Array(3)].map((_, index) => (
              <Skeleton key={index} height="h-9" width="w-9" rounded="rounded-md" />
            ))}
            <Skeleton height="h-9" width="w-9" rounded="rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TableSkeletonLoader; 