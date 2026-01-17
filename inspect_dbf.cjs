const { DBFFile } = require('./server/dbf-orm/dbffile');
const path = require('path');

async function inspect() {
    try {
        const dbfPath = 'c:\\Users\\User\\Music\\webapp\\d01-2324\\data\\CASH.DBF';
        console.log('Opening:', dbfPath);
        const dbf = await DBFFile.open(dbfPath);
        console.log('Fields:', dbf.fields.map(f => f.name));
        
        // Read last few records to see VR format
        const recordCount = dbf.recordCount;
        console.log('Total records:', recordCount);
        
        const start = Math.max(0, recordCount - 20);
        const records = await dbf.readRecords(false, 20, start);
        records.forEach(r => {
            console.log(`VR: ${r.VR}, VRNO: ${r.VRNO}`);
        });
        
    } catch (e) {
        console.error(e);
    }
}

inspect();
