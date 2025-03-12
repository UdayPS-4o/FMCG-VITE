const fs = require("fs").promises;
const path = require("path");
const { spawn } = require("child_process");


let redirect = (url, time) => {
    return `<script>
      setTimeout(function(){
          window.location.href = "${url}";
      }, ${time});
      </script>`;
};

const getDbfData = (path) => {
    return new Promise((resolve, reject) => {
      const process = spawn("python", ["dbfJS.py", path]);
      let data = "";
      process.stdout.on("data", (chunk) => {
        data += chunk;
      });
      process.on("close", (code) => {
        if (code === 0) {
          resolve(JSON.parse(data));
        } else {
          reject(`Process exited with code ${code}`);
        }
      });
    });
  };
  
  const getCmplData = async (req, res) => {
    const dbfFilePath = path.join(__dirname, "..", "..", "d01-2324/data", "CMPL.dbf");
    console.log(dbfFilePath);
    try {
      let jsonData = await getDbfData(dbfFilePath);
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
      if (req === "99") return jsonData;
      else res.json(jsonData);
    } catch (error) {
      res.status(500).send(error);
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

module.exports = {redirect, getDbfData, getCmplData, ensureDirectoryExistence, saveDataToJsonFile};