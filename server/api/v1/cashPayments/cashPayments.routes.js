const express = require('express');
const router = express.Router();
const cashPaymentsController = require('./cashPayments.controller');
const authMiddleware = require('../../../middleware/auth.middleware');

// Apply authentication middleware to all cash payment routes
router.use(authMiddleware.authenticateToken);

// GET /api/v1/cash-payments - Get all cash payments
router.get('/', cashPaymentsController.getAllCashPayments);

// POST /api/v1/cash-payments - Create a new cash payment
router.post('/', cashPaymentsController.createCashPayment);

// GET /api/v1/cash-payments/next-ids - Get next available local ID and series voucher numbers
router.get('/next-ids', cashPaymentsController.getNextIds);

// GET /api/v1/cash-payments/:series/:voucherNo - Get a specific cash payment
router.get('/:series/:voucherNo', cashPaymentsController.getCashPayment);

// PUT /api/v1/cash-payments/:series/:voucherNo - Update a specific cash payment
router.put('/:series/:voucherNo', cashPaymentsController.updateCashPayment);

// GET /api/v1/cash-payments/:series/:voucherNo/print-data - Get data for printing a cash payment
router.get('/:series/:voucherNo/print-data', cashPaymentsController.getPrintData);

// Placeholder for DELETE route if needed later
// router.delete('/:series/:voucherNo', cashPaymentsController.deleteCashPayment);

module.exports = router;
