import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import constants from '../../constants';
import DatePicker from '../../components/form/input/DatePicker';
import MultiSelect from '../../components/form/MultiSelect';
import useAuth from '../../hooks/useAuth';
import { format, subDays } from 'date-fns';
import { FaFilePdf, FaPrint } from 'react-icons/fa';
import { useReactToPrint } from 'react-to-print';

// Define date range options
const dateRangeOptions = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7days', label: 'Last 7 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'currentFY', label: 'Current FY' },
  { value: 'custom', label: 'Custom Range' },
];

interface CashBookItem {
  date: string;
  narration: string;
  credit: number;
  debit: number;
  balance: number;
  isOpeningBalance?: boolean;
  vr?: string;
  br_code?: string;
  c_code?: string;
  party_name?: string;
}

interface SalesmanOption {
  value: string;
  text: string;
}

// Define User type, similar to ItemWiseSales.tsx and AddUser.tsx
interface User {
  id: number;
  name: string;
  username: string;
  routeAccess: string[];
  powers: string[];
  subgroups: any[];
  smCode?: string;
  defaultSeries?: { 
    billing?: string;
    cashReceipt?: string;
    cashPayment?: string;
    godown?: string;
    reports?: string; 
  };
  godownAccess: string[];
  canSelectSeries?: boolean;
}

const CashBook: React.FC = () => {
  const { user } = useAuth();
  const [selectedDateRange, setSelectedDateRange] = useState<string>('thisMonth');
  const [fromDate, setFromDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [salesmen, setSalesmen] = useState<string[]>([]);
  const [series, setSeries] = useState<string>('');
  const [openingBalance, setOpeningBalance] = useState<string>('0.00');
  const [reportData, setReportData] = useState<CashBookItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [salesmenOptions, setSalesmenOptions] = useState<SalesmanOption[]>([]);

  const printRef = React.useRef<HTMLDivElement>(null);

  // Function to format date as YYYY-MM-DD
  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Handle date range selection
  useEffect(() => {
    const today = new Date();
    const yesterday = subDays(today, 1);
    const last7Days = subDays(today, 7);
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    switch (selectedDateRange) {
      case 'today':
        setFromDate(formatDate(today));
        setToDate(formatDate(today));
        break;
      case 'yesterday':
        setFromDate(formatDate(yesterday));
        setToDate(formatDate(yesterday));
        break;
      case 'last7days':
        setFromDate(formatDate(last7Days));
        setToDate(formatDate(today));
        break;
      case 'thisMonth':
        setFromDate(formatDate(thisMonthStart));
        setToDate(formatDate(today));
        break;
      case 'lastMonth':
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
      case 'custom':
        // Keep custom range as is
        break;
    }
  }, [selectedDateRange]);

  // Fetch salesmen options
  useEffect(() => {
    const fetchSalesmenData = async () => {
      try {
        // Fetch from /cmpl endpoint to get salesman options
        const response = await axios.get(`${constants.baseURL}/cmpl`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        // Filter for salesman entries (starting with 'SM' and not ending with '000')
        const salesmenData = response.data.filter((item: any) => 
          item.C_CODE && item.C_CODE.startsWith('SM') && !item.C_CODE.endsWith('000')
        );
        
        // Format the data to match expected structure
        const formattedSalesmen = salesmenData.map((item: any) => ({
          value: item.C_CODE,
          text: `${item.C_NAME} | ${item.C_CODE}`
        }));
        
        setSalesmenOptions(formattedSalesmen);
      } catch (error) {
        console.error('Error fetching salesmen data:', error);
        toast.error('Failed to load salesmen data');
      }
    };

    fetchSalesmenData();
   }, []);

  // Apply default series from user settings
  useEffect(() => {
    if (user) {
      const isAdmin = user.routeAccess && user.routeAccess.includes('Admin');
      if (!isAdmin && user.defaultSeries && user.defaultSeries.reports && user.canSelectSeries === false) {
        setSeries(user.defaultSeries.reports);
      }
    }
  }, [user]);

  const handleFetchReport = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${constants.baseURL}/api/reports/cash-book`, {
        params: {
          fromDate,
          toDate,
          salesmen: salesmen.join(','),
          openingBalance,
          series
        }
      });
      setReportData(response.data);
    } catch (error) {
      console.error('Error fetching cash book report:', error);
      toast.error('Failed to load cash book report');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: 'Cash Book Report',
  });

  const handleOpeningBalanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only numbers and up to 2 decimal places
    const value = e.target.value;
    const regex = /^\d*\.?\d{0,2}$/;
    if (regex.test(value) || value === '') {
      setOpeningBalance(value);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

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
    
    return dateString; // Return original if all parsing fails
  };

  // Convert YYYY-MM-DD to DD-MM-YYYY for display
  const convertToDisplayFormat = (dateString: string) => {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-');
    return `${day}-${month}-${year}`;
  };

  // Convert DD-MM-YYYY to YYYY-MM-DD for internal use
  const convertFromDisplayFormat = (dateString: string) => {
    if (!dateString) return '';
    const [day, month, year] = dateString.split('-');
    return `${year}-${month}-${day}`;
  };

  // Calculate totals
  const totals = reportData.reduce(
    (acc, item) => {
      if (!item.isOpeningBalance) {
        acc.totalCredit += item.credit;
        acc.totalDebit += item.debit;
      }
      return acc;
    },
    { totalCredit: 0, totalDebit: 0 }
  );

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Cash Book Report</h1>

      <div className="bg-white dark:bg-gray-800 p-4 rounded shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Salesman (BR_CODE)</label>
            <MultiSelect
              label=""
              options={salesmenOptions.map(option => ({
                text: option.text,
                value: option.value
              }))}
              value={salesmen}
              onChange={(values) => setSalesmen(values)}
              allowFiltering={true}
              selectOnEnter={true}
              matchThreshold={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Opening Balance (CR)</label>
            <input
              type="text"
              value={openingBalance}
              onChange={handleOpeningBalanceChange}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Series</label>
            <input
              type="text"
              value={series}
              onChange={(e) => {
                const value = e.target.value.toUpperCase();
                // Allow only alphabets and commas
                if (/^[A-Z,]*$/.test(value)) {
                  setSeries(value);
                }
              }}
              placeholder="e.g., A,B,K"
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              disabled={Boolean(user && !user.routeAccess?.includes('Admin') && user.canSelectSeries === false && user.defaultSeries?.reports)}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleFetchReport}
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
            <style>
              {`
                @media print {
                  .cash-book-print {
                    font-size: 10px !important;
                    line-height: 1.2 !important;
                  }
                  .cash-book-print h2 {
                    font-size: 16px !important;
                    margin-bottom: 8px !important;
                  }
                  .cash-book-print p {
                    font-size: 12px !important;
                    margin-bottom: 12px !important;
                  }
                  .cash-book-print table {
                    border-collapse: collapse !important;
                    width: 100% !important;
                    margin: 0 !important;
                  }
                  .cash-book-print th,
                  .cash-book-print td {
                    padding: 2px 4px !important;
                    font-size: 9px !important;
                    line-height: 1.1 !important;
                    border: 0.5px solid #000 !important;
                    vertical-align: top !important;
                  }
                  .cash-book-print th {
                    background-color: #f0f0f0 !important;
                    font-weight: bold !important;
                    padding: 3px 4px !important;
                  }
                  .cash-book-print .total-row {
                    font-weight: bold !important;
                    background-color: #f5f5f5 !important;
                  }
                  .cash-book-print .opening-balance-row {
                    font-weight: bold !important;
                    background-color: #f8f8f8 !important;
                  }
                  @page {
                    margin: 0.5in !important;
                    size: A4 !important;
                  }
                }
              `}
            </style>
            <div className="cash-book-print">
              <div className="text-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Cash Book Report</h2>
                <p className="text-gray-700 dark:text-gray-300">
                  Period: {formatDateToDDMMYYYY(fromDate)} to {formatDateToDDMMYYYY(toDate)}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-700">
                      <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white">Date</th>
                      <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white">Narration (Remark)</th>
                      <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white">Party Name (Party Code)</th>
                      <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">Credit (CR)</th>
                      <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">Debit (DR)</th>
                      <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">Balance (CR-DR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((item, index) => (
                      <tr key={index} className={item.isOpeningBalance ? 'bg-gray-50 dark:bg-gray-600 font-semibold opening-balance-row' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}>
                        <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">{item.isOpeningBalance ? formatDateToDDMMYYYY(fromDate) : formatDateToDDMMYYYY(item.date)}</td>
                        <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">{item.narration}</td>
                        <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">{item.party_name && item.c_code ? `${item.party_name} (${item.c_code})` : (item.party_name || item.c_code || '-')}</td>
                        <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">
                          {item.credit > 0 ? formatCurrency(item.credit) : '-'}
                        </td>
                        <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">
                          {item.debit > 0 ? formatCurrency(item.debit) : '-'}
                        </td>
                        <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">
                          {formatCurrency(item.balance)}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-bold bg-gray-100 dark:bg-gray-700 total-row">
                      <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white" colSpan={3}>Total</td>
                      <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">{formatCurrency(totals.totalCredit)}</td>
                      <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">{formatCurrency(totals.totalDebit)}</td>
                      <td className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">{formatCurrency(reportData[reportData.length - 1]?.balance || 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashBook;