import React from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import DatabaseTable from "../../components/tables/DatabaseTable";

const GodownTransferApproved: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta
        title="Godown Transfer Approved | FMCG Vite Admin Template"
        description="Godown Transfer Approved page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Godown Transfer Approved" />
      
      <div className="container mx-auto px-4 py-6 overflow-hidden">
        <div className="bg-white max-w-[1140px] dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full overflow-hidden">
          <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">Godown Transfer Approved Data</h2>
          <DatabaseTable endpoint="godownTransfer" tableId="godown-transfer-approved" />
        </div>
      </div>
    </div>
  );
};

export default GodownTransferApproved; 