import React, { useState, useEffect } from 'react';
import constants from '../../constants';

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
}

interface DebtorBalance {
  code: string;
  name: string;
  balance: number;
}

interface SummaryData {
  totalSales: number;
  totalPurchases: number;
  totalStockItems: number;
  totalDebtors: number;
}

const PNBStockStatement: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [hasAdminAccess, setHasAdminAccess] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stockData, setStockData] = useState<StockItem[]>([]);
  const [debtorData, setDebtorData] = useState<DebtorBalance[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [reportGenerated, setReportGenerated] = useState(false);

  // Check user access on component mount
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
        // Check if user has admin access
        setHasAdminAccess(userData.routeAccess && userData.routeAccess.includes('Admin'));
      } catch (e) {
        console.error("Failed to parse user data from localStorage", e);
      }
    }
  }, []);

  const generateReport = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${constants.baseURL}/api/reports/pnb-stock-statement`, {
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
      setSummaryData(data.summary || null);
      setReportGenerated(true);
      
    } catch (error) {
      console.error('Error generating PNB stock statement:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveExcel = async () => {
    if (!reportGenerated) {
      alert('Please generate the report first.');
      return;
    }

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
          summaryData
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Get the JSON response
      const result = await response.json();
      
      // Show success message
      alert(`Excel file updated successfully!\nFile: ${result.filePath}\nTimestamp: ${new Date(result.timestamp).toLocaleString()}`);
      
    } catch (error) {
      console.error('Error saving Excel file:', error);
      alert('Failed to save Excel file. Please try again.');
    }
  };

  const handlePrint = () => {
    if (!reportGenerated) {
      alert('Please generate the report first.');
      return;
    }

    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Unable to open print window');
      return;
    }

    // Create the print content
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>PNB Stock Statement</title>
        <style>
          @page {
            size: A4;
            margin: 0.5in;
          }
          
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
            font-size: 12px;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #000;
            padding-bottom: 10px;
          }
          .section {
            margin-bottom: 30px;
          }
          .section-title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 10px;
            background-color: #f0f0f0;
            padding: 5px;
            border: 1px solid #000;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th, td {
            border: 1px solid #000;
            padding: 6px 8px;
            text-align: left;
            font-size: 10px;
          }
          th {
            background-color: #f0f0f0;
            font-weight: bold;
            text-align: center;
          }
          .text-right {
            text-align: right;
          }
          .text-center {
            text-align: center;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-top: 20px;
          }
          .summary-item {
            border: 1px solid #000;
            padding: 10px;
            text-align: center;
          }
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PNB STOCK STATEMENT</h1>
          <p>Generated on: ${new Date().toLocaleDateString('en-IN')} at ${new Date().toLocaleTimeString('en-IN')}</p>
        </div>

        <!-- Summary Section -->
        <div class="section">
          <div class="section-title">SUMMARY</div>
          <div class="summary-grid">
            <div class="summary-item">
              <strong>Total Stock Items</strong><br>
              ${summaryData?.totalStockItems || 0}
            </div>
            <div class="summary-item">
              <strong>Total Debtors</strong><br>
              ${summaryData?.totalDebtors || 0}
            </div>
            <div class="summary-item">
              <strong>Total Sales</strong><br>
              ₹${summaryData?.totalSales?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
            </div>
            <div class="summary-item">
              <strong>Total Purchases</strong><br>
              ₹${summaryData?.totalPurchases?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'}
            </div>
          </div>
        </div>

        <!-- Stock Data Section -->
        <div class="section">
          <div class="section-title">CURRENT STOCK</div>
          <table>
            <thead>
              <tr>
                <th>S.No.</th>
                <th>Item Code</th>
                <th>Product Name</th>
                <th>Current Stock</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              ${stockData.map((item, index) => `
                <tr>
                  <td class="text-center">${index + 1}</td>
                  <td>${item.code}</td>
                  <td>${item.product}</td>
                  <td class="text-right">${item.currentStock}</td>
                  <td class="text-center">${item.unit || 'PCS'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Debtor Balances Section -->
        <div class="section">
          <div class="section-title">DEBTOR BALANCES</div>
          <table>
            <thead>
              <tr>
                <th>S.No.</th>
                <th>Debtor Code</th>
                <th>Debtor Name</th>
                <th>Balance Amount</th>
              </tr>
            </thead>
            <tbody>
              ${debtorData.map((debtor, index) => `
                <tr>
                  <td class="text-center">${index + 1}</td>
                  <td>${debtor.code}</td>
                  <td>${debtor.name}</td>
                  <td class="text-right">₹${debtor.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
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

      {/* Generate Report Button */}
      <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={generateReport}
            disabled={loading}
            className="px-6 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
          
          {reportGenerated && (
            <>
              <button
                type="button"
                onClick={handleSaveExcel}
                className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Save Excel
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
        
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          This report provides a comprehensive view of current stock levels, debtor balances, and business summary.
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-blue-600 dark:text-blue-400">Stock Items</h3>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{summaryData.totalStockItems}</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-green-600 dark:text-green-400">Total Debtors</h3>
                <p className="text-2xl font-bold text-green-900 dark:text-green-100">{summaryData.totalDebtors}</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-purple-600 dark:text-purple-400">Total Sales</h3>
                <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                  ₹{summaryData.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-orange-600 dark:text-orange-400">Total Purchases</h3>
                <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                  ₹{summaryData.totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          )}

          {/* Stock Data Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Current Stock ({stockData.length} items)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Item Code</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Product Name</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Current Stock</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Unit</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {stockData.slice(0, 10).map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.code}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{item.product}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300 text-right">{item.currentStock}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300 text-center">{item.unit || 'PCS'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stockData.length > 10 && (
                <div className="px-6 py-3 bg-gray-50 dark:bg-gray-700 text-sm text-gray-500 dark:text-gray-400">
                  Showing first 10 of {stockData.length} items. Print report to see all items.
                </div>
              )}
            </div>
          </div>

          {/* Debtor Balances Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Debtor Balances ({debtorData.length} debtors)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Debtor Code</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Debtor Name</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Balance Amount</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {debtorData.slice(0, 10).map((debtor, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{debtor.code}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{debtor.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300 text-right">
                        ₹{debtor.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {debtorData.length > 10 && (
                <div className="px-6 py-3 bg-gray-50 dark:bg-gray-700 text-sm text-gray-500 dark:text-gray-400">
                  Showing first 10 of {debtorData.length} debtors. Print report to see all debtors.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PNBStockStatement;