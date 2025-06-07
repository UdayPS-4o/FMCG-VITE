const express = require('express');
const router = express.Router();
const invoicesController = require('./invoices.controller');
const authMiddleware = require('../../../middleware/auth.middleware');

// Apply authentication middleware to all invoice routes
router.use(authMiddleware.authenticateToken);

// GET /api/v1/invoices - Get all invoices
router.get('/', invoicesController.getAllInvoices);

// POST /api/v1/invoices - Create a new invoice
router.post('/', invoicesController.createInvoice);

// GET /api/v1/invoices/next-ids - Get next available internal ID and series bill numbers
router.get('/next-ids', invoicesController.getNextInvoiceIds);

// GET /api/v1/invoices/:id - Get a specific invoice by its internal ID
router.get('/:id', invoicesController.getInvoice);

// PUT /api/v1/invoices/:id - Update a specific invoice by its internal ID
router.put('/:id', invoicesController.updateInvoice);

// GET /api/v1/invoices/:id/print-data - Get comprehensive data for printing a specific invoice
router.get('/:id/print-data', invoicesController.getPrintableInvoiceData);

// Placeholder for DELETE route if needed later
// router.delete('/:id', invoicesController.deleteInvoice);

module.exports = router;
