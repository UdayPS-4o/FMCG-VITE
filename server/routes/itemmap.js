const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { ensureDirectoryExistence } = require('./utilities');

const ITEM_MAP_FILE = path.resolve(process.env.DBF_FOLDER_PATH || path.join(__dirname, '..', '..'), 'server', 'db', 'itemmap.json');
// Fallback if env not set correctly or we want standard location
const ITEM_MAP_FILE_FALLBACK = path.join(__dirname, '..', 'db', 'itemmap.json');

// Helper to normalize description for consistent matching
const normalizeDesc = (s) => {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
};

router.post('/itemmap', async (req, res) => {
  try {
    const { description, mrp, itemCode } = req.body;
    
    if (!description || !itemCode) {
      return res.status(400).json({ error: 'Description and Item Code are required' });
    }

    // Ensure directory exists (just in case)
    const targetFile = ITEM_MAP_FILE_FALLBACK; // Use the standard local path to be safe
    await ensureDirectoryExistence(targetFile);

    let mapData = [];
    try {
      const data = await fs.readFile(targetFile, 'utf8');
      mapData = JSON.parse(data);
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('Error reading itemmap:', err);
    }

    const normDesc = normalizeDesc(description);
    const mrpStr = String(mrp || '').trim().replace(/[^0-9.]/g, '');
    const mrpNum = parseFloat(mrpStr);

    // Find if mapping already exists
    const existingIndex = mapData.findIndex(m => {
      const mDesc = normalizeDesc(m.description);
      const mMrp = String(m.mrp || '').trim().replace(/[^0-9.]/g, '');
      const mMrpNum = parseFloat(mMrp);
      
      // Check description match
      if (mDesc !== normDesc) return false;

      // Check MRP match (if both have MRP)
      // If the incoming mapping has no MRP (maybe service item?), we just match on description
      if (isNaN(mrpNum) && isNaN(mMrpNum)) return true;
      
      // If both have MRP, they must match
      if (!isNaN(mrpNum) && !isNaN(mMrpNum)) {
        return Math.abs(mrpNum - mMrpNum) < 0.01;
      }
      
      // If one has MRP and other doesn't, treat as different? 
      // User requirement: "item name + mrp". 
      return false;
    });

    const newEntry = {
      description, // Store original description for reference
      mrp: mrpStr,
      itemCode,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      console.log('Updating existing mapping for', description);
      mapData[existingIndex] = newEntry;
    } else {
      console.log('Adding new mapping for', description);
      mapData.push(newEntry);
    }

    await fs.writeFile(targetFile, JSON.stringify(mapData, null, 2), 'utf8');
    console.log('Item mapping saved successfully to', targetFile);

    res.json({ success: true, message: 'Item mapping saved' });

  } catch (err) {
    console.error('Error saving item map:', err);
    res.status(500).json({ error: 'Failed to save mapping' });
  }
});

module.exports = router;
