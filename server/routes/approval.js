const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { checkOrGenerateInvoicePdf } = require('./get/pdf');

// Endpoint to approve items directly from push notifications
router.get('/approve-from-notification', async (req, res) => {
  const { endpoint, id } = req.query;

  if (!endpoint || !id) {
    return res.status(400).send('Endpoint and ID are required.');
  }

  // If this is an invoice, generate PDF first
  if (endpoint === 'invoicing') {
    try {
      const pdfResult = await checkOrGenerateInvoicePdf(id);
      if (!pdfResult.success) {
        return res.status(500).send('Failed to generate invoice PDF.');
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      return res.status(500).send(`Failed to generate PDF: ${error.message}`);
    }
  }

  const dbPath = path.join(__dirname, '..', 'db', `${endpoint}.json`);
  const approvedFolderPath = path.join(__dirname, '..', 'db', 'approved');
  const approvedDbPath = path.join(approvedFolderPath, `${endpoint}.json`);

  try {
    // Ensure 'approved' directory exists
    await fs.mkdir(approvedFolderPath, { recursive: true });

    // Read main db
    let dbData = [];
    try {
      const data = await fs.readFile(dbPath, 'utf8');
      dbData = JSON.parse(data);
    } catch (readError) {
      if (readError.code === 'ENOENT') {
        return res.status(404).send(`Database for ${endpoint} not found.`);
      }
      throw readError;
    }

    // Find item to approve
    const idKey = 
        endpoint === 'cash-receipts' ? 'receiptNo' :
        endpoint === 'cash-payments' ? 'voucherNo' :
        endpoint === 'account-master' ? 'subgroup' :
        'id';
    
    const itemIndex = dbData.findIndex(item => String(item[idKey]) === String(id));

    if (itemIndex === -1) {
      // Check if already approved
      try {
        const approvedDataRaw = await fs.readFile(approvedDbPath, 'utf8');
        const approvedData = JSON.parse(approvedDataRaw);
        const alreadyApproved = approvedData.some(item => String(item[idKey]) === String(id));
        if (alreadyApproved) {
            return res.send(`
              <html>
                <head><title>Already Approved</title></head>
                <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                  <h1>This item has already been approved.</h1>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
        }
      } catch (e) {
        // ignore if approved file doesn't exist
      }
      return res.status(404).send(`Item with ID ${id} not found in ${endpoint}.`);
    }
    
    const [itemToApprove] = dbData.splice(itemIndex, 1);

    // Read approved db
    let approvedData = [];
    try {
      const data = await fs.readFile(approvedDbPath, 'utf8');
      approvedData = JSON.parse(data);
    } catch (readError) {
      if (readError.code !== 'ENOENT') {
        throw readError;
      }
    }

    // Add to approved and write both files
    approvedData.push(itemToApprove);

    await fs.writeFile(dbPath, JSON.stringify(dbData, null, 2));
    await fs.writeFile(approvedDbPath, JSON.stringify(approvedData, null, 2));
    
    res.send(`
      <html>
        <head>
          <title>Approval Status</title>
          <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background-color: #f0f0f0; }
            .container { text-align: center; padding: 20px; border-radius: 8px; background-color: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            h1 { color: #4CAF50; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Successfully Approved!</h1>
            <p>The item has been approved and moved.</p>
            <p>You can close this window.</p>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('Error during approval:', error);
    res.status(500).send('An error occurred during the approval process.');
  }
});

module.exports = router; 