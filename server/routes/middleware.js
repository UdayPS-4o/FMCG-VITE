const fs = require("fs").promises;
const path = require("path");
const jwt = require("jsonwebtoken");
const {redirect} = require("./utilities");

// Get the frontend URL from environment variables or use a default value
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Extract JWT token from Authorization header
const extractToken = (req) => {
  if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
    return req.headers.authorization.split(' ')[1];
  }
  return null;
};

const middleware = (req, res, next) => {
  // Check if request is an API request
  const isApiRequest = req.path.startsWith('/api/') || 
                       req.xhr || 
                       req.headers.accept && req.headers.accept.includes('application/json');

  const token = extractToken(req);
  if (!token) {
    if (isApiRequest) {
      // For API requests, return 401 instead of redirecting
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Authentication required' 
      });
    } else {
      // For regular page requests, redirect to login
      return res.redirect(`${FRONTEND_URL}/login`);
    }
  }

  try {
    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // If token is valid, get user info
    const filePath = path.join(__dirname, "..", "db", "users.json");
    fs.readFile(filePath, "utf8")
      .then((data) => {
        const dbData = JSON.parse(data);
        const user = dbData.find((entry) => entry.id === decoded.userId);
        if (user) {
          req.user = user;
          next();
        } else {
          if (isApiRequest) {
            // For API requests, return 401
            res.status(401).json({ 
              error: 'Unauthorized', 
              message: 'Invalid or expired authentication token' 
            });
          } else {
            // For regular page requests, redirect to login
            res.status(401)
              .redirect(`${FRONTEND_URL}/login`)
              .send("Unauthorized access" + redirect(`${FRONTEND_URL}/login`, 1500));
          }
        }
      })
      .catch((err) => {
        console.error(err);
        if (isApiRequest) {
          res.status(500).json({ error: 'Failed to read user data' });
        } else {
          res.status(500).send("Failed to read user data");
        }
      });
  } catch (err) {
    console.error("JWT verification failed:", err);
    if (isApiRequest) {
      res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid or expired token' 
      });
    } else {
      res.status(401).redirect(`${FRONTEND_URL}/login`);
    }
  }
}

module.exports = middleware;