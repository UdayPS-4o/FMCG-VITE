const { DBFFile } = require('./server/dbf-orm/dbffile');

async function inspect() {
    try {
        const dbfPath = 'c:\\Users\\User\\Music\\webapp\\d01-2324\\data\\CASH.DBF';
        const dbf = await DBFFile.open(dbfPath);
        const vrField = dbf.fields.find(f => f.name === 'VR');
        console.log('VR Field:', vrField);
    } catch (e) {
        console.error(e);
    }
}

inspect();
