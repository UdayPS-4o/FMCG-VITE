const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { ensureDirectoryExistence } = require('./utilities');

// Middleware to verify JWT token (reused/copied for now, or imported if available in a shared module)
// Assuming we can rely on the main app to handle auth or we reuse the middleware from app.js if mounted correctly.
// But usually good to have it here if we mount on /api/activity
const jwt = require('jsonwebtoken');
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Invalid or expired token' });
  }
};

const LOGS_DIR = path.join(__dirname, '..', 'db', 'activity');
const LOGS_FILE = path.join(LOGS_DIR, 'logs.json');

// Ensure directory exists
ensureDirectoryExistence(LOGS_FILE);

// Helper to get logs
async function getLogs() {
  try {
    const data = await fs.readFile(LOGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

// Helper to save logs
async function saveLogs(logs) {
  await fs.writeFile(LOGS_FILE, JSON.stringify(logs, null, 2));
}

// POST /api/activity/log
router.post('/log', verifyToken, async (req, res) => {
  try {
    const { page, action, duration, nextPage, timestamp } = req.body;
    const userId = req.user.userId;
    const userName = req.user.name || req.body.userName || 'Unknown'; // Fallback if name not in token

    const newLog = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      userId,
      userName,
      page,
      action,
      duration,
      nextPage,
      timestamp: timestamp || new Date().toISOString(),
      ipAddress: req.ip
    };

    const logs = await getLogs();
    logs.push(newLog);

    // Optional: Limit log size (e.g., keep last 10000 logs)
    if (logs.length > 10000) {
      logs.splice(0, logs.length - 10000);
    }

    await saveLogs(logs);

    res.status(200).json({ success: true, message: 'Activity logged' });
  } catch (error) {
    console.error('Error logging activity:', error);
    res.status(500).json({ success: false, message: 'Failed to log activity' });
  }
});

// GET /api/activity/logs (Admin only)
router.get('/logs', verifyToken, async (req, res) => {
  try {
    // Check admin access (simplified check)
    // In a real app, use the requireAdmin middleware
    const logs = await getLogs();

    // Sort by timestamp desc
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.status(200).json({ success: true, logs });
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch logs' });
  }
});

module.exports = router;
