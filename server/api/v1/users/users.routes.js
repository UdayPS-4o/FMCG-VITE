const express = require('express');
const router = express.Router();
const usersController = require('./users.controller');
const authMiddleware = require('../../../middleware/auth.middleware');

// Apply authentication middleware to all user routes
// This ensures only authenticated users can access these endpoints.
// Specific role-based authorization could be added here or in controllers if needed.
router.use(authMiddleware.authenticateToken);

// GET /api/v1/users - Get all users
router.get('/', usersController.getUsers);

// POST /api/v1/users - Create a new user
router.post('/', usersController.createUser);

// PUT /api/v1/users/:id - Update a user by ID
router.put('/:id', usersController.updateUserDetails);

// DELETE /api/v1/users/:id - Delete a user by ID
router.delete('/:id', usersController.deleteUserDetails);

module.exports = router;
