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
  mrp: number | null;
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
  const [unitFilter, setUnitFilter] = useState<'All' | 'Box' | 'Pcs'>('Box');
  const [reportData, setReportData] = useState<VanLoadingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [hasAdminAccess, setHasAdminAccess] = useState<boolean>(false);
  const [hoveredItem, setHoveredItem] = useState<VanLoadingItem | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  // Pinned tooltip state
  const [pinnedItem, setPinnedItem] = useState<VanLoadingItem | null>(null);
  const [pinnedPosition, setPinnedPosition] = useState({ x: 0, y: 0 });
  // Company filter state
  const [companyOptions, setCompanyOptions] = useState<Option[]>([]);
  const [selectedCompanyCodes, setSelectedCompanyCodes] = useState<string[]>([]);
  // Bill details dialog state
  const [showBillDialog, setShowBillDialog] = useState(false);
  const [billDetails, setBillDetails] = useState<any[]>([]);

  // Keep focus on the Bill Numbers input
  const billInputRef = useRef<InputRefHandle>(null);

  const fetchAbortControllerRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProcessedTokenRef = useRef<string | null>(null);
  const reportFetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Sort report data alphabetically by SKU
  const sortedReportData = useMemo(() => {
    return [...reportData].sort((a, b) => a.sku.localeCompare(b.sku));
  }, [reportData]);
  
  // Fetch bill details for dialog
  const fetchBillDetails = async () => {
    const bills = billNumbers.split(',').filter(bill => bill.trim());
    if (bills.length === 0) return;
    
    try {
      const response = await fetch(`${constants.baseURL}/api/bill-details-full`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ billNumbers: bills.map(b => b.trim()) }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setBillDetails(data);
        setShowBillDialog(true);
      } else {
        console.error('Failed to fetch bill details');
      }
    } catch (error) {
      console.error('Error fetching bill details:', error);
    }
  };
  
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

  // Verify from server if a bill exists in BILLDTL and check van loading history
  const verifyBillExists = async (token: string): Promise<{ exists: boolean; history: any[] }> => {
    try {
      const [series, billStr] = token.split('-');
      const billNo = parseInt(billStr, 10);
      
      // Check if bill exists
      const billResp = await fetch(`${constants.baseURL}/api/bill-details/${encodeURIComponent(series)}/${encodeURIComponent(billNo)}` , {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      });
      let exists = false;
      if (billResp.ok) {
        const arr = await billResp.json();
        exists = Array.isArray(arr) && arr.length > 0;
      }
      
      // Check van loading history
      let history = [];
      try {
        const historyResp = await fetch(`${constants.baseURL}/api/van-loading-history/${encodeURIComponent(token)}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        });
        if (historyResp.ok) {
          history = await historyResp.json();
        }
      } catch (e) {
        console.warn('Failed to fetch van loading history:', e);
      }
      
      return { exists, history };
    } catch {
      return { exists: false, history: [] };
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
         // Session duplicate: drop the just-entered token
         const newJoined = earlierNorms.join(', ');
         setBillNumbers(newJoined ? `${newJoined}, ` : '');
         setStatusType('duplicate');
         setStatusMsg(`Duplicate bill no - ${candidateNorm}`);
         // Auto-fetch even on duplicate to keep report in sync
         handleFetchReport(newJoined ? `${newJoined}, ` : '');
       } else {
         // Success: add/normalize the token and ensure trailing comma+space
         const newJoined = [...earlierNorms, candidateNorm].join(', ');
         setBillNumbers(`${newJoined}, `);
         const { exists, history } = await verifyBillExists(candidateNorm);
         if (exists) {
           if (history && history.length > 0) {
             // Bill exists and has history - show when it was last used
             const lastUsed = history[0]; // Most recent entry
             setStatusType('duplicate');
             setStatusMsg(`Bill ${candidateNorm} was added in van loading dated ${lastUsed.date}`);
           } else {
             // Bill exists but no history
             setStatusType('success');
             setStatusMsg(`Added: ${candidateNorm}`);
           }
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
      
      // Save van loading history after successful report generation
      try {
        await fetch(`${constants.baseURL}/api/van-loading-history`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({ billNumbers: effectiveBills.replace(/,\s*$/, '') }),
        });
      } catch (historyErr) {
        console.warn('Failed to save van loading history:', historyErr);
      }
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
    if (!pinnedItem) {
      setHoveredItem(item);
      setMousePosition({ x: event.clientX, y: event.clientY });
    }
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!pinnedItem) {
      setMousePosition({ x: event.clientX, y: event.clientY });
    }
  };

  const handleMouseLeave = () => {
    if (!pinnedItem) {
      setHoveredItem(null);
    }
  };

  // Handle tile click to pin/unpin tooltip
  const handleTileClick = (item: VanLoadingItem, event: React.MouseEvent) => {
    if (pinnedItem && pinnedItem.sku === item.sku) {
      // Unpin if clicking the same item
      setPinnedItem(null);
      setHoveredItem(null);
    } else {
      // Pin the clicked item
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      // Use viewport coordinates directly for consistent positioning
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      setPinnedItem(item);
      setPinnedPosition({ x, y });
      setHoveredItem(null);
    }
  };

  // Handle clicking outside to unpin tooltip
  const handleDocumentClick = (event: MouseEvent) => {
    const target = event.target as Element;
    if (!target.closest('.tooltip-container') && !target.closest('[data-sku-tile]')) {
      setPinnedItem(null);
      setHoveredItem(null);
    }
  };

  // Add document click listener for unpinning
  useEffect(() => {
    if (pinnedItem) {
      document.addEventListener('click', handleDocumentClick);
      return () => document.removeEventListener('click', handleDocumentClick);
    }
  }, [pinnedItem]);

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
      mrp: number | null;
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
          mrp: item.mrp,
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
             <h3 style="background-color: #e0e0e0; padding: 8px; margin: 0; font-size: 14px; font-weight: bold;">
               ${group.code} - ${group.itemName}${group.mrp ? ` - MRP: ₹${group.mrp}` : ''} (Total: ${group.totalQty.toFixed(2)} ${group.unit})
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
      // Don't automatically close - let user close manually or handle print events
      // printWindow.close();
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
    const allItems = Array.from(new Set(reportData.map(item => `${item.sku}|${item.itemName}|${item.mrp || ''}`)))
      .map(itemStr => {
        const [sku, itemName, mrp] = itemStr.split('|');
        return { sku, itemName, mrp: mrp ? parseFloat(mrp) : null };
      })
      .sort((a: VanLoadingItem, b: VanLoadingItem) => a.sku.localeCompare(b.sku));

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
            font-size: 14px;
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
            font-size: 20px;
            font-weight: bold;
          }
          
          .filters {
            margin-bottom: 10px;
            font-size: 12px;
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
            font-size: 11px;
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
            font-size: 10px;
            line-height: 1.1;
          }
          
          .qty-cell {
            font-weight: bold;
            min-width: 40px;
          }
          
          .summary {
            margin-top: 10px;
            font-size: 12px;
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
                  <div>${(item as VanLoadingItem).sku}</div>
                  <div>${(item as VanLoadingItem).itemName}</div>
                  ${(item as VanLoadingItem).mrp ? `<div style="font-size: 10px; color: #646;">MRP: ₹${(item as VanLoadingItem).mrp}</div>` : ''}
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
                  const itemKey = `${(item as VanLoadingItem).sku}-${(item as VanLoadingItem).itemName}`;
                  const itemInfo = partyItems.get(itemKey);
                  return `<td class="qty-cell">${itemInfo ? itemInfo.totalQty : '-'}</td>`;
                }).join('')}
              </tr>
            `).join('')}
            <tr style="background-color: #d0d0d0; font-weight: bold; border-top: 2px solid #333;">
              <td colspan="2" style="text-align: center; padding: 8px; font-size: 11px;">TOTAL QTY</td>
              ${allItems.map(item => {
                const itemKey = `${(item as VanLoadingItem).sku}-${(item as VanLoadingItem).itemName}`;
                let totalQty = 0;
                Array.from(partyItemsMap.values()).forEach(partyItems => {
                  const itemInfo = partyItems.get(itemKey);
                  if (itemInfo) totalQty += itemInfo.totalQty;
                });
                return `<td class="qty-cell" style="background-color: #d0d0d0; font-weight: bold;">${totalQty > 0 ? totalQty : '-'}</td>`;
              }).join('')}
            </tr>
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
       // Don't automatically close - let user close manually or handle print events
       // printWindow.close();
     };
   };

  // Save PDF function
  const handleSavePDF = async () => {
    if (reportData.length === 0) return;
    
    try {
      setLoading(true);
      
      // Generate HTML content similar to print report
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Van Loading Report</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 20px;
              font-size: 10px;
            }
            .header {
              text-align: center;
              margin-bottom: 20px;
              border-bottom: 2px solid #333;
              padding-bottom: 10px;
            }
            .header h1 {
              margin: 0;
              font-size: 18px;
              color: #333;
            }
            .filters {
              margin-bottom: 15px;
              font-size: 9px;
              background-color: #f5f5f5;
              padding: 8px;
              border-radius: 4px;
            }
            .report-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }
            .report-table th,
            .report-table td {
              border: 1px solid #ddd;
              padding: 6px;
              text-align: left;
              font-size: 8px;
            }
            .report-table th {
              background-color: #f2f2f2;
              font-weight: bold;
              text-align: center;
            }
            .sku-header {
              background-color: #e8f4f8;
              font-weight: bold;
            }
            .party-name {
              font-weight: bold;
              background-color: #f9f9f9;
            }
            .qty-cell {
              text-align: center;
              font-weight: bold;
            }
            .summary {
              margin-top: 15px;
              font-size: 10px;
              font-weight: bold;
              text-align: center;
              background-color: #f0f0f0;
              padding: 10px;
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Van Loading Report</h1>
            <div>Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</div>
          </div>
          
          <div class="filters">
            <strong>Bill Numbers:</strong> ${billNumbers.replace(/,\s*$/, '')} | 
            <strong>Unit Filter:</strong> ${unitFilter} |
            ${selectedCompanyCodes.length > 0 ? ` <strong>Companies:</strong> ${selectedCompanyCodes.join(', ')}` : ''}
          </div>
          
          <table class="report-table">
            <thead>
              <tr>
                <th style="width: 120px;">SKU</th>
                <th style="width: 200px;">Item Name</th>
                <th style="width: 120px;">MRP</th>
                <th style="width: 80px;">Total Qty</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              ${reportData.map(item => `
                <tr>
                  <td class="sku-header">${item.sku}</td>
                  <td>${item.itemName}</td>
                  <td class="qty-cell">${item.mrp ? `₹${item.mrp}` : 'N/A'}</td>
                  <td class="qty-cell">
                    ${unitFilter === 'Box' ? `${item.totalQtyBoxes} Box` :
                      unitFilter === 'Pcs' ? `${item.totalQtyPcs} Pcs` :
                      item.totalQtyBoxes > 0 && item.totalQtyPcs > 0
                        ? `${item.totalQtyBoxes}B + ${item.totalQtyPcs}P`
                        : item.totalQtyBoxes > 0
                          ? `${item.totalQtyBoxes}B`
                          : `${item.totalQtyPcs}P`}
                  </td>
                  <td>
                    ${item.details.map(detail => 
                      `${detail.partyName} (${detail.series}-${detail.billNo}): ${detail.qty} ${detail.unit}`
                    ).join('<br>')}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="summary">
            <strong>Total SKUs: ${reportData.length} | Total Records: ${reportData.reduce((sum, item) => sum + item.details.length, 0)}</strong>
          </div>
        </body>
        </html>
      `;
      
      const filename = `van-loading-${new Date().toISOString().split('T')[0]}-${Date.now()}.pdf`;
      
      const response = await fetch(`${constants.baseURL}/api/generate-pdf/van-loading`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ htmlContent, filename }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }
      
      const result = await response.json();
      
      // Open the PDF in a new tab
      window.open(`${constants.baseURL}${result.pdfPath}`, '_blank');
      
      setStatusMsg('PDF saved successfully!');
      setStatusType('success');
      
    } catch (error) {
      console.error('Error saving PDF:', error);
      setStatusMsg('Failed to save PDF. Please try again.');
      setStatusType('not_accepted');
    } finally {
      setLoading(false);
      
      // Clear status message after 3 seconds
      setTimeout(() => {
        setStatusMsg('');
        setStatusType(null);
      }, 3000);
    }
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
            <span 
              className="cursor-pointer hover:text-blue-600 hover:underline"
              onClick={fetchBillDetails}
              title="Click to view bill details"
            >
              Total Bills: {billNumbers.split(',').filter(bill => bill.trim()).length}
            </span>
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
        
        <button
          onClick={handleSavePDF}
          disabled={reportData.length === 0 || loading}
          className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Generating...' : 'Save PDF'}
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
              Hover over each SKU for detailed information. Click to pin tooltip, click outside to unpin.
            </p>
          </div>
          
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
              {sortedReportData.map((item, index) => (
                <div
                  key={`${item.sku}-${index}`}
                  className={`p-3 min-h-[120px] rounded-lg cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg ${
                    pinnedItem && pinnedItem.sku === item.sku ? 'ring-2 ring-blue-500' : ''
                  }`}
                  style={getTileStyle(index, sortedReportData.length)}
                  data-sku-tile
                  onClick={(e) => handleTileClick(item, e)}
                  onMouseEnter={(e) => handleMouseEnter(item, e)}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                >
                  <div className="text-xs font-semibold truncate" title={item.sku}>
                    {item.sku}
                  </div>
                  <div className="text-xs mt-1 whitespace-normal break-words" title={`${item.itemName}${item.mrp ? ` - MRP: ₹${item.mrp}` : ''}`}>
                    {item.itemName}
                    {item.mrp && (
                      <div className="text-xs text-white mt-1">
                        MRP: ₹{item.mrp}
                      </div>
                    )}
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
      {(hoveredItem || pinnedItem) && (
        <div
          className={`fixed z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-3 sm:p-4 tooltip-container ${
            pinnedItem ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
          style={(() => {
            const item = pinnedItem || hoveredItem;
            const x = pinnedItem ? pinnedPosition.x : mousePosition.x;
            const y = pinnedItem ? pinnedPosition.y : mousePosition.y;
            
            // Mobile-first responsive calculations
            const isMobile = window.innerWidth < 640;
            const isTablet = window.innerWidth >= 640 && window.innerWidth < 1024;
            const margin = isMobile ? 12 : 16;
            
            // Dynamic tooltip dimensions based on screen size
            const tooltipWidth = isMobile 
              ? Math.min(window.innerWidth - (margin * 2), 280) 
              : isTablet 
                ? 300 
                : 320;
            
            // Estimate tooltip height based on content
            const baseHeight = 120; // Header + total info
            const detailsHeight = Math.min((pinnedItem || hoveredItem)?.details.length || 0, 6) * 32; // Max 6 rows visible
            const tooltipHeight = baseHeight + detailsHeight + (isMobile ? 20 : 40); // Extra padding
            
            // Get viewport dimensions
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // Calculate initial position (prefer bottom-right)
            let left = x + margin;
            let top = y + margin;
            
            // Horizontal positioning logic
            if (left + tooltipWidth > viewportWidth - margin) {
              // Try positioning to the left
              left = x - tooltipWidth - margin;
              
              // If still doesn't fit, center it horizontally
              if (left < margin) {
                left = Math.max(margin, (viewportWidth - tooltipWidth) / 2);
              }
            }
            
            // Ensure tooltip doesn't go off the left edge
            if (left < margin) {
              left = margin;
            }
            
            // Vertical positioning logic
            if (top + tooltipHeight > viewportHeight - margin) {
              // Try positioning above
              top = y - tooltipHeight - margin;
              
              // If still doesn't fit above, position it to fit within viewport
              if (top < margin) {
                // Calculate best vertical position
                const availableHeight = viewportHeight - (margin * 2);
                if (tooltipHeight <= availableHeight) {
                  // Center vertically if tooltip fits
                  top = (viewportHeight - tooltipHeight) / 2;
                } else {
                  // Position at top with scrollable content
                  top = margin;
                }
              }
            }
            
            // Final bounds checking
            left = Math.max(margin, Math.min(left, viewportWidth - tooltipWidth - margin));
            top = Math.max(margin, Math.min(top, viewportHeight - tooltipHeight - margin));
            
            // For very small screens, use full width with margins
            const finalWidth = isMobile && viewportWidth < 360 
              ? viewportWidth - (margin * 2)
              : tooltipWidth;
            
            return {
              left: `${left}px`,
              top: `${top}px`,
              width: `${finalWidth}px`,
              maxWidth: `${finalWidth}px`,
              maxHeight: isMobile ? `${Math.min(tooltipHeight, viewportHeight - (margin * 2))}px` : 'auto'
            };
          })()}
        >
          {pinnedItem && (
            <button
              onClick={() => {
                setPinnedItem(null);
                setPinnedPosition(null);
              }}
              className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ✕
            </button>
          )}
          
          <div className="font-semibold text-gray-800 dark:text-white mb-2">
            {(pinnedItem || hoveredItem)?.sku} - {(pinnedItem || hoveredItem)?.itemName}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            {(() => {
              const item = pinnedItem || hoveredItem;
              const b = item?.totalQtyBoxes || 0;
              const p = item?.totalQtyPcs || 0;
              if (b > 0 && p > 0) return `Total: ${b} Boxes + ${p} Pcs`;
              if (b > 0) return `Total: ${b} Boxes`;
              return `Total: ${p} Pcs`;
            })()}
          </div>
          
          <div className="overflow-y-auto overflow-x-auto" style={{ maxHeight: 'calc(100% - 80px)' }}>
            <table className="w-full text-xs min-w-full">
              <thead className="sticky top-0 bg-white dark:bg-gray-800">
                <tr className="border-b border-gray-200 dark:border-gray-600">
                  <th className="text-left py-1 px-1 sm:px-2 text-gray-700 dark:text-gray-300">Date</th>
                  <th className="text-left py-1 px-1 sm:px-2 text-gray-700 dark:text-gray-300">Bill No.</th>
                  <th className="text-left py-1 px-1 sm:px-2 text-gray-700 dark:text-gray-300">Party</th>
                  <th className="text-right py-1 px-1 sm:px-2 text-gray-700 dark:text-gray-300">Qty</th>
                </tr>
              </thead>
              <tbody>
                {(pinnedItem || hoveredItem)?.details.map((detail, idx) => (
                  <tr key={idx} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-1 px-1 sm:px-2 text-gray-800 dark:text-gray-200 text-xs">
                      {detail.date}
                    </td>
                    <td className="py-1 px-1 sm:px-2 text-gray-800 dark:text-gray-200 text-xs">
                      {`${detail.series}-${detail.billNo}`}
                    </td>
                    <td className="py-1 px-1 sm:px-2 text-gray-800 dark:text-gray-200 truncate text-xs" title={detail.partyName}>
                      {detail.partyName}
                    </td>
                    <td className="py-1 px-1 sm:px-2 text-right text-gray-800 dark:text-gray-200 text-xs">
                      {detail.qty} {detail.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bill Details Dialog */}
      {showBillDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-600">
              <h2 className="text-xl font-bold text-gray-800 dark:text-white">Bill Details</h2>
              <button
                onClick={() => setShowBillDialog(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(80vh-80px)]">
              <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-700">
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-gray-800 dark:text-white">Bill Date</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-gray-800 dark:text-white">Bill No.</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-left text-gray-800 dark:text-white">Party Name</th>
                    <th className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-800 dark:text-white">Net Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {billDetails.map((bill, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-800 dark:text-white">
                        {bill.DATE ? new Date(bill.DATE).toLocaleDateString('en-GB') : 'N/A'}
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-800 dark:text-white">
                        {bill.BILL_BB || 'N/A'}
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-gray-800 dark:text-white">
                        {bill.C_NAME || 'N/A'}
                      </td>
                      <td className="border border-gray-300 dark:border-gray-600 px-4 py-2 text-right text-gray-800 dark:text-white">
                        ₹{bill.N_B_AMT ? bill.N_B_AMT.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {billDetails.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No bill details found.
                </div>
              )}
            </div>
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