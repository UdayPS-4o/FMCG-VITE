import React, { useState, useRef } from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import DatabaseTable from "../../components/tables/DatabaseTable";
import { toast } from 'react-toastify';
import constants from '../../constants';
const baseUrl = constants.baseURL;

const CashPaymentApproved: React.FC = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState<any[]>([]);
  const tableRef = useRef<{ refreshData: () => Promise<void> }>(null);

  const handleRecordSelection = (records: any[]) => {
    setSelectedRecords(records);
  };

  const handleSyncToDbf = async () => {
    if (selectedRecords.length === 0) {
      toast.warning('Please select at least one record to sync');
      return;
    }

    try {
      setIsSyncing(true);
      const response = await fetch(`${baseUrl}/api/merge/cash-payments/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ records: selectedRecords })
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Successfully synced ${data.syncedCount || 0} records`);
        if (tableRef.current) {
          await tableRef.current.refreshData();
          setSelectedRecords([]);
        }
      } else {
        toast.error(data.message || 'Failed to sync records');
      }
    } catch (error: any) {
      console.error('Error syncing cash payments to DBF:', error);
      toast.error('Error syncing to DBF file: ' + (error.message || 'Unknown error'));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRevertSelected = async () => {
    if (selectedRecords.length === 0) {
      toast.warning('Please select at least one record to revert');
      return;
    }

    try {
      setIsReverting(true);
      const response = await fetch(`${baseUrl}/api/merge/cash-payments/revert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ records: selectedRecords })
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Successfully reverted ${data.revertedCount || 0} records`);
        if (tableRef.current) {
          await tableRef.current.refreshData();
          setSelectedRecords([]);
        }
      } else {
        toast.error(data.message || 'Failed to revert records');
      }
    } catch (error: any) {
      console.error('Error reverting records:', error);
      toast.error('Error reverting records: ' + (error.message || 'Unknown error'));
    } finally {
      setIsReverting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta
        title="Cash Payments Approved | FMCG Vite Admin Template"
        description="Cash Payments Approved page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Cash Payments Approved" />
      
      <div className="container mx-auto px-4 py-6 overflow-hidden">
        <div className="bg-white  dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Cash Payments Approved Data</h2>
            <div className="flex space-x-4">
              <button
                onClick={handleRevertSelected}
                disabled={isReverting || selectedRecords.length === 0}
                className={`px-4 py-2 rounded-md text-white ${
                  isReverting || selectedRecords.length === 0
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isReverting ? 'Reverting...' : 'Revert Selected'}
              </button>
              <button
                onClick={handleSyncToDbf}
                disabled={isSyncing || selectedRecords.length === 0}
                className={`px-4 py-2 rounded-md text-white ${
                  isSyncing || selectedRecords.length === 0
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {isSyncing ? 'Syncing...' : 'Sync to DBF'}
              </button>
            </div>
          </div>
          <DatabaseTable
            ref={tableRef}
            endpoint="cash-payments"
            tableId="cash-payments-approved"
            onSelectionChange={handleRecordSelection}
            hideButtons={['print', 'edit']}
            hideApproveButton={true}
          />
        </div>
      </div>
    </div>
  );
};

export default CashPaymentApproved; 