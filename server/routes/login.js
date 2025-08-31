const express = require('express');
const app = express.Router();
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const {
  redirect,
  getDbfData,
  getCmplData,
  ensureDirectoryExistence,
  saveDataToJsonFile,
  getSTOCKFILE,
} = require('./utilities');
const { cp } = require('fs');
const { id } = require('date-fns/locale');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';
console.log('Login JWT_SECRET:', JWT_SECRET);
const JWT_EXPIRY = '10d'; 

function formatDateToDDMMYYYY(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

// Middleware to extract JWT token from Authorization header
const extractToken = (req) => {
  if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
    return req.headers.authorization.split(' ')[1];
  }
  return null;
};

app.get('/api/checkIsAuth', (req, res) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ authenticated: false });
  }

  try {
    // Verify the JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get user from users.json file
    const filePath = path.join(__dirname, '..', 'db', 'users.json');
    fs.readFile(filePath, 'utf8')
      .then((data) => {
        const users = JSON.parse(data);
        const user = users.find((u) => u.id === decoded.userId);
        
        if (user) {
          return res.status(200).json({
            authenticated: true,
            user: {
              id: user.id,
              name: user.name,
              username: user.username,
              routeAccess: user.routeAccess,
              powers: user.powers,
              subgroups: user.subgroups,
              smCode: user.smCode,
              defaultSeries: user.defaultSeries,
              godownAccess: user.godownAccess,
              canSelectSeries: user.canSelectSeries,
              allowPastDateEntries: user.allowPastDateEntries
            }
          });
        } else {
          return res.status(401).json({ authenticated: false });
        }
      })
      .catch((err) => {
        console.error(err);
        return res.status(500).json({ authenticated: false, error: 'Internal server error' });
      });
  } catch (err) {
    console.error('JWT verification failed:', err);
    return res.status(401).json({ authenticated: false });
  }
});

app.post('/api/login', async (req, res) => {
  const { mobile, password } = req.body;
  const filePath = path.join(__dirname, '..', 'db', 'users.json');

  try {
    let dbData = await fs.readFile(filePath, 'utf8');
    let users = JSON.parse(dbData);
    const user = users.find((user) => user.number === mobile && user.password === password);

    if (user) {
      // Create JWT token
      const token = jwt.sign(
        { 
          userId: user.id,
          username: user.username
        }, 
        JWT_SECRET, 
        { expiresIn: JWT_EXPIRY }
      );

      // Return the token in the response
      res.status(200).json({ 
        success: true, 
        token: token,
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          routeAccess: user.routeAccess,
          powers: user.powers,
          subgroups: user.subgroups,
          smCode: user.smCode,
          defaultSeries: user.defaultSeries,
          godownAccess: user.godownAccess,
          canSelectSeries: user.canSelectSeries,
          allowPastDateEntries: user.allowPastDateEntries
        }
      });
    } else {
      res.status(404).json({ success: false, message: 'Invalid username or password.' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to login: ' + err.message });
  }
});

app.get('/logout', (req, res) => {
  // JWT logout just redirects - client should clear the token
  res.status(200).redirect('/login');
});

// Add this POST route for /api/logout
app.post('/api/logout', (req, res) => {
  // JWT doesn't need server-side logout, just return success
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

module.exports = app;

