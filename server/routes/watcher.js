const fs = require("fs").promises;
const path = require("path");
const {redirect, getDbfData, getCmplData, ensureDirectoryExistence, saveDataToJsonFile} = require("./utilities");


process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  if (err.code === "MODULE_NOT_FOUND" && err.message.includes("io")) {
    // Do nothing: Hide this error
    console.log("Suppressed \"Cannot find module 'io'\" error"); // Log the suppression
  } else {
    console.error("--------------", err); // Log other errors
  }
});
  
  const processData = async (dbData) => {
    let data = dbData;
  
    // Find unique party codes
    const uniquePartyCodes = [...new Set(data.map((item) => item.C_CODE))];
  
    // Array to store results
    const partyResults = [];
  
    // Calculate results for each party code
    uniquePartyCodes.forEach((partycode) => {
      const partyData = data.filter((item) => item.C_CODE === partycode);
      let cr = 0,
        dr = 0;
  
      partyData.forEach((item) => {
        cr += item.CR;
        dr += item.DR;
      });
  
      let result = cr - dr;
      if (result < 0) {
        result = Math.abs(result) + " DR";
      } else {
        result = result + " CR";
      }
  
      partyResults.push({ partycode: partycode, result: result });
    });
  
    const results = {
      lastModifiedTime: new Date().toISOString(),
      data: partyResults,
    };
    return results;
  };
  
  async function watchFile() {
    const dbfFilePath = path.join(__dirname, "..",  "..", "d01-2324/data", "CASH.dbf");
    let lastModifiedTime = null;
  
    setInterval(async () => {
      try {
        // if (fs.existsSync(dbfFilePath)) {
        // fs.existsSync equivalent
        try {
          if (fs.access(dbfFilePath)) {
            lastModifiedTime = await fs
              .readFile("./db/balance.json", "utf8")
              .then((data) => {
                return JSON.parse(data).lastModifiedTime;
              });
          }
        } catch (error) {}
  
        const stats = await fs.stat(dbfFilePath);
        const currentModifiedTime = stats.mtimeMs;
        // console.log('Current Modified Time:', currentModifiedTime);
        // console.log('Last Modified Time:', lastModifiedTime);
        if (!lastModifiedTime || currentModifiedTime > lastModifiedTime) {
          lastModifiedTime = currentModifiedTime;
          console.log("File updated - processing...");
  
          const dbData = await getDbfData(dbfFilePath);
          let results = await processData(dbData);
          results.lastModifiedTime = currentModifiedTime;
          await fs.writeFile(
            "./db/balance.json",
            JSON.stringify(results, null, 2)
          );
  
          console.log("Results updated");
        }
      } catch (error) {
        console.error("Error checking file:", error);
      }
    }, 60 * 1000); // Check every 5 minutes
  }
  
  watchFile();
  
  const dbfDir = path.join(__dirname, "..",  "..", "d01-2324/data");
  const jsonDir = path.join(dbfDir, "json");
  const indexFilePath = path.join(__dirname, "..",  "db", "index.json");
  
  async function convertDbfToJson() {
    try {
      // Create directories if they don't exist
      await fs.mkdir(jsonDir, { recursive: true });
      await fs.mkdir(path.dirname(indexFilePath), { recursive: true });
  
      let index = {};
      try {
        index = JSON.parse(await fs.readFile(indexFilePath, "utf-8")) || {};
      } catch (error) {
        // Index file likely doesn't exist, that's okay
      }
  
      const files = await fs.readdir(dbfDir);
      // filet .dbf / .DBF files
      const dbfFiles = files.filter(
        (file) =>
          path.extname(file).toLowerCase() === ".dbf" ||
          path.extname(file).toLowerCase() === ".DBF"
      );
  
      for (const dbfFile of dbfFiles) {
        const dbfFilePath = path.join(dbfDir, dbfFile);
        const jsonFilePath = path.join(
          jsonDir,
          `${path.basename(path.basename(dbfFile, ".dbf"), ".DBF")}.json`
        );
  
        const fileStats = await fs.stat(dbfFilePath);
        const lastModifiedTime = fileStats.mtimeMs;
  
        if (!index[dbfFile] || index[dbfFile] != lastModifiedTime) {
          console.log(
            `File ${dbfFile} has been modified since last conversion. Processing... :: ${lastModifiedTime} :: ${index[dbfFile]}`
          );
          const dbData = await getDbfData(dbfFilePath);
          await fs.writeFile(jsonFilePath, JSON.stringify(dbData, null, 2));
          index[dbfFile] = lastModifiedTime;
          await fs.writeFile(indexFilePath, JSON.stringify(index, null, 2));
          console.log(`Converted ${dbfFile} to ${path.basename(jsonFilePath)}`);
        }
      }
  
      await fs.writeFile(indexFilePath, JSON.stringify(index, null, 2));
    } catch (error) {
      console.error("Error converting DBF to JSON or handling index:", error);
    }
  }
  
  setInterval(async () => {
    convertDbfToJson();
  }, 60 * 1000 );
  convertDbfToJson();
  
  async function checkFile(filePath) {
    try {
      await fs.access(filePath);
      const stats = await fs.stat(filePath);
      // Continue with your file processing
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`Warning: File not found: ${filePath}`);
        // Optionally create directories and/or empty file:
        await ensureDirectoryExistence(path.dirname(filePath));
        // For DBF files, you might need a proper DBF structure rather than an empty file
        // await fs.writeFile(filePath, ''); 
      } else {
        console.error(`Error checking file: ${error}`);
      }
    }
  }
  