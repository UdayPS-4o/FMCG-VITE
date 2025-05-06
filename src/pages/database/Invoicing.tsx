import React, { useState, useEffect } from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import DatabaseTable from "../../components/tables/DatabaseTable";
import { TableSkeletonLoader } from "../../components/ui/skeleton/SkeletonLoader";
import { useNavigate } from 'react-router-dom';
import constants from "../../constants";

const Invoicing: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Simulate loading delay for demo purposes
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);
  
  const handleApproveSuccess = () => {
    navigate('/approved/invoicing');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta
        title="Invoicing | FMCG Vite Admin Template"
        description="Invoicing database page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Invoicing" />
      
      <div className="container mx-auto px-4 py-6 overflow-hidden">
        <div className="bg-white  dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Invoicing Database</h2>
          </div>
          <DatabaseTable 
            endpoint="invoicing" 
            tableId="invoicing-db"
            onApproveSuccess={handleApproveSuccess}
          />
        </div>
      </div>
    </div>
  );
};

export default Invoicing; 