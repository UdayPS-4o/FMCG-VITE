const path = require('path');
const jsonDbService = require('./jsonDbService'); // Assumes jsonDbService.js is in the same directory

const USERS_DB_PATH = path.join(__dirname, '..', 'db', 'users.json');

function excludePassword(user) {
  if (user) {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
  return null;
}

function excludePasswordForAll(users) {
  if (users && Array.isArray(users)) {
    return users.map(user => excludePassword(user));
  }
  return [];
}

async function getAllUsers() {
  const users = await jsonDbService.readJsonFile(USERS_DB_PATH);
  return excludePasswordForAll(users || []);
}

async function addUser(userData) {
  let users = await jsonDbService.readJsonFile(USERS_DB_PATH);
  if (!users || !Array.isArray(users)) {
    users = []; // Initialize if file was empty or not found/invalid
  }

  // Check for duplicate phone number (assuming 'number' field stores phone)
  if (users.some(user => user.number === userData.number)) {
    throw new Error('DuplicateError: Phone number already exists.');
  }
  // Check for duplicate username
  if (users.some(user => user.username === userData.username)) {
    throw new Error('DuplicateError: Username already exists.');
  }


  const maxId = users.reduce((max, user) => Math.max(max, user.id || 0), 0);
  const newUser = {
    id: maxId + 1,
    name: userData.name,
    username: userData.username, // Ensure username is being saved
    number: userData.number,
    password: userData.password, // Password will be saved, but excluded from return
    routeAccess: userData.routeAccess || [],
    powers: userData.powers || [],
    subgroups: userData.subgroups || [],
    smCode: userData.smCode || null,
    defaultSeries: userData.defaultSeries || null,
    canSelectSeries: typeof userData.canSelectSeries === 'boolean' ? userData.canSelectSeries : false,
    godownAccess: userData.godownAccess || [],
    // For backward compatibility with existing structure
    subgroup: userData.subgroups && userData.subgroups.length > 0 ? userData.subgroups[0] : null,
  };

  users.push(newUser);
  const success = await jsonDbService.writeJsonFile(USERS_DB_PATH, users);
  return success ? excludePassword(newUser) : null;
}

async function updateUser(userId, userData) {
  let users = await jsonDbService.readJsonFile(USERS_DB_PATH);
  if (!users || !Array.isArray(users)) {
    return null; // Or throw Error('User database not found or invalid.')
  }

  // Ensure userId is compared with the correct type
  const userIdNum = Number(userId);
  const userIndex = users.findIndex(user => user.id === userIdNum);

  if (userIndex === -1) {
    return null; // User not found
  }

  // Preserve original password if not provided in userData
  const newPassword = userData.password ? userData.password : users[userIndex].password;

  users[userIndex] = {
    ...users[userIndex], // Keep existing fields
    ...userData,        // Overwrite with new data
    password: newPassword, // Explicitly set password
    id: userIdNum, // Ensure ID remains the same and is a number
     // Update backward compatibility field
    subgroup: userData.subgroups && userData.subgroups.length > 0 ? userData.subgroups[0] : (users[userIndex].subgroups && users[userIndex].subgroups.length > 0 ? users[userIndex].subgroups[0] : null),
  };

  // Ensure boolean fields are correctly handled if not provided in userData
  if (typeof userData.canSelectSeries === 'undefined') {
    users[userIndex].canSelectSeries = users[userIndex].canSelectSeries || false;
  }


  const success = await jsonDbService.writeJsonFile(USERS_DB_PATH, users);
  return success ? excludePassword(users[userIndex]) : null;
}

async function deleteUser(userId) {
  let users = await jsonDbService.readJsonFile(USERS_DB_PATH);
  if (!users || !Array.isArray(users)) {
    return false;
  }

  const userIdNum = Number(userId);
  const initialLength = users.length;
  users = users.filter(user => user.id !== userIdNum);

  if (users.length === initialLength) {
    return false; // User not found, nothing deleted
  }

  return await jsonDbService.writeJsonFile(USERS_DB_PATH, users);
}

module.exports = {
  getAllUsers,
  addUser,
  updateUser,
  deleteUser,
};
