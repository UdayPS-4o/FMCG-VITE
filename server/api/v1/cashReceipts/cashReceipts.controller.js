const cashReceiptsService = require('../../../services/cashReceipts.service'); // Adjusted path

async function getAllCashReceipts(req, res) {
  try {
    const receipts = await cashReceiptsService.getLocalCashReceipts();
    res.status(200).json(receipts);
  } catch (error) {
    console.error('[CashReceiptsController] Error fetching cash receipts:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve cash receipts.' });
  }
}

async function getCashReceipt(req, res) {
  const { series, receiptNo } = req.params; // Assuming series and receiptNo are route params
  if (!series || !receiptNo) {
    return res.status(400).json({ success: false, message: 'Series and Receipt Number parameters are required.' });
  }
  try {
    const receipt = await cashReceiptsService.getLocalCashReceiptById(receiptNo, series);
    if (receipt) {
      res.status(200).json(receipt);
    } else {
      res.status(404).json({ success: false, message: 'Cash receipt not found.' });
    }
  } catch (error) {
    console.error(`[CashReceiptsController] Error fetching cash receipt ${series}-${receiptNo}:`, error);
    res.status(500).json({ success: false, message: 'Failed to retrieve cash receipt.' });
  }
}

async function createCashReceipt(req, res) {
  const receiptData = req.body;
  if (!receiptData || typeof receiptData !== 'object' || !receiptData.series || !receiptData.receiptNo || !receiptData.party || !receiptData.amount) {
    return res.status(400).json({ success: false, message: 'Invalid cash receipt data. Required fields: series, receiptNo, party, amount.' });
  }

  try {
    const newReceipt = await cashReceiptsService.addLocalCashReceipt(receiptData);
    if (newReceipt) {
      res.status(201).json(newReceipt);
    } else {
      res.status(500).json({ success: false, message: 'Failed to create cash receipt due to a server error.' });
    }
  } catch (error) {
    if (error.message && error.message.startsWith('DuplicateError:')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (error.message && error.message.startsWith('ValidationError:')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('[CashReceiptsController] Error creating cash receipt:', error);
    res.status(500).json({ success: false, message: 'Failed to create cash receipt.' });
  }
}

async function updateCashReceipt(req, res) {
  const { series, receiptNo } = req.params; // Assuming series and receiptNo are route params
  const receiptData = req.body;

  if (!series || !receiptNo) {
    return res.status(400).json({ success: false, message: 'Series and Receipt Number parameters are required.' });
  }
  if (Object.keys(receiptData).length === 0) {
    return res.status(400).json({ success: false, message: 'Request body cannot be empty for update.' });
  }
  // Prevent changing key identifiers via body if they don't match params
  if ((receiptData.series && receiptData.series.toUpperCase() !== series.toUpperCase()) || (receiptData.receiptNo && String(receiptData.receiptNo) !== String(receiptNo))) {
      return res.status(400).json({ success: false, message: 'Series/ReceiptNo in body does not match parameters in path.'});
  }


  try {
    // Pass route params for identification, and body for new data
    const updatedReceipt = await cashReceiptsService.updateLocalCashReceipt(receiptNo, series, receiptData);
    if (updatedReceipt) {
      res.status(200).json(updatedReceipt);
    } else {
      res.status(404).json({ success: false, message: 'Cash receipt not found or update failed.' });
    }
  } catch (error) {
    if (error.message && error.message.startsWith('DuplicateError:')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (error.message && error.message.startsWith('ValidationError:')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error(`[CashReceiptsController] Error updating cash receipt ${series}-${receiptNo}:`, error);
    res.status(500).json({ success: false, message: 'Failed to update cash receipt.' });
  }
}

async function getNextIds(req, res) {
  try {
    const ids = await cashReceiptsService.getNextCashReceiptIdentifiers();
    res.status(200).json(ids);
  } catch (error) {
    console.error('[CashReceiptsController] Error fetching next cash receipt identifiers:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve next cash receipt identifiers.' });
  }
}

async function getPrintData(req, res) {
  const { series, receiptNo } = req.params; // Assuming series and receiptNo are route params
  if (!series || !receiptNo) {
    return res.status(400).json({ success: false, message: 'Series and Receipt Number parameters are required for printing.' });
  }
  try {
    const printData = await cashReceiptsService.getCashReceiptPrintData(receiptNo, series);
    res.status(200).json(printData);
  } catch (error) {
    if (error.message && error.message.startsWith('CashReceiptNotFound:')) {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error(`[CashReceiptsController] Error fetching print data for cash receipt ${series}-${receiptNo}:`, error);
    res.status(500).json({ success: false, message: 'Failed to retrieve cash receipt print data.' });
  }
}

module.exports = {
  getAllCashReceipts,
  getCashReceipt,
  createCashReceipt,
  updateCashReceipt,
  getNextIds,
  getPrintData,
};
