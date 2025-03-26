const fs = require("fs").promises;
const path = require("path");
const {redirect} = require("./utilities");

// Get the frontend URL from environment variables or use a default value
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const middleware = (req, res, next) => {

  next();
  return;

  // Check if request is an API request
  const isApiRequest = req.path.startsWith('/api/') || 
                       req.xhr || 
                       req.headers.accept && req.headers.accept.includes('application/json');

  const token = req?.cookies?.token;
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

  const filePath = path.join(__dirname, "..", "db", "users.json");
  fs.readFile(filePath, "utf8")
    .then((data) => {
      const dbData = JSON.parse(data);
      const user = dbData.find((entry) => entry.token === token);
      if (user) {
        req.user = user;
        next();
      } else {
        if (isApiRequest) {
          // For API requests, return 401 instead of redirecting
          res.status(401)
            .clearCookie("token")
            .json({ 
              error: 'Unauthorized', 
              message: 'Invalid or expired authentication token' 
            });
        } else {
          // For regular page requests, redirect to login
          res.status(401)
            .clearCookie("token")
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
}

module.exports = middleware;