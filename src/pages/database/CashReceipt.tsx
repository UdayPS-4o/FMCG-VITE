import React, { useState, useEffect } from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import DatabaseTable from "../../components/tables/DatabaseTable";
import { useNavigate } from 'react-router-dom';
import constants from "../../constants";

const CashReceipt: React.FC = () => {
  const navigate = useNavigate();
  const [selectedReceipts, setSelectedReceipts] = useState<string[]>([]);

  useEffect(() => {
    // Remove checkApprovedItems call
    // checkApprovedItems();
  }, []);

  const handleSyncToDbf = () => {
    navigate('/approved/cash-receipts');
  };
  
  const handleApproveSuccess = () => {
    navigate('/approved/cash-receipts');
  };

  const handleSelectionChange = (selectedItems: any[]) => {
    const ids = selectedItems.map(item => item.receiptNo).filter(id => id !== undefined && id !== null);
    setSelectedReceipts(ids.map(String));
  };

  const handlePrintSelected = () => {
    if (selectedReceipts.length > 0) {
      const idsString = selectedReceipts.join(',');
      navigate(`/print/bulk-cash-receipts?receiptNo=${idsString}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta
        title="Cash Receipts | FMCG Vite Admin Template"
        description="Cash Receipts database page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Cash Receipts" />
      
      <div className="container mx-auto px-4 py-6 overflow-hidden">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Cash Receipts Database</h2>
          </div>

          <div className="flex justify-end items-center mb-4">
            {selectedReceipts.length > 0 && (
              <button
                onClick={handlePrintSelected}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
              >
                Print Selected ({selectedReceipts.length})
              </button>
            )}
          </div>

          <DatabaseTable 
            endpoint="cash-receipts" 
            tableId="cash-receipts-db"
            onApproveSuccess={handleApproveSuccess}
            onSelectionChange={handleSelectionChange}
          />
        </div>
      </div>
    </div>
  );
};

export default CashReceipt; 