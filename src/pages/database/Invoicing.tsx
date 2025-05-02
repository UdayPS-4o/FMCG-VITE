import React, { useState, useEffect } from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import DatabaseTable from "../../components/tables/DatabaseTable";
import { TableSkeletonLoader } from "../../components/ui/skeleton/SkeletonLoader";
import { useNavigate } from 'react-router-dom';
import constants from "../../constants";

const Invoicing: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [hasApprovedItems, setHasApprovedItems] = useState<boolean>(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Simulate loading delay for demo purposes
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);
    
    checkApprovedItems();
    
    return () => clearTimeout(timer);
  }, []);

  const checkApprovedItems = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${constants.baseURL}/approved/json/invoicing?timestamp=${new Date().getTime()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setHasApprovedItems(Array.isArray(data) && data.length > 0);
      }
    } catch (error) {
      console.error('Error checking approved items:', error);
    }
  };

  const handleSyncToDbf = () => {
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
            {hasApprovedItems && (
              <button
                onClick={handleSyncToDbf}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
              >
                Sync to DBF
              </button>
            )}
          </div>
          <DatabaseTable 
            endpoint="invoicing" 
            tableId="invoicing-db"
            onApproveSuccess={() => {
              setHasApprovedItems(true);
            }} 
          />
        </div>
      </div>
    </div>
  );
};

export default Invoicing; 