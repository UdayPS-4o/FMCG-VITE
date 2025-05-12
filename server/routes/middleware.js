const fs = require("fs").promises;
const path = require("path");
const jwt = require("jsonwebtoken");
const {redirect} = require("./utilities");

// Get the frontend URL from environment variables or use a default value
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

const PUBLIC_API_PATHS = [
  '/api/generate-pdf/', 
  '/api/internal/invoice-data/'
];

// Extract JWT token from Authorization header
const extractToken = (req) => {
  if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
    return req.headers.authorization.split(' ')[1];
  }
  return null;
};

// Make the middleware function async
const middleware = async (req, res, next) => {
  console.log(`[Middleware] Request Path: ${req.path}`); // Log entry

  // Check if the path starts with any of the public API paths
  const isPublicApiRequest = PUBLIC_API_PATHS.some(publicPath => req.path.startsWith(publicPath));

  if (isPublicApiRequest) {
    console.log(`[Middleware] Public API path accessed: ${req.path}. Skipping auth.`);
    return next(); // Skip authentication for these specific API paths
  }

  const isApiRequest = req.path.startsWith('/api/') || 
                       req.xhr || 
                       req.headers.accept && req.headers.accept.includes('application/json');
  const isPdfRequest = req.path.startsWith('/api/generate-pdf/') || 
                       req.headers.accept && req.headers.accept.includes('application/pdf');
  const token = extractToken(req);
  if (!token) {
    if (isPdfRequest){
      return next();  
    }
    if (isApiRequest) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Authentication required' 
      });
    } else {
      return res.redirect(`${FRONTEND_URL}/login`);
    }
  }

  try {
    // Verify JWT token (synchronous)
    console.log("[Middleware] Verifying token...");
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log("[Middleware] Token verified. Decoded Payload:", decoded); // Log decoded payload
    
    // Read user data asynchronously
    const filePath = path.join(__dirname, "..", "db", "users.json");
    const data = await fs.readFile(filePath, "utf8"); // Use await
    
    const dbData = JSON.parse(data);
    const userIdToFind = decoded.userId;
    console.log(`[Middleware] Searching for user with ID: ${userIdToFind}`); // Log ID being searched
    const user = dbData.find((entry) => entry.id === userIdToFind);

    if (user) {
      console.log("[Middleware] User found:", user);
      req.user = user; // Attach user
      console.log("[Middleware] Attaching req.user:", req.user);
      console.log("[Middleware] Calling next()...");
      next(); // Proceed only if user is found
    } else {
      // User referenced by token not found in current users.json
      console.warn(`[Middleware] Authentication Warning: User ID ${userIdToFind} from token not found in users.json`);
      if (isApiRequest) {
        res.status(401).json({ 
          error: 'Unauthorized', 
          message: 'Invalid user associated with token' 
        });
      } else {
        // Redirecting to login might be better than showing an error page
        res.redirect(`${FRONTEND_URL}/login`);
      }
    }

  } catch (err) {
    // Catch errors from jwt.verify OR fs.readFile/JSON.parse
    if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
      console.error("[Middleware] JWT verification failed:", err.message);
      if (isApiRequest) {
        res.status(401).json({ 
          error: 'Unauthorized', 
          message: 'Invalid or expired token' 
        });
      } else {
        res.redirect(`${FRONTEND_URL}/login`);
      }
    } else {
      // Catch file read/parse errors
      console.error("[Middleware] Error reading or parsing user data:", err);
      if (isApiRequest) {
        res.status(500).json({ error: 'Server Error', message: 'Failed to process authentication data' });
      } else {
        // For non-API requests, maybe show a generic error page or redirect
        res.status(500).send("Internal Server Error");
      }
    }
    // Do NOT call next() in error cases
  }
}

module.exports = middleware;