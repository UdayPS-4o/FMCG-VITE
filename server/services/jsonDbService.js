const fs = require('fs/promises');

/**
 * Reads a JSON file asynchronously.
 * @param {string} filePath - The absolute path to the JSON file.
 * @returns {Promise<Object|Array|null>} Parsed JSON data, or null if file not found or error.
 */
async function readJsonFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`[JsonDbService] File not found: ${filePath}`);
      return null; // Or return default structure like [] or {} based on needs
    }
    console.error(`[JsonDbService] Error reading or parsing JSON file ${filePath}:`, error);
    // Depending on how critical this is, you might throw the error or return a specific error object.
    // For now, returning null to indicate failure but allow graceful handling.
    return null;
  }
}

/**
 * Writes data to a JSON file asynchronously.
 * @param {string} filePath - The absolute path to the JSON file.
 * @param {Object|Array} data - The data to write to the file.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
async function writeJsonFile(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error(`[JsonDbService] Error writing JSON file ${filePath}:`, error);
    return false;
  }
}

module.exports = {
  readJsonFile,
  writeJsonFile,
};
