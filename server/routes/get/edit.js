const express = require("express");
const app = express.Router();
const fs = require("fs").promises;
const path = require("path");
const {
  redirect,
  getDbfData,
  getCmplData,
  ensureDirectoryExistence,
  saveDataToJsonFile,
} = require("../utilities");

const uniqueIdentifiers = ["receiptNo", "voucherNo", "subgroup", 'id', 'achead'];

app.get("/edit/:page/:id", async (req, res) => {
  const { page, id } = req.params;
  console.log(`Fetching ${page} with id ${id}`);
  
  try {
    let data = await fs.readFile(`./db/${page}.json`, "utf8");
    data = JSON.parse(data);

    // find the entry with the specified identifier
    let result = null;
    
    // For invoicing, look specifically for the id field first
    if (page === 'invoicing') {
      console.log(`Looking for invoicing record with id: ${id}`);
      result = data.find(entry => String(entry.id) === String(id));
    }
    
    // If not found or not invoicing, try other identifiers
    if (!result) {
      console.log(`Trying alternative identifiers for ${page}`);
      for (const key of uniqueIdentifiers) {
        console.log(`Checking identifier: ${key}`);
        result = data.find(entry => String(entry[key]) === String(id));
        if (result) {
          console.log(`Found entry using identifier: ${key}`);
          break;
        }
      }
    }

    if (!result) {
      console.log(`No ${page} record found with id ${id}`);
      res.status(404).send(`Record not found ` + redirect(`/db/${page}`, 2000));
      return;
    }

    console.log(`Found ${page} record:`, result);
    res.json(result);
  } catch (error) {
    console.error(`Error fetching ${page} record:`, error);
    res.status(500).send(`Error retrieving data: ${error.message}`);
  }
});

// make this route delete/cash-receipts/${id}
app.get("/delete/:page/:id", async (req, res) => {
  const { page, id } = req.params;
  console.log(`Attempting to delete ${page} record with ID: ${id}`);
  
  try {
    // Use the same path resolution as the working edit route
    const filePath = `./db/${page}.json`;
    console.log(`Reading from file: ${filePath}`);
    
    // Read the file
    const data = await fs.readFile(filePath, "utf8");
    const jsonData = JSON.parse(data);
    
    if (jsonData.length === 0) {
      console.log(`No records found in ${page}.json`);
      return res.status(404).json({ error: `No records found in ${page}` });
    }
    
    // Get the appropriate ID field based on the endpoint
    const keys = Object.keys(jsonData[0]);
    const validKey = keys.find((key) => uniqueIdentifiers.includes(key));
    
    if (!validKey) {
      console.log(`No valid identifier found for ${page}`);
      return res.status(400).json({ error: `Could not determine ID field for ${page}` });
    }
    
    console.log(`Using identifier field: ${validKey}`);
    
    // Find the record case-insensitively
    const recordIndex = jsonData.findIndex((item) => 
      String(item[validKey]).toLowerCase() === String(id).toLowerCase()
    );
    
    if (recordIndex === -1) {
      console.log(`Record not found with ${validKey} = ${id}`);
      return res.status(404).json({ error: `Record not found with ${validKey} = ${id}` });
    }
    
    // Remove the record
    jsonData.splice(recordIndex, 1);
    
    // Save the updated data
    await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2), "utf8");
    
    console.log(`Successfully deleted ${page} record with ${validKey} = ${id}`);
    res.status(200).json({ message: "Record deleted successfully" });
  } catch (error) {
    console.error(`Error deleting ${page} record:`, error);
    res.status(500).json({ error: `Error deleting record: ${error.message}` });
  }
});

// Add a specific route for invoicing edits to match the client's request pattern
app.get("/edit/invoicing/:id", async (req, res) => {
  console.log(`Edit invoicing request for ID: ${req.params.id}`);
  
  try {
    // Read the invoicing.json file
    const filePath = path.join(__dirname, '..', '..', 'db', 'invoicing.json');
    const data = await fs.promises.readFile(filePath, 'utf8');
    const jsonData = JSON.parse(data);
    
    // Find the record with the matching ID
    const id = req.params.id;
    const record = jsonData.find(item => String(item.id) === String(id));
    
    if (record) {
      console.log(`Found record with ID ${id}`);
      res.json(record);
    } else {
      console.log(`Record with ID ${id} not found`);
      res.status(404).send(`Record with ID ${id} not found`);
    }
  } catch (error) {
    console.error('Error fetching invoicing record:', error);
    res.status(500).send(`Error fetching record: ${error.message}`);
  }
});

module.exports = app;
