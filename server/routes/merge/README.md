# DBF Sync System

This directory contains route handlers for syncing approved data to DBF files for integration with legacy systems.

## Implementation

Each route handler is responsible for:

1. Mapping JSON data from approved records to the DBF file format
2. Handling field transformations (type conversion, etc.)
3. Creating the DBF file if it doesn't exist
4. Appending new records to the DBF file

## Routes

### Account Master

- Endpoint: `/api/merge/account-master/sync`
- DBF File: `d01-2324/data/dbf/CMPL.dbf`
- Mapping: Approved account master entries are mapped to fields in CMPL.dbf

## Adding New Sync Routes

To add a new sync route:

1. Create a new file in this directory for your entity (e.g., `invoicing.js`)
2. Define the field mapping from JSON to DBF
3. Create the route handler for syncing
4. Register the route in `server/app.js`
5. Update the corresponding approved page to include the "Sync to DBF" button

## Field Mapping

Field mapping is done using a function that converts from the JSON structure to the DBF structure. For example:

```javascript
function mapToDbfFormat(record) {
  return {
    // Map fields from JSON to DBF format
    DBF_FIELD_1: record.jsonField1 || '',
    DBF_FIELD_2: record.jsonField2 || '',
    // ...
  };
}
```

## Using the DBF ORM

The DBF ORM provides methods for working with DBF files:

```javascript
// Create DBF ORM instance
const dbfOrm = new DbfORM(dbfFilePath, { 
  autoCreate: true
});

// Define fields if creating a new file
dbfOrm.defineFields(fieldDescriptors);

// Open or create the file
await dbfOrm.open();

// Insert records
await dbfOrm.insertMany(dbfRecords);

// Close the file
dbfOrm.close();
``` 