const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises; // Use promises for async file operations
const router = express.Router();

// --- Puppeteer Configuration ---
const puppeteerOptions = {
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
};

// Allow overriding the executable path via an environment variable for flexibility.
if (process.env.PUPPETEER_EXECUTABLE_PATH) {
  puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
}

try {
  require('fs').mkdirSync(path.join(__dirname, '..', '..', 'db', 'pdfs'), { recursive: true });
} catch (e) {
  if (e.code !== 'EEXIST') throw e; // Ignore if directory already exists
}

// --- Configuration --- 
// Detect if running in development (e.g., using Vite dev server) or production
const isDevelopment = process.env.print !== 'production';
// Adjust the base URL based on environment. You might need to use environment variables.
// For dev, typically http://localhost:5173 (or your Vite port)
// For prod, the URL where your frontend is served.
const FRONTEND_BASE_URL = isDevelopment ? 'http://localhost:3000' : 'https://test.ekta-enterprises.com';


const dbInvPath = path.join(__dirname, '..', '..', 'db', 'invoicing.json');

const crypto = require('crypto');

const invoiceHash = async (id) => {
  const invoiceData = await fs.readFile(dbInvPath, 'utf8');
  const invoice = JSON.parse(invoiceData).find(i => i.id === id);

  const hash = crypto.createHash('md5').update(JSON.stringify(invoice)).digest('hex');

  return {
    series: invoice.series,
    billNo: invoice.billNo,
    hash
  };
}


router.get('/invoice/:id', async (req, res) => {
  const { id } = req.params;
  const redirect = req.query.redirect !== 'false';

  if (!id) {
    return res.status(400).json({ message: 'Invoice ID is required' });
  }

  let invoiceDetails;
  try {
    invoiceDetails = await invoiceHash(id);
    if (!invoiceDetails || !invoiceDetails.series || !invoiceDetails.billNo || !invoiceDetails.hash) {
      console.error(`[PDF Generation] Failed to retrieve complete invoice details for ID: ${id}`);
      return res.status(500).json({ message: 'Failed to retrieve invoice details for naming.' });
    }
  } catch (error) {
    console.error(`[PDF Generation] Error fetching invoice hash for ID ${id}:`, error);
    return res.status(500).json({ message: 'Failed to fetch invoice details for naming.', error: error.message });
  }

  const { series, billNo, hash } = invoiceDetails;
  const newPdfFilename = `${series}-${billNo}-${hash}.pdf`;
  


  const pdfUrl = `${FRONTEND_BASE_URL}/printInvoice?id=${id}`;
  const pdfDir = path.join(__dirname, '..', '..', 'db', 'pdfs');
  const pdfPath = path.join(pdfDir, newPdfFilename);

  console.log(`[PDF Generation] Checking for existing PDF: ${pdfPath}`);
  try {
    await fs.access(pdfPath); 
    console.log(`[PDF Generation] Existing PDF found: ${pdfPath}. Serving existing file.`);
    const relativePdfPath = `/db/pdfs/${newPdfFilename}`;
    if (redirect) {
      console.log(`[PDF Generation] Redirecting to ${relativePdfPath}`);
      return res.redirect(relativePdfPath);
    } else {
      return res.status(200).json({
        message: 'PDF served from existing file',
        pdfPath: relativePdfPath
      });
    }
  } catch (error) {
    // If fs.access throws an error, it means the file doesn't exist or is not accessible.
    // We only care about 'ENOENT' (file not found). Other errors might be permissions issues.
    if (error.code !== 'ENOENT') {
      console.error(`[PDF Generation] Error accessing potential existing PDF ${pdfPath}:`, error);
      return res.status(500).json({ message: 'Error checking for existing PDF', error: error.message });
    }
    console.log(`[PDF Generation] No existing PDF found at ${pdfPath}. Proceeding with generation.`);
  }


  let browser = null;
  console.log(`[PDF Generation] Attempting for invoice ${id} from URL: ${pdfUrl}`);
  console.log(`[PDF Generation] Target save path: ${pdfPath}`);

  try {
    browser = await puppeteer.launch(puppeteerOptions);
    const page = await browser.newPage();

    console.log(`[PDF Generation] Navigating to ${pdfUrl}...`);
    await page.goto(pdfUrl, {
      waitUntil: 'networkidle0',
      timeout: 90000 // Increased timeout slightly
    });
    console.log(`[PDF Generation] Navigation complete. Page content should be loaded.`);

    const errorElement = await page.$('[data-status="error"]');
    if (errorElement) {
      const errorMessage = await page.evaluate(el => el.textContent, errorElement);
      console.error(`[PDF Generation] Page rendered with error: ${errorMessage}`);
      throw new Error(`PDF generation failed: Page rendered with error: ${errorMessage}`);
    }
    const loadingElement = await page.$('.animate-spin');
    if (loadingElement) {
      console.warn('[PDF Generation] Warning: Page has a .animate-spin element present.');
      await new Promise(resolve => setTimeout(resolve, 3000)); // Extra wait if loading element found
    }
    console.log('[PDF Generation] Page status checks passed (no explicit errors found on page).');

    console.log('[PDF Generation] Attempting to generate PDF buffer...');
    const pdfBuffer = await page.pdf({
      // path: pdfPath, // We will write the buffer manually to check its content first
      format: 'A4',
      landscape: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      printBackground: true,
    });
    
    if (!pdfBuffer || pdfBuffer.length === 0) {
      console.error('[PDF Generation] Error: pdfBuffer is null or empty.');
      throw new Error('Generated PDF buffer is empty.');
    }
    console.log(`[PDF Generation] PDF buffer generated successfully. Length: ${pdfBuffer.length}`);

    console.log(`[PDF Generation] Attempting to write PDF to ${pdfPath}...`);
    await fs.writeFile(pdfPath, pdfBuffer);
    console.log(`[PDF Generation] PDF written successfully to: ${pdfPath}`);

    const relativePdfPath = `/db/pdfs/${newPdfFilename}`; // Use new filename

    if (redirect) {
      console.log(`[PDF Generation] Redirecting to ${relativePdfPath}`);
      // Ensure the path is absolute for redirection if your static serving is root-based
      // If express.static is mounted on '/', then relativePdfPath is fine.
      // If mounted on '/static' or similar, adjust accordingly.
      res.redirect(relativePdfPath); 
    } else {
      res.status(200).json({ 
        message: 'PDF generated successfully', 
        pdfPath: relativePdfPath
      });
    }

  } catch (error) {
    console.error(`[PDF Generation] CRITICAL ERROR for invoice ${id}:`, error.message);
    console.error("[PDF Generation] Full error stack:", error.stack);
    res.status(500).json({ message: 'Failed to generate PDF', error: error.message });
  } finally {
    if (browser) {
      await browser.close();
      console.log('[PDF Generation] Puppeteer browser closed.');
    }
  }
});

async function checkOrGenerateInvoicePdf(id) {
  if (!id) {
    throw new Error('Invoice ID is required');
  }

  let invoiceDetails;
  try {
    invoiceDetails = await invoiceHash(id);
    if (!invoiceDetails || !invoiceDetails.series || !invoiceDetails.billNo || !invoiceDetails.hash) {
      throw new Error(`Failed to retrieve complete invoice details for ID: ${id}`);
    }
  } catch (error) {
    console.error(`[PDF Check/Gen] Error fetching invoice hash for ID ${id}:`, error);
    throw new Error(`Failed to fetch invoice details: ${error.message}`);
  }

  const { series, billNo, hash } = invoiceDetails;
  const newPdfFilename = `${series}-${billNo}-${hash}.pdf`;
  const pdfDir = path.join(__dirname, '..', '..', 'db', 'pdfs');
  const pdfPath = path.join(pdfDir, newPdfFilename);
  const relativePdfPath = `/db/pdfs/${newPdfFilename}`;

  console.log(`[PDF Check/Gen] Checking for PDF: ${pdfPath}`);
  try {
    await fs.access(pdfPath);
    console.log(`[PDF Check/Gen] PDF found: ${pdfPath}.`);
    return {
      success: true,
      message: 'PDF already exists and matches current data.',
      pdfPath: relativePdfPath,
      status: 'exists'
    };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Error checking for PDF: ${error.message}`);
    }
    console.log(`[PDF Check/Gen] PDF not found at ${pdfPath}. Generating...`);
  }

  const pdfUrl = `${FRONTEND_BASE_URL}/printInvoice?id=${id}`;
  let browser = null;
  console.log(`[PDF Check/Gen] Attempting generation for invoice ${id} from URL: ${pdfUrl}`);
  console.log(`[PDF Check/Gen] Target save path: ${pdfPath}`);

  try {
    browser = await puppeteer.launch(puppeteerOptions);
    const page = await browser.newPage();

    console.log(`[PDF Check/Gen] Navigating to ${pdfUrl}...`);
    await page.goto(pdfUrl, {
      waitUntil: 'networkidle0',
      timeout: 90000
    });
    console.log(`[PDF Check/Gen] Navigation complete.`);

    const errorElement = await page.$('[data-status="error"]');
    if (errorElement) {
      const errorMessage = await page.evaluate(el => el.textContent, errorElement);
      throw new Error(`Page rendered with error: ${errorMessage}`);
    }
    const loadingElement = await page.$('.animate-spin');
    if (loadingElement) {
      console.warn('[PDF Check/Gen] Warning: Page has a .animate-spin element present. Waiting extra 3s.');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    console.log('[PDF Check/Gen] Page status checks passed.');
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      printBackground: true,
    });

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('Generated PDF buffer is empty.');
    }
    console.log(`[PDF Check/Gen] PDF buffer generated. Length: ${pdfBuffer.length}`);

    await fs.writeFile(pdfPath, pdfBuffer);
    console.log(`[PDF Check/Gen] PDF written to: ${pdfPath}`);

    return {
      success: true,
      message: 'PDF generated successfully.',
      pdfPath: relativePdfPath,
      status: 'generated'
    };

  } catch (error) {
    console.error(`[PDF Check/Gen] CRITICAL ERROR for invoice ${id}:`, error.message);
    console.error("[PDF Check/Gen] Full error stack:", error.stack);
    try {
      await fs.unlink(pdfPath);
      console.log(`[PDF Check/Gen] Cleaned up partially created PDF (if any) at ${pdfPath}`);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') {
        console.error(`[PDF Check/Gen] Error cleaning up PDF during error handling:`, cleanupError);
      }
    }
    throw new Error(`Failed to generate PDF: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
      console.log('[PDF Check/Gen] Puppeteer browser closed.');
    }
  }
}


// Route handler using the function
router.get('/check-or-generate-invoice-pdf/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await checkOrGenerateInvoicePdf(id);
    const statusCode = result.status === 'generated' ? 201 : 200;
    res.status(statusCode).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
      status: 'error'
    });
  }
});

// Helper function to read and parse DBF JSON files
const readDbfJson = async (filename) => {
  const jsonPath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', filename);
  try {
    const data = await fs.readFile(jsonPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading DBF JSON file ${filename}:`, error);
    throw error;
  }
};

// Helper function to map DBF data to invoice format
const mapDbfDataToInvoiceFormat = (billRecord, billDtlRecords, partyRecord, productRecords) => {
  // Map company info (this could be moved to a config file)
  const company = {
    name: "EKTA ENTERPRISES",
    gstin: "23AERPJ8334D1Z7",
    subject: "",
    fssaiNo: "21421051000295",
    address: "BUDHWARI BAZAR,GN ROAD SEONI,",
    phone: "9425174445",
    officeNo: "07692-220445",
    stateCode: "23"
  };

  // Map party info
  const party = {
    name: partyRecord.C_NAME || '',
    address: `${partyRecord.C_ADD1 || ''} ${partyRecord.C_ADD2 || ''} ${partyRecord.C_PLACE || ''}`.trim(),
    gstin: partyRecord.C_CST || '',
    stateCode: partyRecord.PST9 || '',
    mobileNo: partyRecord.C_MOBILE || '',
    balanceBf: 0, // This might need to be calculated from other records
    fssaiNo: partyRecord.FSSAI_NO || '',
    dlNo: partyRecord.DL_NO || ''
  };

  // Map invoice info
  const invoice = {
    no: billRecord.BILL,
    mode: billRecord.CASH === 'Y' ? 'CASH' : 'CREDIT',
    date: new Date(billRecord.DATE).toLocaleDateString('en-IN'),
    time: billRecord.USER_TIME || '',
    dueDate: billRecord.DUE_DAYS ? new Date(billRecord.DATE).toLocaleDateString('en-IN') : '',
    displayNo: billRecord.BILL_BB || `${billRecord.SERIES}-${billRecord.BILL}`
  };

  // Map items
  const items = billDtlRecords.map(dtl => {
    const product = productRecords.find(p => p.CODE === dtl.CODE) || {};
    return {
      item: dtl.CODE || '',
      godown: dtl.GDN_CODE || '',
      unit: dtl.UNIT || '',
      rate: dtl.RATE || 0,
      qty: dtl.QTY?.toString() || '0',            
      cess: dtl.CESS_RS?.toString() || '0',       
      schRs: dtl.SCH10?.toString() || '0',        
      sch: dtl.DISCOUNT?.toString() || '0',     
      cd: dtl.CASH_DIS?.toString() || '0',      
      amount: dtl.AMT10?.toString() || '0',       
      netAmount: dtl.NET10?.toString() || '0',    
      particular: product.PRODUCT || dtl.PRODUCT || '',
      pack: product.PACK || dtl.PACK || '',
      gst: dtl.GST || 0,
      mrp: product.MRP1 || 0,
      hsn: product.H_CODE || dtl.HSN_CODE || '',
      unit1: product.UNIT_1 || '',
      unit2: product.UNIT_2 || '',
      pcBx: product.PC_BX || ''
    };
  });

  // Calculate summary
  const summary = {
    itemsInBill: items.length,
    casesInBill: items.reduce((acc, item) => acc + (item.unit.toUpperCase() === 'BOX' ? parseFloat(item.qty) || 0 : 0), 0),
    looseItemsInBill: items.reduce((acc, item) => acc + (item.unit.toUpperCase() !== 'BOX' ? parseFloat(item.qty) || 0 : 0), 0)
  };

  // Map tax details
  const taxDetails = items.reduce((acc, item) => {
    const gst = item.gst;
    const netAmount = parseFloat(item.netAmount) || 0;
    const baseAmount = netAmount / (1 + (gst / 100));
    const gstAmount = netAmount - baseAmount;
    
    const existingRate = acc.find(t => t.sgst === gst/2);
    if (existingRate) {
      existingRate.goods = (parseFloat(existingRate.goods) + baseAmount).toString();
      existingRate.sgstValue += gstAmount/2;
      existingRate.cgstValue += gstAmount/2;
    } else {
      acc.push({
        goods: baseAmount.toString(),
        sgst: gst/2,
        sgstValue: gstAmount/2,
        cgst: gst/2,
        cgstValue: gstAmount/2
      });
    }
    return acc;
  }, []);

  // Calculate totals
  const totals = {
    grossAmt: items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
    lessSch: items.reduce((sum, item) => sum + (parseFloat(item.schRs) || 0), 0),
    lessCd: items.reduce((sum, item) => {
      const amountAfterSch = parseFloat(item.amount) - (parseFloat(item.schRs) || 0);
      return sum + (amountAfterSch * (parseFloat(item.cd) || 0) / 100);
    }, 0),
    rOff: billRecord.R_OFF || 0,
    netAmount: billRecord.N_B_AMT || 0
  };

  return {
    company,
    dlNo: "20/632 & 21/632",  // This could be moved to config
    party,
    invoice,
    ack: { 
      no: billRecord?.ACK_NO || '', 
      date: billRecord?.ACK_DATE ? new Date(billRecord.ACK_DATE).toLocaleDateString('en-IN') : '' 
    },
    irn: billRecord?.IRN || '',
    billMadeBy: billRecord?.USER_ID?.toString() || '',
    items,
    summary,
    taxDetails,
    totals
  };
};

// New route for generating PDF from DBF JSON using series and billNo
router.get('/dbf-invoice/:series/:billNo', async (req, res) => {
  const { series, billNo } = req.params;
  const redirect = req.query.redirect !== 'false';

  if (!series || !billNo) {
    return res.status(400).json({ message: 'Series and Bill Number are required' });
  }

  try {
    console.log(`[PDF Generation] Attempting to generate PDF for series: ${series}, billNo: ${billNo}`);
    
    // Read DBF JSON files
    console.log('[PDF Generation] Reading DBF JSON files...');
    let billDbfRecords, billDtlDbfRecords, partyRecords, productRecords;
    try {
      [billDbfRecords, billDtlDbfRecords, partyRecords, productRecords] = await Promise.all([
        readDbfJson('BILL.json'),
        readDbfJson('BILLDTL.json'),
        readDbfJson('CMPL.json'),
        readDbfJson('PMPL.json')
      ]);
      
      console.log(`[PDF Generation] Successfully loaded DBF JSON files:
        BILL records: ${billDbfRecords?.length || 0}
        BILLDTL records: ${billDtlDbfRecords?.length || 0}
        CMPL records: ${partyRecords?.length || 0}
        PMPL records: ${productRecords?.length || 0}`);
    } catch (readError) {
      console.error('[PDF Generation] Error reading DBF JSON files:', readError);
      return res.status(500).json({ 
        message: 'Failed to read DBF JSON files',
        error: readError.message,
        details: 'Check if DBF_FOLDER_PATH is correctly set and JSON files exist'
      });
    }

    // Validate loaded data
    if (!Array.isArray(billDbfRecords) || !Array.isArray(billDtlDbfRecords)) {
      console.error('[PDF Generation] Invalid DBF data structure:', {
        billDbfRecords: typeof billDbfRecords,
        billDtlDbfRecords: typeof billDtlDbfRecords
      });
      return res.status(500).json({ 
        message: 'Invalid DBF data structure',
        error: 'DBF JSON files do not contain valid arrays'
      });
    }

    // Find the specific bill record
    console.log(`[PDF Generation] Searching for bill record with series: ${series}, billNo: ${billNo}`);
    const billRecord = billDbfRecords.find(b => {
      const matchesSeries = b?.SERIES === series;
      const matchesBillNo = b?.BILL?.toString() === billNo?.toString();
      return matchesSeries && matchesBillNo;
    });

    if (!billRecord) {
      console.log('[PDF Generation] Bill record not found');
      return res.status(404).json({ 
        message: 'Invoice not found',
        details: `No invoice found with series ${series} and bill number ${billNo}`
      });
    }
    console.log('[PDF Generation] Found bill record:', billRecord);

    // Get related records
    console.log('[PDF Generation] Fetching related records...');
    const billDtlRecords = billDtlDbfRecords.filter(d => {
      const matchesSeries = d?.SERIES === series;
      const matchesBillNo = d?.BILL?.toString() === billNo?.toString();
      return matchesSeries && matchesBillNo;
    });

    if (!billDtlRecords.length) {
      console.log('[PDF Generation] No bill detail records found');
      return res.status(404).json({ 
        message: 'Invoice details not found',
        details: `No detail records found for invoice ${series}-${billNo}`
      });
    }
    console.log(`[PDF Generation] Found ${billDtlRecords.length} bill detail records`);

    const partyRecord = partyRecords?.find(p => p?.C_CODE === billRecord?.C_CODE);
    if (!partyRecord) {
      console.log(`[PDF Generation] Party record not found for C_CODE: ${billRecord?.C_CODE}`);
    }

    // Map data to invoice format
    console.log('[PDF Generation] Mapping data to invoice format...');
    const invoiceData = mapDbfDataToInvoiceFormat(
      billRecord,
      billDtlRecords,
      partyRecord || {},
      productRecords || []
    );

    // Generate hash for PDF filename
    const hash = crypto.createHash('md5').update(JSON.stringify(invoiceData)).digest('hex');
    const newPdfFilename = `${series}-${billNo}-${hash}.pdf`;
    const pdfDir = path.join(__dirname, '..', '..', 'db', 'pdfs');
    const pdfPath = path.join(pdfDir, newPdfFilename);

    // Check if PDF already exists
    try {
      await fs.access(pdfPath);
      console.log(`[PDF Generation] Existing PDF found: ${pdfPath}. Serving existing file.`);
      const relativePdfPath = `/db/pdfs/${newPdfFilename}`;
      if (redirect) {
        return res.redirect(relativePdfPath);
      } else {
        return res.status(200).json({
          message: 'PDF served from existing file',
          pdfPath: relativePdfPath
        });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      console.log('[PDF Generation] No existing PDF found, will generate new one');
    }

    // Generate PDF if it doesn't exist
    const pdfUrl = `${FRONTEND_BASE_URL}/printInvoice?series=${series}&billNo=${billNo}&dbf=true`;
    console.log(`[PDF Generation] Will generate PDF using URL: ${pdfUrl}`);
    let browser = null;

    try {
      browser = await puppeteer.launch(puppeteerOptions);
      const page = await browser.newPage();

      console.log(`[PDF Generation] Navigating to ${pdfUrl}...`);
      await page.goto(pdfUrl, {
        waitUntil: 'networkidle0',
        timeout: 90000
      });

      const errorElement = await page.$('[data-status="error"]');
      if (errorElement) {
        const errorMessage = await page.evaluate(el => el.textContent, errorElement);
        throw new Error(`PDF generation failed: Page rendered with error: ${errorMessage}`);
      }

      const pdfBuffer = await page.pdf({
        format: 'A4',
        landscape: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        printBackground: true,
      });

      await fs.writeFile(pdfPath, pdfBuffer);
      console.log(`[PDF Generation] PDF written successfully to: ${pdfPath}`);

      const relativePdfPath = `/db/pdfs/${newPdfFilename}`;
      if (redirect) {
        res.redirect(relativePdfPath);
      } else {
        res.status(200).json({
          message: 'PDF generated successfully',
          pdfPath: relativePdfPath
        });
      }

    } finally {
      if (browser) {
        await browser.close();
        console.log('[PDF Generation] Browser closed');
      }
    }

  } catch (error) {
    console.error('[PDF Generation] Error:', error);
    res.status(500).json({ 
      message: 'Failed to generate PDF', 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// New route to get DBF invoice data as JSON
router.get('/dbf-invoice-data/:series/:billNo', async (req, res) => {
  const { series, billNo } = req.params;

  if (!series || !billNo) {
    return res.status(400).json({ message: 'Series and Bill Number are required' });
  }

  try {
    console.log(`[DBF Invoice Data] Attempting to fetch data for series: ${series}, billNo: ${billNo}`);

    // Read DBF JSON files
    console.log('[DBF Invoice Data] Reading DBF JSON files...');
    let billDbfRecords, billDtlDbfRecords, partyRecords, productRecords;
    try {
      [billDbfRecords, billDtlDbfRecords, partyRecords, productRecords] = await Promise.all([
        readDbfJson('BILL.json'),
        readDbfJson('BILLDTL.json'),
        readDbfJson('CMPL.json'),
        readDbfJson('PMPL.json')
      ]);
      console.log(`[DBF Invoice Data] Successfully loaded DBF JSON files.`);
    } catch (readError) {
      console.error('[DBF Invoice Data] Error reading DBF JSON files:', readError);
      return res.status(500).json({
        message: 'Failed to read DBF JSON files',
        error: readError.message,
        details: 'Check if DBF_FOLDER_PATH is correctly set and JSON files exist'
      });
    }

    if (!Array.isArray(billDbfRecords) || !Array.isArray(billDtlDbfRecords) || !Array.isArray(partyRecords) || !Array.isArray(productRecords)) {
        console.error('[DBF Invoice Data] Invalid DBF data structure (one or more files not an array)');
        return res.status(500).json({
            message: 'Invalid DBF data structure from JSON files',
            error: 'DBF JSON files do not all contain valid arrays'
        });
    }

    // Find the specific bill record
    const billRecord = billDbfRecords.find(b =>
      b?.SERIES === series && b?.BILL?.toString() === billNo?.toString()
    );

    if (!billRecord) {
      console.log(`[DBF Invoice Data] Bill record not found for series ${series}, billNo ${billNo}`);
      return res.status(404).json({
        message: 'Invoice not found',
        details: `No invoice found with series ${series} and bill number ${billNo}`
      });
    }

    // Get related records
    const relatedBillDtlRecords = billDtlDbfRecords.filter(d =>
      d?.SERIES === series && d?.BILL?.toString() === billNo?.toString()
    );

    if (!relatedBillDtlRecords.length) {
      console.log(`[DBF Invoice Data] No bill detail records found for series ${series}, billNo ${billNo}`);
      // Decide if this is a 404 or if an invoice header without details is acceptable
      // For now, let's assume details are required for a valid invoice page
      return res.status(404).json({
        message: 'Invoice details not found',
        details: `No detail records found for invoice ${series}-${billNo}`
      });
    }

    const partyRecord = partyRecords.find(p => p?.C_CODE === billRecord?.C_CODE);
    if (!partyRecord) {
      console.warn(`[DBF Invoice Data] Party record not found for C_CODE: ${billRecord?.C_CODE}. Proceeding without full party details.`);
    }

    // Map data to invoice format
    console.log('[DBF Invoice Data] Mapping data to invoice format...');
    const invoiceData = mapDbfDataToInvoiceFormat(
      billRecord,
      relatedBillDtlRecords,
      partyRecord || {},
      productRecords || []
    );
    
    console.log('[DBF Invoice Data] Successfully mapped invoice data.');
    res.status(200).json(invoiceData);

  } catch (error) {
    console.error('[DBF Invoice Data] Error fetching invoice data:', error);
    res.status(500).json({
      message: 'Failed to fetch DBF invoice data',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Van Loading PDF Generation Endpoint
router.post('/van-loading', async (req, res) => {
  try {
    const { htmlContent, filename } = req.body;
    
    if (!htmlContent) {
      return res.status(400).json({ message: 'HTML content is required' });
    }
    
    const pdfFilename = filename || `van-loading-${Date.now()}.pdf`;
    const pdfDir = path.join(__dirname, '..', '..', 'db', 'pdfs');
    const pdfPath = path.join(pdfDir, pdfFilename);
    
    console.log(`[Van Loading PDF] Generating PDF: ${pdfPath}`);
    
    const browser = await puppeteer.launch(puppeteerOptions);
    const page = await browser.newPage();
    
    // Set content and wait for any dynamic content to load
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    // Generate PDF with appropriate settings for reports
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });
    
    await browser.close();
    
    const relativePdfPath = `/db/pdfs/${pdfFilename}`;
    console.log(`[Van Loading PDF] PDF generated successfully: ${relativePdfPath}`);
    
    res.status(200).json({
      message: 'Van loading PDF generated successfully',
      pdfPath: relativePdfPath,
      filename: pdfFilename
    });
    
  } catch (error) {
    console.error('[Van Loading PDF] Error generating PDF:', error);
    res.status(500).json({
      message: 'Failed to generate van loading PDF',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Export both the router and the function
module.exports = {
  router,
  checkOrGenerateInvoicePdf
};