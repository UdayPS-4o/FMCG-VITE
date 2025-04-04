import React, { useState, useEffect } from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import DatabaseTable from "../../components/tables/DatabaseTable";
import { TableSkeletonLoader } from "../../components/ui/skeleton/SkeletonLoader";

const Invoicing: React.FC = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading delay for demo purposes
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta
        title="Invoicing | FMCG Vite Admin Template"
        description="Invoicing database page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Invoicing" />
      
      <div className="container mx-auto px-4 py-6 overflow-hidden">
        <div className="bg-white  dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full overflow-hidden">
          <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">Invoicing Database</h2>
          <DatabaseTable endpoint="invoicing" tableId="invoicing-db" />
        </div>
      </div>
    </div>
  );
};

export default Invoicing; 