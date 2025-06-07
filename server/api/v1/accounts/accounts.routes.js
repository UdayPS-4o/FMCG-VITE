const express = require('express');
const router = express.Router();
const accountsController = require('./accounts.controller');
const authMiddleware = require('../../../middleware/auth.middleware');

// Apply authentication middleware to all account routes
router.use(authMiddleware.authenticateToken);

// Routes for locally managed accounts (account-master.json)
// GET /api/v1/accounts - Get all local accounts
router.get('/', accountsController.getAccounts);

// POST /api/v1/accounts - Create a new local account
router.post('/', accountsController.createAccount);

// GET /api/v1/accounts/suggestions - Get suggestions for new account codes
router.get('/suggestions', accountsController.getAccountCreationSuggestions);

// Routes for accessing raw DBF-derived JSON data
// GET /api/v1/accounts/raw/cmpl - Get raw CMPL (party master) data
router.get('/raw/cmpl', accountsController.getRawCmpl);

// GET /api/v1/accounts/raw/pmpl - Get raw PMPL (product master) data
router.get('/raw/pmpl', accountsController.getRawPmpl);

// Routes for specific local accounts (identified by subgroup or achead)
// GET /api/v1/accounts/:id - Get a specific local account
router.get('/:id', accountsController.getAccount);

// PUT /api/v1/accounts/:id - Update a specific local account
router.put('/:id', accountsController.updateAccount);

// Note: Deletion of accounts might need careful consideration regarding related transactions.
// router.delete('/:id', accountsController.deleteAccount); // If deletion is required

module.exports = router;
