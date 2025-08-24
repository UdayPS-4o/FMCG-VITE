import React, { useState, useEffect, useRef, useMemo } from 'react';
import Input, { InputRefHandle } from '../../components/form/input/Input';
import { useInvoiceContext } from '../../contexts/InvoiceContext';
import InvoiceProvider from '../../contexts/InvoiceProvider';
import constants from '../../constants';
import MultiSelect from '../../components/form/MultiSelect';
import RadioSm from '../../components/form/input/RadioSm';

// Define the structure of van loading data
interface VanLoadingItem {
  sku: string;
  itemName: string;
  totalQtyBoxes: number;
  totalQtyPcs: number;
  totalQty: number;
  details: {
    date: string;
    partyName: string;
    qty: number;
    unit: string;
    series: string;
    billNo: string | number;
  }[];
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

// Options type for MultiSelect
interface Option { value: string; text: string }

// Content component that uses the context
const VanLoadingContent: React.FC = () => {
  const [billNumbers, setBillNumbers] = useState<string>('');
  const [unitFilter, setUnitFilter] = useState<'All' | 'Box' | 'Pcs'>('All');
  const [reportData, setReportData] = useState<VanLoadingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [hasAdminAccess, setHasAdminAccess] = useState<boolean>(false);
  const [hoveredItem, setHoveredItem] = useState<VanLoadingItem | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  // Company filter state
  const [companyOptions, setCompanyOptions] = useState<Option[]>([]);
  const [selectedCompanyCodes, setSelectedCompanyCodes] = useState<string[]>([]);

  // Keep focus on the Bill Numbers input
  const billInputRef = useRef<InputRefHandle>(null);

  const fetchAbortControllerRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProcessedTokenRef = useRef<string | null>(null);
  const reportFetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Scan status message
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'duplicate' | 'not_accepted' | null>(null);

  // Normalize a raw bill token like " a- 23 " or " a/23 " => "A-23"; returns null if not a complete valid token
  const normalizeBillToken = (raw: string): string | null => {
    const cleaned = String(raw).trim().replace(/\s*[-/]\s*/, '-');
    const match = cleaned.match(/^([A-Za-z]+)[-/](\d+)$/);
    if (!match) return null;
    const series = match[1].toUpperCase();
    const number = String(parseInt(match[2], 10));
    if (!series || !number || Number.isNaN(Number(number))) return null;
    return `${series}-${number}`;
  };

  // Verify from server if a bill exists in BILLDTL
  const verifyBillExists = async (token: string): Promise<boolean> => {
    try {
      const [series, billStr] = token.split('-');
      const billNo = parseInt(billStr, 10);
      const resp = await fetch(`${constants.baseURL}/api/bill-details/${encodeURIComponent(series)}/${encodeURIComponent(billNo)}` , {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });
      if (!resp.ok) return false;
      const arr = await resp.json();
      return Array.isArray(arr) && arr.length > 0;
    } catch {
      return false;
    }
  };

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
    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
      if (reportFetchDebounceRef.current) clearTimeout(reportFetchDebounceRef.current);
      if (fetchAbortControllerRef.current) fetchAbortControllerRef.current.abort();
    };
  }, []);

  // Load Companies for filter
  useEffect(() => {
    const loadCompanies = async () => {
      try {
        const resp = await fetch(`${constants.baseURL}/api/reports/companies`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        });
        if (!resp.ok) throw new Error('Failed to load companies');
        const data: Option[] = await resp.json();
        setCompanyOptions(data || []);
      } catch (e) {
        console.error('Error fetching companies:', e);
      }
    };
    loadCompanies();
  }, []);

  // Handle bill number input with auto-complete/comma and status messages
  const handleBillNumberChange = (value: string) => {
    setBillNumbers(value);

    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(async () => {
      // Split into segments and identify the candidate token to process
      const rawSegments = value.split(',');
      const trimmedSegments = rawSegments.map(s => (s || '').trim());
      const nonEmpty = trimmedSegments.filter(Boolean);
      const endsWithComma = /,\s*$/.test(value);

      // Prepare lists before evaluating the candidate
      const earlierRaws = nonEmpty.slice(0, -1);
      const earlierNorms = earlierRaws
        .map(r => normalizeBillToken(r || ''))
        .filter(Boolean) as string[];

      // Determine the candidate raw token (handles trailing comma case)
      const candidateRaw = endsWithComma
        ? (nonEmpty[nonEmpty.length - 1] || null)
        : ((trimmedSegments[trimmedSegments.length - 1] || '') || null);

      if (!candidateRaw) return; // nothing to process yet

      const candidateNorm = normalizeBillToken(candidateRaw);
      const invalidKey = `INVALID:${(candidateRaw || '').trim().toUpperCase()}`;

      // If user completed a token (comma typed) but it's invalid, show NOT ACCEPTED message
      if (!candidateNorm) {
        if (endsWithComma) {
          if (lastProcessedTokenRef.current === invalidKey) return;

          const newJoined = earlierNorms.join(', ');
          setBillNumbers(newJoined ? `${newJoined}, ` : '');
          setStatusType('not_accepted');
          setStatusMsg(`Not accepted: ${(candidateRaw || '').trim()}`);

          lastProcessedTokenRef.current = invalidKey;

          if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
          statusTimeoutRef.current = setTimeout(() => {
            setStatusMsg(null);
            setStatusType(null);
          }, 2000);
        }
        return; // don't proceed further for invalid tokens
      }

      // Avoid re-processing the same token repeatedly
      if (lastProcessedTokenRef.current === candidateNorm) return;

      if (earlierNorms.includes(candidateNorm)) {
         // Duplicate: drop the just-entered token
         const newJoined = earlierNorms.join(', ');
         setBillNumbers(newJoined ? `${newJoined}, ` : '');
         setStatusType('duplicate');
         setStatusMsg(`Duplicate bill: ${candidateNorm}`);
         // Auto-fetch even on duplicate to keep report in sync
         handleFetchReport(newJoined ? `${newJoined}, ` : '');
       } else {
         // Success: add/normalize the token and ensure trailing comma+space
         const newJoined = [...earlierNorms, candidateNorm].join(', ');
         setBillNumbers(`${newJoined}, `);
         const exists = await verifyBillExists(candidateNorm);
         if (exists) {
           setStatusType('success');
           setStatusMsg(`Added: ${candidateNorm}`);
         } else {
           setStatusType('not_accepted');
           setStatusMsg(`Bill not found: ${candidateNorm}`);
         }
         // Trigger auto-fetch after processing this token
         handleFetchReport(`${newJoined}, `);
       }

      // Remember last processed token to prevent flicker/repeat
      lastProcessedTokenRef.current = candidateNorm;

      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = setTimeout(() => {
        setStatusMsg(null);
        setStatusType(null);
      }, 2000);
    }, 250);
  };

  // When bill input loses focus (due to clicking elsewhere), refocus shortly after
  const handleBillInputBlur = () => {
    // Allow the click on other controls to complete, then refocus
    setTimeout(() => billInputRef.current?.focus(), 120);
  };

  // Auto-add comma after user stops typing (using debounce)
  const addAutoComma = (value: string) => {
    if (!value.trim() || value.endsWith(',') || value.endsWith(' ')) {
      return value;
    }

    const bills = value.split(',');
    if (bills.length > 0) {
      const lastBill = bills[bills.length - 1].trim();
      
      // Check if the last bill matches the pattern (letters-digits)
      if (lastBill.match(/^[A-Za-z]+-\d+$/)) {
        const completedBills = bills.slice(0, -1).concat([lastBill]).join(', ');
        return completedBills + ', ';
      }
    }
    return value;
  };

  const handleFetchReport = async (overrideBillNumbers?: string) => {
    const effectiveBills = (overrideBillNumbers ?? billNumbers).trim();
    if (!effectiveBills) {
      setReportData([]);
      setError(null);
      return;
    }

    if (fetchAbortControllerRef.current) {
      fetchAbortControllerRef.current.abort();
    }
    fetchAbortControllerRef.current = new AbortController();
    const signal = fetchAbortControllerRef.current.signal;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        billNumbers: effectiveBills.replace(/,\s*$/, ''), // Remove trailing comma
        unit: unitFilter
      });
      if (selectedCompanyCodes.length > 0) {
        params.append('companyCodes', selectedCompanyCodes.join(','));
      }

      const response = await fetch(`${constants.baseURL}/api/van-loading?${params.toString()}`, {
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

      setReportData(data);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error("Error fetching van loading report:", err);
        setError(err.message);
        setReportData([]);
      }
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  };

  // Calculate color intensity based on quantity
  const getHeatmapColor = (item: VanLoadingItem) => {
    if (reportData.length === 0) return 'bg-gray-100';
    
    const maxQty = Math.max(...reportData.map(d => d.totalQty));
    const minQty = Math.min(...reportData.map(d => d.totalQty));
    const range = maxQty - minQty;
    
    if (range === 0) return 'bg-blue-200';
    
    const intensity = (item.totalQty - minQty) / range;
    
    if (intensity >= 0.8) return 'bg-red-600 text-white';
    if (intensity >= 0.6) return 'bg-red-400 text-white';
    if (intensity >= 0.4) return 'bg-orange-400 text-white';
    if (intensity >= 0.2) return 'bg-yellow-400 text-black';
    return 'bg-green-200 text-black';
  };

  // New: unique color per tile using evenly spaced HSL hues
  const getTileStyle = (index: number, total: number): React.CSSProperties => {
    const safeTotal = Math.max(total, 1);
    const hue = Math.round((index * 360) / safeTotal);
    const saturation = 78; // %
    const lightness = 50; // %
    const bg = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    // White text for better contrast on saturated mid-lightness backgrounds
    return { backgroundColor: bg, color: '#ffffff' };
  };

  // Handle mouse events for tooltip
  const handleMouseEnter = (item: VanLoadingItem, event: React.MouseEvent) => {
    setHoveredItem(item);
    setMousePosition({ x: event.clientX, y: event.clientY });
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    setMousePosition({ x: event.clientX, y: event.clientY });
  };

  const handleMouseLeave = () => {
    setHoveredItem(null);
  };

  const handlePrintReport = () => {
    if (reportData.length === 0) {
      alert('No data to print. Please generate the report first.');
      return;
    }

    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Unable to open print window');
      return;
    }

    // Group items by item name and calculate totals
    const groupedItems: { [itemName: string]: {
      itemName: string;
      code: string;
      totalQty: number;
      unit: string;
      details: Array<{
        date: string;
        billNo: string;
        party: string;
        place: string;
        qty: number;
        free: number;
        gross: number;
      }>;
    }} = {};

    reportData.forEach(item => {
      if (!groupedItems[item.itemName]) {
        groupedItems[item.itemName] = {
          itemName: item.itemName,
          code: item.sku,
          totalQty: 0,
          unit: item.details[0]?.unit || 'PCS',
          details: []
        };
      }

      item.details.forEach(detail => {
        groupedItems[item.itemName].totalQty += detail.qty;
        groupedItems[item.itemName].details.push({
          date: detail.date,
          billNo: `${detail.series}-${detail.billNo}`,
          party: detail.partyName,
          place: '', // Not available in current data structure
          qty: detail.qty,
          free: 0, // Not available in current data structure
          gross: 0 // Not available in current data structure
        });
      });
    });

    const sortedGroups = Object.values(groupedItems).sort((a, b) => a.itemName.localeCompare(b.itemName));

    // Create the print content
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Van Loading Report</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 0.5in;
          }
          
          body {
            font-family: Arial, sans-serif;
            margin: 20px;
            font-size: 12px;
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
          }
          .filters {
            margin-bottom: 15px;
            font-size: 11px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th, td {
            border: 1px solid #000;
            padding: 4px 6px;
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
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>Van Loading Report</h2>
          <div class="filters">
            Bill Numbers: ${billNumbers.trim()}<br>
            Unit Filter: ${unitFilter}<br>
            ${selectedCompanyCodes.length > 0 ? `Company Filter: ${selectedCompanyCodes.join(', ')}<br>` : ''}
            Generated on: ${new Date().toLocaleString()}
          </div>
        </div>
        
        ${sortedGroups.map(group => `
           <div style="margin-bottom: 30px;">
             <h3 style="background-color: #e0e0e0; padding: 8px; margin: 0; font-size: 12px; font-weight: bold;">
               ${group.code} - ${group.itemName} (Total: ${group.totalQty.toFixed(2)} ${group.unit})
             </h3>
             <table>
               <thead>
                 <tr>
                   <th>Date</th>
                   <th>Bill No.</th>
                   <th>Party</th>
                   <th>Place</th>
                   <th>Unit</th>
                   <th>Qty</th>
                   <th>Free</th>
                   <th>Gross</th>
                 </tr>
               </thead>
               <tbody>
                 ${group.details.map(detail => `
                   <tr>
                     <td class="text-center">${detail.date}</td>
                     <td class="text-center">${detail.billNo}</td>
                     <td>${detail.party}</td>
                     <td>${detail.place}</td>
                     <td class="text-center">${group.unit}</td>
                     <td class="text-right">${detail.qty.toFixed(2)}</td>
                     <td class="text-right">${detail.free.toFixed(2)}</td>
                     <td class="text-right">${detail.gross.toFixed(2)}</td>
                   </tr>
                 `).join('')}
                 <tr style="background-color: #f5f5f5; font-weight: bold;">
                   <td colspan="5" class="text-right">Subtotal:</td>
                   <td class="text-right">${group.totalQty.toFixed(2)}</td>
                   <td class="text-right">0.00</td>
                   <td class="text-right">0.00</td>
                 </tr>
               </tbody>
             </table>
           </div>
         `).join('')}
        
        <div style="margin-top: 20px; font-size: 11px;">
           <strong>Total Items: ${sortedGroups.length} | Total Records: ${sortedGroups.reduce((sum, group) => sum + group.details.length, 0)}</strong>
         </div>
      </body>
      </html>
    `;

    // Write content to print window
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // Wait for content to load then print
    printWindow.onload = () => {
      printWindow.print();
      printWindow.close();
    };
  };

  // Handle chart format printing with A4 landscape orientation
  const handlePrintChart = () => {
    if (reportData.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Group items by party for chart format
    const partyItemsMap: Map<string, Map<string, {
      sku: string;
      itemName: string;
      totalQty: number;
      unit: string;
      billNumbers: string[];
    }>> = new Map();
    
    reportData.forEach(item => {
      item.details.forEach(detail => {
        const partyKey = detail.partyName;
        if (!partyItemsMap.has(partyKey)) {
          partyItemsMap.set(partyKey, new Map());
        }
        
        const partyItems = partyItemsMap.get(partyKey)!;
        const itemKey = `${item.sku}-${item.itemName}`;
        
        if (!partyItems.has(itemKey)) {
          partyItems.set(itemKey, {
            sku: item.sku,
            itemName: item.itemName,
            totalQty: 0,
            unit: detail.unit,
            billNumbers: []
          });
        }
        
        const itemInfo = partyItems.get(itemKey)!;
        itemInfo.totalQty += detail.qty;
        itemInfo.billNumbers.push(`${detail.series}-${detail.billNo} / ${detail.date}`);
      });
    });

    // Get all unique items for table headers
    const allItems = Array.from(new Set(reportData.map(item => `${item.sku}|${item.itemName}`)))
      .map(itemStr => {
        const [sku, itemName] = itemStr.split('|');
        return { sku, itemName };
      })
      .sort((a, b) => a.sku.localeCompare(b.sku));

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Van Loading Chart Report</title>
        <style>
          @page {
            size: A4 landscape;
            margin: 0.5in;
          }
          
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
          
          body {
            font-family: Arial, sans-serif;
            font-size: 10px;
            line-height: 1.2;
            margin: 0;
            padding: 10px;
          }
          
          .header {
            text-align: center;
            margin-bottom: 15px;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
          }
          
          .header h1 {
            margin: 0;
            font-size: 16px;
            font-weight: bold;
          }
          
          .filters {
            margin-bottom: 10px;
            font-size: 9px;
          }
          
          .chart-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
          }
          
          .chart-table th,
          .chart-table td {
            border: 1px solid #333;
            padding: 4px;
            text-align: center;
            vertical-align: middle;
          }
          
          .chart-table th {
            background-color: #f0f0f0;
            font-weight: bold;
            font-size: 8px;
          }
          
          .party-header {
            background-color: #e0e0e0;
            font-weight: bold;
            text-align: left;
            padding: 6px 4px;
          }
          
          .item-header {
            min-width: 60px;
            max-width: 80px;
            text-align: center;
            font-size: 7px;
            line-height: 1.1;
          }
          
          .qty-cell {
            font-weight: bold;
            min-width: 40px;
          }
          
          .summary {
            margin-top: 10px;
            font-size: 9px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Van Loading Chart Report</h1>
          <div>Generated on: ${new Date().toLocaleDateString()}</div>
        </div>
        
        <div class="filters">
          <strong>Bill Numbers:</strong> ${billNumbers.replace(/,\s*$/, '')} | 
          <strong>Unit Filter:</strong> ${unitFilter} |
          ${selectedCompanyCodes.length > 0 ? ` <strong>Companies:</strong> ${selectedCompanyCodes.join(', ')}` : ''}
        </div>
        
        <table class="chart-table">
          <thead>
            <tr>
              <th rowspan="2" style="width: 150px;">PARTY NAME</th>
              <th rowspan="2" style="width: 120px;">BILL NO / DATE</th>
              ${allItems.map(item => `
                <th class="item-header">
                  <div>${item.sku}</div>
                  <div>${item.itemName}</div>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${Array.from(partyItemsMap.entries()).map(([partyName, partyItems]) => `
              <tr>
                <td style="font-weight: bold; padding: 8px;">${partyName}</td>
                <td style="padding: 8px; font-size: 7px; line-height: 1.2;">${Array.from(new Set(Array.from(partyItems.values()).flatMap(item => item.billNumbers))).join('<br>')}</td>
                ${allItems.map(item => {
                  const itemKey = `${item.sku}-${item.itemName}`;
                  const itemInfo = partyItems.get(itemKey);
                  return `<td class="qty-cell">${itemInfo ? itemInfo.totalQty : '-'}</td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="summary">
          <strong>Total Parties: ${partyItemsMap.size} | Total Items: ${allItems.length} | Total Records: ${reportData.reduce((sum, item) => sum + item.details.length, 0)}</strong>
        </div>
      </body>
      </html>
    `;

    // Write content to print window
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // Wait for content to load then print
    printWindow.onload = () => {
       printWindow.print();
       printWindow.close();
     };
   };

  // Auto-fetch report when bill numbers (or filters) change and a token is completed
  useEffect(() => {
    if (reportFetchDebounceRef.current) clearTimeout(reportFetchDebounceRef.current);
    reportFetchDebounceRef.current = setTimeout(() => {
      const val = billNumbers;
      const trimmed = val.trim();
      if (!trimmed) {
        setReportData([]);
        setError(null);
        return;
      }

      const segments = trimmed.split(',');
      const lastRaw = (segments[segments.length - 1] || '').trim();
      const earlier = segments.slice(0, -1).map(s => (s || '').trim()).filter(Boolean);
      const earlierNorms = earlier
        .map(s => normalizeBillToken(s || ''))
        .filter(Boolean) as string[];

      const lastComplete = /^[A-Za-z]+-\d+$/.test(lastRaw);
      const endsWithComma = /,\s*$/.test(val);

      const shouldFetch = earlierNorms.length > 0 || lastComplete || endsWithComma;
      if (shouldFetch) {
        handleFetchReport();
      }
    }, 400);

    return () => {
      if (reportFetchDebounceRef.current) clearTimeout(reportFetchDebounceRef.current);
    };
  }, [billNumbers, unitFilter, selectedCompanyCodes]);

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
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">Print Van Loading Report</h1>

      {/* Input Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div>
          <label htmlFor="billNumbers" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Bill Numbers (e.g., A-23, B-45)
          </label>
          <Input
            id="billNumbers"
            type="text"
            value={billNumbers}
            onChange={(e) => handleBillNumberChange(e.target.value)}
            placeholder="Enter bill numbers (A-23, B-45, ...)"
            variant="outlined"
            ref={billInputRef}
            onBlur={handleBillInputBlur}
            // Removed onKeyDown handler since it's not defined
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Comma will be added automatically after each complete bill number
          </p>
          <p className="mt-1 font-bold text-gray-800 dark:text-gray-200">
            Total Bills: {billNumbers.split(',').filter(bill => bill.trim()).length}
          </p>
          {statusMsg && (
            <div className="hidden" aria-hidden="true">
              {statusMsg}
            </div>
          )}
        </div>
        
        <div>
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Unit Filter
          </span>
          <div className="mt-1 flex items-center gap-6">
            <RadioSm
              id="unit-all"
              name="unitFilter"
              value="All"
              checked={unitFilter === 'All'}
              label="All"
              onChange={(v) => setUnitFilter(v as 'All' | 'Box' | 'Pcs')}
            />
            <RadioSm
              id="unit-box"
              name="unitFilter"
              value="Box"
              checked={unitFilter === 'Box'}
              label="Box"
              onChange={(v) => setUnitFilter(v as 'All' | 'Box' | 'Pcs')}
            />
            <RadioSm
              id="unit-pcs"
              name="unitFilter"
              value="Pcs"
              checked={unitFilter === 'Pcs'}
              label="Pcs"
              onChange={(v) => setUnitFilter(v as 'All' | 'Box' | 'Pcs')}
            />
          </div>
        </div>

        {/* Company Filter */}
        <div>
          <MultiSelect
            label="Company Filter"
            options={companyOptions}
            value={selectedCompanyCodes}
            onChange={(vals: string[]) => setSelectedCompanyCodes(vals)}
            allowFiltering
            selectOnEnter
            matchThreshold={0.7}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => handleFetchReport()}
          disabled={loading || !billNumbers.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Loading...' : 'Refresh Report'}
        </button>
        
        <button
          onClick={handlePrintReport}
          disabled={reportData.length === 0}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Print Report
        </button>
        
        <button
          onClick={handlePrintChart}
          disabled={reportData.length === 0}
          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Print Chart Format
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          Error: {error}
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="mb-4 p-4 bg-blue-100 border border-blue-400 text-blue-700 rounded">
          Loading van loading data...
        </div>
      )}

      {/* Heatmap Display */}
      {reportData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
              Van Loading Heatmap ({reportData.length} SKUs)
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Hover over each SKU for detailed information
            </p>
          </div>
          
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
              {reportData.map((item, index) => (
                <div
                  key={`${item.sku}-${index}`}
                  className={"p-3 min-h-[120px] rounded-lg cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg"}
                  style={getTileStyle(index, reportData.length)}
                  onMouseEnter={(e) => handleMouseEnter(item, e)}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                >
                  <div className="text-xs font-semibold truncate" title={item.sku}>
                    {item.sku}
                  </div>
                  <div className="text-xs mt-1 whitespace-normal break-words" title={item.itemName}>
                    {item.itemName}
                  </div>
                  <div className="text-sm font-bold mt-2">
                    {unitFilter === 'Box' ? `${item.totalQtyBoxes} Box` :
                     unitFilter === 'Pcs' ? `${item.totalQtyPcs} Pcs` :
                     item.totalQtyBoxes > 0 && item.totalQtyPcs > 0
                      ? `${item.totalQtyBoxes}B + ${item.totalQtyPcs}P`
                      : item.totalQtyBoxes > 0
                        ? `${item.totalQtyBoxes}B`
                        : `${item.totalQtyPcs}P`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* No Data Message */}
      {!loading && reportData.length === 0 && billNumbers.trim() && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No data found for the entered bill numbers.
        </div>
      )}

      {/* Tooltip */}
      {hoveredItem && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-4 max-w-md pointer-events-none"
          style={{
            left: mousePosition.x + 10,
            top: mousePosition.y - 10,
            transform: mousePosition.x > window.innerWidth - 300 ? 'translateX(-100%)' : 'none'
          }}
        >
          <div className="font-semibold text-gray-800 dark:text-white mb-2">
            {hoveredItem.sku} - {hoveredItem.itemName}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            {(() => {
              const b = hoveredItem.totalQtyBoxes;
              const p = hoveredItem.totalQtyPcs;
              if (b > 0 && p > 0) return `Total: ${b} Boxes + ${p} Pcs`;
              if (b > 0) return `Total: ${b} Boxes`;
              return `Total: ${p} Pcs`;
            })()}
          </div>
          
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-600">
                  <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-300">Date</th>
                  <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-300">Bill No.</th>
                  <th className="text-left py-1 px-2 text-gray-700 dark:text-gray-300">Party</th>
                  <th className="text-right py-1 px-2 text-gray-700 dark:text-gray-300">Qty</th>
                </tr>
              </thead>
              <tbody>
                {hoveredItem.details.map((detail, idx) => (
                  <tr key={idx} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-1 px-2 text-gray-800 dark:text-gray-200">
                      {detail.date}
                    </td>
                    <td className="py-1 px-2 text-gray-800 dark:text-gray-200">
                      {`${detail.series}-${detail.billNo}`}
                    </td>
                    <td className="py-1 px-2 text-gray-800 dark:text-gray-200 truncate" title={detail.partyName}>
                      {detail.partyName}
                    </td>
                    <td className="py-1 px-2 text-right text-gray-800 dark:text-gray-200">
                      {detail.qty} {detail.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full-screen status overlay */}
      {statusMsg && (
        <div
          className={`fixed inset-0 z-[9999] flex items-center justify-center ${
            statusType === 'success'
              ? 'bg-green-700'
              : statusType === 'duplicate'
              ? 'bg-yellow-600'
              : 'bg-red-700'
          }`}
          role="alert"
          aria-live="assertive"
        >
          <div className="text-white text-3xl md:text-5xl font-extrabold tracking-wide px-8 text-center drop-shadow-xl">
            {statusMsg}
          </div>
        </div>
      )}
    </div>
  );
};

// Main component with InvoiceProvider wrapper
const VanLoading: React.FC = () => {
  // Dummy states for InvoiceProvider (required but not used)
  const [dummyItemsState, setDummyItemsState] = useState<any[]>([]);
  const dummyUpdateItem = () => {};
  const dummyRemoveItem = () => {};
  const dummyAddItem = () => {};
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
      <VanLoadingContent />
    </InvoiceProvider>
  );
};

export default VanLoading;