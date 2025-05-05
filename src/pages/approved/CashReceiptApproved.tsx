import React, { useState, useRef } from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import DatabaseTable from "../../components/tables/DatabaseTable";
import { toast } from 'react-toastify';
import constants from '../../constants';
const baseUrl = constants.baseURL;

const CashReceiptApproved: React.FC = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState<any[]>([]);
  const tableRef = useRef<{ refreshData: () => Promise<void> }>(null);

  const handleRecordSelection = (records: any[]) => {
    setSelectedRecords(records);
  };

  const getAuthToken = () => {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  };

  const handleSyncToDbf = async () => {
    if (selectedRecords.length === 0) {
      toast.warning('Please select at least one record to sync');
      return;
    }

    try {
      setIsSyncing(true);
      const token = getAuthToken();
      
      const response = await fetch(`${baseUrl}/api/merge/cash-receipts/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          records: selectedRecords
        })
      });
      
      if (!response.ok) {
        // Server returned an error
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          // Not JSON, use as is
        }
        
        // Special handling for 401 errors
        if (response.status === 401) {
          throw new Error(`Authentication error: ${errorData?.message || 'User not authenticated'}`);
        }
        
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();

      if (data.success) {
        toast.success(`Successfully synced ${data.syncedCount} cash receipts`);
        
        // Refresh the data
        if (tableRef.current) {
          await tableRef.current.refreshData();
        }
      } else {
        toast.error(data.message || 'Failed to sync cash receipts');
      }
    } catch (error) {
      console.error('Error syncing to DBF:', error);
      let errorMessage = 'Error syncing to DBF files.';
      
      // Try to extract more detailed error information
      if (error instanceof Error) {
        errorMessage += ` ${error.message}`;
        
        // Show specific message for authentication errors
        if (error.message.includes('Authentication error')) {
          errorMessage = error.message;
          toast.error(errorMessage, { autoClose: false });
          toast.info('Please make sure you are logged in with a valid user account.', { autoClose: false });
          toast.info('Try logging out and logging back in.', { autoClose: false });
          return;
        }
        
        // Show a special message for connection errors
        if (error.message.includes('fetch') || error.message.includes('network')) {
          errorMessage = 'API endpoint not available. The server needs to register the cash-receipts merge route.';
          toast.error(errorMessage, { autoClose: false });
          toast.info('See fix-suggestions.txt for server-side fix instructions.', { autoClose: false });
          return;
        }
      } else if (error instanceof Response) {
        errorMessage += ` HTTP Status: ${error.status}`;
      }
      
      toast.error(errorMessage);
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
      const token = getAuthToken();
      
      const response = await fetch(`${baseUrl}/revert-approved`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          endpoint: 'cash-receipts',
          records: selectedRecords
        })
      });
      
      const data = await response.json();

      if (data.success) {
        toast.success(`Successfully reverted ${selectedRecords.length} cash receipts to database`);
        // Refresh the data
        if (tableRef.current) {
          await tableRef.current.refreshData();
        }
      } else {
        toast.error(data.message || 'Failed to revert cash receipts');
      }
    } catch (error) {
      console.error('Error reverting cash receipts:', error);
      toast.error('Error reverting cash receipts. Check console for details.');
    } finally {
      setIsReverting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta
        title="Cash Receipts Approved | FMCG Vite Admin Template"
        description="Cash Receipts Approved page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Cash Receipts Approved" />
      
      <div className="container mx-auto px-4 py-6 overflow-hidden">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Cash Receipts Approved Data</h2>
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
            endpoint="cash-receipts" 
            tableId="cash-receipts-approved" 
            onSelectionChange={handleRecordSelection}
            hideButtons={['print', 'edit']}
            hideApproveButton={true}
          />
        </div>
      </div>
    </div>
  );
};

export default CashReceiptApproved; 