import React, { useState, useEffect, useRef } from 'react';
import Autocomplete, { AutocompleteRefHandle } from '../../components/form/input/Autocomplete';
import Input from '../../components/form/input/Input';
import { useInvoiceContext, InvoiceContextType } from '../../contexts/InvoiceContext'; // Import InvoiceContextType
import InvoiceProvider from '../../contexts/InvoiceProvider'; // Import InvoiceProvider
import constants from '../../constants';

// Define the structure of a sales report item (same as ItemWiseSales)
interface SalesReportItem {
  Date: string; // Added Date
  Code: string; // Item Code
  ItemName: string; // Added ItemName
  Party: string; // Party Name (Company)
  Place: string;
  Unit: string;
  Qty: number;
  Free: number;
  Gross: number;
  Scheme: number;
  SchPct: number; // Sch.%
  CD: number;
  NetAmt: number;
  GoodsAmt: number;
  GSTAmt: number;
  FreeV: number; // FreeValue
}

// Content component that uses the context
const CompanyWiseSalesContent: React.FC = () => {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedPartyCode, setSelectedPartyCode] = useState<string | null>(null); // Store only party code
  const [selectedItem, setSelectedItem] = useState<any | null>(null); // Optional item filter
  const [reportData, setReportData] = useState<SalesReportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { pmplData, partyOptions } = useInvoiceContext(); // Use partyOptions from InvoiceContext
//   const { acmastData } = []; // For party/company suggestions

  const partyAutocompleteRef = useRef<AutocompleteRefHandle>(null);
  const itemAutocompleteRef = useRef<AutocompleteRefHandle>(null);
  
  // Effect to set default dates
  useEffect(() => {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const formatDate = (date: Date) => date.toISOString().split('T')[0];
    setFromDate(formatDate(firstDayOfMonth));
    setToDate(formatDate(today));
  }, []);

  const handleFetchReport = async () => {
    if (!fromDate || !toDate) {
      alert('Please select both From Date and To Date.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        fromDate,
        toDate,
      });
      if (selectedPartyCode) { // Check selectedPartyCode
        params.append('partyCode', selectedPartyCode);
      }
      if (selectedItem && selectedItem.CODE) {
        params.append('itemCode', selectedItem.CODE); // Optional item filter
      }

      const response = await fetch(`${constants.baseURL}/api/reports/company-wise-sales?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setReportData(data);
    } catch (err: any) {
      setError(err.message);
      setReportData([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Company Wise Sales Report</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-5 gap-4 mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div>
          <label htmlFor="fromDate-cws" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From Date</label>
          <Input
            id="fromDate-cws"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            variant="outlined"
          />
        </div>
        <div>
          <label htmlFor="toDate-cws" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To Date</label>
          <Input
            id="toDate-cws"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            variant="outlined"
          />
        </div>
        
        <div className="xl:col-span-1">
          <label htmlFor="partySearch-cws" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Party/Company (Optional)</label>
           <Autocomplete
            id="partySearch-cws"
            label=""
            options={partyOptions}
            onChange={(value) => {
                setSelectedPartyCode(value); // value is the party ACCODE (string)
            }}
            ref={partyAutocompleteRef}
          />
        </div>

        <div className="xl:col-span-1">
          <label htmlFor="itemSearch-cws" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Item (Optional)</label>
          <Autocomplete
            id="itemSearch-cws"
            label=""
            options={pmplData.map((item) => ({
              value: item.CODE,
              label: `${item.CODE} | ${item.PRODUCT || 'No Product Name'}`
            }))}
            onChange={(value) => {
              const item = pmplData.find(p => p.CODE === value);
              setSelectedItem(item || null);
            }}
            ref={itemAutocompleteRef}
          />
        </div>
        
        <div className="flex items-end">
          <button
            onClick={handleFetchReport}
            disabled={loading}
            className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Fetch Report'}
          </button>
        </div>
      </div>

      {error && <div className="text-red-500 bg-red-100 dark:bg-red-900 dark:text-red-300 p-3 rounded-md mb-4">Error: {error}</div>}

      <div className="overflow-x-auto bg-white dark:bg-gray-800 shadow-md rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              {['Date', 'Code', 'Item Name', 'Party', 'Place', 'Unit', 'Qty', 'Free', 'Gross', 'Scheme', 'Sch.%', 'CD', 'Net Amt', 'Goods Amt', 'GST Amt', 'FreeV'].map(header => (
                <th key={header} scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {reportData.length === 0 && !loading && (
              <tr>
                <td colSpan={16} className="px-4 py-4 text-sm text-center text-gray-500 dark:text-gray-400">
                  No data available for the selected criteria.
                </td>
              </tr>
            )}
            {reportData.map((row, index) => (
              <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{row.Date}</td>
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

// Main component that includes the provider
const CompanyWiseSales: React.FC = () => {
  // Dummy props for InvoiceProvider, similar to ItemWiseSales
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
      setItems={dummySetItems} // Add setItems to satisfy the InvoiceContextType
    >
      <CompanyWiseSalesContent />
    </InvoiceProvider>
  );
};

export default CompanyWiseSales; 