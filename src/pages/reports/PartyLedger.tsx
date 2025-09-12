import React, { useState, useEffect, useRef } from 'react';
import { FaPrint, FaFileInvoice } from 'react-icons/fa';
import useAuth from '../../hooks/useAuth';
import constants from '../../constants';
import apiCache from '../../utils/apiCache';

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

interface PendingBill {
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
  data: PendingBill[];
  partyName: string;
  partyCode: string;
  finalBalance: number;
  totalPendingAmount: number;
}

const PartyLedger: React.FC = () => {
  const [selectedParty, setSelectedParty] = useState<PartyOption | null>(null);
  const [partyOptions, setPartyOptions] = useState<PartyOption[]>([]);
  const [reportData, setReportData] = useState<ReportData[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);
  
  // Searchable dropdown state
  const [isPartyDropdownOpen, setIsPartyDropdownOpen] = useState(false);
  const [partySearchText, setPartySearchText] = useState('');
  const partyDropdownRef = useRef<HTMLDivElement>(null);

  // Date range options
  const dateRangeOptions = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'thisWeek', label: 'This Week' },
    { value: 'lastWeek', label: 'Last Week' },
    { value: 'thisMonth', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
    { value: 'currentFY', label: 'Current FY' },
    { value: 'thisYear', label: 'This Year' },
    { value: 'custom', label: 'Custom Range' }
  ];

  const [selectedDateRange, setSelectedDateRange] = useState('currentFY');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Balance Slip state
  const [showBalanceSlipDialog, setShowBalanceSlipDialog] = useState(false);
  const [pendingBills, setPendingBills] = useState<PendingBill[]>([]);
  const [balanceSlipLoading, setBalanceSlipLoading] = useState(false);
  const [balanceSlipData, setBalanceSlipData] = useState<BalanceSlipResponse | null>(null);
  const balanceSlipRef = useRef<HTMLDivElement>(null);

  // Calculate date range based on selection
  useEffect(() => {
    const today = new Date();
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    switch (selectedDateRange) {
      case 'today':
        setFromDate(formatDate(today));
        setToDate(formatDate(today));
        break;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        setFromDate(formatDate(yesterday));
        setToDate(formatDate(yesterday));
        break;
      case 'thisWeek':
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        setFromDate(formatDate(startOfWeek));
        setToDate(formatDate(today));
        break;
      case 'lastWeek':
        const lastWeekStart = new Date(today);
        lastWeekStart.setDate(today.getDate() - today.getDay() - 7);
        const lastWeekEnd = new Date(lastWeekStart);
        lastWeekEnd.setDate(lastWeekStart.getDate() + 6);
        setFromDate(formatDate(lastWeekStart));
        setToDate(formatDate(lastWeekEnd));
        break;
      case 'thisMonth':
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        setFromDate(formatDate(startOfMonth));
        setToDate(formatDate(today));
        break;
      case 'lastMonth':
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 1);
        setFromDate(formatDate(lastMonthStart));
        setToDate(formatDate(lastMonthEnd));
        break;
      case 'currentFY':
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
        break;
      case 'thisYear':
        const startOfYear = new Date(today.getFullYear(), 0, 1);
        setFromDate(formatDate(startOfYear));
        setToDate(formatDate(today));
        break;
      default:
        // Custom range - don't auto-set dates
        break;
    }
  }, [selectedDateRange]);

  // Load party options on component mount
  useEffect(() => {
    const fetchPartyOptions = async () => {
      try {
        // Fetch CMPL data for party options
        const cmplData = await apiCache.fetchWithCache<CmplEntry[]>(`${constants.baseURL}/cmpl`);
        // Fetch balance data
        const balanceData = await apiCache.fetchWithCache<BalanceResponse>(`${constants.baseURL}/json/balance`);

        // Create a balance lookup map
        const balanceMap = new Map<string, string | number>();
        if (balanceData && Array.isArray(balanceData.data)) {
          balanceData.data.forEach((item) => {
            balanceMap.set(item.partycode, item.result);
          });
        }

        // Check if user is admin
        const isAdmin = user && user.routeAccess && user.routeAccess.includes('Admin');

        // Filter parties (exclude C_CODE ending with "000")
        let filteredParties = cmplData ? cmplData.filter(p => !p.C_CODE.endsWith('000')) : [];

        if (!isAdmin && user && user.subgroups && user.subgroups.length > 0) {
          console.log(`Filtering parties by user's assigned subgroups`);
          const subgroupPrefixes = user.subgroups.map((sg: any) => 
            sg.subgroupCode.substring(0, 2).toUpperCase()
          );
          console.log(`User's subgroup prefixes: ${subgroupPrefixes.join(', ')}`);
          filteredParties = filteredParties.filter(p => {
            const partyPrefix = p.C_CODE.substring(0, 2).toUpperCase();
            return subgroupPrefixes.includes(partyPrefix);
          });
          console.log(`Filtered to ${filteredParties.length} parties based on user's subgroups`);
        } else if (isAdmin) {
          console.log('User is admin - showing all parties without filtering');
        }

        const partyList = filteredParties.map((party) => {
          // Get balance for this party
          const balance = balanceMap.get(party.C_CODE);
          
          // Check if balance is non-zero
          const hasNonZeroBalance = balance && balance.toString().trim() !== '0 CR' && balance.toString().trim() !== '0 DR';
          
          return {
            value: party.C_CODE,
            label: hasNonZeroBalance
              ? `${party.C_NAME} | ${party.C_CODE} / ${balance}`
              : `${party.C_NAME} | ${party.C_CODE}`,
          };
        });

        setPartyOptions(partyList);
      } catch (error) {
        console.error('Error fetching party options:', error);
      }
    };

    fetchPartyOptions();
  }, [user]);

  // Handle party dropdown outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (partyDropdownRef.current && !partyDropdownRef.current.contains(event.target as Node)) {
        setIsPartyDropdownOpen(false);
        setPartySearchText('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Filter party options based on search text
  const filteredPartyOptions = partyOptions.filter(option =>
    !partySearchText || option.label.toLowerCase().includes(partySearchText.toLowerCase())
  );

  // Handle party selection
  const handlePartySelect = (party: PartyOption) => {
    setSelectedParty(party);
    setIsPartyDropdownOpen(false);
    setPartySearchText('');
  };

  // Generate report
  const handleGenerateReport = async () => {
    if (!selectedParty) {
      alert('Please select a party');
      return;
    }

    if (!fromDate || !toDate) {
      alert('Please select date range');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${constants.baseURL}/api/reports/party-ledger?fromDate=${fromDate}&toDate=${toDate}&partyCode=${selectedParty.value}`, {
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
      alert('Error generating report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Parse date function
  const parseItemDate = (dateValue: string) => {
    if (!dateValue) return null;
    
    // Try ISO format first (YYYY-MM-DD)
    let date = new Date(dateValue);
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    // Try DD-MM-YYYY format
    const ddmmyyyy = dateValue.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (ddmmyyyy) {
      const [, day, month, year] = ddmmyyyy;
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    
    return null;
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

  // Balance Slip functions
  const handleBalanceSlip = async () => {
    if (!selectedParty) {
      alert('Please select a party');
      return;
    }

    setBalanceSlipLoading(true);
    try {
      const response = await fetch(`${constants.baseURL}/api/reports/balance-slip?partyCode=${selectedParty.value}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const result: BalanceSlipResponse = await response.json();
      
      if (result.success) {
        setBalanceSlipData(result);
        setPendingBills(result.data);
        setShowBalanceSlipDialog(true);
      } else {
        alert('No pending bills found for this party');
      }
    } catch (error) {
      console.error('Error generating balance slip:', error);
      alert('Error generating balance slip. Please try again.');
    } finally {
      setBalanceSlipLoading(false);
    }
  };

  // Print Balance Slip function
  const handlePrintBalanceSlip = () => {
    if (balanceSlipRef.current) {
      const printContent = balanceSlipRef.current.innerHTML;
      const originalContent = document.body.innerHTML;
      
      document.body.innerHTML = printContent;
      window.print();
      document.body.innerHTML = originalContent;
      window.location.reload();
    }
  };

  // Close Balance Slip Dialog
  const closeBalanceSlipDialog = () => {
    setShowBalanceSlipDialog(false);
    setBalanceSlipData(null);
    setPendingBills([]);
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
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Party Ledger Report</h1>

      <div className="bg-white dark:bg-gray-800 p-4 rounded shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Party Name</label>
            <div className="relative" ref={partyDropdownRef}>
              <div 
                onClick={() => setIsPartyDropdownOpen(!isPartyDropdownOpen)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center flex-1">
                   <input
                     type="text"
                     placeholder={selectedParty && !partySearchText ? "" : "Search and select party..."}
                     value={partySearchText || (selectedParty && !isPartyDropdownOpen ? selectedParty.label : '')}
                     onChange={(e) => {
                       setPartySearchText(e.target.value);
                       setIsPartyDropdownOpen(true);
                     }}
                     onClick={(e) => {
                       e.stopPropagation();
                       setIsPartyDropdownOpen(true);
                     }}
                     onFocus={() => {
                       if (selectedParty) {
                         setPartySearchText('');
                       }
                     }}
                     className="w-full bg-transparent border-0 outline-none text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                   />
                 </div>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${isPartyDropdownOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              
              {isPartyDropdownOpen && (
                <div className="absolute z-50 w-full max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md mt-1 shadow-lg">
                  {filteredPartyOptions.length > 0 ? (
                    filteredPartyOptions.map((option) => (
                      <div
                        key={option.value}
                        onClick={() => handlePartySelect(option)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-600 last:border-b-0"
                      >
                        {option.label}
                      </div>
                    ))
                  ) : (
                    <div className="p-2 text-gray-500 dark:text-gray-400 text-center">
                      No parties found
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date Range</label>
            <select
              value={selectedDateRange}
              onChange={(e) => setSelectedDateRange(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {dateRangeOptions.map(option => (
                <option key={option.value} value={option.value} className="bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              disabled={selectedDateRange !== 'custom'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              disabled={selectedDateRange !== 'custom'}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={handleGenerateReport}
            disabled={loading || !selectedParty}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
          
          <button
            onClick={handleBalanceSlip}
            disabled={balanceSlipLoading || !selectedParty}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <FaFileInvoice />
            {balanceSlipLoading ? 'Loading...' : 'Balance Slip'}
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
                Party: {selectedParty?.label}
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                Period: {formatDateToDDMMYYYY(fromDate)} to {formatDateToDDMMYYYY(toDate)}
              </p>
            </div>

            <div className="overflow-x-auto">
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
                        {item.cr > 0 ? formatCurrency(item.cr) : '-'}
                      </td>
                      <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">
                        {item.dr > 0 ? formatCurrency(item.dr) : '-'}
                      </td>
                      <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">
                        {formatCurrency(item.balance)}
                      </td>
                      <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-center text-gray-900 dark:text-white">
                        {item.balanceType}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-bold bg-gray-100 dark:bg-gray-700">
                    <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" colSpan={3}>Total</td>
                    <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">{formatCurrency(totals.totalCredit)}</td>
                    <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">{formatCurrency(totals.totalDebit)}</td>
                    <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">{formatCurrency(reportData[reportData.length - 1]?.balance || 0)}</td>
                    <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-center text-gray-900 dark:text-white">{reportData[reportData.length - 1]?.balanceType || 'CR'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Balance Slip Dialog */}
      {showBalanceSlipDialog && balanceSlipData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Balance Slip</h2>
              <div className="flex gap-2">
                <button
                  onClick={handlePrintBalanceSlip}
                  className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 flex items-center gap-1"
                >
                  <FaPrint /> Print
                </button>
                <button
                  onClick={closeBalanceSlipDialog}
                  className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div ref={balanceSlipRef} className="print-content">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold">BALANCE SLIP</h1>
                <div className="mt-2">
                  <p><strong>Party:</strong> {balanceSlipData.partyName} ({balanceSlipData.partyCode})</p>
                  <p><strong>Date:</strong> {new Date().toLocaleDateString('en-GB')}</p>
                </div>
              </div>
              
              {pendingBills.length > 0 ? (
                <>
                  <table className="w-full border-collapse border border-gray-300 mb-4">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-2 py-1 text-left">Bill Date</th>
                        <th className="border border-gray-300 px-2 py-1 text-left">Narration</th>
                        <th className="border border-gray-300 px-2 py-1 text-left">Bill No</th>
                        <th className="border border-gray-300 px-2 py-1 text-right">Dr</th>
                        <th className="border border-gray-300 px-2 py-1 text-right">BillDr</th>
                        <th className="border border-gray-300 px-2 py-1 text-center">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingBills.map((bill) => (
                        <tr key={bill.billNo}>
                          <td className="border border-gray-300 px-2 py-1">{bill.billDate}</td>
                          <td className="border border-gray-300 px-2 py-1">{bill.narration}</td>
                          <td className="border border-gray-300 px-2 py-1">{bill.billNo}</td>
                          <td className="border border-gray-300 px-2 py-1 text-right font-semibold">{formatCurrency(bill.dr)}</td>
                          <td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(bill.billdr)}</td>
                          <td className="border border-gray-300 px-2 py-1 text-center">{bill.days}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-100 font-bold">
                        <td colSpan={5} className="border border-gray-300 px-2 py-1 text-right">Total Pending:</td>
                        <td className="border border-gray-300 px-2 py-1 text-right">{formatCurrency(balanceSlipData.totalPendingAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">No pending bills found for this party.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartyLedger;