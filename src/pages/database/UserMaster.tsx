import React, { useState, useEffect } from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import DatabaseTable from "../../components/tables/DatabaseTable";
import { useNavigate } from 'react-router-dom';
import constants from "../../constants";
import { toast } from 'react-toastify';

const UserMaster: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if there are approved items
    // Remove checkApprovedItems call
    // checkApprovedItems();
  }, []);

  // Listen for the custom event that indicates items were approved
  useEffect(() => {
    const handleItemsApproved = () => {
      // Remove checkApprovedItems call
      // checkApprovedItems();
    };

    window.addEventListener('itemsApproved', handleItemsApproved);
    
    return () => {
      window.removeEventListener('itemsApproved', handleItemsApproved);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta
        title="User Master | FMCG Vite Admin Template"
        description="User Master database page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="User Master" />
      
      <div className="container mx-auto px-4 py-6 overflow-hidden">
        <div className="bg-white  dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">User Master Database</h2>
            {/* Remove Sync to DBF button logic */}
            {/* {hasApprovedItems && (
              <button
                onClick={handleSyncToDbf}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
              >
                Sync to DBF
              </button>
            )} */}
          </div>
          <DatabaseTable 
            endpoint="users" 
            tableId="users-master-db" 
            // Remove onApproveSuccess prop and related event dispatch
            // onApproveSuccess={() => {
            //   setHasApprovedItems(true);
            //   // Dispatch a custom event that can be listened to by other components
            //   window.dispatchEvent(new Event('itemsApproved'));
            // }}
          />
        </div>
      </div>
    </div>
  );
};

export default UserMaster; 