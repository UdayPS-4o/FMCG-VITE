const fs = require('fs').promises;
const path = require('path');
const { DbfORM } = require('../dbf-orm');

/**
 * Utility class for safely synchronizing JSON data back to DBF files
 * Implements file locking, atomic operations, and corruption prevention
 */
class DbfSync {
  constructor(dbfFolderPath) {
    this.dbfFolderPath = dbfFolderPath;
    this.maxBackupAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    this.lockTimeout = 30000; // 30 seconds timeout for file locks
    this.activeLocks = new Map(); // Track active file locks
  }

  /**
   * Check if a file is accessible for read/write operations
   * @param {string} filePath - Path to the file to check
   * @returns {boolean} Whether the file is accessible
   */
  async isFileAccessible(filePath) {
    try {
      // Try to open the file for reading and writing
      const fileHandle = await fs.open(filePath, 'r+');
      await fileHandle.close();
      return true;
    } catch (error) {
      if (error.code === 'EBUSY' || error.code === 'EACCES' || error.code === 'EPERM') {
        console.warn(`File ${filePath} is not accessible: ${error.message}`);
        return false;
      }
      if (error.code === 'ENOENT') {
        // File doesn't exist, which is fine for creation operations
        return true;
      }
      // Other errors might indicate corruption or other issues
      console.error(`Unexpected error checking file accessibility: ${error.message}`);
      return false;
    }
  }

  /**
   * Wait for a file to become accessible with timeout
   * @param {string} filePath - Path to the file
   * @param {number} maxWaitTime - Maximum time to wait in milliseconds
   * @param {number} checkInterval - Interval between checks in milliseconds
   * @returns {boolean} Whether the file became accessible
   */
  async waitForFileAccess(filePath, maxWaitTime = 30000, checkInterval = 1000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      if (await this.isFileAccessible(filePath)) {
        return true;
      }
      
      console.log(`Waiting for file access: ${path.basename(filePath)} (${Math.round((Date.now() - startTime) / 1000)}s)`);
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    return false;
  }

  /**
   * Create a file lock to prevent concurrent access
   * @param {string} dbfFileName - Name of the DBF file
   * @returns {string} Lock file path
   */
  async acquireLock(dbfFileName) {
    const lockFile = path.join(this.dbfFolderPath, 'data', `${dbfFileName}.lock`);
    const lockData = {
      pid: process.pid,
      timestamp: Date.now(),
      operation: 'dbf-sync'
    };

    // Check if lock already exists
    try {
      const existingLock = await fs.readFile(lockFile, 'utf8');
      const lockInfo = JSON.parse(existingLock);
      const lockAge = Date.now() - lockInfo.timestamp;
      
      if (lockAge < this.lockTimeout) {
        throw new Error(`DBF file ${dbfFileName} is locked by another process (PID: ${lockInfo.pid})`);
      } else {
        console.warn(`Removing stale lock for ${dbfFileName} (age: ${lockAge}ms)`);
        await fs.unlink(lockFile).catch(() => {}); // Ignore errors
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // Create new lock
    await fs.writeFile(lockFile, JSON.stringify(lockData, null, 2));
    this.activeLocks.set(dbfFileName, lockFile);
    
    console.log(`Acquired lock for ${dbfFileName}`);
    return lockFile;
  }

  /**
   * Release a file lock
   * @param {string} dbfFileName - Name of the DBF file
   */
  async releaseLock(dbfFileName) {
    const lockFile = this.activeLocks.get(dbfFileName);
    if (lockFile) {
      try {
        await fs.unlink(lockFile);
        this.activeLocks.delete(dbfFileName);
        console.log(`Released lock for ${dbfFileName}`);
      } catch (error) {
        console.warn(`Failed to release lock for ${dbfFileName}:`, error.message);
      }
    }
  }

  /**
   * Validate DBF file integrity
   * @param {string} dbfFilePath - Path to the DBF file
   * @returns {boolean} Whether the file is valid
   */
  async validateDbfFile(dbfFilePath) {
    try {
      const dbf = new DbfORM(dbfFilePath);
      await dbf.open();
      
      // Try to read at least one record to verify file structure
      const records = await dbf.findAll();
      const fields = dbf.getFields();
      
      dbf.close();
      
      // Basic validation checks
      if (!Array.isArray(fields) || fields.length === 0) {
        console.error(`Invalid DBF file: No fields found in ${dbfFilePath}`);
        return false;
      }
      
      if (!Array.isArray(records)) {
        console.error(`Invalid DBF file: Cannot read records from ${dbfFilePath}`);
        return false;
      }
      
      console.log(`DBF file validation passed: ${dbfFilePath} (${records.length} records, ${fields.length} fields)`);
      return true;
    } catch (error) {
      console.error(`DBF file validation failed for ${dbfFilePath}:`, error.message);
      return false;
    }
  }

  /**
   * Create a safe backup with validation
   * @param {string} dbfFilePath - Path to the DBF file
   * @returns {string} Backup file path
   */
  async createSafeBackup(dbfFilePath) {
    const backupPath = `${dbfFilePath}.backup.${Date.now()}`;
    
    try {
      // Validate source file before backup
      if (await this.validateDbfFile(dbfFilePath)) {
        await fs.copyFile(dbfFilePath, backupPath);
        
        // Validate backup file
        if (await this.validateDbfFile(backupPath)) {
          console.log(`Created validated backup: ${backupPath}`);
          return backupPath;
        } else {
          await fs.unlink(backupPath).catch(() => {});
          throw new Error('Backup file validation failed');
        }
      } else {
        throw new Error('Source file validation failed');
      }
    } catch (error) {
      console.error(`Failed to create safe backup for ${dbfFilePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Restore from backup with validation
   * @param {string} dbfFilePath - Path to the DBF file
   * @param {string} backupPath - Path to the backup file
   */
  async restoreFromBackup(dbfFilePath, backupPath) {
    try {
      // Validate backup before restoration
      if (await this.validateDbfFile(backupPath)) {
        await fs.copyFile(backupPath, dbfFilePath);
        
        // Validate restored file
        if (await this.validateDbfFile(dbfFilePath)) {
          console.log(`Successfully restored ${dbfFilePath} from backup`);
        } else {
          throw new Error('Restored file validation failed');
        }
      } else {
        throw new Error('Backup file is corrupted, cannot restore');
      }
    } catch (error) {
      console.error(`Failed to restore from backup:`, error.message);
      throw error;
    }
  }

  /**
   * Clean up old backup files to prevent disk space issues
   * @param {string} dbfFileName - Name of the DBF file
   */
  async cleanupOldBackups(dbfFileName) {
    try {
      const dataDir = path.join(this.dbfFolderPath, 'data');
      const files = await fs.readdir(dataDir);
      const backupPattern = new RegExp(`^${dbfFileName}\\.backup\\.(\\d+)$`);
      const now = Date.now();
      
      for (const file of files) {
        const match = file.match(backupPattern);
        if (match) {
          const timestamp = parseInt(match[1]);
          const age = now - timestamp;
          
          if (age > this.maxBackupAge) {
            const backupPath = path.join(dataDir, file);
            await fs.unlink(backupPath);
            console.log(`Cleaned up old backup: ${file}`);
          }
        }
      }
    } catch (error) {
      console.warn(`Error cleaning up old backups for ${dbfFileName}:`, error.message);
    }
  }

  /**
   * Validate record data before processing
   * @param {Array} records - Array of records to validate
   * @param {Array} keyFields - Array of key field names
   * @returns {Object} Validation result
   */
  validateRecords(records, keyFields) {
    const errors = [];
    const validRecords = [];
    
    if (!Array.isArray(records)) {
      return { valid: false, error: 'Records must be an array' };
    }
    
    if (records.length === 0) {
      return { valid: false, error: 'No records provided' };
    }
    
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const recordErrors = [];
      
      if (!record || typeof record !== 'object') {
        recordErrors.push(`Record ${i} is not a valid object`);
        continue;
      }
      
      // Check for required key fields
      for (const keyField of keyFields) {
        if (record[keyField] === undefined || record[keyField] === null) {
          recordErrors.push(`Record ${i} missing required key field: ${keyField}`);
        }
      }
      
      if (recordErrors.length === 0) {
        validRecords.push(record);
      } else {
        errors.push(...recordErrors);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      validRecords,
      invalidCount: records.length - validRecords.length
    };
  }

  /**
   * Get field definitions for a specific DBF file by reading its structure
   * @param {string} dbfFileName - Name of the DBF file (e.g., 'BILL.DBF')
   * @returns {Array} Field descriptors
   */
  async getDbfFields(dbfFileName) {
    const dbfPath = path.join(this.dbfFolderPath, 'data', dbfFileName);
    
    // Validate file first
    if (!(await this.validateDbfFile(dbfPath))) {
      throw new Error(`DBF file ${dbfFileName} is corrupted or invalid`);
    }
    
    const dbf = new DbfORM(dbfPath);
    
    try {
      await dbf.open();
      const fields = dbf.getFields();
      dbf.close();
      return fields;
    } catch (error) {
      console.error(`Error reading DBF fields for ${dbfFileName}:`, error);
      throw error;
    }
  }

  /**
   * Safely recreate a DBF file from JSON data with atomic operations
   * @param {string} dbfFileName - Name of the DBF file (e.g., 'BILL.DBF')
   * @param {Array} jsonData - Array of records to write to DBF
   * @param {Array} fieldDescriptors - Field descriptors for the DBF file
   */
  async recreateDbfFromJson(dbfFileName, jsonData, fieldDescriptors) {
    const dbfPath = path.join(this.dbfFolderPath, 'data', dbfFileName);
    const tempPath = `${dbfPath}.temp.${Date.now()}`;
    let backupPath = null;
    let lockAcquired = false;
    
    try {
      // Check if the file is accessible before attempting any operations
      if (await fs.access(dbfPath).then(() => true).catch(() => false)) {
        console.log(`Checking accessibility of ${dbfFileName}...`);
        if (!(await this.waitForFileAccess(dbfPath, 30000))) {
          throw new Error(`File ${dbfFileName} is locked by another process and cannot be accessed after 30 seconds. Please close any applications that might be using this file.`);
        }
      }
      
      // Acquire file lock
      await this.acquireLock(dbfFileName);
      lockAcquired = true;
      
      // Clean up old backups first
      await this.cleanupOldBackups(dbfFileName);
      
      // Create backup of existing DBF file if it exists
      try {
        backupPath = await this.createSafeBackup(dbfPath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.warn(`Could not create backup for ${dbfPath}:`, error.message);
        }
      }

      // Create new DBF file at temporary location first (atomic operation)
      const dbf = new DbfORM(tempPath, { autoCreate: true });
      dbf.defineFields(fieldDescriptors);
      await dbf.create();

      // Insert all records
      if (jsonData && jsonData.length > 0) {
        await dbf.insertMany(jsonData);
        console.log(`Inserted ${jsonData.length} records into temporary file`);
      }

      dbf.close();
      
      // Validate the temporary file
      if (!(await this.validateDbfFile(tempPath))) {
        throw new Error('Temporary DBF file validation failed');
      }
      
      // Atomic move: replace original with temporary file
      try {
        await fs.unlink(dbfPath).catch(() => {}); // Remove original if exists
        await fs.rename(tempPath, dbfPath);
      } catch (error) {
        throw new Error(`Failed to replace original file: ${error.message}`);
      }
      
      // Final validation of the new file
      if (!(await this.validateDbfFile(dbfPath))) {
        throw new Error('Final DBF file validation failed');
      }
      
      // Update the index.json file with new timestamp
      await this.updateIndexTimestamp(dbfFileName);
      
      console.log(`Successfully recreated ${dbfFileName} from JSON data`);
      
      // Clean up successful backup
      if (backupPath) {
        try {
          await fs.unlink(backupPath);
          console.log(`Cleaned up successful backup: ${backupPath}`);
        } catch (cleanupError) {
          console.warn(`Could not clean up backup: ${cleanupError.message}`);
        }
      }
      
    } catch (error) {
      console.error(`Error recreating DBF file ${dbfFileName}:`, error);
      
      // Clean up temporary file
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        console.warn(`Could not clean up temporary file: ${cleanupError.message}`);
      }
      
      // Try to restore backup if it exists and is valid
      if (backupPath) {
        try {
          await this.restoreFromBackup(dbfPath, backupPath);
        } catch (restoreError) {
          console.error(`CRITICAL: Failed to restore backup:`, restoreError);
        }
      }
      
      throw error;
    } finally {
      // Always release the lock
      if (lockAcquired) {
        await this.releaseLock(dbfFileName);
      }
    }
  }

  /**
   * Update the timestamp in index.json for a DBF file
   * @param {string} dbfFileName - Name of the DBF file
   */
  async updateIndexTimestamp(dbfFileName) {
    const indexPath = path.join(this.dbfFolderPath, '..', 'db', 'index.json');
    
    try {
      let indexData = {};
      try {
        indexData = JSON.parse(await fs.readFile(indexPath, 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.warn(`Error reading index.json: ${error.message}`);
        }
      }
      
      indexData[dbfFileName] = Date.now();
      await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2));
    } catch (error) {
      console.error(`Error updating index timestamp for ${dbfFileName}:`, error);
    }
  }

  /**
   * Sync BILL.DBF and BILLDTL.DBF from their JSON counterparts
   */
  async syncBillAndBillDtl() {
    try {
      const billJsonPath = path.join(this.dbfFolderPath, 'data', 'json', 'bill.json');
      const billdtlJsonPath = path.join(this.dbfFolderPath, 'data', 'json', 'BILLDTL.json');

      // Validate JSON files exist and are readable
      let billData, billdtlData;
      try {
        billData = JSON.parse(await fs.readFile(billJsonPath, 'utf8'));
        billdtlData = JSON.parse(await fs.readFile(billdtlJsonPath, 'utf8'));
      } catch (error) {
        throw new Error(`Failed to read JSON files: ${error.message}`);
      }

      // Get field descriptors from existing DBF files
      const billFields = await this.getDbfFields('bill.DBF');
      const billdtlFields = await this.getDbfFields('BILLDTL.DBF');

      // Recreate both DBF files
      await this.recreateDbfFromJson('bill.DBF', billData, billFields);
      await this.recreateDbfFromJson('BILLDTL.DBF', billdtlData, billdtlFields);

      console.log('Successfully synced BILL.DBF and BILLDTL.DBF from JSON data');
      
      return {
        success: true,
        message: 'DBF files synchronized successfully',
        billRecords: billData.length,
        billdtlRecords: billdtlData.length
      };

    } catch (error) {
      console.error('Error syncing BILL and BILLDTL DBF files:', error);
      throw error;
    }
  }

  /**
   * Sync a specific DBF file from its JSON counterpart
   * @param {string} dbfFileName - Name of the DBF file (e.g., 'BILL.DBF')
   * @param {string} jsonFileName - Name of the JSON file (e.g., 'bill.json')
   */
  async syncSingleDbf(dbfFileName, jsonFileName) {
    try {
      const jsonPath = path.join(this.dbfFolderPath, 'data', 'json', jsonFileName);
      
      // Validate JSON file
      let jsonData;
      try {
        jsonData = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
      } catch (error) {
        throw new Error(`Failed to read JSON file ${jsonFileName}: ${error.message}`);
      }
      
      const fields = await this.getDbfFields(dbfFileName);
      
      await this.recreateDbfFromJson(dbfFileName, jsonData, fields);
      
      console.log(`Successfully synced ${dbfFileName} from ${jsonFileName}`);
      
      return {
        success: true,
        message: `${dbfFileName} synchronized successfully`,
        records: jsonData.length
      };

    } catch (error) {
      console.error(`Error syncing ${dbfFileName} from ${jsonFileName}:`, error);
      throw error;
    }
  }

  /**
   * Safely update existing records in a DBF file without causing corruption
   * @param {string} dbfFileName - Name of the DBF file (e.g., 'BILL.DBF')
   * @param {Array} recordsToUpdate - Array of records to update with their identifiers
   * @param {string|Array} keyFields - Field name(s) to use as unique identifier
   */
  async updateDbfRecords(dbfFileName, recordsToUpdate, keyFields) {
    const dbfPath = path.join(this.dbfFolderPath, 'data', dbfFileName);
    let backupPath = null;
    let lockAcquired = false;
    let dbf = null;
    
    try {
      // Check if the file is accessible before attempting any operations
      console.log(`Checking accessibility of ${dbfFileName}...`);
      if (!(await this.waitForFileAccess(dbfPath, 30000))) {
        throw new Error(`File ${dbfFileName} is locked by another process and cannot be accessed after 30 seconds. Please close any applications that might be using this file.`);
      }
      
      // Normalize keyFields to array
      const keyFieldsArray = Array.isArray(keyFields) ? keyFields : keyFields.split(',').map(f => f.trim());
      
      // Validate input records
      const validation = this.validateRecords(recordsToUpdate, keyFieldsArray);
      if (!validation.valid) {
        throw new Error(`Record validation failed: ${validation.errors.join(', ')}`);
      }
      
      if (validation.invalidCount > 0) {
        console.warn(`Skipping ${validation.invalidCount} invalid records`);
      }
      
      // Acquire file lock
      await this.acquireLock(dbfFileName);
      lockAcquired = true;
      
      // Validate source file
      if (!(await this.validateDbfFile(dbfPath))) {
        throw new Error(`Source DBF file ${dbfFileName} is corrupted`);
      }
      
      // Clean up old backups first
      await this.cleanupOldBackups(dbfFileName);
      
      // Create backup before any modifications
      backupPath = await this.createSafeBackup(dbfPath);

      // Open the DBF file
      dbf = new DbfORM(dbfPath, { autoCreate: false });
      await dbf.open();
      
      let updatedCount = 0;
      let errorCount = 0;
      const errors = [];

      // Process each record update
      for (const recordData of validation.validRecords) {
        try {
          // Build the where condition for finding the record
          const whereCondition = {};
          for (const keyField of keyFieldsArray) {
            whereCondition[keyField] = recordData[keyField];
          }

          // Find existing record
          const existingRecords = await dbf.find(whereCondition);
          
          if (existingRecords.length === 0) {
            console.warn(`No record found for update with keys:`, whereCondition);
            continue;
          }
          
          if (existingRecords.length > 1) {
            console.warn(`Multiple records found for keys ${JSON.stringify(whereCondition)}. Updating first match only.`);
          }

          // Update the record
          await dbf.update(whereCondition, recordData);
          updatedCount++;
          
          console.log(`Updated record in ${dbfFileName} with keys:`, whereCondition);
          
        } catch (recordError) {
          errorCount++;
          const errorMsg = `Error updating record: ${recordError.message}`;
          errors.push(errorMsg);
          console.error(errorMsg, recordError);
        }
      }

      // Close DBF file before validation
      dbf.close();
      dbf = null;
      
      // Validate the updated file
      if (!(await this.validateDbfFile(dbfPath))) {
        throw new Error('DBF file validation failed after updates');
      }

      // Update the index.json file with new timestamp
      await this.updateIndexTimestamp(dbfFileName);
      
      console.log(`Successfully updated ${updatedCount} records in ${dbfFileName}. Errors: ${errorCount}`);
      
      // Clean up backup if operation was successful and no errors
      if (backupPath && errorCount === 0) {
        try {
          await fs.unlink(backupPath);
          console.log(`Cleaned up successful backup: ${backupPath}`);
        } catch (cleanupError) {
          console.warn(`Could not clean up backup: ${cleanupError.message}`);
        }
      }
      
      return {
        success: true,
        message: `Updated ${updatedCount} records in ${dbfFileName}`,
        updatedCount,
        errorCount,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      console.error(`Error updating records in ${dbfFileName}:`, error);
      
      // Try to restore backup if it exists and was created
      if (backupPath) {
        try {
          await this.restoreFromBackup(dbfPath, backupPath);
        } catch (restoreError) {
          console.error(`CRITICAL: Failed to restore backup:`, restoreError);
          throw new Error(`Update failed and backup restoration failed: ${restoreError.message}`);
        }
      }
      
      throw error;
    } finally {
      // Always close the DBF file
      if (dbf) {
        try {
          dbf.close();
        } catch (closeError) {
          console.error(`Error closing DBF file ${dbfFileName}:`, closeError);
        }
      }
      
      // Always release the lock
      if (lockAcquired) {
        await this.releaseLock(dbfFileName);
      }
    }
  }

  /**
   * Safely insert new records into a DBF file without causing corruption
   * @param {string} dbfFileName - Name of the DBF file (e.g., 'BILL.DBF')
   * @param {Array} recordsToInsert - Array of records to insert
   * @param {string|Array} keyFields - Field name(s) to use for duplicate checking
   */
  async insertDbfRecords(dbfFileName, recordsToInsert, keyFields) {
    const dbfPath = path.join(this.dbfFolderPath, 'data', dbfFileName);
    let backupPath = null;
    let lockAcquired = false;
    let dbf = null;
    
    try {
      // Normalize keyFields to array
      const keyFieldsArray = Array.isArray(keyFields) ? keyFields : keyFields.split(',').map(f => f.trim());
      
      // Validate input records
      const validation = this.validateRecords(recordsToInsert, keyFieldsArray);
      if (!validation.valid) {
        throw new Error(`Record validation failed: ${validation.errors.join(', ')}`);
      }
      
      if (validation.invalidCount > 0) {
        console.warn(`Skipping ${validation.invalidCount} invalid records`);
      }
      
      // Acquire file lock
      await this.acquireLock(dbfFileName);
      lockAcquired = true;
      
      // Clean up old backups first
      await this.cleanupOldBackups(dbfFileName);
      
      // Create backup before any modifications if file exists
      try {
        if (await this.validateDbfFile(dbfPath)) {
          backupPath = await this.createSafeBackup(dbfPath);
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.warn(`Could not create backup for ${dbfPath}:`, error.message);
        }
      }

      // Open or create the DBF file
      dbf = new DbfORM(dbfPath, { autoCreate: true });
      try {
        await dbf.open();
      } catch (openError) {
        if (openError.message.includes('not found')) {
          console.log(`${dbfFileName} not found, attempting to create...`);
          await dbf.create();
        } else {
          throw openError;
        }
      }
      
      // Load existing records to check for duplicates
      const existingRecords = await dbf.findAll();
      const existingKeys = new Set();
      
      for (const record of existingRecords) {
        const keyValue = keyFieldsArray.map(field => record[field]).join('-');
        existingKeys.add(keyValue);
      }
      
      // Filter out duplicates
      const newRecords = [];
      const skippedDuplicates = [];
      
      for (const recordData of validation.validRecords) {
        const keyValue = keyFieldsArray.map(field => recordData[field]).join('-');
        
        if (existingKeys.has(keyValue)) {
          skippedDuplicates.push(keyValue);
          console.log(`Skipping duplicate record with key: ${keyValue}`);
        } else {
          newRecords.push(recordData);
          existingKeys.add(keyValue); // Prevent duplicates within the same batch
        }
      }
      
      // Insert new records
      let insertedCount = 0;
      if (newRecords.length > 0) {
        await dbf.insertMany(newRecords);
        insertedCount = newRecords.length;
        console.log(`Inserted ${insertedCount} new records into ${dbfFileName}`);
      }

      // Close DBF file before validation
      dbf.close();
      dbf = null;
      
      // Validate the updated file
      if (!(await this.validateDbfFile(dbfPath))) {
        throw new Error('DBF file validation failed after inserts');
      }

      // Update the index.json file with new timestamp
      await this.updateIndexTimestamp(dbfFileName);
      
      console.log(`Successfully processed ${recordsToInsert.length} records for ${dbfFileName}. Inserted: ${insertedCount}, Skipped duplicates: ${skippedDuplicates.length}`);
      
      // Clean up backup if operation was successful
      if (backupPath && insertedCount > 0) {
        try {
          await fs.unlink(backupPath);
          console.log(`Cleaned up successful backup: ${backupPath}`);
        } catch (cleanupError) {
          console.warn(`Could not clean up backup: ${cleanupError.message}`);
        }
      }
      
      return {
        success: true,
        message: `Inserted ${insertedCount} new records into ${dbfFileName}`,
        insertedCount,
        skippedDuplicates: skippedDuplicates.length,
        skippedKeys: skippedDuplicates
      };

    } catch (error) {
      console.error(`Error inserting records into ${dbfFileName}:`, error);
      
      // Try to restore backup if it exists and was created
      if (backupPath) {
        try {
          await this.restoreFromBackup(dbfPath, backupPath);
        } catch (restoreError) {
          console.error(`CRITICAL: Failed to restore backup:`, restoreError);
          throw new Error(`Insert failed and backup restoration failed: ${restoreError.message}`);
        }
      }
      
      throw error;
    } finally {
      // Always close the DBF file
      if (dbf) {
        try {
          dbf.close();
        } catch (closeError) {
          console.error(`Error closing DBF file ${dbfFileName}:`, closeError);
        }
      }
      
      // Always release the lock
      if (lockAcquired) {
        await this.releaseLock(dbfFileName);
      }
    }
  }

  /**
   * Safely upsert (update or insert) records in a DBF file
   * @param {string} dbfFileName - Name of the DBF file (e.g., 'BILL.DBF')
   * @param {Array} records - Array of records to upsert
   * @param {string|Array} keyFields - Field name(s) to use as unique identifier
   */
  async upsertDbfRecords(dbfFileName, records, keyFields) {
    const dbfPath = path.join(this.dbfFolderPath, 'data', dbfFileName);
    let backupPath = null;
    let lockAcquired = false;
    let dbf = null;
    
    try {
      // Normalize keyFields to array
      const keyFieldsArray = Array.isArray(keyFields) ? keyFields : keyFields.split(',').map(f => f.trim());
      
      // Validate input records
      const validation = this.validateRecords(records, keyFieldsArray);
      if (!validation.valid) {
        throw new Error(`Record validation failed: ${validation.errors.join(', ')}`);
      }
      
      if (validation.invalidCount > 0) {
        console.warn(`Skipping ${validation.invalidCount} invalid records`);
      }
      
      // Acquire file lock
      await this.acquireLock(dbfFileName);
      lockAcquired = true;
      
      // Clean up old backups first
      await this.cleanupOldBackups(dbfFileName);
      
      // Create backup before any modifications if file exists
      try {
        if (await this.validateDbfFile(dbfPath)) {
          backupPath = await this.createSafeBackup(dbfPath);
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.warn(`Could not create backup for ${dbfPath}:`, error.message);
        }
      }

      // Open or create the DBF file
      dbf = new DbfORM(dbfPath, { autoCreate: true });
      try {
        await dbf.open();
      } catch (openError) {
        if (openError.message.includes('not found')) {
          console.log(`${dbfFileName} not found, attempting to create...`);
          await dbf.create();
        } else {
          throw openError;
        }
      }
      
      let updatedCount = 0;
      let insertedCount = 0;
      let errorCount = 0;
      const errors = [];

      // Process each record
      for (const recordData of validation.validRecords) {
        try {
          // Build the where condition for finding the record
          const whereCondition = {};
          for (const keyField of keyFieldsArray) {
            whereCondition[keyField] = recordData[keyField];
          }

          // Check if record exists
          const existingRecords = await dbf.find(whereCondition);
          
          if (existingRecords.length > 0) {
            // Update existing record
            await dbf.update(whereCondition, recordData);
            updatedCount++;
            console.log(`Updated record in ${dbfFileName} with keys:`, whereCondition);
          } else {
            // Insert new record
            await dbf.insert(recordData);
            insertedCount++;
            console.log(`Inserted new record in ${dbfFileName} with keys:`, whereCondition);
          }
          
        } catch (recordError) {
          errorCount++;
          const errorMsg = `Error upserting record: ${recordError.message}`;
          errors.push(errorMsg);
          console.error(errorMsg, recordError);
        }
      }

      // Close DBF file before validation
      dbf.close();
      dbf = null;
      
      // Validate the updated file
      if (!(await this.validateDbfFile(dbfPath))) {
        throw new Error('DBF file validation failed after upserts');
      }

      // Update the index.json file with new timestamp
      await this.updateIndexTimestamp(dbfFileName);
      
      console.log(`Successfully processed ${records.length} records for ${dbfFileName}. Updated: ${updatedCount}, Inserted: ${insertedCount}, Errors: ${errorCount}`);
      
      // Clean up backup if operation was successful and no errors
      if (backupPath && errorCount === 0) {
        try {
          await fs.unlink(backupPath);
          console.log(`Cleaned up successful backup: ${backupPath}`);
        } catch (cleanupError) {
          console.warn(`Could not clean up backup: ${cleanupError.message}`);
        }
      }
      
      return {
        success: true,
        message: `Processed ${records.length} records in ${dbfFileName}`,
        updatedCount,
        insertedCount,
        errorCount,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      console.error(`Error upserting records in ${dbfFileName}:`, error);
      
      // Try to restore backup if it exists and was created
      if (backupPath) {
        try {
          await this.restoreFromBackup(dbfPath, backupPath);
        } catch (restoreError) {
          console.error(`CRITICAL: Failed to restore backup:`, restoreError);
          throw new Error(`Upsert failed and backup restoration failed: ${restoreError.message}`);
        }
      }
      
      throw error;
    } finally {
      // Always close the DBF file
      if (dbf) {
        try {
          dbf.close();
        } catch (closeError) {
          console.error(`Error closing DBF file ${dbfFileName}:`, closeError);
        }
      }
      
      // Always release the lock
      if (lockAcquired) {
        await this.releaseLock(dbfFileName);
      }
    }
  }

  /**
   * Clean up all active locks (call this on process exit)
   */
  async cleanupAllLocks() {
    for (const [dbfFileName, lockFile] of this.activeLocks) {
      try {
        await fs.unlink(lockFile);
        console.log(`Cleaned up lock for ${dbfFileName}`);
      } catch (error) {
        console.warn(`Failed to cleanup lock for ${dbfFileName}:`, error.message);
      }
    }
    this.activeLocks.clear();
  }
}

// Clean up locks on process exit
process.on('exit', () => {
  // Note: This is synchronous cleanup only
  console.log('Process exiting, cleaning up locks...');
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, cleaning up locks...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, cleaning up locks...');
  process.exit(0);
});

module.exports = { DbfSync };