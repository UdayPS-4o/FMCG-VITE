const path = require('path');
const jsonDbService = require('./jsonDbService');
const accountsService = require('./accounts.service'); // For PMPL (product) data

const TRANSFERS_DB_PATH = path.join(__dirname, '..', 'db', 'godown.json');
const DBF_TRANSFER_JSON_PATH = process.env.DBF_FOLDER_PATH ? path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'TRANSFER.json') : path.join(__dirname, '..', '..', 'DBF_FALLBACK_DATA', 'TRANSFER.json');
const DBF_GODOWN_MASTER_JSON_PATH = process.env.DBF_FOLDER_PATH ? path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'GODOWN.json') : path.join(__dirname, '..', '..', 'DBF_FALLBACK_DATA', 'GODOWN.json'); // For godown names

// Placeholder for DBF merge logic
async function triggerDbfGodownTransferMerge(transferData) {
  console.log(`[GodownTransfersService] Placeholder: Triggering DBF merge for Godown Transfer ID: ${transferData.id}, Series: ${transferData.series}`);
  // Example: await require('../dbf-sync/godownTransferSyncService').syncToDbf(transferData);
  return true;
}

async function getLocalGodownTransfers() {
  const transfers = await jsonDbService.readJsonFile(TRANSFERS_DB_PATH);
  return transfers || [];
}

async function getLocalGodownTransferById(transferId) {
  const transfers = await getLocalGodownTransfers();
  return transfers.find(t => String(t.id) === String(transferId));
}

async function addLocalGodownTransfer(transferData) {
  let transfers = await getLocalGodownTransfers();

  if (!transferData.series || !transferData.fromGodown || !transferData.toGodown || !transferData.items || transferData.items.length === 0) {
    throw new Error('ValidationError: Series, from/to godowns, and items are required for a godown transfer.');
  }

  // ID generation for local transfers: simple increment for the 'id' field in godown.json
  // The 'billNo' or 'transferNo' associated with a series will be handled by getNextGodownTransferIdentifiers
  // and should be part of transferData if that's how it's recorded.
  // The old /slink/godownId returned nextSeries for bill numbers, and godown.json used 'id'.
  // Let's assume 'id' in godown.json is the primary local identifier.
  const maxId = transfers.reduce((max, t) => Math.max(max, parseInt(t.id || 0)), 0);
  const newId = (maxId + 1).toString();

  // If the transferData includes a specific bill number for a series, check for duplicates with that series + billNo.
  // This depends on how `godown.json` entries store their series-specific official number.
  // For now, we assume `id` is the main unique key for `godown.json` entries.
  // If `transferData.billNo` and `transferData.series` are present, a duplicate check like in invoicing might be needed.
  // For example:
  if (transferData.billNo && transferData.series) {
      const series = transferData.series.toUpperCase();
      const billNo = String(transferData.billNo);
      if (transfers.some(t => t.series?.toUpperCase() === series && String(t.billNo) === billNo)) {
          throw new Error(`DuplicateError: Godown transfer with series '${series}' and bill number '${billNo}' already exists.`);
      }
  }


  const newTransfer = {
    ...transferData,
    id: newId, // Assign the new local unique ID
    series: transferData.series.toUpperCase(),
    createdAt: new Date().toISOString(),
  };

  transfers.push(newTransfer);
  const success = await jsonDbService.writeJsonFile(TRANSFERS_DB_PATH, transfers);

  if (success) {
    await triggerDbfGodownTransferMerge(newTransfer);
    return newTransfer;
  }
  return null;
}

async function updateLocalGodownTransfer(transferId, transferData) {
  let transfers = await getLocalGodownTransfers();
  const transferIndex = transfers.findIndex(t => String(t.id) === String(transferId));

  if (transferIndex === -1) {
    return null; // Transfer not found
  }

  // If series or billNo are being changed, check for duplicates
  const currentTransfer = transfers[transferIndex];
  const newSeries = transferData.series ? transferData.series.toUpperCase() : currentTransfer.series.toUpperCase();
  const newBillNo = transferData.billNo ? String(transferData.billNo) : String(currentTransfer.billNo);

  if ((transferData.series || transferData.billNo) &&
      (newSeries !== currentTransfer.series.toUpperCase() || newBillNo !== String(currentTransfer.billNo))) {
    if (transfers.some((t, idx) =>
        idx !== transferIndex &&
        t.series?.toUpperCase() === newSeries &&
        String(t.billNo) === newBillNo
    )) {
      throw new Error(`DuplicateError: Another godown transfer with series '${newSeries}' and bill number '${newBillNo}' already exists.`);
    }
  }

  transfers[transferIndex] = {
    ...currentTransfer,
    ...transferData,
    series: newSeries, // Ensure series is uppercase if provided
    billNo: newBillNo, // Ensure billNo is string if provided
    lastUpdated: new Date().toISOString(),
  };

  const success = await jsonDbService.writeJsonFile(TRANSFERS_DB_PATH, transfers);
  if (success) {
    await triggerDbfGodownTransferMerge(transfers[transferIndex]);
    return transfers[transferIndex];
  }
  return null;
}

async function getNextGodownTransferIdentifiers() {
  const localTransfers = await getLocalGodownTransfers();
  const dbfTransferData = await jsonDbService.readJsonFile(DBF_TRANSFER_JSON_PATH) || [];

  const maxLocalId = localTransfers.reduce((max, t) => Math.max(max, parseInt(t.id || 0)), 0);
  const nextLocalId = (maxLocalId + 1).toString();

  const seriesMap = {};

  // Process DBF TRANSFER.json
  dbfTransferData.forEach(entry => {
    const series = entry.SERIES?.toUpperCase();
    const billNumber = Number(entry.BILL); // Assuming BILL is the transfer number in DBF
    if (series && !isNaN(billNumber)) {
      seriesMap[series] = Math.max(seriesMap[series] || 0, billNumber);
    }
  });

  // Process local godown.json (if it also contains series and a comparable bill/transfer number)
  localTransfers.forEach(entry => {
    const series = entry.series?.toUpperCase();
    // Assuming local godown transfers might also have a 'billNo' or similar field for series tracking
    const billNumber = Number(entry.billNo); // Or entry.transferNo, adjust if field name is different
    if (series && !isNaN(billNumber)) {
      seriesMap[series] = Math.max(seriesMap[series] || 0, billNumber);
    }
  });

  const nextSeriesBillNo = {};
  for (const series in seriesMap) {
    nextSeriesBillNo[series] = seriesMap[series] + 1;
  }

  return {
    nextLocalId, // This is the next unique ID for godown.json entries
    nextSeriesBillNo, // This is for series-specific official transfer numbers
  };
}

async function getGodownTransferPrintData(transferId) {
  const transfer = await getLocalGodownTransferById(transferId);
  if (!transfer) {
    throw new Error('GodownTransferNotFound: Godown Transfer not found.');
  }

  const allPmplRaw = await accountsService.getRawPmplJsonData();
  const godownMasterRaw = await jsonDbService.readJsonFile(DBF_GODOWN_MASTER_JSON_PATH) || [];

  const fromGodownDetails = godownMasterRaw.find(g => g.GDN_CODE === transfer.fromGodown);
  const toGodownDetails = godownMasterRaw.find(g => g.GDN_CODE === transfer.toGodown);

  const processedItems = (transfer.items || []).map((item, index) => {
    const pmplItem = allPmplRaw.find(p => p.CODE === item.code); // Assuming item.code is product code
    return {
      s_n: index + 1,
      code: item.code,
      particular: pmplItem?.PRODUCT || 'N/A',
      pack: pmplItem?.PACK || '',
      gst_percent: parseFloat(pmplItem?.GST || '0').toFixed(2), // From PMPL
      unit: item.unit, // Unit used in transfer
      quantity: item.qty,
      // Add any other PMPL details if needed for print, e.g., MULT_F for display
      multFactor: pmplItem?.MULT_F,
      unit1: pmplItem?.UNIT_1,
      unit2: pmplItem?.UNIT_2,
    };
  });

  // Mimicking structure from slink.js printGodown -> datax
  return {
    voucher: {
      number: `${transfer.series || ''} - ${transfer.billNo || transfer.id}`, // Display number
      id: transfer.id,
      date: transfer.date, // Assuming date is already formatted or format here
      transfer_from: fromGodownDetails?.GDN_NAME || transfer.fromGodown,
      transfer_to: toGodownDetails?.GDN_NAME || transfer.toGodown,
    },
    items: processedItems,
    // Add any other top-level fields if needed for the print template
  };
}

module.exports = {
  getLocalGodownTransfers,
  getLocalGodownTransferById,
  addLocalGodownTransfer,
  updateLocalGodownTransfer,
  getNextGodownTransferIdentifiers,
  getGodownTransferPrintData,
  triggerDbfGodownTransferMerge,
};
