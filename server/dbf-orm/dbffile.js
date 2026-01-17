const fs = require('fs').promises;
const path = require('path');

// DBF file header constants
const DBF_HEADER_SIZE = 32;
const FIELD_DESCRIPTOR_SIZE = 32;
const FIELD_TERMINATOR = 0x0D;
const FILE_TERMINATOR = 0x1A;

// DBF field types
const FIELD_TYPES = {
  C: 'Character',
  N: 'Numeric',
  F: 'Float',
  L: 'Logical',
  D: 'Date',
  '0': 'Null Flag',
  M: 'Memo',
  B: 'Binary',
  G: 'General',
  P: 'Picture',
  Y: 'Currency',
  T: 'DateTime',
  I: 'Integer',
  V: 'Variable',
  X: 'Variant'
};

class DBFFile {
  constructor() {
    this.fields = [];
    this.header = null;
    this.recordCount = 0;
    this.headerLength = 0;
    this.recordLength = 0;
    this.fileHandle = null;
  }

  /**
   * Open a DBF file
   * @param {string} filePath - Path to the DBF file
   * @param {Object} options - Options for opening the file
   * @returns {DBFFile} DBF file instance
   */
  static async open(filePath, options = {}) {
    const dbf = new DBFFile();
    await dbf._open(filePath, options);
    return dbf;
  }

  /**
   * Internal method to open a DBF file
   * @param {string} filePath - Path to the DBF file
   * @param {Object} options - Options for opening the file
   */
  async _open(filePath, options = {}) {
    try {
      this.filePath = filePath;
      this.fileHandle = await fs.open(filePath, 'r+');
      
      // Read the header
      const headerBuffer = Buffer.alloc(DBF_HEADER_SIZE);
      await this.fileHandle.read(headerBuffer, 0, DBF_HEADER_SIZE, 0);
      
      // Parse header information
      this.header = {
        version: headerBuffer[0],
        lastUpdated: {
          year: headerBuffer[1] + 1900,
          month: headerBuffer[2],
          day: headerBuffer[3]
        },
        recordCount: headerBuffer.readUInt32LE(4),
        headerLength: headerBuffer.readUInt16LE(8),
        recordLength: headerBuffer.readUInt16LE(10)
      };

      this.recordCount = this.header.recordCount;
      this.headerLength = this.header.headerLength;
      this.recordLength = this.header.recordLength;
      
      // Read field descriptors
      await this._readFieldDescriptors();
    } catch (error) {
      if (this.fileHandle) {
        await this.fileHandle.close();
        this.fileHandle = null;
      }
      throw error;
    }
  }

  /**
   * Read field descriptors from the DBF file
   */
  async _readFieldDescriptors() {
    const fieldCount = Math.floor((this.headerLength - DBF_HEADER_SIZE - 1) / FIELD_DESCRIPTOR_SIZE);
    const fieldDescriptorsBuffer = Buffer.alloc(fieldCount * FIELD_DESCRIPTOR_SIZE);
    
    await this.fileHandle.read(fieldDescriptorsBuffer, 0, fieldCount * FIELD_DESCRIPTOR_SIZE, DBF_HEADER_SIZE);
    
    this.fields = [];
    
    for (let i = 0; i < fieldCount; i++) {
      const offset = i * FIELD_DESCRIPTOR_SIZE;
      const nameBuffer = fieldDescriptorsBuffer.slice(offset, offset + 11);
      let name = '';
      
      for (let j = 0; j < 11; j++) {
        if (nameBuffer[j] === 0) break;
        name += String.fromCharCode(nameBuffer[j]);
      }
      
      const type = String.fromCharCode(fieldDescriptorsBuffer[offset + 11]);
      const fieldLength = fieldDescriptorsBuffer[offset + 16];
      const decimalPlaces = fieldDescriptorsBuffer[offset + 17];
      
      this.fields.push({
        name: name.trim(),
        type,
        size: fieldLength,
        decimalPlaces
      });
    }
  }

  /**
   * Create a new DBF file
   * @param {string} filePath - Path to create the DBF file
   * @param {Array} fields - Field descriptors
   * @returns {DBFFile} DBF file instance
   */
  static async create(filePath, fields) {
    const dbf = new DBFFile();
    await dbf._create(filePath, fields);
    return dbf;
  }

  /**
   * Internal method to create a new DBF file
   * @param {string} filePath - Path to create the DBF file
   * @param {Array} fields - Field descriptors
   */
  async _create(filePath, fields) {
    try {
      this.filePath = filePath;
      this.fields = fields.map(field => ({
        name: field.name.toUpperCase(),
        type: field.type,
        size: field.size,
        decimalPlaces: field.decimalPlaces || 0
      }));
      
      // Calculate header and record lengths
      this.headerLength = DBF_HEADER_SIZE + (fields.length * FIELD_DESCRIPTOR_SIZE) + 1;
      this.recordLength = this._calculateRecordLength();
      this.recordCount = 0;
      
      // Initialize the header
      const now = new Date();
      this.header = {
        version: 0x03, // dBase III without memo
        lastUpdated: {
          year: now.getFullYear() - 1900,
          month: now.getMonth() + 1,
          day: now.getDate()
        },
        recordCount: 0,
        headerLength: this.headerLength,
        recordLength: this.recordLength
      };
      
      // Create and write the header
      await this._writeHeader();
      
      // Open the file for reading and writing
      this.fileHandle = await fs.open(filePath, 'r+');
    } catch (error) {
      if (this.fileHandle) {
        await this.fileHandle.close();
        this.fileHandle = null;
      }
      throw error;
    }
  }

  /**
   * Calculate the record length based on field definitions
   * @returns {number} Record length
   */
  _calculateRecordLength() {
    // First byte is the deletion flag
    let length = 1;
    
    for (const field of this.fields) {
      length += field.size;
    }
    
    return length;
  }

  /**
   * Write the DBF header to the file
   */
  async _writeHeader() {
    // Create header buffer
    const headerBuffer = Buffer.alloc(this.headerLength);
    
    // Write header information
    headerBuffer[0] = this.header.version;
    headerBuffer[1] = this.header.lastUpdated.year;
    headerBuffer[2] = this.header.lastUpdated.month;
    headerBuffer[3] = this.header.lastUpdated.day;
    headerBuffer.writeUInt32LE(this.recordCount, 4);
    headerBuffer.writeUInt16LE(this.headerLength, 8);
    headerBuffer.writeUInt16LE(this.recordLength, 10);
    
    // Write field descriptors
    let offset = DBF_HEADER_SIZE;
    
    for (const field of this.fields) {
      // Write field name (padded with zeros)
      for (let i = 0; i < 11; i++) {
        if (i < field.name.length) {
          headerBuffer[offset + i] = field.name.charCodeAt(i);
        } else {
          headerBuffer[offset + i] = 0;
        }
      }
      
      // Write field type, length, and decimal places
      headerBuffer[offset + 11] = field.type.charCodeAt(0);
      headerBuffer[offset + 16] = field.size;
      headerBuffer[offset + 17] = field.decimalPlaces;
      
      offset += FIELD_DESCRIPTOR_SIZE;
    }
    
    // Write field descriptor terminator
    headerBuffer[offset] = FIELD_TERMINATOR;
    
    // Create or overwrite the file with the header
    await fs.writeFile(this.filePath, headerBuffer);
    
    // Add a file terminator byte
    const terminatorBuffer = Buffer.alloc(1);
    terminatorBuffer[0] = FILE_TERMINATOR;
    await fs.appendFile(this.filePath, terminatorBuffer);
  }

  /**
   * Close the DBF file
   */
  async close() {
    if (this.fileHandle) {
      await this.fileHandle.close();
      this.fileHandle = null;
    }
  }

  /**
   * Read all records from the DBF file
   * @param {boolean} includeDeleted - Whether to include deleted records
   * @param {number} limit - Maximum number of records to read (null for all)
   * @param {number} offset - Number of records to skip
   * @returns {Array} Records from the DBF file
   */
  async readRecords(includeDeleted = false, limit = null, offset = 0) {
    if (!this.fileHandle) {
      throw new Error('DBF file not open');
    }
    
    const records = [];
    const recordBuffer = Buffer.alloc(this.recordLength);
    
    let start = offset;
    if (start < 0) start = 0;
    
    let end = this.recordCount;
    if (limit !== null && limit > 0) {
      end = Math.min(start + limit, this.recordCount);
    }

    for (let i = start; i < end; i++) {
      const position = this.headerLength + (i * this.recordLength);
      await this.fileHandle.read(recordBuffer, 0, this.recordLength, position);
      
      // Check if the record is deleted
      const isDeleted = recordBuffer[0] === 0x2A; // '*' character
      
      if (isDeleted && !includeDeleted) {
        continue;
      }
      
      const record = {};
      let offset = 1; // Skip deletion flag
      
      for (const field of this.fields) {
        const fieldValue = this._parseFieldValue(recordBuffer.slice(offset, offset + field.size), field);
        record[field.name] = fieldValue;
        offset += field.size;
      }
      
      record._deleted = isDeleted;
      records.push(record);
    }
    
    return records;
  }

  /**
   * Parse a field value from the buffer
   * @param {Buffer} buffer - Buffer containing the field value
   * @param {Object} field - Field descriptor
   * @returns {*} Parsed field value
   */
  _parseFieldValue(buffer, field) {
    const valueString = buffer.toString('utf8').trim();
    
    switch (field.type) {
      case 'C': // Character
        return valueString;
        
      case 'N': // Numeric
      case 'F': // Float
        if (valueString === '') {
          return null;
        }
        return field.decimalPlaces > 0 ? parseFloat(valueString) : parseInt(valueString, 10);
        
      case 'L': // Logical
        if (['Y', 'y', 'T', 't'].includes(valueString)) {
          return true;
        } else if (['N', 'n', 'F', 'f'].includes(valueString)) {
          return false;
        }
        return null;
        
      case 'D': // Date
        if (valueString.length !== 8 || valueString === '        ') {
          return null;
        }
        const year = parseInt(valueString.substring(0, 4), 10);
        const month = parseInt(valueString.substring(4, 6), 10) - 1; // JavaScript months are 0-indexed
        const day = parseInt(valueString.substring(6, 8), 10);
        return new Date(year, month, day);
        
      case '0': // Null Flag
        return buffer;
        
      default:
        return valueString;
    }
  }

  /**
   * Append a single record to the DBF file
   * @param {Object} record - Record to append
   */
  async appendRecord(record) {
    if (!this.fileHandle) {
      throw new Error('DBF file not open');
    }
    
    const recordBuffer = this._recordToBuffer(record);
    
    // Seek to just before the file terminator
    const position = this.headerLength + (this.recordCount * this.recordLength);
    
    // Write the record
    await this.fileHandle.write(recordBuffer, 0, this.recordLength, position);
    
    // Increment record count
    this.recordCount++;
    
    // Update the header with the new record count
    const headerBuffer = Buffer.alloc(4);
    headerBuffer.writeUInt32LE(this.recordCount, 0);
    await this.fileHandle.write(headerBuffer, 0, 4, 4);
    
    // Update the file terminator position
    const terminatorBuffer = Buffer.alloc(1);
    terminatorBuffer[0] = FILE_TERMINATOR;
    await this.fileHandle.write(terminatorBuffer, 0, 1, position + this.recordLength);
  }

  /**
   * Append multiple records to the DBF file
   * @param {Array} records - Records to append
   */
  async appendRecords(records) {
    for (const record of records) {
      await this.appendRecord(record);
    }
  }

  /**
   * Convert a record object to a buffer
   * @param {Object} record - Record to convert
   * @returns {Buffer} Record buffer
   */
  _recordToBuffer(record) {
    const buffer = Buffer.alloc(this.recordLength);
    
    // Set deletion flag (0x20 not deleted, 0x2A deleted)
    buffer[0] = record && record._deleted ? 0x2A : 0x20;
    
    let offset = 1;
    
    for (const field of this.fields) {
      const fieldValue = record[field.name];
      this._writeFieldValue(buffer, offset, field, fieldValue);
      offset += field.size;
    }
    
    return buffer;
  }

  /**
   * Mark a record as deleted in-place by index (0-based)
   * @param {number} index
   */
  async markRecordDeleted(index) {
    if (!this.fileHandle) {
      throw new Error('DBF file not open');
    }
    const position = this.headerLength + (index * this.recordLength);
    const flagBuffer = Buffer.alloc(1);
    flagBuffer[0] = 0x2A; // Deleted flag
    await this.fileHandle.write(flagBuffer, 0, 1, position);
  }

  /**
   * Write a field value to a buffer
   * @param {Buffer} buffer - Buffer to write to
   * @param {number} offset - Offset to write at
   * @param {Object} field - Field descriptor
   * @param {*} value - Value to write
   */
  _writeFieldValue(buffer, offset, field, value) {
    if (value === null || value === undefined || value === '') {
      // Fill with spaces or zeros depending on field type
      if (field.type === 'N' || field.type === 'F') {
        buffer.fill(' ', offset, offset + field.size);
      } else if (field.type === '0') {
        // For null flags field, just keep the passed buffer
        if (Buffer.isBuffer(value)) {
          value.copy(buffer, offset, 0, Math.min(value.length, field.size));
        } else {
          buffer.fill(0, offset, offset + field.size);
        }
      } else {
        buffer.fill(' ', offset, offset + field.size);
      }
      return;
    }
    
    let strValue;
    
    switch (field.type) {
      case 'C': // Character
        strValue = value.toString();
        strValue = strValue.substring(0, field.size);
        buffer.write(strValue, offset, 'utf8');
        // Pad with spaces
        if (strValue.length < field.size) {
          buffer.fill(' ', offset + strValue.length, offset + field.size);
        }
        break;
        
      case 'N': // Numeric
      case 'F': // Float
        if (field.decimalPlaces > 0) {
          strValue = parseFloat(value).toFixed(field.decimalPlaces);
        } else {
          strValue = parseInt(value, 10).toString();
        }
        // Right-align and pad with spaces
        if (strValue.length <= field.size) {
          buffer.fill(' ', offset, offset + field.size - strValue.length);
          buffer.write(strValue, offset + field.size - strValue.length, 'utf8');
        } else {
          buffer.write(strValue.substring(0, field.size), offset, 'utf8');
        }
        break;
        
      case 'L': // Logical
        buffer[offset] = value ? 'T'.charCodeAt(0) : 'F'.charCodeAt(0);
        break;
        
      case 'D': // Date
        const date = value instanceof Date ? value : new Date(value);
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        buffer.write(`${year}${month}${day}`, offset, 'utf8');
        break;
        
      case '0': // Null Flag
        if (Buffer.isBuffer(value)) {
          value.copy(buffer, offset, 0, Math.min(value.length, field.size));
        } else {
          buffer.fill(0, offset, offset + field.size);
        }
        break;
        
      default:
        strValue = value.toString();
        strValue = strValue.substring(0, field.size);
        buffer.write(strValue, offset, 'utf8');
        if (strValue.length < field.size) {
          buffer.fill(' ', offset + strValue.length, offset + field.size);
        }
    }
  }
}

module.exports = { DBFFile }; 
