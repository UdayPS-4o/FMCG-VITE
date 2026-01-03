import React, { useRef, useState } from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import DatabaseTable from "../../components/tables/DatabaseTable";
import constants from '../../constants';
import { toast } from 'react-toastify';

const baseUrl = constants.baseURL;

const PurchasesApproved: React.FC = () => {
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
      if (!token) {
        toast.error('Authentication required');
        setIsSyncing(false);
        return;
      }
      const response = await fetch(`${baseUrl}/api/merge/purchases/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ records: selectedRecords })
      });
      let data: any = null;
      try {
        data = await response.json();
      } catch {
        // ignore JSON parse errors
      }
      if (response.ok && data?.success) {
        const processedCount = (data.processed || []).length;
        const skippedCount = (data.skipped || []).length;
        toast.success(`Successfully synced ${processedCount} purchases`);
        if (skippedCount > 0) {
          const duplicates = (data.skipped || []).filter((s: any) => s.reason === 'Duplicate').length;
          toast.warning(`${skippedCount} purchases skipped${duplicates ? ` (${duplicates} duplicates)` : ''}`);
        }
        try {
          const token2 = getAuthToken();
          const processedKeys: string[] = Array.isArray(data.processed) ? data.processed : [];
          // Only delete the records that were processed successfully, match on BILL
          const recordsToDelete = selectedRecords.filter((rec: any) => {
            const billNo = String(rec.bill || rec.BILL || '').trim();
            return billNo && processedKeys.includes(`P-${billNo}`);
          });
          if (recordsToDelete.length > 0) {
            const delResp = await fetch(`${baseUrl}/delete-approved-records`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token2}`
              },
              body: JSON.stringify({
                endpoint: 'purchases',
                records: recordsToDelete
              })
            });
            if (!delResp.ok) {
              const txt = await delResp.text();
              toast.error(`Could not remove synced records: ${txt}`);
            }
          }
        } catch (delErr: any) {
          toast.error(`Error removing synced records: ${delErr?.message || 'Unknown error'}`);
        }
      } else {
        const serverMsg = data?.message || data?.error || `Failed to sync purchases (HTTP ${response.status})`;
        toast.error(serverMsg);
      }
      if (tableRef.current) {
        await tableRef.current.refreshData();
      }
    } catch (error: any) {
      toast.error(`Error syncing to DBF: ${error?.message || 'Unknown error'}`);
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
          endpoint: 'purchases',
          records: selectedRecords
        })
      });
      const data = await response.json();
      if (data.success) {
        toast.success(`Successfully reverted ${selectedRecords.length} purchases to database`);
        if (tableRef.current) {
          await tableRef.current.refreshData();
        }
      } else {
        toast.error(data.message || 'Failed to revert purchases');
      }
    } catch (error: any) {
      toast.error(`Error reverting purchases: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsReverting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta title="Purchases Approved | FMCG Vite Admin Template" description="Approved purchases page" />
      <PageBreadcrumb pageTitle="Purchases Approved" />
      <div className="container mx-auto px-4 py-6 overflow-hidden">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Approved Purchases</h2>
            <div className="flex space-x-2">
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
                className={`px-4 py-2 rounded-md text-white ${isSyncing || selectedRecords.length === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {isSyncing ? 'Syncing...' : 'Sync to DBF'}
              </button>
            </div>
          </div>
          <DatabaseTable 
            ref={tableRef}
            endpoint="purchases" 
            tableId="purchases-approved" 
            onSelectionChange={handleRecordSelection}
            hideButtons={["print", "edit"]}
            hideApproveButton={true}
          />
        </div>
      </div>
    </div>
  );
};

export default PurchasesApproved;
