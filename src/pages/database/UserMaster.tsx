import React from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import DatabaseTable from "../../components/tables/DatabaseTable";

const UserMaster: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta
        title="User Master | FMCG Vite Admin Template"
        description="User Master database page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="User Master" />
      
      <div className="container mx-auto px-4 py-6 overflow-hidden">
        <div className="bg-white  dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full overflow-hidden">
          <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">User Master Database</h2>
          <DatabaseTable endpoint="users" tableId="users-master-db" />
        </div>
      </div>
    </div>
  );
};

export default UserMaster; 