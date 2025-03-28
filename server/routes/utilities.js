const fs = require("fs").promises;
const path = require("path");
const { DbfORM } = require("../dbf-orm");
const crypto = require('crypto');

let redirect = (url, time) => {
    return `<script>
      setTimeout(function(){
          window.location.href = "${url}";
      }, ${time});
      </script>`;
};

const getDbfData = async (filePath) => {
  try {
    const orm = new DbfORM(filePath);
    await orm.open();
    const records = await orm.findAll();
    orm.close();
    return records;
  } catch (error) {
    throw new Error(`Error reading DBF file: ${error.message}`);
  }
};

// Generate hash for data (for ETag)
const generateHash = (data) => {
  return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
};
  
const getCmplData = async (req, res) => {
  const dbfFilePath = path.join(__dirname, "..", "..", "d01-2324/data", "CMPL.dbf");
  console.log(dbfFilePath);
  try {
    console.log("-----------------------------------------------------")
    let jsonData = await fs.readFile(path.resolve(__dirname,  "..", "..", "d01-2324/data/json", "CMPL.json"), 'utf8');
    console.log(path.resolve(__dirname,  "..", "..", "d01-2324/data/json", "CMPL.json"));
    
    // Parse the JSON string into an array
    jsonData = JSON.parse(jsonData);
    
    /*just keep these keys
    "M_GROUP": "CT",
    "M_NAME": "Sundry Creditors",
    "PARTY_MAP": "",
    "C_CODE": "OB001",
    "C_NAME": "OPENING BALANCE",
    */
    jsonData = jsonData.map((entry) => {
      const obj = {
        M_GROUP: entry.M_GROUP,
        M_NAME: entry.M_NAME,
        C_CODE: entry.C_CODE,
        C_NAME: entry.C_NAME,
      };
      if (entry.GSTNO) {
        obj.GST = entry.GSTNO;
      }
      return obj;
    });

    jsonData = jsonData.filter(entry => !entry.C_NAME.includes('OPENING'));

    // Fix the conditional logic
    if (req === "99") {
      return jsonData; // Just return the data when req is "99"
    } else if (res && typeof res.json === 'function') {
      // Generate ETag for the data
      const hash = generateHash(jsonData);
      const clientHash = req.headers['if-none-match'];
      
      // Set up headers for cache control
      res.setHeader('Cache-Control', 'private, no-cache');
      res.setHeader('ETag', `"${hash}"`);
      // Allow clients to access the ETag header
      res.setHeader('Access-Control-Expose-Headers', 'ETag');
      
      console.log(`Generated Hash: ${hash}, Client Hash: ${clientHash}`);
      console.log('Response Headers:', res._headers || 'Headers not available');
      
      // If client has valid hash, send 304 Not Modified
      if (clientHash && (clientHash === hash || clientHash === `"${hash}"` || clientHash === hash.replace(/^"|"$/g, ''))) {
        console.log(`Using cached data for CMPL.json with hash: ${hash}`);
        return res.status(304).end();
      }
      
      // Otherwise send the full data
      res.json(jsonData);
    } else {
      console.error("Response object is missing or invalid");
      return jsonData; // Return the data as fallback
    }
  } catch (error) {
    console.error("Error in getCmplData:", error);
    if (res && typeof res.status === 'function') {
      res.status(500).send(error.message || String(error));
    } else {
      throw error; // Re-throw the error if we can't send a response
    }
  }
};

// Function to ensure directory exists
const ensureDirectoryExistence = async (filePath) => {
  const dirname = path.dirname(filePath);
  try {
    await fs.access(dirname);
  } catch (error) {
    if (error.code === "ENOENT") {
      await fs.mkdir(dirname, { recursive: true });
    } else {
      throw error; // Rethrow unexpected errors
    }
  }
};

// Function to save data to JSON file
const saveDataToJsonFile = async (filePath, data) => {
  await ensureDirectoryExistence(filePath);

  let existingData = [];
  try {
    const fileContent = await fs.readFile(filePath, "utf8").catch((error) => {
      if (error.code !== "ENOENT") throw error; // Ignore file not found errors
    });
    existingData = fileContent ? JSON.parse(fileContent) : [];
  } catch (error) {
    console.error("Error parsing existing file content:", error);
  }

  existingData.push(data);
  await fs.writeFile(filePath, JSON.stringify(existingData, null, 4));
};

const DIR = 'd01-2324';

async function getSTOCKFILE(vvv) {
  return await fs
    .readFile(
      path.join(
        __dirname,
        '..',
        '..',
        DIR,
        'data',
        'json',
        vvv.replace('.dbf', '.json').replace('.DBF', '.json'),
      ),
      'utf8',
    )
    .then((data) => JSON.parse(data));
}

module.exports = {redirect, getDbfData, getCmplData, ensureDirectoryExistence, saveDataToJsonFile, generateHash, getSTOCKFILE};