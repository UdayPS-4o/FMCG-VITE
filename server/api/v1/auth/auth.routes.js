const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const authMiddleware = require('../../../middleware/auth.middleware'); // Will be created

// POST /api/v1/auth/login
router.post('/login', authController.login);

// POST /api/v1/auth/logout
// This route doesn't strictly need authMiddleware if it's just returning success,
// but if it were to interact with user-specific data (e.g., token blocklisting), it would.
router.post('/logout', authController.logout);

// GET /api/v1/auth/status
// This route requires a valid token to check the status of the current user.
router.get('/status', authMiddleware.authenticateToken, authController.getAuthStatus);

module.exports = router;
