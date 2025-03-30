import React from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import DatabaseTable from "../../components/tables/DatabaseTable";

const CashReceiptApproved: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta
        title="Cash Receipts Approved | FMCG Vite Admin Template"
        description="Cash Receipts Approved page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Cash Receipts Approved" />
      
      <div className="container mx-auto px-4 py-6 overflow-hidden">
        <div className="bg-white  dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full overflow-hidden">
          <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">Cash Receipts Approved Data</h2>
          <DatabaseTable endpoint="cash-receipts" tableId="cash-receipts-approved" />
        </div>
      </div>
    </div>
  );
};

export default CashReceiptApproved; 