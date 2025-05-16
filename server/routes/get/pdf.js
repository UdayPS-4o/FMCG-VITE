const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises; // Use promises for async file operations
const router = express.Router();

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
// --- End Configuration ---


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
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();

    console.log(`[PDF Generation] Navigating to ${pdfUrl}...`);
    await page.goto(pdfUrl, {
      waitUntil: 'networkidle0',
      timeout: 90000 // Increased timeout slightly
    });
    console.log(`[PDF Generation] Navigation complete. Page content should be loaded.`);

    // Wait for a specific element that indicates data is loaded (if applicable)
    // For example, if your main table has an ID or a specific class:
    // await page.waitForSelector('.invoice-render-area table', { timeout: 30000 });
    // console.log('[PDF Generation] Key element .invoice-render-area table found.');

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

// New route to check for existing PDF or generate if not found
router.get('/check-or-generate-invoice-pdf/:id', async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: 'Invoice ID is required' });
  }

  let invoiceDetails;
  try {
    invoiceDetails = await invoiceHash(id);
    if (!invoiceDetails || !invoiceDetails.series || !invoiceDetails.billNo || !invoiceDetails.hash) {
      console.error(`[PDF Check/Gen] Failed to retrieve complete invoice details for ID: ${id}`);
      return res.status(500).json({ message: 'Failed to retrieve invoice details for naming.' });
    }
  } catch (error) {
    console.error(`[PDF Check/Gen] Error fetching invoice hash for ID ${id}:`, error);
    return res.status(500).json({ message: 'Failed to fetch invoice details for naming.', error: error.message });
  }

  const { series, billNo, hash } = invoiceDetails;
  const newPdfFilename = `${series}-${billNo}-${hash}.pdf`;
  const pdfDir = path.join(__dirname, '..', '..', 'db', 'pdfs');
  const pdfPath = path.join(pdfDir, newPdfFilename);
  const relativePdfPath = `/db/pdfs/${newPdfFilename}`;

  console.log(`[PDF Check/Gen] Checking for PDF: ${pdfPath}`);
  try {
    await fs.access(pdfPath); // Check if file exists
    console.log(`[PDF Check/Gen] PDF found: ${pdfPath}.`);
    return res.status(200).json({
      message: 'PDF already exists and matches current data.',
      pdfPath: relativePdfPath,
      status: 'exists'
    });
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`[PDF Check/Gen] Error accessing PDF ${pdfPath}:`, error);
      return res.status(500).json({ message: 'Error checking for PDF', error: error.message, status: 'error_checking' });
    }
    // File does not exist (ENOENT), so proceed to generate
    console.log(`[PDF Check/Gen] PDF not found at ${pdfPath}. Generating...`);
  }

  // PDF Generation Logic (adapted from /invoice/:id route, ensuring JSON response)
  const pdfUrl = `${FRONTEND_BASE_URL}/printInvoice?id=${id}`;
  let browser = null;
  console.log(`[PDF Check/Gen] Attempting generation for invoice ${id} from URL: ${pdfUrl}`);
  console.log(`[PDF Check/Gen] Target save path: ${pdfPath}`);

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
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

    return res.status(201).json({
      message: 'PDF generated successfully.',
      pdfPath: relativePdfPath,
      status: 'generated'
    });

  } catch (error) {
    console.error(`[PDF Check/Gen] CRITICAL ERROR for invoice ${id}:`, error.message);
    console.error("[PDF Check/Gen] Full error stack:", error.stack);
    // Attempt to clean up a partially created PDF if an error occurs during generation steps
    try {
      await fs.unlink(pdfPath);
      console.log(`[PDF Check/Gen] Cleaned up partially created PDF (if any) at ${pdfPath}`);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') { // Ignore if file doesn't exist
        console.error(`[PDF Check/Gen] Error cleaning up PDF during error handling:`, cleanupError);
      }
    }
    return res.status(500).json({
      message: 'Failed to generate PDF',
      error: error.message,
      status: 'error_generating'
    });
  } finally {
    if (browser) {
      await browser.close();
      console.log('[PDF Check/Gen] Puppeteer browser closed.');
    }
  }
});



module.exports = router;