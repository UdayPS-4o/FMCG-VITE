import React, { useState, useRef, useEffect } from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import DatabaseTable from "../../components/tables/DatabaseTable";
import { toast } from 'react-toastify';
import constants from '../../constants';
const baseUrl = constants.baseURL;

interface SyncTransaction {
  billNo: string;
  billDate: string;
  partyName: string;
  totalAmount: number;
  salesmanName: string;
}

interface SyncHistory {
  datetime: string;
  transactions: SyncTransaction[];
}

const InvoicingApproved: React.FC = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState<any[]>([]);
  const [syncHistory, setSyncHistory] = useState<SyncHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedTransactions, setSelectedTransactions] = useState<SyncTransaction[]>([]);
  const [showTransactions, setShowTransactions] = useState(false);
  const tableRef = useRef<{ refreshData: () => Promise<void> }>(null);

  useEffect(() => {
    const history = localStorage.getItem('syncHistory');
    if (history) {
      try {
        const parsedHistory = JSON.parse(history);
        
        // Check if the history is in the old format (array of individual transactions)
        // and convert it to the new format if needed
        if (parsedHistory.length > 0 && 'billNo' in parsedHistory[0]) {
          // Old format - convert to new format
          const convertedHistory: SyncHistory[] = [{
            datetime: new Date().toLocaleString('en-US', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true
            }).replace(/,/g, ''),
            transactions: parsedHistory.map((record: any) => ({
              billNo: record.billNo,
              billDate: record.billDate,
              partyName: record.partyName,
              totalAmount: record.totalAmount,
              salesmanName: record.salesmanName
            }))
          }];
          setSyncHistory(convertedHistory);
        } else {
          // New format - use as is
          setSyncHistory(parsedHistory);
        }
      } catch (error) {
        console.error('Error parsing sync history:', error);
        setSyncHistory([]);
      }
    }
  }, []);

  const handleRecordSelection = (records: any[]) => {
    setSelectedRecords(records);
  };

  const getAuthToken = () => {
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
  };

  const updateSyncHistory = (records: any[]) => {
    // Format current date and time in DD-MM-YYYY, HH:MM:SS AM/PM format
    const currentDateTime = new Date().toLocaleString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).replace(/,/g, '');
    
    // Create transaction records for each synced invoice
    const transactions: SyncTransaction[] = records.map(record => ({
      billNo: record.series + '-' + record.billNo,
      billDate: record.date,
      partyName: record.partyName || record.party,
      totalAmount: parseFloat(record.total || '0'),
      salesmanName: record.salesmanName || record.smName || record.sm || ''
    }));
    
    // Create a new sync history entry with the current date/time and all transactions
    const newEntry: SyncHistory = {
      datetime: currentDateTime,
      transactions: transactions
    };

    // Keep all sync operations (no limit)
    const updatedHistory = [newEntry, ...syncHistory];
    setSyncHistory(updatedHistory);
    localStorage.setItem('syncHistory', JSON.stringify(updatedHistory));
  };

  const handleSyncToDbf = async () => {
    if (selectedRecords.length === 0) {
      toast.warning('Please select at least one record to sync');
      return;
    }

    try {
      setIsSyncing(true);
      const token = getAuthToken();
      
      const response = await fetch(`${baseUrl}/api/merge/invoicing/sync`, {
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
        updateSyncHistory(selectedRecords);
        let syncMessage = `Successfully synced ${data.processed.length} invoices.`;
        if (data.messagesAttempted > 0) {
          syncMessage += ` ${data.messagesSent} of ${data.messagesAttempted} PDF messages sent.`;
        } else if (data.processed.length > 0) {
          syncMessage += ` No PDF messages attempted.`;
        }
        if (data.messagesSkippedPdfNotFound > 0) {
          syncMessage += ` ${data.messagesSkippedPdfNotFound} PDFs not found.`;
        }
        if (data.messagesSkippedNoMobile > 0) {
          syncMessage += ` ${data.messagesSkippedNoMobile} entries lacked mobile numbers for PDF sending.`;
        }
        toast.success(syncMessage);
        
        if (data.skipped && data.skipped.length > 0) {
          toast.warning(`${data.skipped.length} invoices were skipped (possible duplicates)`);
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
              endpoint: 'invoicing',
              records: selectedRecords.filter(record => 
                data.processed.includes(`${record.series}-${record.billNo}`)
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
        toast.error(data.message || 'Failed to sync invoices');
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
          endpoint: 'invoicing',
          records: selectedRecords
        })
      });
      
      const data = await response.json();

      if (data.success) {
        toast.success(`Successfully reverted ${selectedRecords.length} invoices to database`);
        // Refresh the data
        if (tableRef.current) {
          await tableRef.current.refreshData();
        }
      } else {
        toast.error(data.message || 'Failed to revert invoices');
      }
    } catch (error) {
      console.error('Error reverting invoices:', error);
      toast.error('Error reverting invoices. Check console for details.');
    } finally {
      setIsReverting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta
        title="Invoicing Approved | FMCG Vite Admin Template"
        description="Invoicing Approved page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Invoicing Approved" />
      
      <div className="container mx-auto px-4 py-6 overflow-hidden">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Invoicing Approved Data</h2>
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
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowHistory(true)}
                  className="p-2 text-gray-600 hover:text-blue-600 focus:outline-none"
                  title="View Sync History"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
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
          </div>
          <DatabaseTable 
            ref={tableRef}
            endpoint="invoicing" 
            tableId="invoicing-approved" 
            onSelectionChange={handleRecordSelection}
            hideButtons={['print', 'edit']}
            hideApproveButton={true}
          />
        </div>
      </div>

      <div
        className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1100] ${showHistory ? '' : 'hidden'}`}
        onClick={() => setShowHistory(false)}
      >
        <div
          className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg max-w-6xl w-full mx-4 ml-[260px] md:ml-4 max-h-[80vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Sync History</h2>
            <button
              onClick={() => setShowHistory(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <span className="text-2xl">&times;</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto border-collapse">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Sync Date & Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Transactions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {syncHistory.map((record, index) => (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{record.datetime}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                      <button 
                        className="cursor-pointer text-blue-500 hover:text-blue-700 underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTransactions(record.transactions);
                          setShowTransactions(true);
                        }}
                      >
                        {record.transactions.length} invoice(s) synced
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Transaction Details Modal */}
      <div
        className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1200] ${showTransactions ? '' : 'hidden'}`}
        onClick={() => setShowTransactions(false)}
      >
        <div
          className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg max-w-6xl w-full mx-4 ml-[260px] md:ml-4 max-h-[80vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Transaction Details</h2>
            <button
              onClick={() => setShowTransactions(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <span className="text-2xl">&times;</span>
            </button>
          </div>
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="min-w-full table-auto border-collapse">
              <thead className="sticky top-0 bg-white dark:bg-gray-800">
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Bill No</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Bill Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Party Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Total Amount</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Salesman</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {selectedTransactions.map((transaction, tIndex) => (
                  <tr key={tIndex} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{transaction.billNo}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{transaction.billDate}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{transaction.partyName}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{transaction.totalAmount}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{transaction.salesmanName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoicingApproved;