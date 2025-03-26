import React, { useState, useRef } from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import DatabaseTable from "../../components/tables/DatabaseTable";
import axios from 'axios';
import { toast } from 'react-toastify';
import constants from '../../constants';
const baseUrl = constants.baseURL;


const AccountMasterApproved: React.FC = () => {
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
      const response = await axios.post(`${baseUrl}/api/merge/account-master/sync`, {
        records: selectedRecords
      });

      if (response.data.success) {
        // Handle successful records that were synced
        if (response.data.syncedRecords && response.data.syncedRecords.length > 0) {
          toast.success(`Successfully synced ${response.data.syncedRecords.length} records`);
          
          // Remove synced records from approved section
          try {
            await axios.post(`${baseUrl}/delete-approved-records`, {
              endpoint: 'account-master',
              records: response.data.syncedRecords
            });
            
            // Soft reload - refresh the data instead of reloading the page
            if (tableRef.current) {
              await tableRef.current.refreshData();
            }
          } catch (deleteError) {
            console.error('Error removing synced records:', deleteError);
            toast.error('Could not remove synced records from approved list');
          }
        }
        
        // Handle records that failed due to duplicate C_CODE
        if (response.data.duplicateRecords && response.data.duplicateRecords.length > 0) {
          toast.error(`${response.data.duplicateRecords.length} records have duplicate C_CODE and were not synced`);
        }
      } else {
        toast.error(response.data.message || 'Failed to sync records');
      }
    } catch (error) {
      console.error('Error syncing to DBF:', error);
      toast.error('Error syncing to DBF file. Check console for details.');
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
      const response = await axios.post(`${baseUrl}/revert-approved`, {
        endpoint: 'account-master',
        records: selectedRecords
      });

      if (response.data.success) {
        toast.success(`Successfully reverted ${selectedRecords.length} records to database`);
        // Soft reload - refresh the data instead of reloading the page
        if (tableRef.current) {
          await tableRef.current.refreshData();
        }
      } else {
        toast.error(response.data.message || 'Failed to revert records');
      }
    } catch (error) {
      console.error('Error reverting records:', error);
      toast.error('Error reverting records. Check console for details.');
    } finally {
      setIsReverting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta
        title="Account Master Approved | FMCG Vite Admin Template"
        description="Account Master Approved page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Account Master Approved" />
      
      <div className="container mx-auto px-4 py-6 overflow-hidden">
        <div className="bg-white max-w-[1140px] dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Account Master Approved Data</h2>
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
            endpoint="account-master" 
            tableId="account-master-approved" 
            onSelectionChange={handleRecordSelection}
            hideButtons={['print', 'edit']}
            hideApproveButton={true}
          />
        </div>
      </div>
    </div>
  );
};

export default AccountMasterApproved; 