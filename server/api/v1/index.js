const express = require('express');
const router = express.Router();

// Import v1 routes
const authRoutes = require('./auth/auth.routes');
const userRoutes = require('./users/users.routes');
const accountRoutes = require('./accounts/accounts.routes');
const invoiceRoutes = require('./invoices/invoices.routes');
const cashReceiptRoutes = require('./cashReceipts/cashReceipts.routes');
const cashPaymentRoutes = require('./cashPayments/cashPayments.routes'); // Require

// Mount v1 routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/accounts', accountRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/cash-receipts', cashReceiptRoutes);
router.use('/cash-payments', cashPaymentRoutes); // Mount

// ... and so on for other resources

// Optional: A simple health check or welcome route for /api/v1
router.get('/', (req, res) => {
  res.json({
    message: 'Welcome to API v1. Auth, Users, Accounts, Invoices, Cash Receipts, and Cash Payments modules are active.', // Updated
    status: 'ok'
  });
});

module.exports = router;
