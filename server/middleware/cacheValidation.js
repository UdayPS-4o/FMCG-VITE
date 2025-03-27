const crypto = require('crypto');
const cache = new Map(); // In-memory cache of hashes

// Helper to generate hash from data
function generateHash(data) {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
}

// Middleware to handle cache validation
function cacheValidationMiddleware(req, res, next) {
  // Store the original send method
  const originalSend = res.send;
  
  // Override the send method
  res.send = function(data) {
    // Generate hash for the response data
    let responseData = data;
    
    // If data is a string but looks like JSON, parse it
    if (typeof data === 'string' && (data.startsWith('{') || data.startsWith('['))) {
      try {
        responseData = JSON.parse(data);
      } catch (e) {
        // Not valid JSON, use as is
        responseData = data;
      }
    }
    
    // Only process JSON responses
    if (typeof responseData === 'object') {
      const hash = generateHash(responseData);
      const url = req.originalUrl;
      
      // Store hash in our cache map
      cache.set(url, hash);
      
      // Check if client sent a hash in header
      const clientHash = req.headers['if-none-match'] || req.query.hash;
      
      if (clientHash && clientHash === hash) {
        // Data hasn't changed, send 304 Not Modified
        res.setHeader('ETag', hash);
        res.setHeader('Cache-Control', 'no-cache');
        return res.status(304).end();
      }
      
      // Add hash as ETag header
      res.setHeader('ETag', hash);
      res.setHeader('Cache-Control', 'no-cache');
    }
    
    // Call the original send method
    return originalSend.call(this, data);
  };
  
  next();
}

module.exports = {
  cacheValidationMiddleware,
  generateHash
}; 