const express = require("express");
const app = express.Router();
const fs = require("fs").promises;
const fsSync = require("fs");
const readline = require("readline");
const path = require("path");
const {
  redirect,
  getDbfData,
  getCmplData,
  ensureDirectoryExistence,
  saveDataToJsonFile,
} = require("../utilities");
const jwt = require('jsonwebtoken');
const { DBFFile } = require('../../dbf-orm/dbffile');

// JWT secret key
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Extract JWT token from Authorization header
const extractToken = (req) => {
  if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
    return req.headers.authorization.split(' ')[1];
  }
  return null;
};

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
  const token = extractToken(req);
  
  if (!token) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Authentication required' 
    });
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user from users.json file
    const filePath = path.join(__dirname, "..", "..", "db", "users.json");
    const data = await fs.readFile(filePath, "utf8");
    const users = JSON.parse(data);
    const user = users.find((u) => u.id === decoded.userId);
    
    if (user) {
      req.user = user;
      next();
    } else {
      res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid or expired authentication token' 
      });
    }
  } catch (err) {
    console.error("JWT verification failed:", err);
    res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Invalid or expired token' 
    });
  }
};

const uniqueIdentifiers = ["bill", "createdAt", "subgroup", "receiptNo", "voucherNo", "id", "achead"];

app.get("/edit/:page/:id", async (req, res) => {
  const { page, id } = req.params;
  console.log(`Fetching ${page} with id ${id}`);
  
  try {
    let data = await fs.readFile(`./db/${page}.json`, "utf8");
    data = JSON.parse(data);

    // find the entry with the specified identifier
    let result = null;
    
    // For invoicing, look specifically for the id field first
    if (page === 'invoicing') {
      console.log(`Looking for invoicing record with id: ${id}`);
      result = data.find(entry => String(entry.id) === String(id));
    }
    // For account-master, prioritize subgroup
    else if (page === 'account-master') {
      console.log(`Looking for account-master record with subgroup: ${id}`);
      result = data.find(entry => String(entry.subgroup) === String(id));
      
      if (!result) {
        // If not found by subgroup, then try achead as fallback
        result = data.find(entry => String(entry.achead) === String(id));
      }
    }
    
    // If not found with specific handling, try other identifiers
    if (!result) {
      console.log(`Trying alternative identifiers for ${page}`);
      for (const key of uniqueIdentifiers) {
        console.log(`Checking identifier: ${key}`);
        result = data.find(entry => String(entry[key]) === String(id));
        if (result) {
          console.log(`Found entry using identifier: ${key}`);
          break;
        }
      }
    }

    if (!result) {
      console.log(`No ${page} record found with id ${id}`);
      res.status(404).send(`Record not found ` + redirect(`/db/${page}`, 2000));
      return;
    }

    console.log(`Found ${page} record:`, result);
    res.json(result);
  } catch (error) {
    console.error(`Error fetching ${page} record:`, error);
    res.status(500).send(`Error retrieving data: ${error.message}`);
  }
});

// make this route delete/cash-receipts/${id}
app.get("/delete/:page/:id", verifyToken, async (req, res) => {
  const { page, id } = req.params;
  console.log(`Attempting to delete ${page} record with ID: ${id}`);
  
  try {
    // Use the same path resolution as the working edit route
    const filePath = `./db/${page}.json`;
    console.log(`Reading from file: ${filePath}`);
    
    // Read the file
    const data = await fs.readFile(filePath, "utf8");
    const jsonData = JSON.parse(data);
    
    if (jsonData.length === 0) {
      console.log(`No records found in ${page}.json`);
      return res.status(404).json({ error: `No records found in ${page}` });
    }
    
    let recordIndex = -1;
    
    // Special handling for account-master to prioritize subgroup
    if (page === 'account-master') {
      console.log(`Looking for account-master record with subgroup: ${id}`);
      recordIndex = jsonData.findIndex(item => String(item.subgroup) === String(id));
      
      if (recordIndex === -1) {
        // Fallback to achead only if not found by subgroup
        recordIndex = jsonData.findIndex(item => String(item.achead) === String(id));
      }
    } else {
      // Get the appropriate ID field based on the endpoint
      const keys = Object.keys(jsonData[0]);
      let validKey = keys.find((key) => uniqueIdentifiers.includes(key));
      // Explicit preference for purchases: search across common keys (do not rely on first row)
      if (page === 'purchases') {
        const candidateKeys = ['pbillno', 'PBILLNO', 'bill', 'BILL', 'createdAt'];
        recordIndex = jsonData.findIndex((item) =>
          candidateKeys.some((k) => 
            item.hasOwnProperty(k) && 
            String(item[k]).toLowerCase() === String(id).toLowerCase()
          )
        );
        validKey = recordIndex !== -1 
          ? candidateKeys.find(k => jsonData[recordIndex].hasOwnProperty(k) && String(jsonData[recordIndex][k]).toLowerCase() === String(id).toLowerCase()) 
          : validKey;
      } else {
        if (!validKey) {
          console.log(`No valid identifier found for ${page}`);
          return res.status(400).json({ error: `Could not determine ID field for ${page}` });
        }
        
        console.log(`Using identifier field: ${validKey}`);
        
        // Find the record case-insensitively
        recordIndex = jsonData.findIndex((item) => 
          String(item[validKey]).toLowerCase() === String(id).toLowerCase()
        );
      }
    }
    
    if (recordIndex === -1) {
      console.log(`Record not found with ID = ${id}`);
      return res.status(404).json({ error: `Record not found with ID = ${id}` });
    }
    
    // Remove the record
    jsonData.splice(recordIndex, 1);
    
    // Save the updated data
    await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), "utf8");
    
    console.log(`Successfully deleted ${page} record with ID = ${id}`);
    res.status(200).json({ message: "Record deleted successfully" });
  } catch (error) {
    console.error(`Error deleting ${page} record:`, error);
    res.status(500).json({ error: `Error deleting record: ${error.message}` });
  }
});

// Add a specific route for invoicing edits to match the client's request pattern
app.get("/edit/invoicing/:id", async (req, res) => {
  console.log(`Edit invoicing request for ID: ${req.params.id}`);
  
  try {
    // Read the invoicing.json file
    const filePath = path.join(__dirname, '..', '..', 'db', 'invoicing.json');
    const data = await fs.promises.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(data);
    
    // Find the record with the matching ID
    const id = req.params.id;
    const record = jsonData.find(item => String(item.id) === String(id));
    
    if (record) {
      console.log(`Found record with ID ${id}`);
      res.json(record);
    } else {
      console.log(`Record with ID ${id} not found`);
      res.status(404).send(`Record with ID ${id} not found`);
    }
  } catch (error) {
    console.error('Error fetching invoicing record:', error);
    res.status(500).send(`Error fetching record: ${error.message}`);
  }
});

// Add a specific route for deleting approved records
app.get("/delete/approved/:page/:id", verifyToken, async (req, res) => {
  const { page, id } = req.params;
  console.log(`Attempting to delete approved ${page} record with ID: ${id}`);
  
  try {
    // Use path to the approved file
    const filePath = `./db/approved/${page}.json`;
    console.log(`Reading from approved file: ${filePath}`);
    
    // Read the file
    let jsonData = [];
    try {
      const data = await fs.readFile(filePath, "utf8");
      jsonData = JSON.parse(data);
    } catch (readError) {
      if (readError.code === 'ENOENT') {
        return res.status(404).json({ error: `No approved records found for ${page}` });
      }
      throw readError;
    }
    
    if (jsonData.length === 0) {
      console.log(`No approved records found in ${page}.json`);
      return res.status(404).json({ error: `No approved records found in ${page}` });
    }
    
    let recordIndex = -1;
    
    // Special handling for account-master to prioritize subgroup
    if (page === 'account-master') {
      console.log(`Looking for approved account-master record with subgroup: ${id}`);
      recordIndex = jsonData.findIndex(item => String(item.subgroup) === String(id));
      
      if (recordIndex === -1) {
        // Fallback to achead only if not found by subgroup
        recordIndex = jsonData.findIndex(item => String(item.achead) === String(id));
      }
    } else {
      // Get the appropriate ID field based on the endpoint
      const keys = Object.keys(jsonData[0]);
      let validKey = keys.find((key) => uniqueIdentifiers.includes(key));
      
      // Explicit preference for purchases in approved file too
      if (page === 'purchases') {
        const candidateKeys = ['pbillno', 'PBILLNO', 'bill', 'BILL', 'createdAt'];
        recordIndex = jsonData.findIndex((item) =>
          candidateKeys.some((k) => 
            item.hasOwnProperty(k) && 
            String(item[k]).toLowerCase() === String(id).toLowerCase()
          )
        );
        validKey = recordIndex !== -1 
          ? candidateKeys.find(k => jsonData[recordIndex].hasOwnProperty(k) && String(jsonData[recordIndex][k]).toLowerCase() === String(id).toLowerCase()) 
          : validKey;
      } else {
        if (!validKey) {
          console.log(`No valid identifier found for approved ${page}`);
          return res.status(400).json({ error: `Could not determine ID field for ${page}` });
        }
        
        console.log(`Using identifier field: ${validKey}`);
        
        // Find the record case-insensitively
        recordIndex = jsonData.findIndex((item) => 
          String(item[validKey]).toLowerCase() === String(id).toLowerCase()
        );
      }
    }
    
    if (recordIndex === -1) {
      console.log(`Approved record not found with ID = ${id}`);
      return res.status(404).json({ error: `Approved record not found with ID = ${id}` });
    }
    
    // Remove the record
    jsonData.splice(recordIndex, 1);
    
    // Save the updated data
    await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), "utf8");
    
    console.log(`Successfully deleted approved ${page} record with ID = ${id}`);
    res.status(200).json({ message: "Approved record deleted successfully" });
  } catch (error) {
    console.error(`Error deleting approved ${page} record:`, error);
    res.status(500).json({ error: `Error deleting approved record: ${error.message}` });
  }
});

// Add a route for fetching approved records for editing
app.get("/edit/approved/:page/:id", async (req, res) => {
  const { page, id } = req.params;
  console.log(`Fetching approved ${page} with id ${id}`);
  
  try {
    let data = await fs.readFile(`./db/approved/${page}.json`, "utf8");
    data = JSON.parse(data);

    // find the entry with the specified identifier
    let result = null;
    
    // For account-master, prioritize subgroup
    if (page === 'account-master') {
      console.log(`Looking for approved account-master record with subgroup: ${id}`);
      result = data.find(entry => String(entry.subgroup) === String(id));
      
      if (!result) {
        // If not found by subgroup, then try achead as fallback
        result = data.find(entry => String(entry.achead) === String(id));
      }
    } else {
      // If not found with specific handling, try other identifiers
      for (const key of uniqueIdentifiers) {
        console.log(`Checking identifier: ${key}`);
        result = data.find(entry => String(entry[key]) === String(id));
        if (result) {
          console.log(`Found entry using identifier: ${key}`);
          break;
        }
      }
    }

    if (!result) {
      console.log(`No approved ${page} record found with id ${id}`);
      res.status(404).send(`Approved record not found ` + redirect(`/approved/${page}`, 2000));
      return;
    }

    console.log(`Found approved ${page} record:`, result);
    res.json(result);
  } catch (error) {
    console.error(`Error fetching approved ${page} record:`, error);
    res.status(500).send(`Error retrieving data: ${error.message}`);
  }
});

// Add temporary test endpoint without authentication for testing
app.get("/api/test-details/:series/:billNo", async (req, res) => {
  const { series, billNo } = req.params;
  console.log(`[TEST] Fetching bill details for series: ${series}, billNo: ${billNo}`);
  
  try {
    const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
    if (!DBF_FOLDER_PATH) {
      return res.status(500).json({ 
        success: false,
        message: 'DBF_FOLDER_PATH environment variable not set.' 
      });
    }

    // Define file paths
    const billPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'BILL.json');
    const billDtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'BILLDTL.json');
    const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');
    const pmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'PMPL.json');

    // Check if required files exist
    const requiredFiles = [billPath, billDtlPath, cmplPath, pmplPath];
    for (const filePath of requiredFiles) {
      try {
        await fs.access(filePath);
      } catch (error) {
        console.error(`Required data file not found: ${filePath}`);
        return res.status(404).json({
          success: false,
          message: 'Required data files not found'
        });
      }
    }

    // Helper function to find bill details efficiently by streaming
    const findBillDetailsStreaming = async (filePath, targetSeries, targetBillNo) => {
      const fileStream = fsSync.createReadStream(filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      const matchingDetails = [];
      let isFirstLine = true;
      let isInArray = false;
      let processedLines = 0;
      const startTime = Date.now();

      for await (const line of rl) {
        processedLines++;
        const trimmedLine = line.trim();
        
        // Skip empty lines
        if (!trimmedLine) continue;
        
        // Handle JSON array start
        if (trimmedLine === '[') {
          isInArray = true;
          continue;
        }
        
        // Handle JSON array end
        if (trimmedLine === ']') {
          break;
        }
        
        // Skip if not in array yet
        if (!isInArray) continue;
        
        // Remove trailing comma if present
        let jsonLine = trimmedLine;
        if (jsonLine.endsWith(',')) {
          jsonLine = jsonLine.slice(0, -1);
        }
        
        try {
          const detail = JSON.parse(jsonLine);
          // Check if this detail matches our criteria
          if (detail.SERIES === targetSeries && detail.BILL.toString() === targetBillNo.toString()) {
            matchingDetails.push(detail);
          }
        } catch (parseError) {
          // Skip malformed JSON lines
          console.warn('Skipping malformed JSON line:', jsonLine.substring(0, 100));
        }
      }
       
       const endTime = Date.now();
       console.log(`Streaming completed: processed ${processedLines} lines in ${endTime - startTime}ms, found ${matchingDetails.length} matching details`);
       return matchingDetails;
    };

    // Read required data files (except BILLDTL which we'll stream)
    const [billData, cmplData, pmplData] = await Promise.all([
      fs.readFile(billPath, 'utf8').then(data => JSON.parse(data)),
      fs.readFile(cmplPath, 'utf8').then(data => JSON.parse(data)),
      fs.readFile(pmplPath, 'utf8').then(data => JSON.parse(data))
    ]);

    // Find the main bill record
    const mainBill = billData.find(bill => 
      bill.SERIES === series && bill.BILL.toString() === billNo.toString()
    );

    if (!mainBill) {
      console.log(`Bill not found: series=${series}, billNo=${billNo}`);
      return res.status(404).json({
        success: false,
        message: `Bill not found with series ${series} and bill number ${billNo}`
      });
    }

    // Find bill details using streaming approach
    console.log(`Streaming BILLDTL.json to find details for series: ${series}, billNo: ${billNo}`);
    const billDetails = await findBillDetailsStreaming(billDtlPath, series, billNo);

    // Create lookup maps for party and product details
    const partyDetailsMap = cmplData.reduce((acc, party) => {
      acc[party.C_CODE] = { 
        name: party.C_NAME, 
        place: party.C_PLACE,
        address: party.C_ADD1,
        gstNo: party.C_GSTNO
      };
      return acc;
    }, {});

    const productDetailsMap = pmplData.reduce((acc, product) => {
      acc[product.CODE] = { 
        name: product.PRODUCT, 
        unit: product.UNIT_1,
        brand: product.BRAND
      };
      return acc;
    }, {});

    // Get party information
    const partyInfo = partyDetailsMap[mainBill.C_CODE] || { 
      name: 'Unknown Party', 
      place: '', 
      address: '',
      gstNo: ''
    };

    // Create lookup map for S/M names using BR_CODE
    const smDetailsMap = usersData.reduce((acc, user) => {
      if (user.smCode) {
        acc[user.smCode] = {
          name: user.name,
          smCode: user.smCode
        };
      }
      return acc;
    }, {});

    // Get S/M information from BR_CODE
    const smInfo = smDetailsMap[mainBill.BR_CODE] || { 
      name: '', 
      smCode: mainBill.BR_CODE || ''
    };

    // Process bill details with product information
    const processedDetails = billDetails.map(detail => ({
      ...detail,
      BILLDTL_UNIT: detail.UNIT, // Add original unit from BILLDTL for frontend reference
      productInfo: {
        ...(productDetailsMap[detail.I_CODE] || { 
          name: 'Unknown Product', 
          unit: '',
          brand: ''
        }),
        // Override unit with actual unit from bill detail, not from product master
        unit: detail.UNIT || (productDetailsMap[detail.I_CODE] && productDetailsMap[detail.I_CODE].unit) || ''
      }
    }));

    console.log(`[TEST] Found bill record: series=${series}, billNo=${billNo}, party=${partyInfo.name}`);
    res.json({
      success: true,
      data: {
        bill: mainBill,
        details: processedDetails,
        party: partyInfo,
        summary: {
          series: series,
          billNo: billNo,
          date: mainBill.DATE,
          partyName: partyInfo.name,
          totalAmount: mainBill.AMOUNT,
          itemCount: billDetails.length
        }
      }
    });
  } catch (error) {
    console.error('[TEST] Error fetching bill details:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching bill details: ${error.message}`
    });
  }
});

// Add endpoint to handle /api/details/:series/:billNo for old bill editing
app.get("/api/details/:series/:billNo", verifyToken, async (req, res) => {
  const { series, billNo } = req.params;
  console.log(`Fetching bill details for series: ${series}, billNo: ${billNo}`);
  
  try {
    const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
    if (!DBF_FOLDER_PATH) {
      return res.status(500).json({ 
        success: false,
        message: 'DBF_FOLDER_PATH environment variable not set.' 
      });
    }

    // Define file paths
    const billPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'BILL.json');
    const billDtlPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'BILLDTL.json');
    const cmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json');
    const pmplPath = path.join(DBF_FOLDER_PATH, 'data', 'json', 'PMPL.json');
    const usersPath = path.join(__dirname, '..', '..', 'db', 'users.json');

    // Check if required files exist
    const requiredFiles = [billPath, billDtlPath, cmplPath, pmplPath, usersPath];
    for (const filePath of requiredFiles) {
      try {
        await fs.access(filePath);
      } catch (error) {
        console.error(`Required data file not found: ${filePath}`);
        return res.status(404).json({
          success: false,
          message: 'Required data files not found'
        });
      }
    }

    // Read all required data files
    const [billData, billDtlData, cmplData, pmplData, usersData] = await Promise.all([
      fs.readFile(billPath, 'utf8').then(data => JSON.parse(data)),
      fs.readFile(billDtlPath, 'utf8').then(data => JSON.parse(data)),
      fs.readFile(cmplPath, 'utf8').then(data => JSON.parse(data)),
      fs.readFile(pmplPath, 'utf8').then(data => JSON.parse(data)),
      fs.readFile(usersPath, 'utf8').then(data => JSON.parse(data))
    ]);

    // Find the main bill record
    const mainBill = billData.find(bill => 
      bill.SERIES === series && bill.BILL.toString() === billNo.toString()
    );

    if (!mainBill) {
      console.log(`Bill not found: series=${series}, billNo=${billNo}`);
      return res.status(404).json({
        success: false,
        message: `Bill not found with series ${series} and bill number ${billNo}`
      });
    }

    // Find all bill detail records for this bill
    const billDetails = billDtlData.filter(detail => 
      detail.SERIES === series && detail.BILL.toString() === billNo.toString()
    );

    // Create lookup maps for party and product details
    const partyDetailsMap = cmplData.reduce((acc, party) => {
      acc[party.C_CODE] = { 
        name: party.C_NAME, 
        place: party.C_PLACE,
        address: party.C_ADD1,
        gstNo: party.C_GSTNO
      };
      return acc;
    }, {});

    const productDetailsMap = pmplData.reduce((acc, product) => {
      acc[product.CODE] = { 
        name: product.PRODUCT, 
        unit: product.UNIT_1,
        brand: product.BRAND
      };
      return acc;
    }, {});

    // Get party information
    const partyInfo = partyDetailsMap[mainBill.C_CODE] || { 
      name: 'Unknown Party', 
      place: '', 
      address: '',
      gstNo: ''
    };

    // Create lookup map for S/M names using BR_CODE
    const smDetailsMap = usersData.reduce((acc, user) => {
      if (user.smCode) {
        acc[user.smCode] = {
          name: user.name,
          smCode: user.smCode
        };
      }
      return acc;
    }, {});

    // Get S/M information from BR_CODE
    const smInfo = smDetailsMap[mainBill.BR_CODE] || { 
      name: '', 
      smCode: mainBill.BR_CODE || ''
    };

    // Process bill details with product information
    const processedDetails = billDetails.map(detail => ({
      ...detail,
      BILLDTL_UNIT: detail.UNIT, // Add original unit from BILLDTL for frontend reference
      productInfo: {
        ...(productDetailsMap[detail.I_CODE] || { 
          name: 'Unknown Product', 
          unit: '',
          brand: ''
        }),
        // Override unit with actual unit from bill detail, not from product master
        unit: detail.UNIT || (productDetailsMap[detail.I_CODE] && productDetailsMap[detail.I_CODE].unit) || ''
      }
    }));

    console.log(`Found bill record: series=${series}, billNo=${billNo}, party=${partyInfo.name}, SM=${smInfo.name}`);
    console.log(`[DEBUG] mainBill.BR_CODE: ${mainBill.BR_CODE}`);
    console.log(`[DEBUG] smDetailsMap keys:`, Object.keys(smDetailsMap));
    console.log(`[DEBUG] smInfo:`, smInfo);
    console.log(`[DEBUG] Sample detail unit data:`, processedDetails[0] ? {
      UNIT: processedDetails[0].UNIT,
      productInfo: processedDetails[0].productInfo
    } : 'No details');
    res.json({
      success: true,
      data: {
        bill: {
          ...mainBill,
          SM: smInfo.smCode,
          smName: smInfo.name
        },
        details: processedDetails,
        party: partyInfo,
        sm: smInfo,
        summary: {
          series: series,
          billNo: billNo,
          date: mainBill.DATE,
          partyName: partyInfo.name,
          totalAmount: mainBill.AMOUNT,
          itemCount: billDetails.length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching bill details:', error);
    res.status(500).json({
      success: false,
      message: `Error fetching bill details: ${error.message}`
    });
  }
});

module.exports = app;
 
// Simple direct DBF update for old bill edits using delete-and-append strategy
app.post("/api/update-old-bill-dbffile", verifyToken, async (req, res) => {
  try {
    const DBF_FOLDER_PATH = process.env.DBF_FOLDER_PATH;
    if (!DBF_FOLDER_PATH) {
      return res.status(500).json({ success: false, message: 'DBF_FOLDER_PATH not set' });
    }
    const { series, billNo, date, cash, party, sm, ref, dueDays, items, total } = req.body || {};
    if (!series || !billNo || !date || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const billPath = path.join(DBF_FOLDER_PATH, 'data', 'BILL.DBF');
    const billDtlPath = path.join(DBF_FOLDER_PATH, 'data', 'BILLDTL.DBF');
    const parseDDMMYYYY = (dstr) => {
      const m = String(dstr).match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
      if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      const d = new Date(dstr);
      return isNaN(d.getTime()) ? new Date() : d;
    };
    // Read existing BILL and mark the old row as deleted
    const billDbf = await DBFFile.open(billPath);
    const billFields = billDbf.fields;
    const billRecords = await billDbf.readRecords(true);
    let headerIndex = -1;
    for (let i = 0; i < billRecords.length; i++) {
      const r = billRecords[i];
      if (String(r.SERIES).toUpperCase() === String(series).toUpperCase() && String(r.BILL) === String(billNo)) {
        headerIndex = i;
        break;
      }
    }
    if (headerIndex === -1) {
      await billDbf.close();
      return res.status(404).json({ success: false, message: 'Bill header not found' });
    }
    await billDbf.markRecordDeleted(headerIndex);
    // Append a fresh updated header row
    const oldHeader = billRecords[headerIndex];
    const newHeader = {
      ...oldHeader,
      DATE: parseDDMMYYYY(date),
      CASH: cash || oldHeader.CASH,
      C_CODE: party || oldHeader.C_CODE,
      SM: sm || oldHeader.SM,
      REF: ref ?? oldHeader.REF,
      DUE_DAYS: dueDays ?? oldHeader.DUE_DAYS,
      AMOUNT: total ? parseFloat(total) : oldHeader.AMOUNT,
      N_B_AMT: total ? parseFloat(total) : oldHeader.N_B_AMT
    };
    delete newHeader._deleted;
    await billDbf.appendRecord(newHeader);
    await billDbf.close();
    // Read existing BILLDTL
    const dtlDbf = await DBFFile.open(billDtlPath);
    const dtlFields = dtlDbf.fields;
    const dtlRecords = await dtlDbf.readRecords(true);
    // Mark old lines as deleted instead of rewriting file
    for (let i = 0; i < dtlRecords.length; i++) {
      const r = dtlRecords[i];
      if (String(r.SERIES).toUpperCase() === String(series).toUpperCase() && String(r.BILL) === String(billNo)) {
        await dtlDbf.markRecordDeleted(i);
      }
    }
    // Load PMPL and CMPL for supplemental fields and prepare field name set
    let pmplData = [];
    let cmplData = [];
    try {
      const { getSTOCKFILE } = require('../utilities');
      pmplData = await getSTOCKFILE('pmpl.json');
      cmplData = await getSTOCKFILE('CMPL.json');
    } catch (e) {
      pmplData = [];
      cmplData = [];
    }
    const dtlFieldNames = new Set(dtlFields.map(f => String(f.name).toUpperCase()));
    // Build new detail lines to append with extended fields
    const newDetails = items
      .filter(it => it.item && it.qty)
      .map((it, idx) => {
        const qtyNum = parseFloat(it.qty) || 0;
        const rateNum = parseFloat(it.rate) || 0;
        const amountNum = parseFloat(it.amount) || (qtyNum * rateNum);
        const netNum = parseFloat(it.netAmount) || amountNum;
        const pmplItem = pmplData.find(p => String(p.CODE).toUpperCase() === String(it.item).toUpperCase()) || {};
        const unitNo = String(it.unit || '').toUpperCase() === String(pmplItem.UNIT_2 || '').toUpperCase() ? 2 : 1;
        const gstPct = parseFloat(it.gst) || parseFloat(pmplItem.GST) || 0;
        const bas10 = rateNum > 0 ? +(rateNum / (1 + gstPct / 100)).toFixed(2) : 0;
        const gd10 = +(bas10 * qtyNum).toFixed(2);
        const gst10 = +(gd10 * (gstPct / 100)).toFixed(2);
        const hsn = pmplItem.HSN || pmplItem.HSN_CODE || '';
        const grp9 = pmplItem.GR_CODE9 || pmplItem.GR_CODE || '';
        const partyRow = cmplData.find(c => String(c.C_CODE).toUpperCase() === String(party || oldHeader?.C_CODE || '').toUpperCase()) || {};
        const pst9Val = partyRow.PST9 || partyRow.STATE || partyRow.C_STATE || partyRow.STATE_CODE || '';
        const billNoStr = String(billNo);
        const bill2Str = `${String(series).toUpperCase()}-${' '.repeat(Math.max(0, 5 - billNoStr.length))}${billNoStr}`;
        const bill2nStr = `${String(series).toUpperCase()}${billNoStr.padStart(5, '0')}`;
        const partyGst = partyRow.GST_NO || partyRow.GST || partyRow.C_GSTNO || '';
        let weightVal = 0, wtUnitVal = '';
        if (it.pack) {
          const m = String(it.pack).match(/([\d.]+)\s*([A-Za-z]+)/);
          if (m) { weightVal = parseFloat(m[1]) || 0; wtUnitVal = m[2].toUpperCase(); }
        }
        const base = {
          SERIES: String(series).toUpperCase(),
          BILL: parseInt(billNo),
          SR: idx + 1,
          DATE: parseDDMMYYYY(date),
          CODE: it.item,
          I_CODE: it.item,
          PRODUCT: it.itemName || '',
          UNIT: it.unit || '',
          QTY: qtyNum,
          RATE: rateNum,
          AMOUNT: amountNum,
          NET_AMOUNT: netNum,
          AMT10: amountNum,
          NET10: netNum,
          GST: parseFloat(it.gst) || 0,
          CESS: parseFloat(it.cess) || 0,
          CESS_RS: parseFloat(it.cess) || 0,
          SCH_RS: parseFloat(it.schRs) || 0,
          SCHEME: parseFloat(it.schRs) || 0,
          SCH: parseFloat(it.sch) || 0,
          DISCOUNT: parseFloat(it.sch) || 0,
          CD: parseFloat(it.cd) || 0,
          CASH_DIS: parseFloat(it.cd) || 0,
          MRP: parseFloat(it.mrp) || 0,
          PACK: it.pack || '',
          GDN_CODE: it.godown || '',
          GODOWN: it.godown || '',
          MULT_F: parseFloat(pmplItem.MULT_F) || parseFloat(it.pcBx) || 1,
          TRADE: rateNum,
          BILL_BB: `${String(series).toUpperCase()}-${billNo}`,
          BILL2: bill2Str,
          BILL2N: bill2nStr,
          BAS10: bas10,
          GD10: gd10,
          GST10: gst10,
          GR_CODE9: grp9 || '',
          UNIT_NO: unitNo,
          C_CODE: party || oldHeader?.C_CODE || '',
          BR_CODE: oldHeader?.BR_CODE || '',
          HSN_CODE: hsn || '',
          PST9: pst9Val || '',
          C_CST: partyGst || '',
          WEIGHT: weightVal,
          WT_UNIT: wtUnitVal
        };
        const normalized = {};
        for (const [k, v] of Object.entries(base)) {
          const U = k.toUpperCase();
          if (dtlFieldNames.has(U)) normalized[U] = v;
        }
        return normalized;
      });
    for (const rec of newDetails) {
      await dtlDbf.appendRecord(rec);
    }
    await dtlDbf.close();
    return res.json({ success: true, message: 'Old bill updated in DBF (delete + append)', detailsCount: newDetails.length });
  } catch (err) {
    console.error('Error in update-old-bill:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to update old bill' });
  }
});
