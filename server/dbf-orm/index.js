const fs = require('fs').promises;
const path = require('path');
const dbffile = require('./dbffile');

class DbfORM {
  constructor(dbfPath, options = {}) {
    this.dbfPath = dbfPath;
    this.options = {
      autoCreate: false,
      encoding: 'utf8',
      includeDeletedRecords: false,
      readMode: 'strict',
      ...options
    };
    this.dbf = null;
    this.fieldDescriptors = [];
  }

  /**
   * Define the schema for the DBF file
   * @param {Array} fieldDescriptors - Array of field descriptors
   */
  defineFields(fieldDescriptors) {
    this.fieldDescriptors = fieldDescriptors;
    return this;
  }

  /**
   * Ensure the DBF file is open, opening it if needed
   */
  async ensureOpen() {
    if (!this.dbf) {
      await this.open();
    }
    return this;
  }

  /**
   * Open an existing DBF file, or create it if autoCreate is true
   */
  async open() {
    try {
      this.dbf = await dbffile.DBFFile.open(this.dbfPath, {
        readMode: this.options.readMode
      });
      return this;
    } catch (error) {
      if (error.code === 'ENOENT' && this.options.autoCreate) {
        return this.create(this.dbfPath);
      }
      throw error;
    }
  }

  /**
   * Create a new DBF file
   * @param {string} filePath - Path to create the file
   */
  async create(filePath = this.dbfPath) {
    if (!this.fieldDescriptors || this.fieldDescriptors.length === 0) {
      throw new Error('Field descriptors must be defined before creating a DBF file');
    }

    this.dbf = await dbffile.DBFFile.create(filePath, this.fieldDescriptors);
    return this;
  }

  /**
   * Close the DBF file
   */
  close() {
    if (this.dbf) {
      this.dbf.close();
      this.dbf = null;
    }
    return this;
  }

  /**
   * Get all records from the DBF file
   * @returns {Array} All records
   */
  async findAll() {
    await this.ensureOpen();
    return this.dbf.readRecords(this.options.includeDeletedRecords);
  }

  /**
   * Find records matching a filter function
   * @param {Function} filterFn - Filter function
   * @returns {Array} Filtered records
   */
  async find(filterFn) {
    const records = await this.findAll();
    return records.filter(filterFn);
  }

  /**
   * Find records where field values match criteria
   * @param {Object} criteria - Field criteria to match
   * @returns {Array} Matching records
   */
  async findWhere(criteria) {
    return this.find(record => {
      for (const [key, value] of Object.entries(criteria)) {
        if (record[key] !== value) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Find the first record matching a filter function
   * @param {Function} filterFn - Filter function
   * @returns {Object} First matching record
   */
  async findOne(filterFn) {
    const records = await this.findAll();
    return records.find(filterFn);
  }

  /**
   * Find the first record where field values match criteria
   * @param {Object} criteria - Field criteria to match
   * @returns {Object} First matching record
   */
  async findOneWhere(criteria) {
    return this.findOne(record => {
      for (const [key, value] of Object.entries(criteria)) {
        if (record[key] !== value) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Insert a single record
   * @param {Object} record - Record to insert
   */
  async insert(record) {
    await this.ensureOpen();
    await this.dbf.appendRecord(record);
    return this;
  }

  /**
   * Insert multiple records
   * @param {Array} records - Records to insert
   */
  async insertMany(records) {
    await this.ensureOpen();
    await this.dbf.appendRecords(records);
    return this;
  }

  /**
   * Get information about the DBF file
   * @returns {Object} DBF file information
   */
  getInfo() {
    if (!this.dbf) {
      throw new Error('DBF file not open');
    }
    return {
      path: this.dbfPath,
      recordCount: this.dbf.recordCount,
      headerLength: this.dbf.headerLength,
      recordLength: this.dbf.recordLength,
      ...this.dbf.header
    };
  }

  /**
   * Get field descriptors
   * @returns {Array} Field descriptors
   */
  getFields() {
    if (!this.dbf) {
      return this.fieldDescriptors;
    }
    return this.dbf.fields;
  }

  /**
   * Check if a field exists
   * @param {string} fieldName - Field name to check
   * @returns {boolean} Whether the field exists
   */
  hasField(fieldName) {
    const fields = this.getFields();
    return fields.some(field => field.name === fieldName);
  }

  /**
   * Export DBF contents to JSON
   * @param {string} outputPath - Optional path to save JSON file
   * @returns {Array|undefined} Records as JSON if no outputPath is provided
   */
  async toJSON(outputPath) {
    const records = await this.findAll();
    
    // If no output path, return the JSON data
    if (!outputPath) {
      return records;
    }
    
    // Write to file
    await fs.writeFile(outputPath, JSON.stringify(records, null, 2));
    return this;
  }

  /**
   * Append records from JSON
   * @param {Array|string} jsonData - JSON data or path to JSON file
   * @param {Object} options - Options for importing
   */
  async appendFromJSON(jsonData, options = {}) {
    let data = jsonData;
    
    // If jsonData is a string, treat it as a file path
    if (typeof jsonData === 'string') {
      const content = await fs.readFile(jsonData, 'utf8');
      data = JSON.parse(content);
    }
    
    if (!Array.isArray(data)) {
      throw new Error('JSON data must be an array of records');
    }
    
    await this.insertMany(data);
    return this;
  }

  /**
   * Check if the file is locked by another process
   * @returns {boolean} Whether the file is locked
   */
  async isLocked() {
    try {
      // Try to open the file for writing to see if it's locked
      const handle = await fs.open(this.dbfPath, 'r+');
      await handle.close();
      return false;
    } catch (error) {
      if (error.code === 'EBUSY') {
        return true;
      }
      throw error;
    }
  }
}

module.exports = { DbfORM }; 