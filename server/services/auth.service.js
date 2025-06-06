const path = require('path');
const jwt = require('jsonwebtoken');
const jsonDbService = require('./jsonDbService');

// It's crucial that JWT_SECRET is the same as used in the original middleware and login routes.
// process.env.JWT_SECRET should be defined in your .env file for the server.
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here'; // Fallback for safety, but .env is preferred
const JWT_EXPIRY = '10d'; // Match existing expiry

const USERS_DB_PATH = path.join(__dirname, '..', 'db', 'users.json');

/**
 * Authenticates a user by mobile and password.
 * @param {string} mobile
 * @param {string} password
 * @returns {Promise<Object|null>} User object (without password) or null.
 */
async function authenticateUser(mobile, password) {
  const users = await jsonDbService.readJsonFile(USERS_DB_PATH);
  if (!users || !Array.isArray(users)) {
    return null;
  }

  const user = users.find(u => u.number === mobile && u.password === password);
  if (user) {
    // Exclude password from the returned user object
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
  return null;
}

/**
 * Generates a JWT for a given user.
 * @param {Object} user - User object (should contain id and username).
 * @returns {string|null} JWT token or null if user data is insufficient.
 */
function generateAuthToken(user) {
  if (!user || !user.id || !user.username) {
    console.error('[AuthService] Insufficient user data to generate token.');
    return null;
  }
  const payload = {
    userId: user.id,
    username: user.username,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Verifies a JWT token.
 * @param {string} token
 * @returns {Object|null} Decoded payload or null if invalid.
 */
function verifyAuthToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    console.error('[AuthService] JWT verification failed:', error.message);
    return null;
  }
}

/**
 * Retrieves a user by their ID.
 * @param {string|number} userId
 * @returns {Promise<Object|null>} User object (without password) or null.
 */
async function getUserById(userId) {
  const users = await jsonDbService.readJsonFile(USERS_DB_PATH);
  if (!users || !Array.isArray(users)) {
    return null;
  }

  // Ensure userId is of the same type as in users.json (e.g., number if ids are numbers)
  const user = users.find(u => u.id === (typeof users[0]?.id === 'number' ? Number(userId) : userId));
  if (user) {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
  return null;
}

module.exports = {
  authenticateUser,
  generateAuthToken,
  verifyAuthToken,
  getUserById,
  JWT_SECRET, // Exporting for use in middleware if needed, though middleware should ideally use this service
};
