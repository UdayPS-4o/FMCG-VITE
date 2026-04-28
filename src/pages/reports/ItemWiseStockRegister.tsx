import React, { useState, useEffect, useRef, useMemo } from 'react';
import Autocomplete, { AutocompleteRefHandle } from '../../components/form/input/Autocomplete';
import Input from '../../components/form/input/Input';
import DatePicker from '../../components/form/input/DatePicker';
import constants from '../../constants';
import useActivityTracker from '../../hooks/useActivityTracker';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Toast from '../../components/ui/toast/Toast';

// Define interfaces
interface TransactionDetail {
  type: string;
  billNo: string;
  partyName: string;
  quantity: number;
}

interface StockRegisterItem {
  date: string;
  openingStock: number;
  purchase: number;
  salesReturn: number;
  transferIn: number;
  sales: number;
  purReturn: number;
  transferOut: number;
  balanceStock: number;
  details?: TransactionDetail[];
}

interface Option {
  value: string;
  label: string;
}

interface User {
  id: number;
  name: string;
  username: string;
  routeAccess: string[];
  powers: string[];
  godownAccess: string[];
}

interface PmplItem {
  CODE: string;
  PRODUCT: string;
  MULT_F: number;
}

interface GodownItem {
  GDN_CODE: string;
  GDN_NAME: string;
}

// Utility function to format date as DD/MM/YYYY
const formatDateDDMMYYYY = (dateString: string): string => {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

// Utility function to get local date as DD-MM-YYYY
const getLocalDateDDMMYYYY = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

// Convert BOX+PCS format utility
const convertToPcsAndBoxFormat = (totalPcs: number, multF: number, displayInBoxPcs: boolean): string => {
  if (!displayInBoxPcs || !multF || multF === 1) {
    return totalPcs.toString();
  }

  const boxes = Math.floor(totalPcs / multF);
  const remainingPcs = totalPcs % multF;

  if (boxes === 0) {
    return remainingPcs.toString();
  } else if (remainingPcs === 0) {
    return `${boxes}B`;
  } else {
    return `${boxes}B+${remainingPcs}`;
  }
};

const ItemWiseStockRegister: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const { logActivity } = useActivityTracker();
  const [fromDate, setFromDate] = useState<string>(getLocalDateDDMMYYYY(new Date()));
  const [toDate, setToDate] = useState<string>(getLocalDateDDMMYYYY(new Date()));
  const [selectedItem, setSelectedItem] = useState<Option | null>(null);
  const [selectedGodown, setSelectedGodown] = useState<Option | null>(null);
  const [displayInBoxPcs, setDisplayInBoxPcs] = useState<boolean>(false);
  const [showPartyDetails, setShowPartyDetails] = useState<boolean>(false);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [expandAll, setExpandAll] = useState<boolean>(false);
  const [reportData, setReportData] = useState<StockRegisterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pmplData, setPmplData] = useState<PmplItem[]>([]);
  const [godownOptions, setGodownOptions] = useState<Option[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [toast, setToast] = useState<{
    visible: boolean,
    message: string,
    type: 'success' | 'error' | 'info'
  }>({
    visible: false,
    message: '',
    type: 'info'
  });

  // Get user data from localStorage
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

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');

        const [pmplResponse, godownResponse] = await Promise.all([
          fetch(`${constants.baseURL}/api/dbf/pmpl.json`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`${constants.baseURL}/api/godowns`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);

        if (!pmplResponse.ok || !godownResponse.ok) {
          throw new Error('Failed to fetch data');
        }

        const pmplData = await pmplResponse.json();
        const godownData = await godownResponse.json();

        setPmplData(pmplData);

        // Process godown options and filter by user access
        let filteredGodowns = godownData;
        if (user && user.godownAccess && user.godownAccess.length > 0) {
          filteredGodowns = godownData.filter((godown: GodownItem) =>
            user.godownAccess.includes(godown.GDN_CODE)
          );
        }

        const godownOptions = filteredGodowns.map((godown: GodownItem) => ({
          value: godown.GDN_CODE,
          label: `${godown.GDN_NAME} (${godown.GDN_CODE})`
        }));

        setGodownOptions(godownOptions);
      } catch (error) {
        console.error('Failed to fetch data:', error);
        setError('Failed to load data');
      } finally {
        setDataLoading(false);
      }
    };

    if (user !== null) { // Only fetch after user state is determined
      fetchData();
    }
  }, [user]);

  // Prepare item options from pmplData
  const itemOptions = useMemo(() => {
    if (!pmplData) return [];

    return pmplData.map((item) => ({
      value: item.CODE,
      label: `${item.CODE} | ${item.PRODUCT || 'No Product Name'}`
    }));
  }, [pmplData]);

  const handleFromDateChange = (selectedDate: string) => {
    setFromDate(selectedDate);
  };

  const handleToDateChange = (selectedDate: string) => {
    setToDate(selectedDate);
  };

  const handleItemChange = (value: string) => {
    const selected = itemOptions.find(option => option.value === value);
    setSelectedItem(selected || null);
  };

  const handleGodownChange = (value: string) => {
    const selected = godownOptions.find(option => option.value === value);
    setSelectedGodown(selected || null);
  };

  const validateForm = (): boolean => {
    if (!selectedItem) {
      setToast({
        visible: true,
        message: 'Please select an item',
        type: 'error'
      });
      return false;
    }

    if (!selectedGodown) {
      setToast({
        visible: true,
        message: 'Please select a godown',
        type: 'error'
      });
      return false;
    }

    if (!fromDate || !toDate) {
      setToast({
        visible: true,
        message: 'Please select both from and to dates',
        type: 'error'
      });
      return false;
    }

    // Validate date range
    const from = new Date(fromDate.split('-').reverse().join('-'));
    const to = new Date(toDate.split('-').reverse().join('-'));

    if (from > to) {
      setToast({
        visible: true,
        message: 'From date cannot be after To date',
        type: 'error'
      });
      return false;
    }

    return true;
  };

  const generateReport = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${constants.baseURL}/api/reports/item-wise-stock-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fromDate: fromDate.split('-').reverse().join('-'), // Convert DD-MM-YYYY to YYYY-MM-DD
          toDate: toDate.split('-').reverse().join('-'), // Convert DD-MM-YYYY to YYYY-MM-DD
          itemCode: selectedItem?.value,
          godownCode: selectedGodown?.value,
          displayInBoxPcs,
          showPartyDetails
        })
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const data = await response.json();
      setReportData(data.reportData || []);

      setToast({
        visible: true,
        message: 'Report generated successfully!',
        type: 'success'
      });

      // Log report generation
      logActivity({
        page: 'Item Wise Stock Register',
        action: 'Generated Report',
        duration: 0
      });

    } catch (error) {
      console.error('Failed to generate report:', error);
      setError('Failed to generate report');
      setToast({
        visible: true,
        message: 'Failed to generate report',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (reportData.length === 0) {
      setToast({
        visible: true,
        message: 'No data to print. Please generate the report first.',
        type: 'info'
      });
      return;
    }

    // If expand all is selected and party details are shown, ensure all rows are expanded before printing
    if (showPartyDetails && expandAll) {
      const rowsWithDetails = reportData
        .map((item, index) => ({ index, hasDetails: item.details && item.details.length > 0 }))
        .filter(row => row.hasDetails)
        .map(row => row.index);
      setExpandedRows(new Set(rowsWithDetails));
    }

    // Small delay to ensure state updates are applied
    setTimeout(() => {
      // Get the table element
      const tableElement = document.querySelector('.print-table');
      if (!tableElement) {
        setToast({ visible: true, message: 'Table not found for printing', type: 'error' });
        return;
      }

      // Create a new window for printing
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setToast({ visible: true, message: 'Unable to open print window', type: 'error' });
        return;
      }

      // Create the print content
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Item Wise Stock Register</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
              font-size: 12px;
            }
            .print-header {
              text-align: center;
              margin-bottom: 20px;
              padding-bottom: 15px;
              border-bottom: 2px solid #333;
            }
            .print-header h1 {
              margin: 0 0 10px 0;
              font-size: 18px;
              color: #333;
            }
            .print-details {
              margin: 0;
              font-size: 12px;
              color: #666;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th, td {
              border: 1px solid #000;
              padding: 6px;
              text-align: left;
              font-size: 11px;
            }
            th {
              background-color: #f5f5f5;
              font-weight: bold;
            }
            .expand-btn {
              display: none;
            }
            @media print {
              body { margin: 0; }
              .print-header { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="print-header">
            <h1>Item Wise Stock Register</h1>
            <div class="print-details">
              <p>Item: ${selectedItem?.label || 'All Items'}</p>
              <p>Godown: ${selectedGodown?.label || 'All Godowns'}</p>
              <p>Period: ${fromDate} to ${toDate}</p>
              <p>Generated on: ${new Date().toLocaleDateString()}</p>
            </div>
          </div>
          ${tableElement.outerHTML}
        </body>
        </html>
      `;

      // Write content to the new window
      printWindow.document.write(printContent);
      printWindow.document.close();

      // Wait for content to load, then print
      printWindow.onload = () => {
        printWindow.print();
        printWindow.close();
      };
    }, 100);
  };

  // Handle row expansion for party details
  const toggleRowExpansion = (index: number) => {
    const newExpandedRows = new Set(expandedRows);
    if (newExpandedRows.has(index)) {
      newExpandedRows.delete(index);
    } else {
      newExpandedRows.add(index);
    }
    setExpandedRows(newExpandedRows);

    // Update expandAll state based on whether all expandable rows are now expanded
    const rowsWithDetails = reportData
      .map((item, idx) => ({ index: idx, hasDetails: item.details && item.details.length > 0 }))
      .filter(row => row.hasDetails)
      .map(row => row.index);

    const allExpanded = rowsWithDetails.every(idx => newExpandedRows.has(idx));
    setExpandAll(allExpanded && rowsWithDetails.length > 0);
  };

  const toggleExpandAll = () => {
    if (expandAll) {
      // Collapse all
      setExpandedRows(new Set());
      setExpandAll(false);
    } else {
      // Expand all rows that have details
      const rowsWithDetails = reportData
        .map((item, index) => ({ index, hasDetails: item.details && item.details.length > 0 }))
        .filter(row => row.hasDetails)
        .map(row => row.index);
      setExpandedRows(new Set(rowsWithDetails));
      setExpandAll(true);
    }
  };

  // Reset expanded rows when showPartyDetails changes
  useEffect(() => {
    setExpandedRows(new Set());
    setExpandAll(false);
  }, [showPartyDetails]);

  // Calculate totals
  const totals = useMemo(() => {
    if (reportData.length === 0) return null;

    return reportData.reduce((acc, item) => ({
      openingStock: acc.openingStock + item.openingStock,
      purchase: acc.purchase + item.purchase,
      salesReturn: acc.salesReturn + item.salesReturn,
      transferIn: acc.transferIn + item.transferIn,
      sales: acc.sales + item.sales,
      purReturn: acc.purReturn + item.purReturn,
      transferOut: acc.transferOut + item.transferOut,
      balanceStock: item.balanceStock // Take the last balance stock as final balance
    }), {
      openingStock: 0,
      purchase: 0,
      salesReturn: 0,
      transferIn: 0,
      sales: 0,
      purReturn: 0,
      transferOut: 0,
      balanceStock: 0
    });
  }, [reportData]);

  // Get selected item details for display formatting
  const selectedItemDetails = useMemo(() => {
    if (!selectedItem || !pmplData) return null;
    return pmplData.find(item => item.CODE === selectedItem.value);
  }, [selectedItem, pmplData]);

  if (dataLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <PageMeta
        title="Item Wise Stock Register | FMCG Vite Admin Template"
        description="Item Wise Stock Register Report"
      />
      <PageBreadcrumb pageTitle="Item Wise Stock Register" />

      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast({ ...toast, visible: false })}
      />

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm mb-6 no-print">
        <h2 className="text-xl font-semibold mb-4 dark:text-white">Filters</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <DatePicker
              id="fromDate"
              label="From Date"
              value={fromDate}
              onChange={handleFromDateChange}
              dateFormatType="dd-mm-yyyy"
              required
            />
          </div>

          <div>
            <DatePicker
              id="toDate"
              label="To Date"
              value={toDate}
              onChange={handleToDateChange}
              dateFormatType="dd-mm-yyyy"
              required
            />
          </div>

          <div>
            <Autocomplete
              id="item"
              label="Item Name"
              options={itemOptions}
              onChange={handleItemChange}
              value={selectedItem?.value || ''}
            />
          </div>

          <div>
            <Autocomplete
              id="godown"
              label="Select Godown"
              options={godownOptions}
              onChange={handleGodownChange}
              value={selectedGodown?.value || ''}
            />
          </div>

          <div className="flex items-center">
            <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={displayInBoxPcs}
                onChange={(e) => setDisplayInBoxPcs(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span>Display in BOX+PCS format</span>
            </label>
          </div>

          <div className="flex items-center space-x-6">
            <div className="flex items-center">
              <label className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={showPartyDetails}
                  onChange={(e) => setShowPartyDetails(e.target.checked)}
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span>Show Party Details</span>
              </label>
            </div>

            {showPartyDetails && (
              <button
                onClick={toggleExpandAll}
                className="inline-flex items-center px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500"
              >
                {expandAll ? (
                  <>
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    Collapse All
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    Expand All
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="flex space-x-4">
          <button
            type="button"
            onClick={generateReport}
            disabled={loading}
            className="px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg mb-6 no-print">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {reportData.length > 0 && (
        <div className="print-only">
          <div className="print-header">
            <h3 className="text-lg font-semibold dark:text-white">
              Item Wise Stock Register
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Item: {selectedItem?.label} | Godown: {selectedGodown?.label} |
              Period: {fromDate} to {toDate}
              {displayInBoxPcs && " | Format: BOX+PCS"}
            </p>
          </div>

          {/* Print button - only visible on screen */}
          <div className="no-print mb-4 flex justify-end">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
              Print Report
            </button>
          </div>

          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 print-table">
              <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-10">
                <tr>
                  {showPartyDetails && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-12">

                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Opening Stock
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Purchase
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Sales Return
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Transfer IN
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Sales
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Pur Return
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Transfer OUT
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Balance Stock
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {reportData.map((item, index) => (
                  <React.Fragment key={index}>
                    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      {showPartyDetails && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {item.details && item.details.length > 0 && (
                            <button
                              onClick={() => toggleRowExpansion(index)}
                              className="text-brand-600 hover:text-brand-800 focus:outline-none"
                            >
                              {expandedRows.has(index) ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              )}
                            </button>
                          )}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {formatDateDDMMYYYY(item.date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {displayInBoxPcs ?
                          convertToPcsAndBoxFormat(item.openingStock, selectedItemDetails?.MULT_F || 1, displayInBoxPcs) :
                          item.openingStock
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {displayInBoxPcs ?
                          convertToPcsAndBoxFormat(item.purchase, selectedItemDetails?.MULT_F || 1, displayInBoxPcs) :
                          item.purchase
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {displayInBoxPcs ?
                          convertToPcsAndBoxFormat(item.salesReturn, selectedItemDetails?.MULT_F || 1, displayInBoxPcs) :
                          item.salesReturn
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {displayInBoxPcs ?
                          convertToPcsAndBoxFormat(item.transferIn, selectedItemDetails?.MULT_F || 1, displayInBoxPcs) :
                          item.transferIn
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {displayInBoxPcs ?
                          convertToPcsAndBoxFormat(item.sales, selectedItemDetails?.MULT_F || 1, displayInBoxPcs) :
                          item.sales
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {displayInBoxPcs ?
                          convertToPcsAndBoxFormat(item.purReturn, selectedItemDetails?.MULT_F || 1, displayInBoxPcs) :
                          item.purReturn
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {displayInBoxPcs ?
                          convertToPcsAndBoxFormat(item.transferOut, selectedItemDetails?.MULT_F || 1, displayInBoxPcs) :
                          item.transferOut
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        {displayInBoxPcs ?
                          convertToPcsAndBoxFormat(item.balanceStock, selectedItemDetails?.MULT_F || 1, displayInBoxPcs) :
                          item.balanceStock
                        }
                      </td>
                    </tr>

                    {/* Expanded details row */}
                    {showPartyDetails && expandedRows.has(index) && item.details && item.details.length > 0 && (
                      <tr className="bg-gray-50 dark:bg-gray-900">
                        <td colSpan={showPartyDetails ? 10 : 9} className="px-6 py-4">
                          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                              Transaction Details for {formatDateDDMMYYYY(item.date)}
                            </h4>
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-700">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                      Type
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                      Bill No.
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                      Party Name
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                      Quantity
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                  {item.details.map((detail, detailIndex) => (
                                    <tr key={detailIndex} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${detail.type === 'Purchase' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                          detail.type === 'Sales' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                            detail.type === 'Transfer In' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                              detail.type === 'Transfer Out' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                                'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                                          }`}>
                                          {detail.type}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                                        {detail.billNo}
                                      </td>
                                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                                        {detail.partyName}
                                      </td>
                                      <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                                        <span className={detail.quantity >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                          {displayInBoxPcs ?
                                            convertToPcsAndBoxFormat(Math.abs(detail.quantity), selectedItemDetails?.MULT_F || 1, displayInBoxPcs) :
                                            Math.abs(detail.quantity)
                                          }
                                          {detail.quantity >= 0 ? ' (+)' : ' (-)'}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}

                {totals && (
                  <tr className="bg-gray-100 dark:bg-gray-700 font-semibold">
                    {showPartyDetails && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {/* Empty cell for expand/collapse column */}
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      Total
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {displayInBoxPcs ?
                        convertToPcsAndBoxFormat(totals.openingStock, selectedItemDetails?.MULT_F || 1, displayInBoxPcs) :
                        totals.openingStock
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {displayInBoxPcs ?
                        convertToPcsAndBoxFormat(totals.purchase, selectedItemDetails?.MULT_F || 1, displayInBoxPcs) :
                        totals.purchase
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {displayInBoxPcs ?
                        convertToPcsAndBoxFormat(totals.salesReturn, selectedItemDetails?.MULT_F || 1, displayInBoxPcs) :
                        totals.salesReturn
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {displayInBoxPcs ?
                        convertToPcsAndBoxFormat(totals.transferIn, selectedItemDetails?.MULT_F || 1, displayInBoxPcs) :
                        totals.transferIn
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {displayInBoxPcs ?
                        convertToPcsAndBoxFormat(totals.sales, selectedItemDetails?.MULT_F || 1, displayInBoxPcs) :
                        totals.sales
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {displayInBoxPcs ?
                        convertToPcsAndBoxFormat(totals.purReturn, selectedItemDetails?.MULT_F || 1, displayInBoxPcs) :
                        totals.purReturn
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {displayInBoxPcs ?
                        convertToPcsAndBoxFormat(totals.transferOut, selectedItemDetails?.MULT_F || 1, displayInBoxPcs) :
                        totals.transferOut
                      }
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-gray-100">
                      {displayInBoxPcs ?
                        convertToPcsAndBoxFormat(totals.balanceStock, selectedItemDetails?.MULT_F || 1, displayInBoxPcs) :
                        totals.balanceStock
                      }
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemWiseStockRegister;