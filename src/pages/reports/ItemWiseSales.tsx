import React, { useState, useEffect, useRef } from 'react';
import Autocomplete, { AutocompleteRefHandle } from '../../components/form/input/Autocomplete'; // Restored Autocomplete import
import MultiSelect from '../../components/form/MultiSelect'; // Import MultiSelect
import Input from '../../components/form/input/Input';
import { useInvoiceContext } from '../../contexts/InvoiceContext';
import InvoiceProvider from '../../contexts/InvoiceProvider';
import constants from '../../constants';

// Define the structure of a sales report item
interface SalesReportItem {
  Date: string;
  Code: string;
  ItemName: string;
  Party: string;
  Place: string;
  Unit: string;
  Qty: number;
  Free: number;
  Gross: number;
  Scheme: number;
  SchPct: number;
  CD: number;
  NetAmt: number;
  GoodsAmt: number;
  GSTAmt: number;
  FreeV: number;
  Series: string;
  BillNo: string | number;
}

// Define a simple Option type for party selection state
interface PartyOptionType {
  value: string;
  label: string;
}

// Define option types for dynamic filters
interface DynamicItemOption {
  value: string;
  text: string; // For MultiSelect
}
interface DynamicPartyOption {
  value: string;
  label: string; // For Autocomplete
}

// Define User type, similar to Invoicing.tsx and AddUser.tsx
interface User {
  id: number;
  name: string;
  username: string;
  routeAccess: string[];
  powers: string[];
  subgroups: any[]; // Adjust as per actual SubGroup structure if needed
  smCode?: string;
  defaultSeries?: { billing?: string };
  godownAccess: string[];
  canSelectSeries?: boolean;
}

// Define date range options
const dateRangeOptions = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7days', label: 'Last 7 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'custom', label: 'Custom Range' },
];

// Content component that uses the context
const ItemWiseSalesContent: React.FC = () => {
  const [selectedDateRange, setSelectedDateRange] = useState<string>('thisMonth');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  // const [selectedItem, setSelectedItem] = useState<any | null>(null); // Old single item state
  const [selectedItemCodes, setSelectedItemCodes] = useState<string[]>([]); // New state for multiple item codes
  const [reportData, setReportData] = useState<SalesReportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seriesFilter, setSeriesFilter] = useState<string>('');
  const [selectedParty, setSelectedParty] = useState<PartyOptionType | null>(null); // New state for selected party object

  // State for dynamic filter options
  const [dynamicItemOptions, setDynamicItemOptions] = useState<DynamicItemOption[]>([]);
  const [dynamicPartyOptions, setDynamicPartyOptions] = useState<DynamicPartyOption[]>([]);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);
  const [filterOptionsError, setFilterOptionsError] = useState<string | null>(null);

  const { pmplData, partyOptions: contextPartyOptions } = useInvoiceContext(); 
  // const itemAutocompleteRef = useRef<AutocompleteRefHandle>(null); // Not for MultiSelect
  const [user, setUser] = useState<User | null>(null);

  // Refs for abort controllers
  const fetchOptionsAbortControllerRef = useRef<AbortController | null>(null);
  const fetchReportAbortControllerRef = useRef<AbortController | null>(null);

  // Refs to track previous date values to determine if dates actually changed
  const prevFromDateRef = useRef<string | undefined>(undefined);
  const prevToDateRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse user data from localStorage", e);
      }
    }
  }, []);

  // Apply default series from user settings
  useEffect(() => {
    if (user) {
      const isAdmin = user.routeAccess && user.routeAccess.includes('Admin');
      if (!isAdmin && user.defaultSeries && user.defaultSeries.billing && user.canSelectSeries === false) {
        setSeriesFilter(user.defaultSeries.billing);
      }
    }
  }, [user]);

  // Effect to fetch dynamic filter options when dates change or party changes
  useEffect(() => {
    const actualDatesChanged = fromDate !== prevFromDateRef.current || toDate !== prevToDateRef.current;

    if (actualDatesChanged) {
      prevFromDateRef.current = fromDate;
      prevToDateRef.current = toDate;

      if (selectedParty) {
        setSelectedParty(null);
      }
      setSelectedItemCodes([]); // Ensure called with []
      
      if (selectedParty) return; 
    }

    if (fromDate && toDate) {
      if (fetchOptionsAbortControllerRef.current) {
        fetchOptionsAbortControllerRef.current.abort();
      }
      fetchOptionsAbortControllerRef.current = new AbortController();
      const signal = fetchOptionsAbortControllerRef.current.signal;

      setFilterOptionsLoading(true);
      setFilterOptionsError(null);
      
      if(actualDatesChanged || selectedParty){
        setSelectedItemCodes([]); // Ensure called with []
      }

      const fetchOptions = async () => {
        try {
          const params = new URLSearchParams({ fromDate, toDate });
          if (selectedParty && selectedParty.value) {
            params.append('partyCode', selectedParty.value);
          }

          const response = await fetch(`${constants.baseURL}/api/reports/filter-options?${params.toString()}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`,
            },
            signal,
          });

          if (signal.aborted) return;
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const data = await response.json();
          if (signal.aborted) return;

          setDynamicItemOptions(data.itemOptions || []);

          if (!selectedParty || actualDatesChanged) {
            setDynamicPartyOptions(data.partyOptions || []);
          }

        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.error("Error fetching filter options:", err);
            setFilterOptionsError(err.message);
            setDynamicItemOptions([]); // Ensure called with []
            if (!selectedParty || actualDatesChanged) {
               setDynamicPartyOptions([]); // Ensure called with []
            }
          }
        } finally {
          if (!signal.aborted) {
            setFilterOptionsLoading(false);
          }
        }
      };

      fetchOptions();

      return () => {
        if (fetchOptionsAbortControllerRef.current) {
          fetchOptionsAbortControllerRef.current.abort();
        }
      };
    } else {
      // This block is critical for clearing when dates are invalid
      setDynamicItemOptions([]); // Ensure called with []
      setDynamicPartyOptions([]); // Ensure called with []
      setSelectedItemCodes([]); // Ensure called with []
      if (selectedParty) setSelectedParty(null);

      prevFromDateRef.current = undefined;
      prevToDateRef.current = undefined;
    }
  }, [fromDate, toDate, selectedParty, setSelectedParty, setSelectedItemCodes, setDynamicItemOptions, setDynamicPartyOptions]);

  // Function to format date as YYYY-MM-DD
  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  // Effect to set initial and update dates based on selectedDateRange
  useEffect(() => {
    const today = new Date();
    let newFromDate = '';
    let newToDate = '';

    switch (selectedDateRange) {
      case 'today':
        newFromDate = formatDate(today);
        newToDate = formatDate(today);
        break;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        newFromDate = formatDate(yesterday);
        newToDate = formatDate(yesterday);
        break;
      case 'last7days':
        const last7Days = new Date(today);
        last7Days.setDate(today.getDate() - 6); // Includes today
        newFromDate = formatDate(last7Days);
        newToDate = formatDate(today);
        break;
      case 'thisMonth':
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        newFromDate = formatDate(firstDayOfMonth);
        newToDate = formatDate(today);
        break;
      case 'lastMonth':
        const firstDayOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        newFromDate = formatDate(firstDayOfLastMonth);
        newToDate = formatDate(lastDayOfLastMonth);
        break;
      case 'custom':
        // For custom, we don't override, allow manual input.
        // If fromDate and toDate are empty, set to default (e.g. this month)
        if (!fromDate || !toDate) {
            const firstDayThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            setFromDate(formatDate(firstDayThisMonth));
            setToDate(formatDate(today));
        }
        return; // Exit early for custom if dates are already set.
      default:
        // Default to "This Month"
        const defaultFirstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        newFromDate = formatDate(defaultFirstDay);
        newToDate = formatDate(today);
    }
    setFromDate(newFromDate);
    setToDate(newToDate);
  }, [selectedDateRange]);

  const handleFetchReport = async () => {
    if (!fromDate || !toDate) {
      alert('Please select both From Date and To Date.');
      return;
    }
    if (fetchReportAbortControllerRef.current) {
      fetchReportAbortControllerRef.current.abort();
    }
    fetchReportAbortControllerRef.current = new AbortController();
    const signal = fetchReportAbortControllerRef.current.signal;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        fromDate,
        toDate,
      });
      // Append multiple item codes if any are selected
      if (selectedItemCodes.length > 0) {
        selectedItemCodes.forEach(code => params.append('itemCodes[]', code));
      }
      if (seriesFilter) {
        params.append('series', seriesFilter);
      }
      if (selectedParty?.value) {
        params.append('partyCode', selectedParty.value);
      }

      const response = await fetch(`${constants.baseURL}/api/reports/item-wise-sales?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        signal, // Pass the abort signal
      });
      if (!response.ok) {
        if (signal.aborted) {
          console.log('Fetch report aborted');
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setReportData(data);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Fetch report aborted');
      } else {
        setError(err.message);
        setReportData([]);
      }
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  };
  
  // Item MultiSelect uses dynamicItemOptions if available, otherwise empty or placeholder
  const currentItemOptions = dynamicItemOptions.length > 0 ? dynamicItemOptions 
    : (fromDate && toDate && !filterOptionsLoading ? [{value: '', text: 'No items found for dates'}] : []);

  // Party Autocomplete uses dynamicPartyOptions if available
  const currentPartyOptions = dynamicPartyOptions.length > 0 ? dynamicPartyOptions 
    : (fromDate && toDate && !filterOptionsLoading ? [{value: '', label: 'No parties found for dates'}] : (contextPartyOptions || [])); // Fallback to contextPartyOptions

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Item Wise Sales Report</h1>
      {/* Updated filter section grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div>
          <label htmlFor="dateRange" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date Range</label>
          <select
            id="dateRange"
            name="dateRange"
            className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:text-gray-200"
            value={selectedDateRange}
            onChange={(e) => setSelectedDateRange(e.target.value)}
          >
            {dateRangeOptions.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fromDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From Date</label>
          <Input
            id="fromDate"
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); if (selectedDateRange !== 'custom') setSelectedDateRange('custom'); }}
            variant="outlined"
            disabled={selectedDateRange !== 'custom'}
          />
        </div>
        <div>
          <label htmlFor="toDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To Date</label>
          <Input
            id="toDate"
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); if (selectedDateRange !== 'custom') setSelectedDateRange('custom'); }}
            variant="outlined"
            disabled={selectedDateRange !== 'custom'}
          />
        </div>
        
        {/* Party Name Filter (using Autocomplete for single selection) */}
        <div className="xl:col-span-1">
          <label htmlFor="partyFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Party (Optional)</label>
          <Autocomplete
            id="partyFilter"
            label={filterOptionsLoading ? 'Loading parties...' : (fromDate && toDate ? 'Select Party' : 'Select dates first')}
            options={currentPartyOptions}
            onChange={(value) => {
              const partyObj = dynamicPartyOptions.find(p => p.value === value);
              setSelectedParty(partyObj || null);
            }}
            value={selectedParty?.value || ''}
            disabled={!fromDate || !toDate || filterOptionsLoading}
          />
        </div>

        {/* Series Filter - moved to new logical row (still within the grid) */}
        {/* This starts a new "visual" row or section within the grid for larger screens */}
        {/* For smaller screens, it will stack naturally. */}
        {/* Add a div to wrap series and items if you want them grouped on one line below */}
        <div className="md:col-span-2 lg:col-span-3 xl:col-span-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mt-4 md:mt-0">
          <div className="xl:col-span-1"> {/* Adjust span as needed */}
            <label htmlFor="seriesFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Series (Optional)</label>
            <Input
              id="seriesFilter"
              type="text"
              value={seriesFilter}
              onChange={(e) => setSeriesFilter(e.target.value.toUpperCase())}
              placeholder="E.g., B"
              variant="outlined"
              maxLength={1} // Assuming series is a single character
              disabled={user ? (!user.routeAccess.includes('Admin') && user.canSelectSeries === false && !!user.defaultSeries?.billing) : false}
            />
          </div>

          {/* Item MultiSelect - moved to new logical row */}
          <div className="lg:col-span-2 xl:col-span-2"> {/* Adjust span as needed */}
            <label htmlFor="itemMultiSelect" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Items (Optional)</label>
            <MultiSelect
              label={filterOptionsLoading ? 'Loading items...' : (fromDate && toDate ? '' : 'Select dates first')}
              options={currentItemOptions}
              value={selectedItemCodes}
              onChange={setSelectedItemCodes}
              allowFiltering={true}
              selectOnEnter={true}
              matchThreshold={3}
              disabled={!fromDate || !toDate || filterOptionsLoading}
            />
          </div>
        </div>

        <div className="flex items-end mt-4 md:mt-0 md:col-span-1">
          <button
            onClick={handleFetchReport}
            disabled={loading || (!fromDate || !toDate)}
            className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Fetch Report'}
          </button>
        </div>
      </div>

      {filterOptionsError && <div className="text-red-500 bg-red-100 dark:bg-red-900 dark:text-red-300 p-3 rounded-md mb-4">Dynamic Filter Error: {filterOptionsError}</div>}
      {error && <div className="text-red-500 bg-red-100 dark:bg-red-900 dark:text-red-300 p-3 rounded-md mb-4">Report Error: {error}</div>}

      {/* Table remains the same */}
      <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow-md rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              {['Date', 'Bill No.', 'Code', 'Item Name', 'Party', 'Place', 'Unit', 'Qty', 'Free', 'Gross', 'Scheme', 'Sch.%', 'CD', 'Net Amt', 'Goods Amt', 'GST Amt', 'FreeV'].map(header => (
                <th key={header} scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {reportData.length === 0 && !loading && (
              <tr>
                <td colSpan={17} className="px-4 py-4 text-sm text-center text-gray-500 dark:text-gray-400">
                  No data available for the selected criteria.
                </td>
              </tr>
            )}
            {reportData.map((row, index) => (
              <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{row.Date}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{`${row.Series}-${row.BillNo}`}</td> 
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{row.Code}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{row.ItemName}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{row.Party}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{row.Place}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{row.Unit}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{row.Qty.toFixed(2)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{row.Free.toFixed(2)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{row.Gross.toFixed(2)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{row.Scheme.toFixed(2)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{row.SchPct.toFixed(2)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{row.CD.toFixed(2)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-gray-900 dark:text-gray-100">{row.NetAmt.toFixed(2)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{row.GoodsAmt.toFixed(2)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{row.GSTAmt.toFixed(2)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{row.FreeV.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Main component that includes the provider (structure remains the same)
const ItemWiseSales: React.FC = () => {
  const dummyItems = [];
  const dummyUpdateItem = () => {};
  const dummyRemoveItem = () => {};
  const dummyAddItem = () => {};
  const dummyCalculateTotal = () => '0.00';
  const [dummyExpandedIndex, setDummyExpandedIndex] = useState(0);
  const [dummyFocusNewItemIndex, setDummyFocusNewItemIndex] = useState<number | null>(null);
  const dummySetItems = () => {};

  return (
    <InvoiceProvider
      items={dummyItems}
      updateItem={dummyUpdateItem}
      removeItem={dummyRemoveItem}
      addItem={dummyAddItem}
      calculateTotal={dummyCalculateTotal}
      expandedIndex={dummyExpandedIndex}
      setExpandedIndex={setDummyExpandedIndex}
      focusNewItemIndex={dummyFocusNewItemIndex}
      setFocusNewItemIndex={setDummyFocusNewItemIndex}
      setItems={dummySetItems}
    >
      <ItemWiseSalesContent />
    </InvoiceProvider>
  );
};

export default ItemWiseSales; 