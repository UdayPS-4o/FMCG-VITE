import React, { useState, useEffect, useRef, useMemo } from 'react';
import Autocomplete from '../../components/form/input/Autocomplete';
import MultiSelect from '../../components/form/MultiSelect';
import Input from '../../components/form/input/Input';
import InvoiceProvider from '../../contexts/InvoiceProvider';
import constants from '../../constants';
import useActivityTracker from '../../hooks/useActivityTracker';

// Define the structure of a purchase report item
interface PurchaseReportItem {
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
  text: string;
}
interface DynamicPartyOption {
  value: string;
  label: string;
}

// Define Company option type
interface CompanyOptionType {
  value: string;
  text: string;
}

// Define User type
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

const ItemWisePurchaseContent: React.FC = () => {
  const [selectedDateRange, setSelectedDateRange] = useState<string>('today');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedItemCodes, setSelectedItemCodes] = useState<string[]>([]);
  const [reportData, setReportData] = useState<PurchaseReportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seriesBillFilters, setSeriesBillFilters] = useState<SeriesBillFilter[]>([{ series: '', billNumbers: '' }]);
  const [selectedParty, setSelectedParty] = useState<PartyOptionType | null>(null);
  const [unitFilter, setUnitFilter] = useState<'All' | 'Box' | 'Pcs'>('All');
  const [groupItems, setGroupItems] = useState<boolean>(false);
  const [expandedItemNames, setExpandedItemNames] = useState<Set<string>>(new Set());
  const [dynamicItemOptions, setDynamicItemOptions] = useState<DynamicItemOption[]>([]);
  const [dynamicPartyOptions, setDynamicPartyOptions] = useState<DynamicPartyOption[]>([]);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);
  const [filterOptionsError, setFilterOptionsError] = useState<string | null>(null);
  const [companyOptions, setCompanyOptions] = useState<CompanyOptionType[]>([]);
  const [selectedCompanyCodes, setSelectedCompanyCodes] = useState<string[]>([]);
  const [companyLoadingError, setCompanyLoadingError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const { logActivity } = useActivityTracker();

  const handleHideColumn = (columnName: string) => {
    setHiddenColumns(prev => [...prev, columnName]);
  };

  const handleResetColumns = () => {
    setHiddenColumns([]);
  };

  const reportTotals = useMemo(() => {
    if (!reportData || reportData.length === 0) {
      return { Qty: 0, Free: 0, Gross: 0, Scheme: 0, NetAmt: 0, GoodsAmt: 0, GSTAmt: 0, FreeV: 0 };
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
    }, { Qty: 0, Free: 0, Gross: 0, Scheme: 0, NetAmt: 0, GoodsAmt: 0, GSTAmt: 0, FreeV: 0 });
  }, [reportData]);

  const fetchOptionsAbortControllerRef = useRef<AbortController | null>(null);
  const fetchReportAbortControllerRef = useRef<AbortController | null>(null);
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

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await fetch(`${constants.baseURL}/api/reports/companies`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setCompanyOptions(data);
        setCompanyLoadingError(null);
      } catch (err: any) {
        console.error("Error fetching companies:", err);
        setCompanyLoadingError(err.message);
        setCompanyOptions([]);
      }
    };
    fetchCompanies();
  }, []);

  useEffect(() => {
    if (user) {
      const isAdmin = user.routeAccess && user.routeAccess.includes('Admin');
      if (!isAdmin && user.defaultSeries && user.defaultSeries.reports && user.canSelectSeries === false) {
        setSeriesBillFilters([{ series: user.defaultSeries.reports, billNumbers: '' }]);
      }
    }
  }, [user]);

  useEffect(() => {
    const actualDatesChanged = fromDate !== prevFromDateRef.current || toDate !== prevToDateRef.current;

    if (actualDatesChanged) {
      prevFromDateRef.current = fromDate;
      prevToDateRef.current = toDate;
      if (selectedParty) setSelectedParty(null);
      setSelectedItemCodes([]);
    }

    if (fromDate && toDate) {
      if (fetchOptionsAbortControllerRef.current) fetchOptionsAbortControllerRef.current.abort();
      fetchOptionsAbortControllerRef.current = new AbortController();
      const signal = fetchOptionsAbortControllerRef.current.signal;

      setFilterOptionsLoading(true);
      setFilterOptionsError(null);

      const fetchOptions = async () => {
        try {
          const params = new URLSearchParams({ fromDate, toDate });
          if (selectedParty?.value) params.append('partyCode', selectedParty.value);
          if (selectedCompanyCodes.length > 0) params.append('companyCodes', selectedCompanyCodes.join(','));

          const response = await fetch(`${constants.baseURL}/api/reports/purchase-filter-options?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            signal,
          });

          if (signal.aborted) return;
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

          const data = await response.json();
          if (signal.aborted) return;

          setDynamicItemOptions(data.itemOptions || []);
          if (!selectedParty || actualDatesChanged) setDynamicPartyOptions(data.partyOptions || []);

        } catch (err: any) {
          if (err.name !== 'AbortError') {
            console.error("Error fetching filter options:", err);
            setFilterOptionsError(err.message);
            setDynamicItemOptions([]);
            if (!selectedParty || actualDatesChanged) setDynamicPartyOptions([]);
          }
        } finally {
          if (!signal.aborted) setFilterOptionsLoading(false);
        }
      };
      fetchOptions();
      return () => {
        if (fetchOptionsAbortControllerRef.current) fetchOptionsAbortControllerRef.current.abort();
      };
    } else {
      setDynamicItemOptions([]);
      setDynamicPartyOptions([]);
      setSelectedItemCodes([]);
      if (selectedParty) setSelectedParty(null);
      prevFromDateRef.current = undefined;
      prevToDateRef.current = undefined;
    }
  }, [fromDate, toDate, selectedParty, selectedCompanyCodes]);

  const prevSelectedCompanyCodesRef = useRef<string[] | undefined>(undefined);
  useEffect(() => {
    if (prevSelectedCompanyCodesRef.current && JSON.stringify(prevSelectedCompanyCodesRef.current) !== JSON.stringify(selectedCompanyCodes)) {
      if (selectedParty) setSelectedParty(null);
      setSelectedItemCodes([]);
    }
    prevSelectedCompanyCodesRef.current = selectedCompanyCodes;
  }, [selectedCompanyCodes, selectedParty]);

  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  interface GroupedPurchaseReportItem {
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
    details: PurchaseReportItem[];
    unitQty?: { [unit: string]: number };
    displayQty?: string;
    unitFree?: { [unit: string]: number };
    displayFree?: string;
  }

  const processedReportDisplayData = useMemo(() => {
    if (!groupItems) return reportData;
    if (!reportData || reportData.length === 0) return [];

    const grouped = reportData.reduce((acc, row) => {
      const key = row.ItemName;
      if (!acc[key]) {
        acc[key] = {
          Code: row.Code, ItemName: row.ItemName, Qty: 0, Free: 0, Gross: 0, Scheme: 0,
          NetAmt: 0, GoodsAmt: 0, GSTAmt: 0, FreeV: 0, details: [],
          unitQty: {},
          unitFree: {},
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

      const unit = (row.Unit || 'UNKNOWN').toUpperCase();
      if (acc[key].unitQty) {
        if (!acc[key].unitQty[unit]) {
          acc[key].unitQty[unit] = 0;
        }
        acc[key].unitQty[unit] += Number(row.Qty) || 0;
      }
      if (acc[key].unitFree) {
        if (!acc[key].unitFree[unit]) {
          acc[key].unitFree[unit] = 0;
        }
        acc[key].unitFree[unit] += Number(row.Free) || 0;
      }

      return acc;
    }, {} as Record<string, GroupedPurchaseReportItem>);

    const groupedResult = Object.values(grouped);

    groupedResult.forEach(item => {
      const formatDisplayValue = (totalValue: number, unitValues: { [unit: string]: number } | undefined) => {
        if (!unitValues) return totalValue.toFixed(2);

        const activeUnits = Object.keys(unitValues).filter(u => unitValues[u] > 0);
        const hasOnlyBoxAndPcs = activeUnits.every(u => u === 'BOX' || u === 'PCS');

        if (hasOnlyBoxAndPcs && activeUnits.length > 0) {
          const boxValue = unitValues['BOX'] || 0;
          const pcsValue = unitValues['PCS'] || 0;
          return `(BOX+PCS)\n(${boxValue}+${pcsValue})`;
        }

        const unitOrder = ['BOX', 'PCS'];
        const sortedUnits = Object.keys(unitValues).sort((a, b) => {
          const indexA = unitOrder.indexOf(a);
          const indexB = unitOrder.indexOf(b);
          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
          if (indexA !== -1) return -1;
          if (indexB !== -1) return 1;
          return a.localeCompare(b);
        });

        const labels: string[] = [];
        const values: number[] = [];
        sortedUnits.forEach(unit => {
          if (unitValues[unit] > 0) {
            labels.push(unit);
            values.push(unitValues[unit]);
          }
        });

        if (labels.length > 1) {
          return `(${labels.join('+')})\n(${values.join('+')})`;
        }

        return totalValue.toFixed(2);
      };

      item.displayQty = formatDisplayValue(item.Qty, item.unitQty);
      item.displayFree = formatDisplayValue(item.Free, item.unitFree);
    });

    return groupedResult.sort((a, b) => a.ItemName.localeCompare(b.ItemName));
  }, [reportData, groupItems]);

  const fullTableHeaders = ['Date', 'Bill No.', 'Code', 'Item Name', 'Party', 'Place', 'Unit', 'Qty', 'Free', 'Gross', 'Scheme', 'Sch.%', 'CD', 'NetAmt', 'GoodsAmt', 'GSTAmt', 'FreeV'];
  const groupedSummaryHeaders = ['Code', 'Item Name', 'Qty', 'Free', 'Gross', 'Scheme', 'NetAmt', 'GoodsAmt', 'GSTAmt', 'FreeV'];

  const currentTableHeaders = useMemo(() => groupItems ? groupedSummaryHeaders : fullTableHeaders, [groupItems]);

  const handleToggleExpand = (itemName: string) => {
    setExpandedItemNames(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemName)) newSet.delete(itemName);
      else newSet.add(itemName);
      return newSet;
    });
  };

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
    if (fetchReportAbortControllerRef.current) fetchReportAbortControllerRef.current.abort();
    fetchReportAbortControllerRef.current = new AbortController();
    const signal = fetchReportAbortControllerRef.current.signal;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ fromDate, toDate });
      if (selectedItemCodes.length > 0) params.append('itemCodes', selectedItemCodes.join(','));

      const validSeriesFilters = seriesBillFilters.filter(f => f.series.trim() !== '');
      if (validSeriesFilters.length > 0) {
        const filtersToSend = validSeriesFilters.map(f => ({
          series: f.series,
          billNumbers: f.billNumbers.trim()
        })).filter(f => f.series);

        if (filtersToSend.length > 0) {
          params.append('seriesBillFilters', JSON.stringify(filtersToSend));
        }
      }

      if (selectedParty?.value) params.append('partyCode', selectedParty.value);
      if (unitFilter !== 'All') params.append('unit', unitFilter);
      if (selectedCompanyCodes.length > 0) params.append('companyCodes', selectedCompanyCodes.join(','));

      const response = await fetch(`${constants.baseURL}/api/reports/item-wise-purchase?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        signal,
      });
      if (signal.aborted) return;
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setReportData(data);

      // Log report generation
      logActivity({
        page: 'Item Wise Purchase Report',
        action: 'Generated Report',
        duration: 0
      });

    } catch (err: any) {
      if (err.name === 'AbortError') console.log('Fetch report aborted');
      else {
        setError(err.message);
        setReportData([]);
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  };

  const currentItemOptions = dynamicItemOptions.length > 0 ? dynamicItemOptions
    : (fromDate && toDate && !filterOptionsLoading ? [{ value: '', text: 'No items found for dates' }] : []);

  const currentPartyOptions = dynamicPartyOptions.length > 0 ? dynamicPartyOptions
    : (fromDate && toDate && !filterOptionsLoading ? [{ value: '', label: 'No parties found for dates' }] : []);

  const handlePrintReport = () => {
    const companyNames = selectedCompanyCodes.map(ccode => companyOptions.find(opt => opt.value === ccode)?.text || ccode).join(', ') || 'All';
    const itemNames = selectedItemCodes.map(itemCode => dynamicItemOptions.find(opt => opt.value === itemCode)?.text || itemCode).join(', ') || 'All';
    const partyName = selectedParty ? selectedParty.label : 'All';
    const seriesFiltersDisplay = seriesBillFilters
      .filter(f => f.series.trim() !== '')
      .map(f => `Series ${f.series}: ${f.billNumbers.trim() || 'All Bills'}`)
      .join('<br>') || 'All';

    let reportHtml = `
      <html><head><title>Item Wise Purchase Report</title>
      <style>
        @page { size: landscape; margin: 0.2in; }
        body { font-family: Arial, sans-serif; margin: 20px; } h1 { text-align: center; margin-bottom: 20px; }
        .filter-criteria { margin-bottom: 20px; padding: 10px; border: 1px solid #ccc; font-size: 0.9em; }
        .filter-criteria p { margin: 5px 0; } .filter-criteria strong { min-width: 100px; display: inline-block;}
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 0.8em; }
        th, td { border: 1px solid #000; padding: 2px; text-align: left; word-break: break-word; }
        th { background-color: #f2f2f2; font-weight: bold; } .text-right { text-align: right; }
        .total-row td { font-weight: bold; background-color: #e9e9e9; }
        .grouped-summary-row { font-weight: bold; cursor: default; } .grouped-summary-row td { background-color: #f8f8f8; }
        .detail-header-row th { background-color: #e0e0e0; font-style: italic; }
        .detail-data-row td { background-color: #fdfdfd; }
        @media print {
          body { margin: 0; font-size: 10pt; } h1 { font-size: 16pt; } .filter-criteria { font-size: 9pt; }
          table { font-size: 8pt; } th, td { padding: 2px; } .filter-criteria { page-break-after: auto; }
          table { page-break-inside: auto; } tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; } tfoot { display: table-footer-group; }
          button, .no-print { display: none !important; } 
        }
      </style></head><body><h1>Item Wise Purchase Report</h1>
      <div class="filter-criteria">
        <p><strong>Date Range:</strong> ${fromDate} to ${toDate}</p>
        <p><strong>Companies:</strong> ${companyNames}</p>
        <p><strong>Party:</strong> ${partyName}</p>
        <p><strong>Items:</strong> ${itemNames}</p>
        <p><strong>Series/Bills:</strong> ${seriesFiltersDisplay}</p>
        <p><strong>Unit:</strong> ${unitFilter}</p>
        <p><strong>Grouped by Item:</strong> ${groupItems ? 'Yes' : 'No'}</p>
      </div>
      <table><thead><tr>${currentTableHeaders.map(header => `<th>${header}</th>`).join('')}</tr></thead><tbody>
    `;

    (processedReportDisplayData as Array<PurchaseReportItem | GroupedPurchaseReportItem>).forEach(row => {
      if (groupItems) {
        const groupedRow = row as GroupedPurchaseReportItem;
        reportHtml += `<tr class="grouped-summary-row">
          <td>${groupedRow.Code}</td><td>${groupedRow.ItemName}</td>
          <td class="text-right">${(groupedRow.displayQty || '').replace(/\n/g, '<br />')}</td>
          <td class="text-right">${(groupedRow.displayFree || '').replace(/\n/g, '<br />')}</td>
          <td class="text-right">${(groupedRow.Gross || 0).toFixed(2)}</td><td class="text-right">${(groupedRow.Scheme || 0).toFixed(2)}</td>
          <td class="text-right">${(groupedRow.NetAmt || 0).toFixed(2)}</td><td class="text-right">${(groupedRow.GoodsAmt || 0).toFixed(2)}</td>
          <td class="text-right">${(groupedRow.GSTAmt || 0).toFixed(2)}</td><td class="text-right">${(groupedRow.FreeV || 0).toFixed(2)}</td>
        </tr>`;

        if (groupedRow.details) {
          reportHtml += `<tr class="detail-header-row">${fullTableHeaders.map(header => `<th>${header}</th>`).join('')}</tr>`;
          groupedRow.details.forEach(detailRow => {
            reportHtml += `<tr class="detail-data-row">
              <td>${detailRow.Date}</td><td>${detailRow.BillNo}</td>
              <td>${detailRow.Code}</td><td>${detailRow.ItemName}</td><td>${detailRow.Party}</td><td>${detailRow.Place}</td>
              <td>${detailRow.Unit}</td><td class="text-right">${(detailRow.Qty || 0).toFixed(2)}</td>
              <td class="text-right">${(detailRow.Free || 0).toFixed(2)}</td><td class="text-right">${(detailRow.Gross || 0).toFixed(2)}</td>
              <td class="text-right">${(detailRow.Scheme || 0).toFixed(2)}</td><td class="text-right">${(detailRow.SchPct || 0).toFixed(2)}</td>
              <td class="text-right">${(detailRow.CD || 0).toFixed(2)}</td><td class="text-right">${(detailRow.NetAmt || 0).toFixed(2)}</td>
              <td class="text-right">${(detailRow.GoodsAmt || 0).toFixed(2)}</td><td class="text-right">${(detailRow.GSTAmt || 0).toFixed(2)}</td>
              <td class="text-right">${(detailRow.FreeV || 0).toFixed(2)}</td>
            </tr>`;
          });
        }
      } else {
        const nonGroupedRow = row as PurchaseReportItem;
        reportHtml += `<tr>
          <td>${nonGroupedRow.Date}</td><td>${nonGroupedRow.BillNo}</td>
          <td>${nonGroupedRow.Code}</td><td>${nonGroupedRow.ItemName}</td><td>${nonGroupedRow.Party}</td>
          <td>${nonGroupedRow.Place}</td><td>${nonGroupedRow.Unit}</td>
          <td class="text-right">${(nonGroupedRow.Qty || 0).toFixed(2)}</td><td class="text-right">${(nonGroupedRow.Free || 0).toFixed(2)}</td>
          <td class="text-right">${(nonGroupedRow.Gross || 0).toFixed(2)}</td><td class="text-right">${(nonGroupedRow.Scheme || 0).toFixed(2)}</td>
          <td class="text-right">${(nonGroupedRow.SchPct || 0).toFixed(2)}</td><td class="text-right">${(nonGroupedRow.CD || 0).toFixed(2)}</td>
          <td class="text-right">${(nonGroupedRow.NetAmt || 0).toFixed(2)}</td><td class="text-right">${(nonGroupedRow.GoodsAmt || 0).toFixed(2)}</td>
          <td class="text-right">${(nonGroupedRow.GSTAmt || 0).toFixed(2)}</td><td class="text-right">${(nonGroupedRow.FreeV || 0).toFixed(2)}</td>
        </tr>`;
      }
    });

    reportHtml += `</tbody>`;

    if (reportData.length > 0) {
      reportHtml += `<tfoot class="total-row"><tr>
        <td colSpan="${groupItems ? 2 : 7}">Total</td>
        <td class="text-right">${(reportTotals.Qty || 0).toFixed(2)}</td><td class="text-right">${(reportTotals.Free || 0).toFixed(2)}</td>
        <td class="text-right">${(reportTotals.Gross || 0).toFixed(2)}</td><td class="text-right">${(reportTotals.Scheme || 0).toFixed(2)}</td>
        ${!groupItems ? `<td class="text-right">-</td><td class="text-right">-</td>` : ''}
        <td class="text-right">${(reportTotals.NetAmt || 0).toFixed(2)}</td><td class="text-right">${(reportTotals.GoodsAmt || 0).toFixed(2)}</td>
        <td class="text-right">${(reportTotals.GSTAmt || 0).toFixed(2)}</td><td class="text-right">${(reportTotals.FreeV || 0).toFixed(2)}</td>
      </tr></tfoot>`;
    }
    reportHtml += `</table></body></html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(reportHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    } else {
      alert('Could not open print window. Please check your browser pop-up settings.');
    }
  };

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
      setSeriesBillFilters([{ series: '', billNumbers: '' }]);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Item Wise Purchase Report</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow w-full lg:w-[75vw]">
        {/* --- Row 1: Date and Company Filters --- */}
        <div>
          <label htmlFor="dateRange" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date Range</label>
          <select id="dateRange" value={selectedDateRange} onChange={(e) => setSelectedDateRange(e.target.value)} className="mt-1 block w-full py-2 px-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:text-gray-200">
            {dateRangeOptions.map(option => <option key={option.value} value={option.value} className="text-black bg-white dark:bg-gray-700 dark:text-gray-200">{option.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="fromDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From Date</label>
          <Input id="fromDate" type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setSelectedDateRange('custom'); }} variant="outlined" disabled={selectedDateRange !== 'custom'} />
        </div>
        <div>
          <label htmlFor="toDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To Date</label>
          <Input id="toDate" type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setSelectedDateRange('custom'); }} variant="outlined" disabled={selectedDateRange !== 'custom'} />
        </div>
        <div>
          <label htmlFor="companyMultiSelect" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company</label>
          <MultiSelect label={companyOptions.length > 0 ? '' : (companyLoadingError ? 'Error loading companies' : 'Loading...')} options={companyOptions} value={selectedCompanyCodes} onChange={setSelectedCompanyCodes} allowFiltering={true} selectOnEnter={true} matchThreshold={3} disabled={companyOptions.length === 0 && !companyLoadingError} />
          {companyLoadingError && <p className="text-xs text-red-500 mt-1">{companyLoadingError}</p>}
        </div>

        {/* --- Row 2: Party and Item Filters --- */}
        <div className="lg:col-span-2">
          <label htmlFor="partyFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Party (Optional)</label>
          <Autocomplete id="partyFilter" label={filterOptionsLoading ? 'Loading parties...' : 'Select Party'} options={currentPartyOptions} onChange={(value) => setSelectedParty(dynamicPartyOptions.find(p => p.value === value) || null)} value={selectedParty?.value || ''} disabled={!fromDate || !toDate || filterOptionsLoading} />
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="itemMultiSelect" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Items (Optional)</label>
          <MultiSelect label={filterOptionsLoading ? 'Loading items...' : ''} options={currentItemOptions} value={selectedItemCodes} onChange={setSelectedItemCodes} allowFiltering={true} selectOnEnter={true} matchThreshold={3} disabled={!fromDate || !toDate || filterOptionsLoading} />
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
                disabled={!filter.series || (user ? (!user.routeAccess.includes('Admin') && user.canSelectSeries === false && !!user.defaultSeries?.reports) : false)}
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
            {['All', 'Box', 'Pcs'].map(unitValue => (
              <div key={unitValue}>
                <input type="radio" id={`unitFilter${unitValue}`} name="unitFilter" value={unitValue} checked={unitFilter === unitValue} onChange={(e) => setUnitFilter(e.target.value as 'All' | 'Box' | 'Pcs')} className="form-radio h-4 w-4 text-indigo-600 transition duration-150 ease-in-out dark:bg-gray-700 dark:border-gray-600" />
                <label htmlFor={`unitFilter${unitValue}`} className="ml-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">{unitValue}</label>
              </div>
            ))}
          </div>
        </div>

        {/* --- Row 4: Grouping and Actions --- */}
        <div className="lg:col-span-2 flex items-center">
          <div className="flex items-center">
            <input type="checkbox" id="groupItems" checked={groupItems} onChange={(e) => setGroupItems(e.target.checked)} className="form-checkbox h-5 w-5 text-indigo-600 transition duration-150 ease-in-out mr-2 rounded dark:bg-gray-700 dark:border-gray-600 focus:ring-indigo-500 dark:focus:ring-indigo-400 dark:ring-offset-gray-800" />
            <label htmlFor="groupItems" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">Group by Item Name</label>
          </div>
        </div>
        <div className="lg:col-span-2 flex items-end justify-end space-x-2">
          <button onClick={handleFetchReport} disabled={loading || !fromDate || !toDate} className="w-full max-w-xs inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50">
            {loading ? 'Loading...' : 'Fetch Report'}
          </button>
          <button onClick={handlePrintReport} disabled={reportData.length === 0 && !loading} className="w-full max-w-xs inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50">
            Print Report
          </button>
          {hiddenColumns.length > 0 && (
            <button
              onClick={handleResetColumns}
              className="w-full max-w-xs inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              Reset Columns
            </button>
          )}
        </div>
      </div>
      {companyLoadingError && <div className="text-red-500 bg-red-100 dark:bg-red-900 dark:text-red-300 p-3 rounded-md mb-4">Company Loading Error: {companyLoadingError}</div>}
      {filterOptionsError && <div className="text-red-500 bg-red-100 dark:bg-red-900 dark:text-red-300 p-3 rounded-md mb-4">Dynamic Filter Error: {filterOptionsError}</div>}
      {error && <div className="text-red-500 bg-red-100 dark:bg-red-900 dark:text-red-300 p-3 rounded-md mb-4">Report Error: {error}</div>}
      <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow-md rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>{currentTableHeaders.map(header => (
              !hiddenColumns.includes(header) && (
                <th key={header} scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                  <div className="flex flex-col items-start">
                    <button
                      onClick={() => handleHideColumn(header)}
                      className="text-gray-400 hover:text-red-600 mb-1 focus:outline-none"
                      title="Hide column"
                    >
                      (-)
                    </button>
                    {header}
                  </div>
                </th>
              )
            ))}</tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {processedReportDisplayData.length === 0 && !loading && (
              <tr><td colSpan={currentTableHeaders.filter(h => !hiddenColumns.includes(h)).length} className="px-4 py-4 text-sm text-center text-gray-500 dark:text-gray-400">No data available for the selected criteria.</td></tr>
            )}
            {processedReportDisplayData.map((row: PurchaseReportItem | GroupedPurchaseReportItem, index) => {
              if (groupItems) {
                const groupedRow = row as GroupedPurchaseReportItem;
                return (
                  <React.Fragment key={`${groupedRow.ItemName}-${index}`}>
                    <tr onClick={() => handleToggleExpand(groupedRow.ItemName)} className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
                      {!hiddenColumns.includes('Code') && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200"><span className="mr-2">{expandedItemNames.has(groupedRow.ItemName) ? '-' : '+'}</span>{groupedRow.Code}</td>}
                      {!hiddenColumns.includes('Item Name') && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{groupedRow.ItemName}</td>}
                      {!hiddenColumns.includes('Qty') && <td className="px-4 py-3 whitespace-pre-line text-sm text-right text-gray-900 dark:text-gray-200">{groupedRow.displayQty}</td>}
                      {!hiddenColumns.includes('Free') && <td className="px-4 py-3 whitespace-pre-line text-sm text-right text-gray-900 dark:text-gray-200">{groupedRow.displayFree}</td>}
                      {!hiddenColumns.includes('Gross') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{groupedRow.Gross.toFixed(2)}</td>}
                      {!hiddenColumns.includes('Scheme') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{groupedRow.Scheme.toFixed(2)}</td>}
                      {!hiddenColumns.includes('NetAmt') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{groupedRow.NetAmt.toFixed(2)}</td>}
                      {!hiddenColumns.includes('GoodsAmt') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{groupedRow.GoodsAmt.toFixed(2)}</td>}
                      {!hiddenColumns.includes('GSTAmt') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{groupedRow.GSTAmt.toFixed(2)}</td>}
                      {!hiddenColumns.includes('FreeV') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{groupedRow.FreeV.toFixed(2)}</td>}
                    </tr>
                    {expandedItemNames.has(groupedRow.ItemName) && (
                      <>
                        <tr className="bg-gray-200 dark:bg-gray-700/80">
                          {fullTableHeaders.map((header, headerIndex) => (
                            !hiddenColumns.includes(header) && (
                              <th key={`detail-header-${headerIndex}`} className={`px-4 py-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap ${headerIndex === 0 ? 'pl-8' : ''}`}>{header}</th>
                            )
                          ))}
                        </tr>
                        {groupedRow.details.map((detailRow, detailIndex) => (
                          <tr key={`${groupedRow.ItemName}-detail-${detailIndex}`} className="bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-700/70">
                            {!hiddenColumns.includes('Date') && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 pl-8">{detailRow.Date}</td>}
                            {!hiddenColumns.includes('Bill No.') && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{detailRow.BillNo}</td>}
                            {!hiddenColumns.includes('Code') && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{detailRow.Code}</td>}
                            {!hiddenColumns.includes('Item Name') && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{detailRow.ItemName}</td>}
                            {!hiddenColumns.includes('Party') && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{detailRow.Party}</td>}
                            {!hiddenColumns.includes('Place') && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{detailRow.Place}</td>}
                            {!hiddenColumns.includes('Unit') && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{detailRow.Unit}</td>}
                            {!hiddenColumns.includes('Qty') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">{detailRow.Qty.toFixed(2)}</td>}
                            {!hiddenColumns.includes('Free') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">{detailRow.Free.toFixed(2)}</td>}
                            {!hiddenColumns.includes('Gross') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">{detailRow.Gross.toFixed(2)}</td>}
                            {!hiddenColumns.includes('Scheme') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">{detailRow.Scheme.toFixed(2)}</td>}
                            {!hiddenColumns.includes('Sch.%') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">{detailRow.SchPct.toFixed(2)}</td>}
                            {!hiddenColumns.includes('CD') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">{detailRow.CD.toFixed(2)}</td>}
                            {!hiddenColumns.includes('NetAmt') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-gray-700 dark:text-gray-300">{detailRow.NetAmt.toFixed(2)}</td>}
                            {!hiddenColumns.includes('GoodsAmt') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">{detailRow.GoodsAmt.toFixed(2)}</td>}
                            {!hiddenColumns.includes('GSTAmt') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">{detailRow.GSTAmt.toFixed(2)}</td>}
                            {!hiddenColumns.includes('FreeV') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700 dark:text-gray-300">{detailRow.FreeV.toFixed(2)}</td>}
                          </tr>
                        ))}
                      </>
                    )}
                  </React.Fragment>
                );
              } else {
                const nonGroupedRow = row as PurchaseReportItem;
                return (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    {!hiddenColumns.includes('Date') && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{nonGroupedRow.Date}</td>}
                    {!hiddenColumns.includes('Bill No.') && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{nonGroupedRow.BillNo}</td>}
                    {!hiddenColumns.includes('Code') && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{nonGroupedRow.Code}</td>}
                    {!hiddenColumns.includes('Item Name') && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{nonGroupedRow.ItemName}</td>}
                    {!hiddenColumns.includes('Party') && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{nonGroupedRow.Party}</td>}
                    {!hiddenColumns.includes('Place') && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{nonGroupedRow.Place}</td>}
                    {!hiddenColumns.includes('Unit') && <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{nonGroupedRow.Unit}</td>}
                    {!hiddenColumns.includes('Qty') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{nonGroupedRow.Qty.toFixed(2)}</td>}
                    {!hiddenColumns.includes('Free') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{nonGroupedRow.Free.toFixed(2)}</td>}
                    {!hiddenColumns.includes('Gross') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{nonGroupedRow.Gross.toFixed(2)}</td>}
                    {!hiddenColumns.includes('Scheme') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{nonGroupedRow.Scheme.toFixed(2)}</td>}
                    {!hiddenColumns.includes('Sch.%') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{nonGroupedRow.SchPct.toFixed(2)}</td>}
                    {!hiddenColumns.includes('CD') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{nonGroupedRow.CD.toFixed(2)}</td>}
                    {!hiddenColumns.includes('NetAmt') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-gray-900 dark:text-gray-100">{nonGroupedRow.NetAmt.toFixed(2)}</td>}
                    {!hiddenColumns.includes('GoodsAmt') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{nonGroupedRow.GoodsAmt.toFixed(2)}</td>}
                    {!hiddenColumns.includes('GSTAmt') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{nonGroupedRow.GSTAmt.toFixed(2)}</td>}
                    {!hiddenColumns.includes('FreeV') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-200">{nonGroupedRow.FreeV.toFixed(2)}</td>}
                  </tr>
                );
              }
            })}
          </tbody>
          {reportData.length > 0 && (
            <tfoot className="bg-gray-100 dark:bg-gray-700 font-semibold">
              <tr>
                {(() => {
                  const colSpan = (groupItems ? ['Code', 'Item Name'] : ['Date', 'Bill No.', 'Code', 'Item Name', 'Party', 'Place', 'Unit']).filter(h => !hiddenColumns.includes(h)).length;
                  return colSpan > 0 ? <td colSpan={colSpan} className="px-4 py-3 text-left text-sm text-gray-800 dark:text-gray-100 uppercase whitespace-nowrap">Total</td> : null;
                })()}
                {!hiddenColumns.includes('Qty') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">{reportTotals.Qty.toFixed(2)}</td>}
                {!hiddenColumns.includes('Free') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">{reportTotals.Free.toFixed(2)}</td>}
                {!hiddenColumns.includes('Gross') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">{reportTotals.Gross.toFixed(2)}</td>}
                {!hiddenColumns.includes('Scheme') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">{reportTotals.Scheme.toFixed(2)}</td>}
                {!groupItems && (<>
                  {!hiddenColumns.includes('Sch.%') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">-</td>}
                  {!hiddenColumns.includes('CD') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">-</td>}
                </>)}
                {!hiddenColumns.includes('NetAmt') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">{reportTotals.NetAmt.toFixed(2)}</td>}
                {!hiddenColumns.includes('GoodsAmt') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">{reportTotals.GoodsAmt.toFixed(2)}</td>}
                {!hiddenColumns.includes('GSTAmt') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">{reportTotals.GSTAmt.toFixed(2)}</td>}
                {!hiddenColumns.includes('FreeV') && <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-800 dark:text-gray-100">{reportTotals.FreeV.toFixed(2)}</td>}
              </tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

const ItemWisePurchase: React.FC = () => {
  const [dummyItemsState, setDummyItemsState] = useState<any[]>([]);
  const dummyUpdateItem = (index: number, updatedItem: any) => { };
  const dummyRemoveItem = (index: number) => { };
  const dummyAddItem = (item?: any) => { };
  const dummyCalculateTotal = () => '0.00';
  const [dummyExpandedIndex, setDummyExpandedIndex] = useState<number | null>(null);
  const [dummyFocusNewItemIndex, setDummyFocusNewItemIndex] = useState<number | null>(null);

  return (
    <InvoiceProvider
      items={dummyItemsState}
      updateItem={dummyUpdateItem}
      removeItem={dummyRemoveItem}
      addItem={dummyAddItem}
      calculateTotal={dummyCalculateTotal}
      expandedIndex={dummyExpandedIndex}
      setExpandedIndex={setDummyExpandedIndex}
      focusNewItemIndex={dummyFocusNewItemIndex}
      setFocusNewItemIndex={setDummyFocusNewItemIndex}
      setItems={setDummyItemsState}
    >
      <ItemWisePurchaseContent />
    </InvoiceProvider>
  );
};

export default ItemWisePurchase; 