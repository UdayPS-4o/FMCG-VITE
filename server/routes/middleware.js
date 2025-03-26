const fs = require("fs").promises;
const path = require("path");
const {redirect} = require("./utilities");

const middleware = (req, res, next) => {
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
      return res.redirect("http://localhost:3000/login");
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
            .redirect("http://localhost:3000/login")
            .send("Unauthorized access" + redirect("http://localhost:3000/login", 1500));
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