const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises; // Use promises for async file operations
const router = express.Router();

// Ensure the PDF directory exists synchronously at startup or handle async
try {
  require('fs').mkdirSync(path.join(__dirname, '..', '..', 'db', 'pdfs'), { recursive: true });
} catch (e) {
  if (e.code !== 'EEXIST') throw e; // Ignore if directory already exists
}

// --- Configuration --- 
// Detect if running in development (e.g., using Vite dev server) or production
const isDevelopment = process.env.print !== 'print';
// Adjust the base URL based on environment. You might need to use environment variables.
// For dev, typically http://localhost:5173 (or your Vite port)
// For prod, the URL where your frontend is served.
const FRONTEND_BASE_URL = isDevelopment ? 'http://localhost:3000' : 'https://test.ekta-enterprises.com'; 
// --- End Configuration ---

router.get('/invoice/:id', async (req, res) => {
  const { id } = req.params;
  const redirect = req.query.redirect !== 'false'; // Default to true if not specified or not 'false'

  if (!id) {
    return res.status(400).json({ message: 'Invoice ID is required' });
  }

//   const pdfUrl = `${FRONTEND_BASE_URL}/internal/print/invoice/${id}`;
  const pdfUrl = `${FRONTEND_BASE_URL}/printInvoice?id=${id}`;
  const pdfDir = path.join(__dirname, '..', '..', 'db', 'pdfs');
  const pdfPath = path.join(pdfDir, `invoice_${id}.pdf`);

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

    const relativePdfPath = `/db/pdfs/invoice_${id}.pdf`;

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

module.exports = router;
