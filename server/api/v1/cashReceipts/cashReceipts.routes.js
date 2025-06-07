const express = require('express');
const router = express.Router();
const cashReceiptsController = require('./cashReceipts.controller');
const authMiddleware = require('../../../middleware/auth.middleware');

// Apply authentication middleware to all cash receipt routes
router.use(authMiddleware.authenticateToken);

// GET /api/v1/cash-receipts - Get all cash receipts
router.get('/', cashReceiptsController.getAllCashReceipts);

// POST /api/v1/cash-receipts - Create a new cash receipt
router.post('/', cashReceiptsController.createCashReceipt);

// GET /api/v1/cash-receipts/next-ids - Get next available local ID and series receipt numbers
router.get('/next-ids', cashReceiptsController.getNextIds);

// GET /api/v1/cash-receipts/:series/:receiptNo - Get a specific cash receipt
router.get('/:series/:receiptNo', cashReceiptsController.getCashReceipt);

// PUT /api/v1/cash-receipts/:series/:receiptNo - Update a specific cash receipt
router.put('/:series/:receiptNo', cashReceiptsController.updateCashReceipt);

// GET /api/v1/cash-receipts/:series/:receiptNo/print-data - Get data for printing a cash receipt
router.get('/:series/:receiptNo/print-data', cashReceiptsController.getPrintData);

// Placeholder for DELETE route if needed later
// router.delete('/:series/:receiptNo', cashReceiptsController.deleteCashReceipt);

module.exports = router;
