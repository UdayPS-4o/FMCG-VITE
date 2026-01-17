import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import constants from '../../constants';
import Autocomplete from '../../components/ui/autocomplete/Autocomplete';
import useAuth from '../../hooks/useAuth';

interface PendingTransaction {
  id: number;
  txnNo: string;
  date: string;
  narration: string;
  drAmount: number;
  crAmount: number;
  partyCode: string;
  partyName: string;
  matchReason?: string;
}

interface PartyOption {
  value: string;
  label: string;
}

const PNBStatement: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([]);
  const [partyOptions, setPartyOptions] = useState<PartyOption[]>([]);
  
  // Fetch pending transactions
  const fetchPending = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${constants.baseURL}/api/reports/pnb-statement/pending`);
      setPendingTransactions(response.data.pendingTransactions);
      setPartyOptions(response.data.parties);
      if (response.data.pendingTransactions.length === 0) {
        toast.info('No pending transactions found.');
      }
    } catch (error: any) {
        console.error('Error fetching pending:', error);
        toast.error(error.response?.data?.message || 'Failed to fetch pending transactions');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await axios.post(`${constants.baseURL}/api/reports/pnb-statement/download`);
      toast.success('Download started. Please wait a moment before checking for transactions.');
      // Wait 10s then fetch
      setTimeout(fetchPending, 10000); 
    } catch (error: any) {
      console.error('Download error:', error);
      toast.error('Failed to trigger download');
    } finally {
      setDownloading(false);
    }
  };

  const handlePartyChange = (id: number, code: string, name: string) => {
    setPendingTransactions(prev => prev.map(t => 
      t.id === id ? { ...t, partyCode: code, partyName: name } : t
    ));
  };

  const handleSave = async () => {
    // Validate
    const invalid = pendingTransactions.some(t => !t.partyCode);
    if (invalid) {
      toast.error('Please select a party for all transactions.');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${constants.baseURL}/api/reports/pnb-statement/save`, {
        transactions: pendingTransactions
      });
      toast.success(response.data.message);
      setPendingTransactions([]); // Clear list
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error('Failed to save transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch only if not admin check logic blocks it?
    // user might be null initially
    if (user) fetchPending();
  }, [user]);

  // Access Control
  if (user && user.role !== 'admin' && !user.routeAccess?.includes('Admin')) {
       return <div className="p-4 text-red-500">Access Denied: Admin only area.</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">PNB Bank Statement Reconciliation</h1>
        <div className="space-x-2">
            <button
                onClick={handleDownload}
                disabled={downloading}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
            >
                {downloading ? 'Downloading...' : 'Download Statement'}
            </button>
            <button
                onClick={fetchPending}
                disabled={loading}
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors"
            >
                Refresh
            </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-4 rounded shadow overflow-x-auto">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">Pending Transactions</h2>
        
        {loading ? (
            <div className="text-center py-4 text-gray-600 dark:text-gray-400">Loading transactions...</div>
        ) : pendingTransactions.length === 0 ? (
            <div className="text-center py-4 text-gray-500">No pending transactions to reconcile.</div>
        ) : (
            <>
            <div className="overflow-x-auto">
                <table className="min-w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600">
                    <thead>
                        <tr className="bg-gray-100 dark:bg-gray-700">
                            <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-sm font-semibold text-gray-700 dark:text-gray-200">Txn No</th>
                            <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-sm font-semibold text-gray-700 dark:text-gray-200">Date</th>
                            <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-sm font-semibold text-gray-700 dark:text-gray-200">Narration</th>
                            <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-sm font-semibold text-gray-700 dark:text-gray-200">Dr Amount</th>
                            <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-sm font-semibold text-gray-700 dark:text-gray-200">Cr Amount</th>
                            <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left w-64 text-sm font-semibold text-gray-700 dark:text-gray-200">Party</th>
                            <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-sm font-semibold text-gray-700 dark:text-gray-200">Match Info</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pendingTransactions.map((txn) => (
                            <tr key={txn.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-sm">{txn.txnNo}</td>
                                <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-sm">{txn.date}</td>
                                <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-xs">{txn.narration}</td>
                                <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-sm">{txn.drAmount ? txn.drAmount.toFixed(2) : '-'}</td>
                                <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-sm">{txn.crAmount ? txn.crAmount.toFixed(2) : '-'}</td>
                                <td className="py-2 px-3 border border-gray-300 dark:border-gray-600">
                                    <Autocomplete
                                        id={`party-${txn.id}`}
                                        label="Select Party"
                                        options={partyOptions}
                                        defaultValue={txn.partyName}
                                        onChange={(code) => {
                                            const party = partyOptions.find(p => p.value === code);
                                            handlePartyChange(txn.id, code, party ? party.label : '');
                                        }}
                                    />
                                </td>
                                <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-xs text-green-600 font-medium">
                                    {txn.matchReason}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-4 flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={pendingTransactions.some(t => !t.partyCode) || loading}
                    className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
                >
                    Save Transactions
                </button>
            </div>
            </>
        )}
      </div>
    </div>
  );
};

export default PNBStatement;
