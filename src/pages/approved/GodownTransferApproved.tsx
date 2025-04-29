import React, { useState, useRef } from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import DatabaseTable from "../../components/tables/DatabaseTable";
import { toast } from 'react-toastify';
import constants from '../../constants';
const baseUrl = constants.baseURL;

const GodownTransferApproved: React.FC = () => {
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
      
      const response = await fetch(`${baseUrl}/api/merge/godown-transfer/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          records: selectedRecords
        })
      });
      
      const data = await response.json();

      if (data.success) {
        toast.success(`Successfully synced ${data.processed.length} godown transfers`);
        
        if (data.skipped && data.skipped.length > 0) {
          const duplicates = data.skipped.filter((item: any) => item.reason === 'Duplicate').length;
          const missingData = data.skipped.filter((item: any) => item.reason === 'Missing Product Data').length;
          
          if (duplicates > 0) {
            toast.warning(`${duplicates} transfers were skipped (already exist in DBF)`);
          }
          
          if (missingData > 0) {
            toast.error(`${missingData} transfers were skipped (missing product data)`);
          }
        }
        
        // Remove synced records from approved section
        try {
          const deleteResponse = await fetch(`${baseUrl}/delete-approved-records`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              endpoint: 'godown',
              records: selectedRecords.filter(record => 
                data.processed.includes(`${record.series}-${record.id}`)
              )
            })
          });
          
          // Refresh the data
          if (tableRef.current) {
            await tableRef.current.refreshData();
          }
        } catch (deleteError) {
          console.error('Error removing synced records:', deleteError);
          toast.error('Could not remove synced records from approved list');
        }
      } else {
        toast.error(data.message || 'Failed to sync godown transfers');
      }
    } catch (error) {
      console.error('Error syncing to DBF:', error);
      toast.error('Error syncing to DBF files. Check console for details.');
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
          endpoint: 'godown',
          records: selectedRecords
        })
      });
      
      const data = await response.json();

      if (data.success) {
        toast.success(`Successfully reverted ${selectedRecords.length} godown transfers to database`);
        // Refresh the data
        if (tableRef.current) {
          await tableRef.current.refreshData();
        }
      } else {
        toast.error(data.message || 'Failed to revert godown transfers');
      }
    } catch (error) {
      console.error('Error reverting godown transfers:', error);
      toast.error('Error reverting godown transfers. Check console for details.');
    } finally {
      setIsReverting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta
        title="Godown Transfer Approved | FMCG Vite Admin Template"
        description="Godown Transfer Approved page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Godown Transfer Approved" />
      
      <div className="container mx-auto px-4 py-6 overflow-hidden">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Godown Transfer Approved Data</h2>
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
            endpoint="godown" 
            tableId="godown-transfer-approved" 
            onSelectionChange={handleRecordSelection}
            hideButtons={['print', 'edit']}
            hideApproveButton={true}
          />
        </div>
      </div>
    </div>
  );
};

export default GodownTransferApproved; 