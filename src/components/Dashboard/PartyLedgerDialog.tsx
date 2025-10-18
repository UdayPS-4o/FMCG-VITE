import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../ui/modal';
import { FaPrint } from 'react-icons/fa';
import useAuth from '../../hooks/useAuth';
import constants from '../../constants';
import apiCache from '../../utils/apiCache';
import { PulseLoadAnimation } from '../ui/loading';

interface PartyOption {
  value: string;
  label: string;
}

interface CashEntry {
  DATE: string;
  REMARK: string;
  VR: string;
  CR: number;
  DR: number;
  C_CODE: string;
  AC_NAME: string;
}

interface CmplEntry {
  C_CODE: string;
  C_NAME: string;
}

interface BalanceEntry {
  partycode: string;
  result: string | number;
}

interface BalanceResponse {
  data: BalanceEntry[];
}

interface ReportData {
  date: string;
  narration: string;
  book: string;
  cr: number;
  dr: number;
  balance: number;
  balanceType: 'CR' | 'DR';
  isOpeningBalance?: boolean;
}

interface BalanceSlipData {
  billDate: string;
  narration: string;
  billNo: string;
  dr: number;
  billdr: number;
  days: number;
  balance: number;
  balanceType: 'CR' | 'DR';
}

interface BalanceSlipResponse {
  success: boolean;
  data: BalanceSlipData[];
  partyName: string;
  partyCode: string;
  finalBalance: number;
  totalPendingAmount: number;
}

interface PartyLedgerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  partyCode: string;
  partyName: string;
}

const PartyLedgerDialog: React.FC<PartyLedgerDialogProps> = ({
  isOpen,
  onClose,
  partyCode,
  partyName
}) => {
  const [reportData, setReportData] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(false);
  const [balanceSlipData, setBalanceSlipData] = useState<BalanceSlipData[]>([]);
  const [balanceSlipLoading, setBalanceSlipLoading] = useState(false);
  const [showBalanceSlip, setShowBalanceSlip] = useState(false);
  const [balanceSlipInfo, setBalanceSlipInfo] = useState<{ finalBalance: number; totalPendingAmount: number }>({ finalBalance: 0, totalPendingAmount: 0 });
  const { user } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);
  const balanceSlipPrintRef = useRef<HTMLDivElement>(null);
  
  // Date range state - default to Current FY
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Calculate Current FY dates
  useEffect(() => {
    const today = new Date();
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Financial Year: April 1 to March 31
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-based (0 = January, 3 = April)
    
    let fyStartYear, fyEndYear;
    if (currentMonth >= 3) { // April (3) to December (11)
      fyStartYear = currentYear;
      fyEndYear = currentYear + 1;
    } else { // January (0) to March (2)
      fyStartYear = currentYear - 1;
      fyEndYear = currentYear;
    }
    
    const fyStart = new Date(fyStartYear, 3, 1); // April 1
    const fyEnd = new Date(fyEndYear, 2, 31); // March 31
    setFromDate(formatDate(fyStart));
    setToDate(formatDate(fyEnd));
  }, []);

  // Generate report when dialog opens or dates change
  useEffect(() => {
    if (isOpen && partyCode && fromDate && toDate) {
      handleGenerateReport();
    }
  }, [isOpen, partyCode, fromDate, toDate]);

  // Generate report
  const handleGenerateReport = async () => {
    if (!partyCode || !fromDate || !toDate) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${constants.baseURL}/api/reports/party-ledger?fromDate=${fromDate}&toDate=${toDate}&partyCode=${partyCode}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.data) {
        // Convert the backend response to our ReportData format
        const reportItems: ReportData[] = result.data.map((item: any) => ({
          date: item.date,
          narration: item.narration,
          book: extractBookPrefix(item.book),
          cr: item.cr,
          dr: item.dr,
          balance: item.balance,
          balanceType: item.balanceType,
          isOpeningBalance: item.date === 'Opening Balance'
        }));
        
        setReportData(reportItems);
      } else {
        setReportData([]);
      }
    } catch (error) {
      console.error('Error generating report:', error);
    } finally {
      setLoading(false);
    }
  };

  // Format date to DD-MM-YYYY
  const formatDateToDDMMYYYY = (dateString: string) => {
    if (!dateString) return '';
    
    // If the string is already in DD-MM-YYYY format, return as is
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateString)) {
      return dateString;
    }
    
    // If it's in YYYY-MM-DD format, convert to DD-MM-YYYY
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [year, month, day] = dateString.split('-');
      return `${day}-${month}-${year}`;
    }
    
    // Fallback: try to parse as Date and format
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    }
    
    return dateString;
  };

  // Extract book prefix (e.g., "BR-001152" -> "BR")
  const extractBookPrefix = (book: string) => {
    if (!book) return book;
    const parts = book.split('-');
    return parts[0] || book;
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Handle Balance Slip
  const handleBalanceSlip = async () => {
    if (!partyCode) return;
    
    setBalanceSlipLoading(true);
    try {
      const response = await fetch(`${constants.baseURL}/api/reports/balance-slip?partyCode=${partyCode}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const result: BalanceSlipResponse = await response.json();
      
      if (result.success && result.data) {
        setBalanceSlipData(result.data);
        setBalanceSlipInfo({
          finalBalance: result.finalBalance,
          totalPendingAmount: result.totalPendingAmount
        });
        setShowBalanceSlip(true);
      }
    } catch (error) {
      console.error('Error generating balance slip:', error);
    } finally {
      setBalanceSlipLoading(false);
    }
  };

  // Print function
  const handlePrint = () => {
    if (printRef.current) {
      const printContent = printRef.current.innerHTML;
      const originalContent = document.body.innerHTML;
      
      document.body.innerHTML = printContent;
      window.print();
      document.body.innerHTML = originalContent;
      window.location.reload();
    }
  };

  // Print Balance Slip function
  const handlePrintBalanceSlip = () => {
    if (balanceSlipPrintRef.current) {
      const printContent = balanceSlipPrintRef.current.innerHTML;
      const originalContent = document.body.innerHTML;
      
      document.body.innerHTML = printContent;
      window.print();
      document.body.innerHTML = originalContent;
      window.location.reload();
    }
  };

  // Calculate totals
  const totals = reportData.reduce(
    (acc, item) => {
      if (!item.isOpeningBalance) {
        acc.totalCredit += item.cr;
        acc.totalDebit += item.dr;
      }
      return acc;
    },
    { totalCredit: 0, totalDebit: 0 }
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-6xl mx-4">
      <div className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Party Ledger Report</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded shadow mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Party</label>
              <div className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">
                {partyName} | {partyCode}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end space-x-2">
            <button
              onClick={handleBalanceSlip}
              disabled={balanceSlipLoading || !partyCode}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-green-300"
            >
              {balanceSlipLoading ? 'Loading...' : 'Balance Slip'}
            </button>
            <button
              onClick={handleGenerateReport}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-blue-300"
            >
              {loading ? 'Loading...' : 'Generate Report'}
            </button>
          </div>
        </div>

        {reportData.length > 0 && (
          <div className="bg-white dark:bg-gray-800 p-4 rounded shadow">
            <div className="flex justify-end mb-4 space-x-2">
              <button
                onClick={handlePrint}
                className="flex items-center bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
              >
                <FaPrint className="mr-1" /> Print
              </button>
            </div>

            <div ref={printRef} className="p-4">
              <div className="text-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Party Ledger Report</h2>
                <p className="text-gray-700 dark:text-gray-300">
                  Party: {partyName} | {partyCode}
                </p>
                <p className="text-gray-700 dark:text-gray-300">
                  Period: {formatDateToDDMMYYYY(fromDate)} to {formatDateToDDMMYYYY(toDate)}
                </p>
              </div>

              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="min-w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-700">
                      <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white">Date</th>
                      <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white">Narration</th>
                      <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white">Book</th>
                      <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">CR</th>
                      <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">DR</th>
                      <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">Balance</th>
                      <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-center text-gray-900 dark:text-white">Bal Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((item, index) => (
                      <tr key={index} className={item.isOpeningBalance ? 'bg-gray-50 dark:bg-gray-600 font-semibold' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}>
                        <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">{item.date}</td>
                        <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">{item.narration}</td>
                        <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">{item.book}</td>
                        <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">
                          {item.cr > 0 ? formatCurrency(item.cr) : ''}
                        </td>
                        <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">
                          {item.dr > 0 ? formatCurrency(item.dr) : ''}
                        </td>
                        <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">
                          {formatCurrency(Math.abs(item.balance))}
                        </td>
                        <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-center text-gray-900 dark:text-white">
                          {item.balanceType}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-100 dark:bg-gray-700 font-semibold">
                      <td colSpan={3} className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">Total</td>
                      <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">
                        {formatCurrency(totals.totalCredit)}
                      </td>
                      <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">
                        {formatCurrency(totals.totalDebit)}
                      </td>
                      <td colSpan={2} className="py-2 px-3 border border-gray-300 dark:border-gray-600"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex justify-center items-center py-8">
            <PulseLoadAnimation size="sm" />
            <span className="ml-2 text-gray-600 dark:text-gray-400">Loading report...</span>
          </div>
        )}

        {!loading && reportData.length === 0 && fromDate && toDate && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No data found for the selected period.
          </div>
        )}

        {/* Balance Slip Modal */}
        {showBalanceSlip && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Balance Slip</h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={handlePrintBalanceSlip}
                      className="flex items-center bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                    >
                      <FaPrint className="mr-1" /> Print
                    </button>
                    <button
                      onClick={() => setShowBalanceSlip(false)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div ref={balanceSlipPrintRef} className="p-4">
                  <div className="text-center mb-6">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">BALANCE SLIP</h2>
                    <p className="text-gray-700 dark:text-gray-300 mt-2">
                      Party: {partyName} ({partyCode})
                    </p>
                    <p className="text-gray-700 dark:text-gray-300">
                      Date: {new Date().toLocaleDateString('en-GB')}
                    </p>
                  </div>

                  {balanceSlipData.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600">
                        <thead>
                          <tr className="bg-gray-100 dark:bg-gray-700">
                            <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white">Bill Date</th>
                            <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white">Narration</th>
                            <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white">Bill No</th>
                            <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">DR</th>
                            <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">Bill DR</th>
                            <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">Days</th>
                            <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {balanceSlipData.map((item, index) => (
                            <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                              <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">{item.billDate}</td>
                              <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">{item.narration}</td>
                              <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">{item.billNo}</td>
                              <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">
                                {formatCurrency(item.dr)}
                              </td>
                              <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">
                                {formatCurrency(item.billdr)}
                              </td>
                              <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">{item.days}</td>
                              <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">
                                {formatCurrency(item.balance)} {item.balanceType}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-100 dark:bg-gray-700 font-semibold">
                            <td colSpan={3} className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">Total</td>
                            <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">
                              {formatCurrency(balanceSlipInfo.totalPendingAmount)}
                            </td>
                            <td colSpan={3} className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">
                              Final Balance: {formatCurrency(Math.abs(balanceSlipInfo.finalBalance))} {balanceSlipInfo.finalBalance >= 0 ? 'CR' : 'DR'}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      No pending bills found for this party.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default PartyLedgerDialog;