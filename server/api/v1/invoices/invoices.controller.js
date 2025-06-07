const invoicesService = require('../../../services/invoices.service'); // Adjusted path

async function getAllInvoices(req, res) {
  try {
    const invoices = await invoicesService.getLocalInvoices();
    res.status(200).json(invoices);
  } catch (error) {
    console.error('[InvoicesController] Error fetching invoices:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve invoices.' });
  }
}

async function getInvoice(req, res) {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ success: false, message: 'Invoice ID parameter is required.' });
  }
  try {
    const invoice = await invoicesService.getLocalInvoiceById(id);
    if (invoice) {
      res.status(200).json(invoice);
    } else {
      res.status(404).json({ success: false, message: 'Invoice not found.' });
    }
  } catch (error) {
    console.error(`[InvoicesController] Error fetching invoice ${id}:`, error);
    res.status(500).json({ success: false, message: 'Failed to retrieve invoice.' });
  }
}

async function createInvoice(req, res) {
  const invoiceData = req.body;
  // Basic validation - can be expanded based on required fields from invoiceData schema
  if (!invoiceData || typeof invoiceData !== 'object' || !invoiceData.series || !invoiceData.billNo || !invoiceData.party || !invoiceData.items || !Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
    return res.status(400).json({ success: false, message: 'Invalid invoice data. Required fields: series, billNo, party, and at least one item.' });
  }

  try {
    const newInvoice = await invoicesService.addLocalInvoice(invoiceData);
    if (newInvoice) {
      res.status(201).json(newInvoice);
    } else {
      // This case might occur if writeJsonFile returned false in the service
      res.status(500).json({ success: false, message: 'Failed to create invoice due to a server error.' });
    }
  } catch (error) {
    if (error.message && error.message.startsWith('DuplicateError:')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (error.message && error.message.startsWith('ValidationError:')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('[InvoicesController] Error creating invoice:', error);
    res.status(500).json({ success: false, message: 'Failed to create invoice.' });
  }
}

async function updateInvoice(req, res) {
  const { id } = req.params;
  const invoiceData = req.body;

  if (!id) {
    return res.status(400).json({ success: false, message: 'Invoice ID parameter is required.' });
  }
  if (Object.keys(invoiceData).length === 0) {
    return res.status(400).json({ success: false, message: 'Request body cannot be empty for update.' });
  }
  // Prevent changing the internal ID via body if it's part of invoiceData
  if (invoiceData.id && String(invoiceData.id) !== String(id)) {
      return res.status(400).json({ success: false, message: 'Invoice ID in body does not match ID in path.'});
  }

  try {
    const updatedInvoice = await invoicesService.updateLocalInvoice(id, invoiceData);
    if (updatedInvoice) {
      res.status(200).json(updatedInvoice);
    } else {
      res.status(404).json({ success: false, message: 'Invoice not found or update failed.' });
    }
  } catch (error) {
    if (error.message && error.message.startsWith('DuplicateError:')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (error.message && error.message.startsWith('ValidationError:')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error(`[InvoicesController] Error updating invoice ${id}:`, error);
    res.status(500).json({ success: false, message: 'Failed to update invoice.' });
  }
}

async function getNextInvoiceIds(req, res) {
  try {
    const ids = await invoicesService.getNextInvoiceIdentifiers();
    res.status(200).json(ids);
  } catch (error) {
    console.error('[InvoicesController] Error fetching next invoice identifiers:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve next invoice identifiers.' });
  }
}

async function getPrintableInvoiceData(req, res) {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ success: false, message: 'Invoice ID parameter is required for printing.' });
  }
  try {
    const printData = await invoicesService.getInvoicePrintData(id);
    res.status(200).json(printData);
  } catch (error) {
    if (error.message && error.message.startsWith('InvoiceNotFound:')) {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error(`[InvoicesController] Error fetching print data for invoice ${id}:`, error);
    res.status(500).json({ success: false, message: 'Failed to retrieve invoice print data.' });
  }
}

module.exports = {
  getAllInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  getNextInvoiceIds,
  getPrintableInvoiceData,
};
