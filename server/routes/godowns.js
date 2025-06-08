const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const godownsFilePath = path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'godown.json');

// Route to get godowns
router.get('/godowns', async (req, res) => {
    try {
        const data = await fs.readFile(godownsFilePath, 'utf8');
        const godowns = JSON.parse(data);
        res.json(godowns);
    } catch (error) {
        console.error('Error fetching godowns.json:', error);
        if (error.code === 'ENOENT') {
            res.status(404).json({ message: `godowns.json not found at ${error.path}` });
        } else {
            res.status(500).json({ message: 'Failed to fetch godowns data' });
        }
    }
});

module.exports = router; 