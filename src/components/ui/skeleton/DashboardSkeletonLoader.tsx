import React from 'react';
import { Skeleton } from './SkeletonLoader';

const DashboardSkeletonLoader: React.FC = () => {
  return (
    <div>
      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div className="space-y-2">
                <Skeleton height="h-4" width="w-20" />
                <Skeleton height="h-8" width="w-28" />
              </div>
              <Skeleton height="h-10" width="w-10" rounded="rounded-full" />
            </div>
            <Skeleton height="h-2" width="w-full" />
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-12 gap-6 mb-6">
        <div className="col-span-12 xl:col-span-7">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <Skeleton height="h-6" width="w-40" />
              <div className="flex space-x-2">
                <Skeleton height="h-8" width="w-20" rounded="rounded-md" />
                <Skeleton height="h-8" width="w-20" rounded="rounded-md" />
              </div>
            </div>
            <Skeleton height="h-64" width="w-full" />
          </div>
        </div>
        <div className="col-span-12 xl:col-span-5">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm h-full">
            <Skeleton height="h-6" width="w-40" className="mb-6" />
            <Skeleton height="h-64" width="w-full" />
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm mb-6">
        <div className="flex justify-between items-center mb-6">
          <Skeleton height="h-6" width="w-48" />
          <div className="flex space-x-2">
            <Skeleton height="h-10" width="w-32" rounded="rounded-md" />
            <Skeleton height="h-10" width="w-32" rounded="rounded-md" />
          </div>
        </div>
        
        {/* Table header */}
        <div className="overflow-x-auto">
          <div className="min-w-full border-b border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-5 py-3 bg-gray-100 dark:bg-gray-800">
              {[...Array(5)].map((_, index) => (
                <div key={index} className="px-4">
                  <Skeleton height="h-5" width="w-full" />
                </div>
              ))}
            </div>
            
            {/* Table rows */}
            {[...Array(5)].map((_, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-5 py-4 border-b border-gray-200 dark:border-gray-700">
                {[...Array(5)].map((_, colIndex) => (
                  <div key={colIndex} className="px-4">
                    <Skeleton height="h-5" width={colIndex === 0 ? "w-1/2" : "w-3/4"} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        
        {/* Pagination */}
        <div className="flex justify-between items-center mt-6">
          <Skeleton height="h-8" width="w-32" />
          <div className="flex space-x-2">
            {[...Array(3)].map((_, index) => (
              <Skeleton key={index} height="h-8" width="w-8" rounded="rounded-md" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardSkeletonLoader; 