const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// In-memory cache of file hashes
const fileHashCache = {};

// Calculate hash for a JSON object or string
function calculateHash(data) {
  const content = typeof data === 'string' ? data : JSON.stringify(data);
  return crypto.createHash('md5').update(content).digest('hex');
}

// Middleware for handling cached API responses
const apiCacheMiddleware = async (req, res, next) => {
  // Get the client's cached hash from the header
  const clientHash = req.get('If-None-Match');
  
  // Store original send function to intercept it
  const originalSend = res.send;
  
  // Override send method to add hash headers and handle caching
  res.send = function(data) {
    // Only process JSON data
    if (typeof data === 'object') {
      const serverHash = calculateHash(data);
      
      // Save hash for this resource path
      const resourcePath = req.originalUrl || req.url;
      fileHashCache[resourcePath] = serverHash;
      
      // Set ETag header with the hash
      res.set('ETag', serverHash);
      res.set('Cache-Control', 'private, must-revalidate');
      
      // If client hash matches server hash, send 304 Not Modified
      if (clientHash && clientHash === serverHash) {
        return res.status(304).end();
      }
    }
    
    // Otherwise, proceed with normal send
    return originalSend.call(this, data);
  };
  
  next();
};

// Function to get JSON with hash checking
async function getJsonWithHashCheck(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(data);
    const hash = calculateHash(jsonData);
    
    return {
      data: jsonData,
      hash
    };
  } catch (error) {
    throw error;
  }
}

module.exports = {
  apiCacheMiddleware,
  calculateHash,
  getJsonWithHashCheck
}; 