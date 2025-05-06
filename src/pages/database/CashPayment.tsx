import React, { useState, useEffect } from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import DatabaseTable from "../../components/tables/DatabaseTable";
import { useNavigate } from 'react-router-dom';
import constants from "../../constants";

const CashPayment: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Remove checkApprovedItems call
    // checkApprovedItems();
  }, []);

  const handleSyncToDbf = () => {
    navigate('/approved/cash-payments');
  };

  const handleApproveSuccess = () => {
    navigate('/approved/cash-payments');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta
        title="Cash Payments | FMCG Vite Admin Template"
        description="Cash Payments database page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Cash Payments" />
      
      <div className="container mx-auto px-4 py-6 overflow-hidden">
        <div className="bg-white  dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Cash Payments Database</h2>
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
            endpoint="cash-payments" 
            tableId="cash-payments-db"
            onApproveSuccess={handleApproveSuccess}
          />
        </div>
      </div>
    </div>
  );
};

export default CashPayment; 