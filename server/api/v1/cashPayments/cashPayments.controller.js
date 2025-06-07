const cashPaymentsService = require('../../../services/cashPayments.service'); // Adjusted path

async function getAllCashPayments(req, res) {
  try {
    const payments = await cashPaymentsService.getLocalCashPayments();
    res.status(200).json(payments);
  } catch (error) {
    console.error('[CashPaymentsController] Error fetching cash payments:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve cash payments.' });
  }
}

async function getCashPayment(req, res) {
  const { series, voucherNo } = req.params;
  if (!series || !voucherNo) {
    return res.status(400).json({ success: false, message: 'Series and Voucher Number parameters are required.' });
  }
  try {
    const payment = await cashPaymentsService.getLocalCashPaymentById(voucherNo, series);
    if (payment) {
      res.status(200).json(payment);
    } else {
      res.status(404).json({ success: false, message: 'Cash payment not found.' });
    }
  } catch (error) {
    console.error(`[CashPaymentsController] Error fetching cash payment ${series}-${voucherNo}:`, error);
    res.status(500).json({ success: false, message: 'Failed to retrieve cash payment.' });
  }
}

async function createCashPayment(req, res) {
  const paymentData = req.body;
  if (!paymentData || typeof paymentData !== 'object' || !paymentData.series || !paymentData.voucherNo || !paymentData.party || !paymentData.amount) {
    return res.status(400).json({ success: false, message: 'Invalid cash payment data. Required fields: series, voucherNo, party, amount.' });
  }

  try {
    const newPayment = await cashPaymentsService.addLocalCashPayment(paymentData);
    if (newPayment) {
      res.status(201).json(newPayment);
    } else {
      res.status(500).json({ success: false, message: 'Failed to create cash payment due to a server error.' });
    }
  } catch (error) {
    if (error.message && error.message.startsWith('DuplicateError:')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (error.message && error.message.startsWith('ValidationError:')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('[CashPaymentsController] Error creating cash payment:', error);
    res.status(500).json({ success: false, message: 'Failed to create cash payment.' });
  }
}

async function updateCashPayment(req, res) {
  const { series, voucherNo } = req.params;
  const paymentData = req.body;

  if (!series || !voucherNo) {
    return res.status(400).json({ success: false, message: 'Series and Voucher Number parameters are required.' });
  }
  if (Object.keys(paymentData).length === 0) {
    return res.status(400).json({ success: false, message: 'Request body cannot be empty for update.' });
  }
  if ((paymentData.series && paymentData.series.toUpperCase() !== series.toUpperCase()) || (paymentData.voucherNo && String(paymentData.voucherNo) !== String(voucherNo))) {
      return res.status(400).json({ success: false, message: 'Series/VoucherNo in body does not match parameters in path.'});
  }

  try {
    const updatedPayment = await cashPaymentsService.updateLocalCashPayment(voucherNo, series, paymentData);
    if (updatedPayment) {
      res.status(200).json(updatedPayment);
    } else {
      res.status(404).json({ success: false, message: 'Cash payment not found or update failed.' });
    }
  } catch (error) {
    if (error.message && error.message.startsWith('DuplicateError:')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (error.message && error.message.startsWith('ValidationError:')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error(`[CashPaymentsController] Error updating cash payment ${series}-${voucherNo}:`, error);
    res.status(500).json({ success: false, message: 'Failed to update cash payment.' });
  }
}

async function getNextIds(req, res) {
  try {
    const ids = await cashPaymentsService.getNextCashPaymentIdentifiers();
    res.status(200).json(ids);
  } catch (error) {
    console.error('[CashPaymentsController] Error fetching next cash payment identifiers:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve next cash payment identifiers.' });
  }
}

async function getPrintData(req, res) {
  const { series, voucherNo } = req.params;
  if (!series || !voucherNo) {
    return res.status(400).json({ success: false, message: 'Series and Voucher Number parameters are required for printing.' });
  }
  try {
    const printData = await cashPaymentsService.getCashPaymentPrintData(voucherNo, series);
    res.status(200).json(printData);
  } catch (error) {
    if (error.message && error.message.startsWith('CashPaymentNotFound:')) {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error(`[CashPaymentsController] Error fetching print data for cash payment ${series}-${voucherNo}:`, error);
    res.status(500).json({ success: false, message: 'Failed to retrieve cash payment print data.' });
  }
}

module.exports = {
  getAllCashPayments,
  getCashPayment,
  createCashPayment,
  updateCashPayment,
  getNextIds,
  getPrintData,
};
