import React, { useState, useEffect, useRef, useMemo } from 'react';
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

// Add this new interface for the dynamic series/bill filters
interface SeriesBillFilter {
  series: string;
  billNumbers: string;
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

// Define Company option type
interface CompanyOptionType {
  value: string; // e.g., CCODE
  text: string;  // e.g., CNAME
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
  defaultSeries?: { 
    billing?: string;
    reports?: string; 
  };
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
  const [seriesBillFilters, setSeriesBillFilters] = useState<SeriesBillFilter[]>([{ series: '', billNumbers: '' }]);
  const [selectedParty, setSelectedParty] = useState<PartyOptionType | null>(null);
  const [unitFilter, setUnitFilter] = useState<'All' | 'Box' | 'Pcs'>('All');
  const [groupItems, setGroupItems] = useState<boolean>(false);
  const [expandedItemNames, setExpandedItemNames] = useState<Set<string>>(new Set());

  // State for dynamic filter options
  const [dynamicItemOptions, setDynamicItemOptions] = useState<DynamicItemOption[]>([]);
  const [dynamicPartyOptions, setDynamicPartyOptions] = useState<DynamicPartyOption[]>([]);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);
  const [filterOptionsError, setFilterOptionsError] = useState<string | null>(null);

  // State for company filter
  const [companyOptions, setCompanyOptions] = useState<CompanyOptionType[]>([]);
  const [selectedCompanyCodes, setSelectedCompanyCodes] = useState<string[]>([]);
  const [companyLoadingError, setCompanyLoadingError] = useState<string | null>(null);

  const { pmplData, partyOptions: contextPartyOptions } = useInvoiceContext(); 
  // const itemAutocompleteRef = useRef<AutocompleteRefHandle>(null); // Not for MultiSelect
  const [user, setUser] = useState<User | null>(null);

  // Handlers for dynamic series and bill number filters
  const handleSeriesBillFilterChange = (index: number, field: keyof SeriesBillFilter, value: string) => {
    const updatedFilters = [...seriesBillFilters];
    updatedFilters[index][field] = field === 'series' ? value.toUpperCase() : value;
    setSeriesBillFilters(updatedFilters);
  };

  const addSeriesBillFilter = () => {
    setSeriesBillFilters([...seriesBillFilters, { series: '', billNumbers: '' }]);
  };

  const removeSeriesBillFilter = (indexToRemove: number) => {
    if (seriesBillFilters.length > 1) {
      setSeriesBillFilters(seriesBillFilters.filter((_, index) => index !== indexToRemove));
    } else {
      // If it's the last one, just clear it instead of removing the row.
      setSeriesBillFilters([{ series: '', billNumbers: '' }]);
    }
  };

  // Calculate totals for the report data
  const reportTotals = useMemo(() => {
    if (!reportData || reportData.length === 0) {
      return {
        Qty: 0,
        Free: 0,
        Gross: 0,
        Scheme: 0,
        // SchPct will not be summed directly, it's a percentage
        // CD will not be summed directly, it's a percentage
        NetAmt: 0,
        GoodsAmt: 0,
        GSTAmt: 0,
        FreeV: 0,
      };
    }

    return reportData.reduce((acc, row) => {
      acc.Qty += Number(row.Qty) || 0;
      acc.Free += Number(row.Free) || 0;
      acc.Gross += Number(row.Gross) || 0;
      acc.Scheme += Number(row.Scheme) || 0;
      acc.NetAmt += Number(row.NetAmt) || 0;
      acc.GoodsAmt += Number(row.GoodsAmt) || 0;
      acc.GSTAmt += Number(row.GSTAmt) || 0;
      acc.FreeV += Number(row.FreeV) || 0;
      return acc;
    }, {
      Qty: 0,
      Free: 0,
      Gross: 0,
      Scheme: 0,
      NetAmt: 0,
      GoodsAmt: 0,
      GSTAmt: 0,
      FreeV: 0,
    });
  }, [reportData]);

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

  // Effect to fetch companies
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await fetch(`${constants.baseURL}/api/reports/companies`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        // Assuming data is an array of { CCODE: string, CNAME: string } - This was the previous assumption
        // And MultiSelect expects { value: string, text: string }
        // The API now directly returns data in the { value: ..., text: ... } format
        setCompanyOptions(data); // MODIFIED LINE: Directly use data as it's already formatted
        setCompanyLoadingError(null);
      } catch (err: any) {
        console.error("Error fetching companies:", err);
        setCompanyLoadingError(err.message);
        setCompanyOptions([]);
      }
    };
    fetchCompanies();
  }, []);

  // Apply default series from user settings
  useEffect(() => {
    if (user) {
      const isAdmin = user.routeAccess && user.routeAccess.includes('Admin');
      if (!isAdmin && user.defaultSeries && user.defaultSeries.reports && user.canSelectSeries === false) {
        setSeriesBillFilters([{ series: user.defaultSeries.reports, billNumbers: '' }]);
      }
    }
  }, [user]);

  // Effect to fetch dynamic filter options when dates, party, or companies change
  useEffect(() => {
    const actualDatesChanged = fromDate !== prevFromDateRef.current || toDate !== prevToDateRef.current;

    if (actualDatesChanged) {
      prevFromDateRef.current = fromDate;
      prevToDateRef.current = toDate;

      // If dates change, reset party and items, as they are dependent on date range
      if (selectedParty) {
        setSelectedParty(null);
      }
      setSelectedItemCodes([]);
    }
    
    // If companies change, reset party and items as well, as they might be filtered by company
    // This part needs to be handled carefully. We check if this effect is running due to a company change.
    // A simple way is to see if selectedCompanyCodes is a dependency.
    // We also ensure that if companies change, we clear dependent filters.
    // No, a better way is to reset selectedParty and selectedItemCodes if selectedCompanyCodes change
    // This logic will be inside the main block where we decide to fetch.

    if (fromDate && toDate) { // Company selection is optional
      if (fetchOptionsAbortControllerRef.current) {
        fetchOptionsAbortControllerRef.current.abort();
      }
      fetchOptionsAbortControllerRef.current = new AbortController();
      const signal = fetchOptionsAbortControllerRef.current.signal;

      setFilterOptionsLoading(true);
      setFilterOptionsError(null);

      // If this fetch is triggered due to date change or company change, clear item codes.
      // If it's due to party change, item codes are already cleared or will be re-fetched.
      // The key is that selectedParty and selectedItemCodes should be reset if their basis (date/company) changes.
      // This is partially handled by resetting them when `actualDatesChanged` or when `selectedCompanyCodes` changes (see below)

      const fetchOptions = async () => {
        try {
          const params = new URLSearchParams({ fromDate, toDate });
          if (selectedParty && selectedParty.value) {
            params.append('partyCode', selectedParty.value);
          }
          if (selectedCompanyCodes.length > 0) {
            params.append('companyCodes', selectedCompanyCodes.join(','));
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
  }, [fromDate, toDate, selectedParty, selectedCompanyCodes]); // Add selectedCompanyCodes to dependency array

  // Effect to reset party and items if company selection changes
  // This is a more direct way to handle resetting dependent filters when companies change.
  const prevSelectedCompanyCodesRef = useRef<string[] | undefined>(undefined);
  useEffect(() => {
    if (prevSelectedCompanyCodesRef.current && JSON.stringify(prevSelectedCompanyCodesRef.current) !== JSON.stringify(selectedCompanyCodes)) {
        if (selectedParty) {
      setSelectedParty(null);
        }
        setSelectedItemCodes([]);
    }
    prevSelectedCompanyCodesRef.current = selectedCompanyCodes;
  }, [selectedCompanyCodes, selectedParty, setSelectedParty, setSelectedItemCodes]);

  // Function to format date as YYYY-MM-DD
  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  // Define types for grouped report item
  interface GroupedSalesReportItem {
    Code: string;
    ItemName: string;
    Qty: number;
    Free: number;
    Gross: number;
    Scheme: number;
    NetAmt: number;
    GoodsAmt: number;
    GSTAmt: number;
    FreeV: number;
    details: SalesReportItem[];
  }

  // Process report data for display (either raw or grouped)
  const processedReportDisplayData = useMemo(() => {
    if (!groupItems) {
      return reportData; // Return raw data if not grouping
    }
    if (!reportData || reportData.length === 0) {
      return [];
    }

    const grouped = reportData.reduce((acc, row) => {
      const key = row.ItemName; // Group by ItemName
      if (!acc[key]) {
        acc[key] = {
          Code: row.Code,
          ItemName: row.ItemName,
          Qty: 0,
          Free: 0,
          Gross: 0,
          Scheme: 0,
          NetAmt: 0,
          GoodsAmt: 0,
          GSTAmt: 0,
          FreeV: 0,
          details: [],
        };
      }
      acc[key].Qty += Number(row.Qty) || 0;
      acc[key].Free += Number(row.Free) || 0;
      acc[key].Gross += Number(row.Gross) || 0;
      acc[key].Scheme += Number(row.Scheme) || 0;
      acc[key].NetAmt += Number(row.NetAmt) || 0;
      acc[key].GoodsAmt += Number(row.GoodsAmt) || 0;
      acc[key].GSTAmt += Number(row.GSTAmt) || 0;
      acc[key].FreeV += Number(row.FreeV) || 0;
      acc[key].details.push(row);
      return acc;
    }, {} as Record<string, GroupedSalesReportItem>);

    return Object.values(grouped).sort((a, b) => a.ItemName.localeCompare(b.ItemName));
  }, [reportData, groupItems]);

  // Define table headers based on grouping state
  const fullTableHeaders = ['Date', 'Bill No.', 'Code', 'Item Name', 'Party', 'Place', 'Unit', 'Qty', 'Free', 'Gross', 'Scheme', 'Sch.%', 'CD', 'NetAmt', 'GoodsAmt', 'GSTAmt', 'FreeV'];
  const groupedSummaryHeaders = ['Code', 'Item Name', 'Qty', 'Free', 'Gross', 'Scheme', 'NetAmt', 'GoodsAmt', 'GSTAmt', 'FreeV'];

  const currentTableHeaders = useMemo(() => {
    if (groupItems) {
      return groupedSummaryHeaders;
    }
    return fullTableHeaders;
  }, [groupItems]);

  // Handler to toggle item expansion
  const handleToggleExpand = (itemName: string) => {
    setExpandedItemNames(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemName)) {
        newSet.delete(itemName);
      } else {
        newSet.add(itemName);
      }
      return newSet;
    });
  };

  // Effect to set initial and update dates based on selectedDateRange
  useEffect(() => {
    const today = new Date();
    let newFromDate = '';
    let newToDate = '';

        switch (selectedDateRange) {
      case 'today':
        today.setHours(5, 30, 0, 0);
        newFromDate = formatDate(today);
        newToDate = formatDate(today);
        break;
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        yesterday.setHours(5, 30, 0, 0);
        newFromDate = formatDate(yesterday);
        newToDate = formatDate(yesterday);
        break;
      case 'last7days':
        const last7Days = new Date(today);
        last7Days.setDate(today.getDate() - 6);
        last7Days.setHours(5, 30, 0, 0);
        today.setHours(5, 30, 0, 0);
        newFromDate = formatDate(last7Days);
        newToDate = formatDate(today);
        break;
      case 'thisMonth':
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        firstDayOfMonth.setHours(5, 30, 0, 0);
        today.setHours(5, 30, 0, 0);
        newFromDate = formatDate(firstDayOfMonth);
        newToDate = formatDate(today);
        break;
      case 'lastMonth':
        const firstDayOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const firstDayOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDayOfLastMonth = new Date(firstDayOfThisMonth);
        lastDayOfLastMonth.setDate(firstDayOfThisMonth.getDate() - 1);
        firstDayOfLastMonth.setHours(5, 30, 0, 0);
        lastDayOfLastMonth.setHours(5, 30, 0, 0);
        newFromDate = formatDate(firstDayOfLastMonth);
        newToDate = formatDate(lastDayOfLastMonth);
        break;
      case 'custom':
        if (!fromDate || !toDate) {
            const firstDayThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            firstDayThisMonth.setHours(5, 30, 0, 0);
            today.setHours(5, 30, 0, 0);
            setFromDate(formatDate(firstDayThisMonth));
            setToDate(formatDate(today));
        }
        return;
      default:
        const defaultFirstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        defaultFirstDay.setHours(5, 30, 0, 0);
        today.setHours(5, 30, 0, 0);
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
        params.append('itemCodes', selectedItemCodes.join(','));
      }

      // New logic for multiple series/bill number filters
      const validSeriesFilters = seriesBillFilters.filter(f => f.series.trim() !== '');
      if (validSeriesFilters.length > 0) {
        const filtersToSend = validSeriesFilters.map(f => ({
          series: f.series,
          billNumbers: f.billNumbers.trim(),
        })).filter(f => f.series);

        if (filtersToSend.length > 0) {
          params.append('seriesBillFilters', JSON.stringify(filtersToSend));
        }
      }

      if (selectedParty?.value) {
        params.append('partyCode', selectedParty.value);
      }
      // New unit filter logic for radio buttons
      if (unitFilter === 'Box') {
        params.append('unit', 'Box');
      } else if (unitFilter === 'Pcs') {
        params.append('unit', 'Pcs');
      }

      // Add selected company codes to the report fetch
      if (selectedCompanyCodes.length > 0) {
        params.append('companyCodes', selectedCompanyCodes.join(','));
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

  const handlePrintReport = () => {
    const companyNames = selectedCompanyCodes.map(ccode => {
      const option = companyOptions.find(opt => opt.value === ccode);
      return option ? option.text : ccode;
    }).join(', ') || 'All';

    const itemNames = selectedItemCodes.map(itemCode => {
      const option = dynamicItemOptions.find(opt => opt.value === itemCode);
      return option ? option.text : itemCode;
    }).join(', ') || 'All';

    const partyName = selectedParty ? selectedParty.label : 'All';

    const seriesFiltersDisplay = seriesBillFilters
      .filter(f => f.series.trim() !== '')
      .map(f => `Series ${f.series}: ${f.billNumbers.trim() || 'All Bills'}`)
      .join('<br>') || 'All';

    let reportHtml = `
      <html>
        <head>
          <title>Item Wise Sales Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { text-align: center; margin-bottom: 20px; }
            .filter-criteria { margin-bottom: 20px; padding: 10px; border: 1px solid #ccc; font-size: 0.9em; }
            .filter-criteria p { margin: 5px 0; }
            .filter-criteria strong { min-width: 100px; display: inline-block;}
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 0.8em; }
            th, td { border: 1px solid #000; padding: 6px; text-align: left; word-break: break-word; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .text-right { text-align: right; }
            .total-row td { font-weight: bold; background-color: #e9e9e9; }
            .grouped-summary-row { font-weight: bold; cursor: default; }
            .grouped-summary-row td { background-color: #f8f8f8; }
            .detail-header-row th { background-color: #e0e0e0; font-style: italic; padding-left: 15px !important; }
            .detail-data-row td { background-color: #fdfdfd; padding-left: 15px !important; }
            .detail-data-row .indent-cell { padding-left: 25px !important; } /* For first cell of detail row like Date */
            @media print {
              body { margin: 0.5in; font-size: 10pt; }
              h1 { font-size: 16pt; }
              .filter-criteria { font-size: 9pt; }
              table { font-size: 8pt; }
              th, td { padding: 4px; }
              .filter-criteria { page-break-after: auto; }
              table { page-break-inside: auto; }
              tr { page-break-inside: avoid; page-break-after: auto; }
              thead { display: table-header-group; } /* Repeat headers on each page */
              tfoot { display: table-footer-group; } /* Repeat footers */
              button, .no-print { display: none !important; } 
            }
          </style>
        </head>
        <body>
          <h1>Item Wise Sales Report</h1>
          <div class="filter-criteria">
            <p><strong>Date Range:</strong> ${fromDate} to ${toDate}</p>
            <p><strong>Companies:</strong> ${companyNames}</p>
            <p><strong>Party:</strong> ${partyName}</p>
            <p><strong>Items:</strong> ${itemNames}</p>
            <p><strong>Series/Bills:</strong> ${seriesFiltersDisplay}</p>
            <p><strong>Unit:</strong> ${unitFilter}</p>
            <p><strong>Grouped by Item:</strong> ${groupItems ? 'Yes' : 'No'}</p>
          </div>
          <table>
            <thead>
              <tr>
                ${(groupItems ? groupedSummaryHeaders : fullTableHeaders).map(header => `<th>${header}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
    `;

    (processedReportDisplayData as Array<SalesReportItem | GroupedSalesReportItem>).forEach(row => {
      if (groupItems) {
        const groupedRow = row as GroupedSalesReportItem;
        reportHtml += `<tr class="grouped-summary-row">
          <td>${groupedRow.Code}</td>
          <td>${groupedRow.ItemName}</td>
          <td class="text-right">${(groupedRow.Qty || 0).toFixed(2)}</td>
          <td class="text-right">${(groupedRow.Free || 0).toFixed(2)}</td>
          <td class="text-right">${(groupedRow.Gross || 0).toFixed(2)}</td>
          <td class="text-right">${(groupedRow.Scheme || 0).toFixed(2)}</td>
          <td class="text-right">${(groupedRow.NetAmt || 0).toFixed(2)}</td>
          <td class="text-right">${(groupedRow.GoodsAmt || 0).toFixed(2)}</td>
          <td class="text-right">${(groupedRow.GSTAmt || 0).toFixed(2)}</td>
          <td class="text-right">${(groupedRow.FreeV || 0).toFixed(2)}</td>
        </tr>`;

        if (groupedRow.details) {
          reportHtml += `<tr class="detail-header-row">
            ${fullTableHeaders.map(header => `<th>${header}</th>`).join('')}
          </tr>`;
          groupedRow.details.forEach(detailRow => {
            reportHtml += `<tr class="detail-data-row">
              <td class="indent-cell">${detailRow.Date}</td>
              <td>${detailRow.Series}-${detailRow.BillNo}</td>
              <td>${detailRow.Code}</td>
              <td>${detailRow.ItemName}</td>
              <td>${detailRow.Party}</td>
              <td>${detailRow.Place}</td>
              <td>${detailRow.Unit}</td>
              <td class="text-right">${(detailRow.Qty || 0).toFixed(2)}</td>
              <td class="text-right">${(detailRow.Free || 0).toFixed(2)}</td>
              <td class="text-right">${(detailRow.Gross || 0).toFixed(2)}</td>
              <td class="text-right">${(detailRow.Scheme || 0).toFixed(2)}</td>
              <td class="text-right">${(detailRow.SchPct || 0).toFixed(2)}</td>
              <td class="text-right">${(detailRow.CD || 0).toFixed(2)}</td>
              <td class="text-right">${(detailRow.NetAmt || 0).toFixed(2)}</td>
              <td class="text-right">${(detailRow.GoodsAmt || 0).toFixed(2)}</td>
              <td class="text-right">${(detailRow.GSTAmt || 0).toFixed(2)}</td>
              <td class="text-right">${(detailRow.FreeV || 0).toFixed(2)}</td>
            </tr>`;
          });
        }
      } else {
        const nonGroupedRow = row as SalesReportItem;
        reportHtml += `<tr>
          <td>${nonGroupedRow.Date}</td>
          <td>${nonGroupedRow.Series}-${nonGroupedRow.BillNo}</td>
          <td>${nonGroupedRow.Code}</td>
          <td>${nonGroupedRow.ItemName}</td>
          <td>${nonGroupedRow.Party}</td>
          <td>${nonGroupedRow.Place}</td>
          <td>${nonGroupedRow.Unit}</td>
          <td class="text-right">${(nonGroupedRow.Qty || 0).toFixed(2)}</td>
          <td class="text-right">${(nonGroupedRow.Free || 0).toFixed(2)}</td>
          <td class="text-right">${(nonGroupedRow.Gross || 0).toFixed(2)}</td>
          <td class="text-right">${(nonGroupedRow.Scheme || 0).toFixed(2)}</td>
          <td class="text-right">${(nonGroupedRow.SchPct || 0).toFixed(2)}</td>
          <td class="text-right">${(nonGroupedRow.CD || 0).toFixed(2)}</td>
          <td class="text-right">${(nonGroupedRow.NetAmt || 0).toFixed(2)}</td>
          <td class="text-right">${(nonGroupedRow.GoodsAmt || 0).toFixed(2)}</td>
          <td class="text-right">${(nonGroupedRow.GSTAmt || 0).toFixed(2)}</td>
          <td class="text-right">${(nonGroupedRow.FreeV || 0).toFixed(2)}</td>
        </tr>`;
      }
    });

    reportHtml += `</tbody>`;

    if (reportData.length > 0) {
      reportHtml += `<tfoot class="total-row">
        <tr>
          <td colSpan="${groupItems ? 2 : 7}">Total</td>
          <td class="text-right">${(reportTotals.Qty || 0).toFixed(2)}</td>
          <td class="text-right">${(reportTotals.Free || 0).toFixed(2)}</td>
          <td class="text-right">${(reportTotals.Gross || 0).toFixed(2)}</td>
          <td class="text-right">${(reportTotals.Scheme || 0).toFixed(2)}</td>
          ${!groupItems ? `<td class="text-right">-</td><td class="text-right">-</td>` : ''}
          <td class="text-right">${(reportTotals.NetAmt || 0).toFixed(2)}</td>
          <td class="text-right">${(reportTotals.GoodsAmt || 0).toFixed(2)}</td>
          <td class="text-right">${(reportTotals.GSTAmt || 0).toFixed(2)}</td>
          <td class="text-right">${(reportTotals.FreeV || 0).toFixed(2)}</td>
        </tr>
      </tfoot>`;
    }

    reportHtml += `
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(reportHtml);
      printWindow.document.close();
      printWindow.focus(); // Focus new window before printing
      // Timeout to ensure content is loaded before print dialog
      setTimeout(() => {
        printWindow.print();
        // printWindow.close(); // Optional: close after print dialog
      }, 500);
    } else {
      alert('Could not open print window. Please check your browser pop-up settings.');
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Item Wise Sales Report</h1>
      {/* Updated filter section grid */}
      {/* width 70vw, only on breakpoint pc*/} 
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow w-full lg:w-[75vw]">
        {/* --- Row 1: Date and Company Filters --- */}
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
        <div>
          <label htmlFor="companyMultiSelect" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company</label>
          <MultiSelect
            label={companyOptions.length > 0 ? '' : (companyLoadingError ? 'Error loading companies' : 'Loading companies...')}
            options={companyOptions}
            value={selectedCompanyCodes}
            onChange={setSelectedCompanyCodes}
            allowFiltering={true}
            selectOnEnter={true}
            matchThreshold={3}
            disabled={companyOptions.length === 0 && !companyLoadingError}
          />
          {companyLoadingError && <p className="text-xs text-red-500 mt-1">{companyLoadingError}</p>}
        </div>
        
        {/* --- Row 2: Party and Item Filters --- */}
        <div className="lg:col-span-2">
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
        <div className="lg:col-span-2">
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

        {/* --- Row 3: Series/Bills and Unit Filter --- */}
        <div className="lg:col-span-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Series & Bill Numbers (Optional)</label>
          {seriesBillFilters.map((filter, index) => (
            <div key={index} className="flex items-center gap-2 mb-2">
              <Input
                name={`series_${index}`}
                type="text"
                value={filter.series}
                onChange={(e) => handleSeriesBillFilterChange(index, 'series', e.target.value)}
                placeholder="Series"
                variant="outlined"
                maxLength={1}
                className="w-24"
                disabled={user ? (!user.routeAccess.includes('Admin') && user.canSelectSeries === false && !!user.defaultSeries?.reports) : false}
              />
              <Input
                name={`billNumbers_${index}`}
                type="text"
                value={filter.billNumbers}
                onChange={(e) => handleSeriesBillFilterChange(index, 'billNumbers', e.target.value)}
                placeholder="Bill Numbers (e.g., 1,2,3)"
                variant="outlined"
                className="flex-grow"
              />
              <button
                type="button"
                onClick={() => removeSeriesBillFilter(index)}
                className="flex-shrink-0 px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                disabled={seriesBillFilters.length === 1 || (user ? (!user.routeAccess.includes('Admin') && user.canSelectSeries === false && !!user.defaultSeries?.reports) : false)}
              >
                &ndash;
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addSeriesBillFilter}
            className="mt-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
            disabled={user ? (!user.routeAccess.includes('Admin') && user.canSelectSeries === false && !!user.defaultSeries?.reports) : false}
          >
            + Add Series
          </button>
        </div>
        <div className="flex flex-col justify-start pt-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Unit Filter</label>
          <div className="flex items-center mt-2 space-x-4">
            <div>
              <input
                type="radio"
                id="unitFilterAll"
                name="unitFilter"
                value="All"
                checked={unitFilter === 'All'}
                onChange={(e) => setUnitFilter(e.target.value as 'All' | 'Box' | 'Pcs')}
                className="form-radio h-4 w-4 text-indigo-600 transition duration-150 ease-in-out dark:bg-gray-700 dark:border-gray-600"
              />
              <label htmlFor="unitFilterAll" className="ml-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">All</label>
            </div>
            <div>
              <input
                type="radio"
                id="unitFilterBox"
                name="unitFilter"
                value="Box"
                checked={unitFilter === 'Box'}
                onChange={(e) => setUnitFilter(e.target.value as 'All' | 'Box' | 'Pcs')}
                className="form-radio h-4 w-4 text-indigo-600 transition duration-150 ease-in-out dark:bg-gray-700 dark:border-gray-600"
              />
              <label htmlFor="unitFilterBox" className="ml-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">Box</label>
            </div>
            <div>
              <input
                type="radio"
                id="unitFilterPcs"
                name="unitFilter"
                value="Pcs"
                checked={unitFilter === 'Pcs'}
                onChange={(e) => setUnitFilter(e.target.value as 'All' | 'Box' | 'Pcs')}
                className="form-radio h-4 w-4 text-indigo-600 transition duration-150 ease-in-out dark:bg-gray-700 dark:border-gray-600"
              />
              <label htmlFor="unitFilterPcs" className="ml-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">Pcs</label>
            </div>
          </div>
        </div>

        {/* --- Row 4: Grouping and Actions --- */}
        <div className="lg:col-span-2 flex items-center">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="groupItems"
              checked={groupItems}
              onChange={(e) => setGroupItems(e.target.checked)}
              className="form-checkbox h-5 w-5 text-indigo-600 transition duration-150 ease-in-out mr-2 rounded dark:bg-gray-700 dark:border-gray-600 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:ring-offset-gray-800"
            />
            <label htmlFor="groupItems" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
              Group by Item Name
            </label>
          </div>
        </div>
        <div className="lg:col-span-2 flex items-end justify-end space-x-2">
          <button
            onClick={handleFetchReport}
            disabled={loading || !fromDate || !toDate}
            className="w-full max-w-xs inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Fetch Report'}
          </button>
          <button
            onClick={handlePrintReport}
            disabled={reportData.length === 0 && !loading}
            className="w-full max-w-xs inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
          >
            Print Report
          </button>
        </div>
      </div>

      {companyLoadingError && <div className="text-red-500 bg-red-100 dark:bg-red-900 dark:text-red-300 p-3 rounded-md mb-4">Company Loading Error: {companyLoadingError}</div>}
      {filterOptionsError && <div className="text-red-500 bg-red-100 dark:bg-red-900 dark:text-red-300 p-3 rounded-md mb-4">Dynamic Filter Error: {filterOptionsError}</div>}
      {error && <div className="text-red-500 bg-red-100 dark:bg-red-900 dark:text-red-300 p-3 rounded-md mb-4">Report Error: {error}</div>}

      {/* Table remains the same */}
      <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow-md rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              {currentTableHeaders.map(header => (
                <th key={header} scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {processedReportDisplayData.length === 0 && !loading && (
              <tr>
                <td colSpan={currentTableHeaders.length} className="px-4 py-4 text-sm text-center text-gray-500 dark:text-gray-400">
                  No data available for the selected criteria.
                </td>
              </tr>
            )}
            {processedReportDisplayData.map((row: SalesReportItem | GroupedSalesReportItem, index) => {
              if (groupItems) {
                const groupedRow = row as GroupedSalesReportItem;
                return (
                  <React.Fragment key={`${groupedRow.ItemName}-${index}`}>
                    <tr onClick={() => handleToggleExpand(groupedRow.ItemName)} className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">
                        <span className="mr-2">{expandedItemNames.has(groupedRow.ItemName) ? '-' : '+'}</span>
                        {groupedRow.Code}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{groupedRow.ItemName}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{groupedRow.Qty.toFixed(2)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{groupedRow.Free.toFixed(2)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{groupedRow.Gross.toFixed(2)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{groupedRow.Scheme.toFixed(2)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{groupedRow.NetAmt.toFixed(2)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{groupedRow.GoodsAmt.toFixed(2)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{groupedRow.GSTAmt.toFixed(2)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{groupedRow.FreeV.toFixed(2)}</td>
                    </tr>
                    {expandedItemNames.has(groupedRow.ItemName) && (
                      <>
                        {/* Detail Header Row */}
                        <tr className="bg-gray-200 dark:bg-gray-700/80">
                          {fullTableHeaders.map((header, headerIndex) => (
                            <th key={`detail-header-${headerIndex}`} 
                                className={`px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap ${headerIndex === 0 ? 'pl-8' : ''}`}>
                              {header}
                            </th>
                          ))}
                        </tr>
                        {/* Detail Data Rows */}
                        {groupedRow.details.map((detailRow, detailIndex) => (
                          <tr key={`${groupedRow.ItemName}-detail-${detailIndex}`} className="bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-700/70">
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 pl-8">{detailRow.Date}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{`${detailRow.Series}-${detailRow.BillNo}`}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{detailRow.Code}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{detailRow.ItemName}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{detailRow.Party}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{detailRow.Place}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{detailRow.Unit}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">{detailRow.Qty.toFixed(2)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">{detailRow.Free.toFixed(2)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">{detailRow.Gross.toFixed(2)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">{detailRow.Scheme.toFixed(2)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">{detailRow.SchPct.toFixed(2)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">{detailRow.CD.toFixed(2)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-gray-700 dark:text-gray-300">{detailRow.NetAmt.toFixed(2)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">{detailRow.GoodsAmt.toFixed(2)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">{detailRow.GSTAmt.toFixed(2)}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">{detailRow.FreeV.toFixed(2)}</td>
              </tr>
            ))}
                      </>
                    )}
                  </React.Fragment>
                );
              } else {
                // Original non-grouped row rendering
                const nonGroupedRow = row as SalesReportItem;
                return (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{nonGroupedRow.Date}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{`${nonGroupedRow.Series}-${nonGroupedRow.BillNo}`}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{nonGroupedRow.Code}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{nonGroupedRow.ItemName}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{nonGroupedRow.Party}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{nonGroupedRow.Place}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{nonGroupedRow.Unit}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{nonGroupedRow.Qty.toFixed(2)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{nonGroupedRow.Free.toFixed(2)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{nonGroupedRow.Gross.toFixed(2)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{nonGroupedRow.Scheme.toFixed(2)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{nonGroupedRow.SchPct.toFixed(2)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{nonGroupedRow.CD.toFixed(2)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-gray-900 dark:text-gray-100">{nonGroupedRow.NetAmt.toFixed(2)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{nonGroupedRow.GoodsAmt.toFixed(2)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{nonGroupedRow.GSTAmt.toFixed(2)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{nonGroupedRow.FreeV.toFixed(2)}</td>
                  </tr>
                );
              }
            })}
          </tbody>
          {reportData.length > 0 && (
            <tfoot className="bg-gray-100 dark:bg-gray-700 font-semibold">
              <tr>
                <td colSpan={groupItems ? 2 : 7} className="px-4 py-3 text-left text-sm text-gray-800 dark:text-gray-100 uppercase whitespace-nowrap">Total</td>
                {/* Qty Total */}
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">{reportTotals.Qty.toFixed(2)}</td>
                {/* Free Total */}
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">{reportTotals.Free.toFixed(2)}</td>
                {/* Gross Total */}
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">{reportTotals.Gross.toFixed(2)}</td>
                {/* Scheme Total */}
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">{reportTotals.Scheme.toFixed(2)}</td>
                {!groupItems && (
                  <>
                    {/* SchPct - Empty or N/A as it's not a sum - Ensure alignment */}
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">-</td> 
                    {/* CD - Empty or N/A as it's not a sum - Ensure alignment */}
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">-</td> 
                  </>
                )}
                {/* NetAmt Total */}
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">{reportTotals.NetAmt.toFixed(2)}</td>
                {/* GoodsAmt Total */}
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">{reportTotals.GoodsAmt.toFixed(2)}</td>
                {/* GSTAmt Total */}
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">{reportTotals.GSTAmt.toFixed(2)}</td>
                {/* FreeV Total */}
                <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">{reportTotals.FreeV.toFixed(2)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

// Main component that includes the provider (structure remains the same)
const ItemWiseSales: React.FC = () => {
  // Dummy props for InvoiceProvider - Ensure all are correctly defined
  const [dummyItemsState, setDummyItemsState] = useState<any[]>([]); // Renamed to avoid conflict and use state
  const dummyUpdateItem = (index: number, updatedItem: any) => {};
  const dummyRemoveItem = (index: number) => {};
  const dummyAddItem = (item?: any) => {};
  const dummyCalculateTotal = () => '0.00';
  const [dummyExpandedIndex, setDummyExpandedIndex] = useState<number | null>(null); // Allow null
  const [dummyFocusNewItemIndex, setDummyFocusNewItemIndex] = useState<number | null>(null);
  // Removed dummySetItems as setDummyItemsState serves this purpose with useState

  return (
    <InvoiceProvider
      items={dummyItemsState} // Use state variable
      updateItem={dummyUpdateItem}
      removeItem={dummyRemoveItem}
      addItem={dummyAddItem}
      calculateTotal={dummyCalculateTotal}
      expandedIndex={dummyExpandedIndex}
      setExpandedIndex={setDummyExpandedIndex}
      focusNewItemIndex={dummyFocusNewItemIndex}
      setFocusNewItemIndex={setDummyFocusNewItemIndex}
      setItems={setDummyItemsState} // Pass the state setter
    >
      <ItemWiseSalesContent />
    </InvoiceProvider>
  );
};

export default ItemWiseSales; 