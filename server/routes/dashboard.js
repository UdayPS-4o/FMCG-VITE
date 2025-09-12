const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Helper function to format date to DD/MM/YYYY
const formatDateDDMMYYYY = (dateObj) => {
  if (!dateObj || !(dateObj instanceof Date)) return 'N/A';
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  return `${day}/${month}/${year}`;
};

// Helper function to check if date is today
const isToday = (dateString) => {
  const today = new Date();
  let checkDate;
  
  // Handle DD-MM-YYYY format (from invoicing.json)
  if (dateString.includes('-') && dateString.split('-').length === 3) {
    const [day, month, year] = dateString.split('-');
    checkDate = new Date(year, month - 1, day); // month is 0-indexed
  } else {
    checkDate = new Date(dateString);
  }
  
  return checkDate.toDateString() === today.toDateString();
};

// GET /api/dashboard/todays-sales - Get today's sales data
router.get('/todays-sales', async (req, res) => {
  try {
    const { userSubgroups } = req.query;
    
    const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
    const billdtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'BILLDTL.json');
    const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');
    const localInvoicingPath = path.join(__dirname, '..', 'db', 'invoicing.json');

    let billdtlData = [];
    let cmplData = [];
    let localInvoicingData = [];

    try {
      const billdtlFileContents = await fs.readFile(billdtlPath, 'utf-8');
      billdtlData = JSON.parse(billdtlFileContents);
    } catch (error) {
      console.error('Error reading BILLDTL.json:', error);
      // Don't return error, continue with local data
    }

    try {
      const cmplFileContents = await fs.readFile(cmplPath, 'utf-8');
      cmplData = JSON.parse(cmplFileContents);
    } catch (error) {
      console.error('Error reading CMPL.json:', error);
    }

    try {
      const localInvoicingFileContents = await fs.readFile(localInvoicingPath, 'utf-8');
      localInvoicingData = JSON.parse(localInvoicingFileContents);
    } catch (error) {
      console.error('Error reading invoicing.json:', error);
    }

    // Create party details map
    const partyDetailsMap = cmplData.reduce((acc, party) => {
      acc[party.C_CODE] = { name: party.C_NAME, place: party.C_PLACE };
      return acc;
    }, {});

    // Filter for today's sales
    const todaysSales = billdtlData.filter(item => {
      if (!item.DATE || item._deleted) return false;
      return isToday(item.DATE);
    });

    // Filter by user subgroups if provided
    let filteredSales = todaysSales;
    if (userSubgroups) {
      const subgroupPrefixes = userSubgroups.split(',').map(sg => sg.substring(0, 2).toUpperCase());
      filteredSales = todaysSales.filter(item => {
        if (!item.C_CODE) return false;
        const partyPrefix = item.C_CODE.substring(0, 2).toUpperCase();
        return subgroupPrefixes.includes(partyPrefix);
      });
    }

    // Group by bill and calculate totals
    const billMap = new Map();
    
    // Process DBF sales data
    filteredSales.forEach(item => {
      const billKey = `${item.SERIES}-${item.BILL}`;
      if (!billMap.has(billKey)) {
        const partyInfo = partyDetailsMap[item.C_CODE] || { name: item.C_CODE, place: '' };
        billMap.set(billKey, {
          date: formatDateDDMMYYYY(new Date(item.DATE)),
          series: item.SERIES,
          billNo: item.BILL,
          partyName: partyInfo.name,
          netAmt: 0
        });
      }
      const bill = billMap.get(billKey);
      bill.netAmt += parseFloat(item.AMT10) || 0;
    });

    // Process local invoicing data
    const todaysLocalInvoices = localInvoicingData.filter(item => {
      if (!item.date) return false;
      return isToday(item.date);
    });

    todaysLocalInvoices.forEach(item => {
      const billKey = `${item.series}-${item.billNo}`;
      if (!billMap.has(billKey)) {
        const partyInfo = partyDetailsMap[item.party] || { name: item.partyName || item.party, place: '' };
        // Convert DD-MM-YYYY to DD/MM/YYYY format to match the desired output
        const formattedDate = item.date ? item.date.replace(/-/g, '/') : 'N/A';
        billMap.set(billKey, {
          date: formattedDate,
          series: item.series,
          billNo: item.billNo,
          partyName: partyInfo.name,
          netAmt: parseFloat(item.total) || 0
        });
      }
    });

    // Convert to array and format
    const salesData = Array.from(billMap.values()).map(bill => ({
      date: bill.date,
      partyName: bill.partyName,
      billNo: `${bill.series}-${bill.billNo}`,
      netAmt: parseFloat(bill.netAmt.toFixed(2))
    }));

    // Sort by net amount descending
    salesData.sort((a, b) => b.netAmt - a.netAmt);

    res.json(salesData);
  } catch (error) {
    console.error('Error fetching today\'s sales:', error);
    res.status(500).json({ message: 'Error fetching today\'s sales data' });
  }
});

// GET /api/dashboard/todays-collections - Get today's collections data
router.get('/todays-collections', async (req, res) => {
  try {
    const { userSubgroups } = req.query;
    
    const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
    const cashPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CASH.json');
    const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');
    const localCashReceiptsPath = path.join(__dirname, '..', 'db', 'cash-receipts.json');
    const approvedCashReceiptsPath = path.join(__dirname, '..', 'db', 'approved', 'cash-receipts.json');

    let cashData = [];
    let cmplData = [];
    let localCashReceipts = [];
    let approvedCashReceipts = [];

    try {
      const cashFileContents = await fs.readFile(cashPath, 'utf-8');
      cashData = JSON.parse(cashFileContents);
    } catch (error) {
      console.error('Error reading CASH.json:', error);
    }

    try {
      const cmplFileContents = await fs.readFile(cmplPath, 'utf-8');
      cmplData = JSON.parse(cmplFileContents);
    } catch (error) {
      console.error('Error reading CMPL.json:', error);
    }

    try {
      const localFileContents = await fs.readFile(localCashReceiptsPath, 'utf-8');
      localCashReceipts = JSON.parse(localFileContents);
    } catch (error) {
      console.error('Error reading local cash-receipts.json:', error);
    }

    try {
      const approvedFileContents = await fs.readFile(approvedCashReceiptsPath, 'utf-8');
      approvedCashReceipts = JSON.parse(approvedFileContents);
    } catch (error) {
      console.error('Error reading approved cash-receipts.json:', error);
    }

    // Create party details map
    const partyDetailsMap = cmplData.reduce((acc, party) => {
      acc[party.C_CODE] = { name: party.C_NAME, place: party.C_PLACE };
      return acc;
    }, {});

    const collectionsData = [];

    // Process DBF cash receipts (CR entries)
    const todaysCashReceipts = cashData.filter(item => {
      if (!item.DATE || item._deleted) return false;
      return item.VR && item.VR.substring(0, 2) === 'CR' && isToday(item.DATE);
    });

    todaysCashReceipts.forEach(item => {
      const partyInfo = partyDetailsMap[item.C_CODE] || { name: item.C_CODE, place: '' };
      collectionsData.push({
        date: formatDateDDMMYYYY(new Date(item.DATE)),
        partyName: partyInfo.name,
        netAmt: parseFloat(item.AMOUNT) || 0
      });
    });

    // Process local cash receipts
    const todaysLocalReceipts = localCashReceipts.filter(item => {
      if (!item.date) return false;
      return isToday(item.date);
    });

    todaysLocalReceipts.forEach(item => {
      const partyInfo = partyDetailsMap[item.party] || { name: item.party, place: '' };
      collectionsData.push({
        date: formatDateDDMMYYYY(new Date(item.date)),
        partyName: partyInfo.name,
        netAmt: parseFloat(item.amount) || 0
      });
    });

    // Process approved cash receipts
    const todaysApprovedReceipts = approvedCashReceipts.filter(item => {
      if (!item.date) return false;
      return isToday(item.date);
    });

    todaysApprovedReceipts.forEach(item => {
      const partyInfo = partyDetailsMap[item.party] || { name: item.party, place: '' };
      collectionsData.push({
        date: formatDateDDMMYYYY(new Date(item.date)),
        partyName: partyInfo.name,
        netAmt: parseFloat(item.amount) || 0
      });
    });

    // Filter by user subgroups if provided
    let filteredCollections = collectionsData;
    if (userSubgroups) {
      const subgroupPrefixes = userSubgroups.split(',').map(sg => sg.substring(0, 2).toUpperCase());
      // Note: For collections, we might need to match party codes differently
      // This is a simplified approach - you may need to adjust based on your data structure
    }

    // Sort by net amount descending
    filteredCollections.sort((a, b) => b.netAmt - a.netAmt);

    res.json(filteredCollections);
  } catch (error) {
    console.error('Error fetching today\'s collections:', error);
    res.status(500).json({ message: 'Error fetching today\'s collections data' });
  }
});

// GET /api/dashboard/todays-collections-detailed - Get detailed today's collections data
router.get('/todays-collections-detailed', async (req, res) => {
  try {
    const { userSubgroups, userName } = req.query;
    
    const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
    const cashPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CASH.json');
    const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');
    const localCashReceiptsPath = path.join(__dirname, '..', 'db', 'cash-receipts.json');
    const approvedCashReceiptsPath = path.join(__dirname, '..', 'db', 'approved', 'cash-receipts.json');

    let cashData = [];
    let cmplData = [];
    let localCashReceipts = [];
    let approvedCashReceipts = [];

    try {
      const cashFileContents = await fs.readFile(cashPath, 'utf-8');
      cashData = JSON.parse(cashFileContents);
    } catch (error) {
      console.error('Error reading CASH.json:', error);
    }

    try {
      const cmplFileContents = await fs.readFile(cmplPath, 'utf-8');
      cmplData = JSON.parse(cmplFileContents);
    } catch (error) {
      console.error('Error reading CMPL.json:', error);
    }

    try {
      const localFileContents = await fs.readFile(localCashReceiptsPath, 'utf-8');
      localCashReceipts = JSON.parse(localFileContents);
    } catch (error) {
      console.error('Error reading local cash-receipts.json:', error);
    }

    try {
      const approvedFileContents = await fs.readFile(approvedCashReceiptsPath, 'utf-8');
      approvedCashReceipts = JSON.parse(approvedFileContents);
    } catch (error) {
      console.error('Error reading approved cash-receipts.json:', error);
    }

    // Create party details map
    const partyDetailsMap = cmplData.reduce((acc, party) => {
      acc[party.C_CODE] = { name: party.C_NAME, place: party.C_PLACE };
      return acc;
    }, {});

    const detailedCollections = [];

    // Process DBF cash receipts (CR entries)
    const todaysCashReceipts = cashData.filter(item => {
      if (!item.DATE || item._deleted) return false;
      return item.VR && item.VR.substring(0, 2) === 'CR' && isToday(item.DATE);
    });

    todaysCashReceipts.forEach(item => {
      const partyInfo = partyDetailsMap[item.C_CODE] || { name: item.C_CODE, place: '' };
      detailedCollections.push({
        date: formatDateDDMMYYYY(new Date(item.DATE)),
        partyName: partyInfo.name,
        receiptNo: item.VR || 'N/A',
        series: item.VR ? item.VR.split('-')[0] : 'N/A',
        amount: parseFloat(item.AMOUNT) || 0,
        userName: 'System', // DBF entries don't have user info
        source: 'dbf'
      });
    });

    // Process local cash receipts
    const todaysLocalReceipts = localCashReceipts.filter(item => {
      if (!item.date) return false;
      const isToday = new Date(item.date).toDateString() === new Date().toDateString();
      
      // Filter by user if userName is provided
      if (userName && item.smName !== userName) return false;
      
      return isToday;
    });

    todaysLocalReceipts.forEach(item => {
      const partyInfo = partyDetailsMap[item.party] || { name: item.party, place: '' };
      detailedCollections.push({
        date: formatDateDDMMYYYY(new Date(item.date)),
        partyName: partyInfo.name,
        receiptNo: `${item.series}-${item.receiptNo}`,
        series: item.series,
        amount: parseFloat(item.amount) || 0,
        userName: item.smName || 'Unknown',
        source: 'local'
      });
    });

    // Process approved cash receipts
    const todaysApprovedReceipts = approvedCashReceipts.filter(item => {
      if (!item.date) return false;
      const isToday = new Date(item.date).toDateString() === new Date().toDateString();
      
      // Filter by user if userName is provided
      if (userName && item.smName !== userName) return false;
      
      return isToday;
    });

    todaysApprovedReceipts.forEach(item => {
      const partyInfo = partyDetailsMap[item.party] || { name: item.party, place: '' };
      detailedCollections.push({
        date: formatDateDDMMYYYY(new Date(item.date)),
        partyName: partyInfo.name,
        receiptNo: `${item.series}-${item.receiptNo}`,
        series: item.series,
        amount: parseFloat(item.amount) || 0,
        userName: item.smName || 'Unknown',
        source: 'approved'
      });
    });

    // Filter by user subgroups if provided
    let filteredCollections = detailedCollections;
    if (userSubgroups) {
      const subgroupPrefixes = userSubgroups.split(',').map(sg => sg.substring(0, 2).toUpperCase());
      filteredCollections = detailedCollections.filter(item => {
        // For local/approved receipts, check if party code starts with subgroup prefix
        const partyCode = Object.keys(partyDetailsMap).find(code => 
          partyDetailsMap[code].name === item.partyName
        );
        if (partyCode) {
          const partyPrefix = partyCode.substring(0, 2).toUpperCase();
          return subgroupPrefixes.includes(partyPrefix);
        }
        return true; // Include if we can't determine the party code
      });
    }

    // Calculate total
    const total = filteredCollections.reduce((sum, item) => sum + item.amount, 0);

    // Sort by amount descending
    filteredCollections.sort((a, b) => b.amount - a.amount);

    res.json({
      collections: filteredCollections,
      total: parseFloat(total.toFixed(2))
    });
  } catch (error) {
    console.error('Error fetching detailed today\'s collections:', error);
    res.status(500).json({ message: 'Error fetching detailed today\'s collections data' });
  }
});

// GET /api/dashboard/balance-uddhari - Get balance uddhari KPI
router.get('/balance-uddhari', async (req, res) => {
  try {
    const { userSubgroups } = req.query;
    
    const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
    const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');

    let cmplData = [];

    try {
      const cmplFileContents = await fs.readFile(cmplPath, 'utf-8');
      cmplData = JSON.parse(cmplFileContents);
    } catch (error) {
      console.error('Error reading CMPL.json:', error);
      return res.status(500).json({ message: 'Error loading balance data.' });
    }

    // Filter for debit balances (customers with outstanding amounts)
    let debtorBalances = cmplData.filter(company => {
      const balance = parseFloat(company.CUR_BAL || company.CB_VAL || 0);
      const drCr = company.DR || '';
      return drCr === 'DR' && balance > 0;
    });

    // Filter by user subgroups if provided
    if (userSubgroups) {
      const subgroupPrefixes = userSubgroups.split(',').map(sg => sg.substring(0, 2).toUpperCase());
      debtorBalances = debtorBalances.filter(company => {
        if (!company.C_CODE) return false;
        const partyPrefix = company.C_CODE.substring(0, 2).toUpperCase();
        return subgroupPrefixes.includes(partyPrefix);
      });
    }

    // Calculate total balance uddhari
    const totalBalanceUddhari = debtorBalances.reduce((total, company) => {
      const balance = parseFloat(company.CUR_BAL || company.CB_VAL || 0);
      return total + balance;
    }, 0);

    // Get count of debtors
    const debtorCount = debtorBalances.length;

    res.json({
      totalBalance: parseFloat(totalBalanceUddhari.toFixed(2)),
      debtorCount: debtorCount,
      averageBalance: debtorCount > 0 ? parseFloat((totalBalanceUddhari / debtorCount).toFixed(2)) : 0
    });
  } catch (error) {
    console.error('Error fetching balance uddhari:', error);
    res.status(500).json({ message: 'Error fetching balance uddhari data' });
  }
});

// NEW: GET /api/dashboard/unbilled-customers - Customers by days since last bill grouped by subgroup
router.get('/unbilled-customers', async (req, res) => {
  try {
    console.log('=== UNBILLED CUSTOMERS API CALLED ===');
    console.log('User:', req.user?.name, 'ID:', req.user?.id);
    console.log('User subgroups:', req.user?.subgroups);
    console.log('User routeAccess:', req.user?.routeAccess);
    
    const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
    
    // Get user subgroups from authenticated user (req.user is set by middleware)
    const userSubgroups = req.user?.subgroups || [];
    const isAdmin = req.user?.routeAccess?.includes('Admin');
    
    console.log('Is Admin:', isAdmin);
    console.log('User subgroups length:', userSubgroups.length);
    
    // If user has no subgroups and is not admin, return empty result
    if (!isAdmin && (!userSubgroups || userSubgroups.length === 0)) {
      console.log('Returning empty result for non-admin user with no subgroups');
      return res.json({ subgroups: [] });
    }
    
    const billPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'BILL.json');
    const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');

    let billData = [];
    let cmplData = [];

    try {
      const billFileContents = await fs.readFile(billPath, 'utf-8');
      billData = JSON.parse(billFileContents);
    } catch (error) {
      console.error('Error reading BILL.json:', error);
      // If billing data is missing, we will still attempt to respond with empty buckets
    }

    try {
      const cmplFileContents = await fs.readFile(cmplPath, 'utf-8');
      cmplData = JSON.parse(cmplFileContents);
    } catch (error) {
      console.error('Error reading CMPL.json:', error);
      return res.status(500).json({ message: 'Error loading customers data.' });
    }

    // Map last billed date per customer code (process in chunks of 1000)
    const lastBilledMap = new Map();
    if (Array.isArray(billData)) {
      const CHUNK_SIZE = 1000;
      for (let start = 0; start < billData.length; start += CHUNK_SIZE) {
        const chunk = billData.slice(start, start + CHUNK_SIZE);
        for (const item of chunk) {
          if (!item || item._deleted) continue;
          const code = item.C_CODE || item.CCODE || item.PARTY || null;
          const dateStr = item.DATE;
          if (!code || !dateStr) continue;
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) continue;
          const prev = lastBilledMap.get(code);
          if (!prev || d > prev) lastBilledMap.set(code, d);
        }
      }
    }

    // Create a map of subgroup prefixes to subgroup info
    const subgroupMap = new Map();
    
    if (isAdmin) {
      // For admin users, we'll dynamically discover subgroups from customer data
      // This will be populated later when processing customer data
    } else {
      // For regular users, use their assigned subgroups
      userSubgroups.forEach(sg => {
        const code = sg.subgroupCode || sg;
        if (typeof code === 'string' && code.length >= 2) {
          const prefix = code.substring(0, 2).toUpperCase();
          subgroupMap.set(prefix, {
            title: sg.title || code,
            subgroupCode: code,
            prefix: prefix
          });
        }
      });
    }

    const today = new Date();

    const pushCustomer = (subgroupPrefix, bucket, c, lastDate) => {
      const payload = {
        code: c.C_CODE,
        name: c.C_NAME || c.NAME || c.CMP_NAME || c.code || c.name,
        lastBillDate: lastDate ? `${String(lastDate.getDate()).padStart(2, '0')}-${String(lastDate.getMonth() + 1).padStart(2, '0')}-${lastDate.getFullYear()}` : 'Never',
        daysSince: lastDate ? Math.floor((today - lastDate) / (1000 * 60 * 60 * 24)) : null,
      };
      
      const subgroupResult = subgroupResults.get(subgroupPrefix);
      if (subgroupResult) {
        subgroupResult[bucket].push(payload);
        subgroupResult.counts[bucket]++;
        subgroupResult.counts.total++;
      }
    };

    // For admin users, dynamically discover subgroups from customer data
    if (isAdmin) {
      console.log('Admin user detected, discovering subgroups from customer data...');
      console.log('CMPL data length:', cmplData.length);
      
      // Define excluded subgroups for admin users (same as BalanceUddhari.tsx)
      const excludedSubgroups = ['CL', 'EE', 'FA', 'CT', 'AA', 'GG', 'BB', 'SB', 'FC', 'PL', 'DZ', 'VG', 'VI'];
      
      const discoveredSubgroups = new Set();
      for (const c of cmplData) {
        if (!c || !c.C_CODE) continue;
        const pref = c.C_CODE.substring(0, 2).toUpperCase();
        
        // Skip excluded subgroups for admin users
        if (excludedSubgroups.includes(pref)) continue;
        
        if (pref.length === 2 && !discoveredSubgroups.has(pref)) {
          discoveredSubgroups.add(pref);
          subgroupMap.set(pref, {
            title: pref,
            subgroupCode: pref,
            prefix: pref
          });
        }
      }
      console.log('Discovered subgroups (after exclusions):', Array.from(discoveredSubgroups));
      console.log('Excluded subgroups:', excludedSubgroups);
      console.log('SubgroupMap size:', subgroupMap.size);
    }

    // Initialize subgroup results after subgroup discovery
    const subgroupResults = new Map();
    subgroupMap.forEach((subgroupInfo, prefix) => {
      subgroupResults.set(prefix, {
        ...subgroupInfo,
        last7: [],
        last15: [],
        last30: [],
        counts: { last7: 0, last15: 0, last30: 0, total: 0 }
      });
    });

    console.log('Starting customer processing...');
    console.log('SubgroupResults initialized for:', Array.from(subgroupResults.keys()));
    
    let processedCustomers = 0;
    let matchedCustomers = 0;
    
    const CMPL_CHUNK = 1000;
    for (let i = 0; i < cmplData.length; i += CMPL_CHUNK) {
      const cmplChunk = cmplData.slice(i, i + CMPL_CHUNK);
      for (const c of cmplChunk) {
        if (!c || !c.C_CODE) continue;
        processedCustomers++;
        
        // Get the prefix and check if it matches any user subgroup
        const pref = c.C_CODE.substring(0, 2).toUpperCase();
        if (!subgroupMap.has(pref)) continue;
        matchedCustomers++;
        
        const lastDate = lastBilledMap.get(c.C_CODE) || null;
        if (!lastDate) {
          // Never billed -> consider in last30 bucket as oldest
          pushCustomer(pref, 'last30', c, null);
          continue;
        }
        
        const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
        if (diffDays >= 1 && diffDays <= 7) {
          pushCustomer(pref, 'last7', c, lastDate);
        } else if (diffDays >= 8 && diffDays <= 15) {
          pushCustomer(pref, 'last15', c, lastDate);
        } else if (diffDays >= 16 && diffDays <= 30) {
          pushCustomer(pref, 'last30', c, lastDate);
        }
        // If >30 days, we skip for this KPI (focused on last 30 days)
      }
    }

    console.log('Customer processing completed:');
    console.log('- Processed customers:', processedCustomers);
    console.log('- Matched customers:', matchedCustomers);
    console.log('- SubgroupResults after processing:', Array.from(subgroupResults.entries()).map(([key, value]) => ({ key, total: value.counts.total })));

    // Sort each bucket by daysSince desc (more stale first) for each subgroup
    subgroupResults.forEach((subgroupResult) => {
      subgroupResult.last7.sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0));
      subgroupResult.last15.sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0));
      subgroupResult.last30.sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0));
    });

    // Convert to array and filter out empty subgroups
    const subgroupsArray = Array.from(subgroupResults.values())
      .filter(sg => sg.counts.total > 0)
      .sort((a, b) => b.counts.total - a.counts.total); // Sort by total count desc

    console.log('Final subgroups array length:', subgroupsArray.length);
    console.log('Subgroups with data:', subgroupsArray.map(sg => ({ title: sg.title, total: sg.counts.total })));

    res.json({ subgroups: subgroupsArray });
  } catch (error) {
    console.error('Error computing unbilled customers:', error);
    res.status(500).json({ message: 'Error computing unbilled customers' });
  }
});

module.exports = router;