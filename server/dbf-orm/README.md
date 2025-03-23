# DBF-ORM

A fully-featured ORM for DBF files with a custom implementation of the dbffile library. This package allows for easy reading, writing, and manipulation of DBF (dBase) files in Node.js.

## Features

- Create, read, update, and delete operations for DBF files
- Field schema definition and validation
- Flexible query capabilities with filtering
- Support for special field types including _NullFlags
- Proper handling of numeric fields and other data types
- Transaction-like operations for appending records
- Optimized reading and writing performance

## Installation

### Via npm (when published)

```bash
npm install dbf-orm
```

### Via GitHub

```bash
npm install github:UdayPS-4o/dbf-orm
```

## Usage Examples

### Basic Usage

```javascript
const { DbfORM } = require('dbf-orm');

async function example() {
  // Create a new ORM instance
  const orm = new DbfORM('path/to/file.dbf', {
    autoCreate: true,
    encoding: 'utf8'
  });
  
  // Define the fields (only needed when creating a new file)
  orm.defineFields([
    { name: 'ID', type: 'N', size: 10 },
    { name: 'NAME', type: 'C', size: 50 },
    { name: 'ACTIVE', type: 'L', size: 1 }
  ]);
  
  // Open the file (creates it if it doesn't exist and autoCreate is true)
  await orm.open();
  
  // Insert a record
  await orm.insert({
    ID: 1,
    NAME: 'Example Record',
    ACTIVE: true
  });
  
  // Read all records
  const records = await orm.findAll();
  console.log(records);
  
  // Close the file
  orm.close();
}

example().catch(console.error);
```

### Advanced Queries

```javascript
const { DbfORM } = require('dbf-orm');

async function advancedExample() {
  const orm = new DbfORM('path/to/file.dbf');
  await orm.open();
  
  // Find records by criteria
  const activeUsers = await orm.findWhere({ ACTIVE: true });
  
  // Find records using a custom filter function
  const premiumUsers = await orm.find(record => 
    record.ACTIVE && record.SUBSCRIPTION === 'PREMIUM'
  );
  
  // Find a single record
  const user = await orm.findOneWhere({ ID: 100 });
  
  orm.close();
}
```

### Working with Special Fields

```javascript
const { DbfORM } = require('dbf-orm');

async function specialFieldsExample() {
  const orm = new DbfORM('path/to/file.dbf');
  
  // Define fields including special _NullFlags field
  orm.defineFields([
    { name: 'ID', type: 'N', size: 10 },
    { name: 'AMOUNT', type: 'N', size: 10, decimalPlaces: 2 },
    { name: '_NullFlags', type: '0', size: 1 }
  ]);
  
  await orm.create();
  
  // Insert record with _NullFlags
  await orm.insert({
    ID: 1,
    AMOUNT: 99.99,
    _NullFlags: Buffer.alloc(1, 0)  // Create a buffer filled with zeros
  });
  
  orm.close();
}
```

### Exporting to JSON

```javascript
const { DbfORM } = require('dbf-orm');

async function exportExample() {
  const orm = new DbfORM('path/to/file.dbf');
  await orm.open();
  
  // Export to a JSON file
  await orm.toJSON('output.json');
  
  // Or get the JSON data as an object
  const jsonData = await orm.toJSON();
  console.log(JSON.stringify(jsonData, null, 2));
  
  orm.close();
}
```

## API Reference

### Constructor

```javascript
const orm = new DbfORM(dbfPath, options);
```

#### Options

- `autoCreate` (boolean): Automatically create the file if it doesn't exist (default: false)
- `encoding` (string): Character encoding for the DBF file (default: 'utf8')
- `includeDeletedRecords` (boolean): Include deleted records when reading (default: false)
- `readMode` (string): Read mode - 'strict' or 'loose' (default: 'strict')

### Methods

#### Field Definition

- `defineFields(fieldDescriptors)`: Define the schema for the DBF file

#### File Operations

- `async open()`: Open an existing DBF file, or create it if autoCreate is true
- `async create(filePath)`: Create a new DBF file
- `close()`: Close the DBF file
- `async ensureOpen()`: Ensure the DBF file is open, opening it if needed

#### Read Operations

- `async findAll()`: Get all records from the DBF file
- `async find(filterFn)`: Find records matching a filter function
- `async findWhere(criteria)`: Find records where field values match criteria
- `async findOne(filterFn)`: Find the first record matching a filter function
- `async findOneWhere(criteria)`: Find the first record where field values match criteria

#### Write Operations

- `async insert(record)`: Insert a single record
- `async insertMany(records)`: Insert multiple records

#### Utilities

- `getInfo()`: Get information about the DBF file
- `getFields()`: Get field descriptors
- `hasField(fieldName)`: Check if a field exists
- `async toJSON(outputPath)`: Export DBF contents to JSON
- `async appendFromJSON(jsonData, options)`: Append records from JSON
- `async isLocked()`: Check if the file is locked by another process

## License

MIT 