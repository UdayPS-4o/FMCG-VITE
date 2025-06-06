const usersService = require('../../../services/users.service'); // Adjusted path

async function getUsers(req, res) {
  try {
    const users = await usersService.getAllUsers();
    res.status(200).json(users);
  } catch (error) {
    console.error('[UsersController] Error fetching users:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve users.' });
  }
}

async function createUser(req, res) {
  const userData = req.body;
  // Basic validation (more can be added)
  if (!userData.username || !userData.password || !userData.number || !userData.name) {
    return res.status(400).json({ success: false, message: 'Username, password, name, and number are required.' });
  }

  try {
    const newUser = await usersService.addUser(userData);
    if (newUser) {
      res.status(201).json(newUser);
    } else {
      // This case might occur if writeJsonFile returned false in the service
      res.status(500).json({ success: false, message: 'Failed to create user due to a server error.' });
    }
  } catch (error) {
    if (error.message && error.message.startsWith('DuplicateError:')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    console.error('[UsersController] Error creating user:', error);
    res.status(500).json({ success: false, message: 'Failed to create user.' });
  }
}

async function updateUserDetails(req, res) {
  const userId = req.params.id;
  const userData = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, message: 'User ID parameter is required.' });
  }
  if (Object.keys(userData).length === 0) {
    return res.status(400).json({ success: false, message: 'Request body cannot be empty for update.' });
  }
  // It's good practice to prevent changing the ID via the body
  if (userData.id && userData.id !== Number(userId)) {
      return res.status(400).json({ success: false, message: 'User ID in body does not match ID in path.'});
  }


  try {
    const updatedUser = await usersService.updateUser(userId, userData);
    if (updatedUser) {
      res.status(200).json(updatedUser);
    } else {
      res.status(404).json({ success: false, message: 'User not found or update failed.' });
    }
  } catch (error) {
    // Handle potential duplicate errors during update if email/number is changed
    if (error.message && error.message.startsWith('DuplicateError:')) {
        return res.status(409).json({ success: false, message: error.message });
    }
    console.error(`[UsersController] Error updating user ${userId}:`, error);
    res.status(500).json({ success: false, message: 'Failed to update user.' });
  }
}

async function deleteUserDetails(req, res) {
  const userId = req.params.id;

  if (!userId) {
    return res.status(400).json({ success: false, message: 'User ID parameter is required.' });
  }

  try {
    const success = await usersService.deleteUser(userId);
    if (success) {
      res.status(204).send(); // No Content
    } else {
      res.status(404).json({ success: false, message: 'User not found or delete failed.' });
    }
  } catch (error) {
    console.error(`[UsersController] Error deleting user ${userId}:`, error);
    res.status(500).json({ success: false, message: 'Failed to delete user.' });
  }
}

module.exports = {
  getUsers,
  createUser,
  updateUserDetails,
  deleteUserDetails,
};
