const express = require('express');
const router = express.Router();

// Import v1 routes
const authRoutes = require('./auth/auth.routes');
const userRoutes = require('./users/users.routes'); // Require the new user routes
// Import other resource routes here as they are created, e.g.:
// const invoiceRoutes = require('./invoices/invoices.routes');

// Mount v1 routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes); // Mount the user routes
// router.use('/invoices', invoiceRoutes);
// ... and so on for other resources

// Optional: A simple health check or welcome route for /api/v1
router.get('/', (req, res) => {
  res.json({
    message: 'Welcome to API v1. Auth and Users modules are active.', // Updated message
    status: 'ok'
  });
});

module.exports = router;
