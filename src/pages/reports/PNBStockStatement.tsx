import React, { useState, useEffect } from 'react';
import constants from '../../constants';
import useActivityTracker from '../../hooks/useActivityTracker';
import useAuth from '../../hooks/useAuth';

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

// Define the structure of stock data
interface StockItem {
  code: string;
  product: string;
  currentStock: number;
  unit?: string;
  purchases?: number;
  sales?: number;
  rate?: number;
}

interface DebtorBalance {
  code: string;
  name: string;
  balance: number;
  gstin?: string;
}

interface CreditorBalance {
  code: string;
  name: string;
  balance: number;
  gstin?: string;
}

interface SummaryData {
  totalSales: number;
  totalPurchases: number;
  totalStockItems: number;
  totalDebtors: number;
  period?: { month: number; year: number } | null;
}

const MONTHS = [
  { value: 1,  label: 'January' },
  { value: 2,  label: 'February' },
  { value: 3,  label: 'March' },
  { value: 4,  label: 'April' },
  { value: 5,  label: 'May' },
  { value: 6,  label: 'June' },
  { value: 7,  label: 'July' },
  { value: 8,  label: 'August' },
  { value: 9,  label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const currentYear  = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

const PNBStockStatement: React.FC = () => {
  const { logActivity } = useActivityTracker();
  const { user } = useAuth();
  const hasAdminAccess = Boolean(user?.routeAccess?.includes('Admin'));

  const [loading, setLoading]             = useState(false);
  const [excelLoading, setExcelLoading]   = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [stockData, setStockData]         = useState<StockItem[]>([]);
  const [debtorData, setDebtorData]       = useState<DebtorBalance[]>([]);
  const [creditorData, setCreditorData]   = useState<CreditorBalance[]>([]);
  const [summaryData, setSummaryData]     = useState<SummaryData | null>(null);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [targetStockValue, setTargetStockValue] = useState('');

  // Period selectors – default to previous month
  const [selectedMonth, setSelectedMonth] = useState(currentMonth === 1 ? 12 : currentMonth - 1);
  const [selectedYear,  setSelectedYear]  = useState(currentMonth === 1 ? currentYear - 1 : currentYear);

  // Years to show in selector
  const years = Array.from({ length: currentYear - 2022 }, (_, i) => 2023 + i);


  const generateReport = async () => {
    setLoading(true);
    setError(null);

    try {
      const url = `${constants.baseURL}/api/reports/pnb-stock-statement?month=${selectedMonth}&year=${selectedYear}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setStockData(data.stockData || []);
      setDebtorData(data.debtorData || []);
      setCreditorData(data.creditorData || []);
      setSummaryData(data.summary || null);
      setReportGenerated(true);

      logActivity({
        page: 'PNB Stock Statement',
        action: `Generated Report for ${MONTHS[selectedMonth - 1].label} ${selectedYear}`,
        duration: 0
      });

    } catch (err) {
      console.error('Error generating PNB stock statement:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveExcel = async () => {
    if (!reportGenerated) {
      alert('Please generate the report first.');
      return;
    }

    setExcelLoading(true);
    try {
      const response = await fetch(`${constants.baseURL}/api/reports/pnb-stock-statement/excel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stockData,
          debtorData,
          creditorData,
          summaryData,
          period: { month: selectedMonth, year: selectedYear }
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `HTTP error! status: ${response.status}`);
      }

      // Download the blob as a file
      const blob = await response.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const monthName = MONTHS[selectedMonth - 1].label.substring(0, 3);
      a.href     = url;
      a.download = `PNB_Stock_Statement_${monthName}${selectedYear}.xlsm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

    } catch (err) {
      console.error('Error saving Excel file:', err);
      alert(`Failed to save Excel file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setExcelLoading(false);
    }
  };

  const handleAdjustStock = () => {
    if (!stockData.length) return;
    const target = parseFloat(targetStockValue);
    if (isNaN(target) || target <= 0) {
      alert("Please enter a valid positive target stock value.");
      return;
    }

    const currentTotalValue = stockData.reduce((sum, item) => sum + (item.currentStock * (item.rate || 0)), 0);
    
    if (currentTotalValue <= 0) {
      alert("Current stock value is zero. Cannot adjust proportionally.");
      return;
    }

    if (Math.abs(target - currentTotalValue) <= 100) {
       alert(`Target value is already met (Difference is within ₹100). Current value: ₹${currentTotalValue.toFixed(2)}`);
       return;
    }

    const multiplier = target / currentTotalValue;

    const newStockData = stockData.map(item => {
      // increase/decrease currentStock proportionally
      return {
        ...item,
        currentStock: parseFloat((item.currentStock * multiplier).toFixed(3)) // 3 decimal places for qty
      };
    });

    setStockData(newStockData);
    setTargetStockValue('');
    alert(`Stock quantities adjusted successfully!\nPrevious Value: ₹${currentTotalValue.toFixed(2)}\nNew Value: ₹${target.toFixed(2)}`);
  };

  const handlePrint = () => {
    if (!reportGenerated) {
      alert('Please generate the report first.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Unable to open print window');
      return;
    }

    const periodLabel = `${MONTHS[selectedMonth - 1].label} ${selectedYear}`;

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>PNB Stock Statement - ${periodLabel}</title>
        <style>
          @page { size: A4; margin: 0.5in; }
          body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 10px; }
          .section { margin-bottom: 30px; }
          .section-title { font-size: 16px; font-weight: bold; margin-bottom: 10px; background-color: #f0f0f0; padding: 5px; border: 1px solid #000; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; font-size: 10px; }
          th { background-color: #f0f0f0; font-weight: bold; text-align: center; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          @media print { body { margin: 0; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PNB STOCK STATEMENT</h1>
          <p>Period: ${periodLabel}</p>
          <p>Generated on: ${new Date().toLocaleDateString('en-IN')} at ${new Date().toLocaleTimeString('en-IN')}</p>
        </div>

        <div class="section">
          <div class="section-title">INVENTORY (Current Stock)</div>
          <table>
            <thead>
              <tr>
                <th>S.No.</th><th>Item Code</th><th>Product Name</th><th>Purchases</th><th>Sales</th><th>Closing Stock</th><th>Unit</th>
              </tr>
            </thead>
            <tbody>
              ${stockData.map((item, i) => `
                <tr>
                  <td class="text-center">${i + 1}</td>
                  <td>${item.code}</td>
                  <td>${item.product}</td>
                  <td class="text-right">${item.purchases ?? ''}</td>
                  <td class="text-right">${item.sales ?? ''}</td>
                  <td class="text-right">${item.currentStock}</td>
                  <td class="text-center">${item.unit || 'PCS'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">DEBTOR BALANCES (Sundry Debtors)</div>
          <table>
            <thead>
              <tr><th>S.No.</th><th>Code</th><th>Name</th><th>Balance (₹)</th></tr>
            </thead>
            <tbody>
              ${debtorData.map((d, i) => `
                <tr>
                  <td class="text-center">${i + 1}</td>
                  <td>${d.code}</td>
                  <td>${d.name}</td>
                  <td class="text-right">₹${d.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top: 50px; text-align: center; font-size: 10px; color: #666;">
          <p>This is a computer-generated report. No signature required.</p>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  // Check admin access
  if (!hasAdminAccess) {
    return (
      <div className="container mx-auto p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong className="font-bold">Access Denied!</strong>
          <span className="block sm:inline"> This report is only available to administrators.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">PNB Stock Statement</h1>

      {/* Period + Actions Card */}
      <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
        {/* Period Selector */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Select Period
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-gray-400">Month:</label>
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(Number(e.target.value))}
                className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {MONTHS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-gray-400">Year:</label>
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(Number(e.target.value))}
                className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="ml-1 px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-sm font-medium">
              {MONTHS[selectedMonth - 1].label} {selectedYear}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={generateReport}
            disabled={loading}
            className="px-6 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Generating...
              </>
            ) : 'Generate Report'}
          </button>

          {reportGenerated && (
            <>
              <button
                type="button"
                onClick={handleSaveExcel}
                disabled={excelLoading}
                className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {excelLoading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Preparing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Save Excel (for PNB Portal)
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Report
              </button>
            </>
          )}
        </div>

        {reportGenerated && stockData.length > 0 && (
          <div className="mt-4 p-4 border border-blue-200 bg-blue-50 dark:bg-blue-900/20 rounded flex flex-wrap items-end gap-3">
             <div className="flex-1 min-w-[200px] max-w-sm">
               <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Target Stock Value (₹)</label>
               <div className="text-xs text-gray-500 mb-1">Enter desired total inventory valuation (e.g., to match CC limit). Quantities will adjust proportionally.</div>
               <input 
                  type="number"
                  value={targetStockValue}
                  onChange={e => setTargetStockValue(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. 39000000"
               />
             </div>
             <button
               type="button"
               onClick={handleAdjustStock}
               className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 whitespace-nowrap h-[34px]"
             >
               Adjust Quantities
             </button>
          </div>
        )}

        <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
          Shows stock activity (purchases − sales) for the selected month. Debtors reflect current outstanding balances.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg mb-6">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {reportGenerated && (
        <div className="space-y-6">
          {/* Summary Cards */}
          {summaryData && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400">Stock Items</h3>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{summaryData.totalStockItems}</p>
                <p className="text-xs text-blue-500 mt-1">With positive closing stock</p>
              </div>
              <div className="bg-teal-50 dark:bg-teal-900/20 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-teal-600 dark:text-teal-400">Stock Value</h3>
                <p className="text-2xl font-bold text-teal-900 dark:text-teal-100">
                  ₹{stockData.reduce((sum, item) => sum + (item.currentStock * (item.rate || 0)), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-teal-500 mt-1">Total Valuation</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-green-600 dark:text-green-400">Total Debtors</h3>
                <p className="text-2xl font-bold text-green-900 dark:text-green-100">{summaryData.totalDebtors}</p>
                <p className="text-xs text-green-500 mt-1">With outstanding balance</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-purple-600 dark:text-purple-400">Total Sales</h3>
                <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                  ₹{summaryData.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-purple-500 mt-1">Period net sales</p>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-orange-600 dark:text-orange-400">Total Purchases</h3>
                <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                  ₹{summaryData.totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-orange-500 mt-1">Period purchases</p>
              </div>
            </div>
          )}


          {/* Stock Data Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                Current Stock — {MONTHS[selectedMonth - 1].label} {selectedYear} ({stockData.length} items)
              </h2>

              {stockData.length > 10 && (
                <span className="text-xs text-gray-500">Showing first 10 of {stockData.length}. Print for full list.</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Item Code</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Product Name</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Purchased</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Sold</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Closing Stock</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Unit</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {stockData.slice(0, 10).map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{item.code}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{item.product}</td>
                      <td className="px-4 py-3 text-sm text-green-600 dark:text-green-400 text-right">{item.purchases ?? '-'}</td>
                      <td className="px-4 py-3 text-sm text-red-600 dark:text-red-400 text-right">{item.sales ?? '-'}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white text-right">{item.currentStock}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">{item.unit || 'PCS'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Debtor Balances Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                Sundry Debtors ({debtorData.length})
              </h2>
              {debtorData.length > 10 && (
                <span className="text-xs text-gray-500">Showing first 10. Print for full list.</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Debtor Name</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {debtorData.slice(0, 10).map((debtor, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{debtor.code}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{debtor.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white text-right font-medium">
                        ₹{debtor.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Creditor Balances (for reference) */}
          {creditorData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                  Sundry Creditors ({creditorData.length}) — included in Excel
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Creditor Name</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Balance (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {creditorData.slice(0, 10).map((cred, index) => (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{cred.code}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{cred.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white text-right font-medium">
                          ₹{cred.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {creditorData.length > 10 && (
                  <div className="px-6 py-3 bg-gray-50 dark:bg-gray-700 text-sm text-gray-500 dark:text-gray-400">
                    Showing first 10 of {creditorData.length} creditors.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PNBStockStatement;