const path = require('path');
const jsonDbService = require('./jsonDbService');
const accountsService = require('./accounts.service'); // For CMPL data
// const { triggerDbfCashReceiptMerge } = require('../dbf-sync/cashReceiptSyncService'); // Placeholder

const RECEIPTS_DB_PATH = path.join(__dirname, '..', 'db', 'cash-receipts.json');
const CASH_JSON_PATH = process.env.DBF_FOLDER_PATH ? path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'CASH.json') : path.join(__dirname, '..', '..', 'DBF_FALLBACK_DATA', 'CASH.json');

// Placeholder for DBF merge logic
async function triggerDbfCashReceiptMerge(receiptData) {
  console.log(`[CashReceiptsService] Placeholder: Triggering DBF merge for cash receipt: Series ${receiptData.series}, No ${receiptData.receiptNo}`);
  // Example: await require('../dbf-sync/cashReceiptSyncService').syncToDbf(receiptData);
  return true;
}

// Helper to convert amount to words (simplified version from orcusRoutes.js)
function convertAmountToWords(amount) {
  const oneToTwenty = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const scales = ['', 'Thousand', 'Lakh', 'Crore'];

  function convertLessThanOneThousand(number) {
    let words;
    if (number % 100 < 20) {
      words = oneToTwenty[number % 100];
      number = Math.floor(number / 100);
    } else {
      words = oneToTwenty[number % 10];
      number = Math.floor(number / 10);
      words = tens[number % 10] + (words ? ' ' + words : '');
      number = Math.floor(number / 10);
    }
    if (number === 0) return words;
    return oneToTwenty[number] + ' Hundred' + (words ? ' ' + words : '');
  }
  if (amount === 0) return 'Zero Only';
  let num = Math.floor(amount); // Integer part
  let decimalPart = Math.round((amount - num) * 100); // Decimal part

  let words = '';
  for (let i = 0; num > 0; i++) {
    if (num % 1000 !== 0) {
      words = convertLessThanOneThousand(num % 1000) + ' ' + scales[i] + (words ? ' ' + words : '');
    }
    num = Math.floor(num / 1000);
  }
  words = words.trim();
  if (words === '') words = 'Zero';


  let result = `Rupees ${words}`;
  if (decimalPart > 0) {
    let decimalWords = '';
    if (decimalPart % 100 < 20) {
        decimalWords = oneToTwenty[decimalPart % 100];
    } else {
        decimalWords = oneToTwenty[decimalPart % 10];
        decimalPart = Math.floor(decimalPart / 10);
        decimalWords = tens[decimalPart % 10] + (decimalWords ? ' ' + decimalWords : '');
    }
    result += ` and ${decimalWords} Paise`;
  }
  return result + ' Only';
}


async function getLocalCashReceipts() {
  const receipts = await jsonDbService.readJsonFile(RECEIPTS_DB_PATH);
  return receipts || [];
}

async function getLocalCashReceiptById(receiptNo, series) {
  const receipts = await getLocalCashReceipts();
  const upperSeries = series?.toUpperCase();
  return receipts.find(r => String(r.receiptNo) === String(receiptNo) && r.series?.toUpperCase() === upperSeries);
}

async function addLocalCashReceipt(receiptData) {
  let receipts = await getLocalCashReceipts();

  if (!receiptData.series || !receiptData.receiptNo) {
    throw new Error('ValidationError: Receipt series and number are required.');
  }
  const series = receiptData.series.toUpperCase();
  const receiptNo = String(receiptData.receiptNo);

  if (receipts.some(r => r.series?.toUpperCase() === series && String(r.receiptNo) === receiptNo)) {
    throw new Error(`DuplicateError: Cash receipt with series '${series}' and number '${receiptNo}' already exists.`);
  }

  // Note: Unlike invoices, cash receipts in the old system didn't seem to have a separate internal 'id'.
  // They were identified by receiptNo (and series). We'll maintain this.
  const newReceipt = {
    ...receiptData,
    series: series,
    receiptNo: receiptNo,
    createdAt: new Date().toISOString(),
  };

  receipts.push(newReceipt);
  const success = await jsonDbService.writeJsonFile(RECEIPTS_DB_PATH, receipts);

  if (success) {
    await triggerDbfCashReceiptMerge(newReceipt);
    return newReceipt;
  }
  return null;
}

async function updateLocalCashReceipt(receiptNoParam, seriesParam, receiptData) {
  let receipts = await getLocalCashReceipts();
  const sParam = seriesParam?.toUpperCase();
  const rNoParam = String(receiptNoParam);

  const receiptIndex = receipts.findIndex(r => String(r.receiptNo) === rNoParam && r.series?.toUpperCase() === sParam);

  if (receiptIndex === -1) {
    return null; // Receipt not found
  }

  // If series or receiptNo are being changed, check for duplicates
  const newSeries = receiptData.series ? receiptData.series.toUpperCase() : receipts[receiptIndex].series.toUpperCase();
  const newReceiptNo = receiptData.receiptNo ? String(receiptData.receiptNo) : String(receipts[receiptIndex].receiptNo);

  if ((receiptData.series || receiptData.receiptNo) &&
      (newSeries !== receipts[receiptIndex].series.toUpperCase() || newReceiptNo !== String(receipts[receiptIndex].receiptNo))) {
    if (receipts.some((r, idx) =>
        idx !== receiptIndex &&
        r.series?.toUpperCase() === newSeries &&
        String(r.receiptNo) === newReceiptNo
    )) {
      throw new Error(`DuplicateError: Another cash receipt with series '${newSeries}' and number '${newReceiptNo}' already exists.`);
    }
  }

  receipts[receiptIndex] = {
    ...receipts[receiptIndex],
    ...receiptData,
    series: newSeries,
    receiptNo: newReceiptNo,
    lastUpdated: new Date().toISOString(),
  };

  const success = await jsonDbService.writeJsonFile(RECEIPTS_DB_PATH, receipts);
  if (success) {
    await triggerDbfCashReceiptMerge(receipts[receiptIndex]);
    return receipts[receiptIndex];
  }
  return null;
}

async function getNextCashReceiptIdentifiers() {
  const localReceipts = await getLocalCashReceipts();
  const cashDbfRaw = await jsonDbService.readJsonFile(CASH_JSON_PATH);
  const cashDbfData = Array.isArray(cashDbfRaw) ? cashDbfRaw : [];

  // Calculate next purely local receipt number (max of existing local ones, ignoring series)
  // This might not be what's needed if frontend always expects series-based next numbers.
  // The old /slink/cashReceiptId returned a single 'nextReceiptNo'.
  const maxLocalOverallReceiptNo = localReceipts.reduce((max, r) => Math.max(max, parseInt(r.receiptNo || 0)), 0);
  const nextLocalOverallReceiptNo = maxLocalOverallReceiptNo + 1;


  const seriesMap = {};

  // Process DBF CASH.json entries (VR starting with "CR" for Cash Receipt)
  cashDbfData.forEach(entry => {
    if (entry.VR && entry.VR.substring(0, 2).toUpperCase() === "CR" && !entry._deleted) {
      const series = entry.SERIES?.toUpperCase();
      const receiptNumber = Number(entry.R_NO); // R_NO is likely the receipt number in DBF
      if (series && !isNaN(receiptNumber)) {
        seriesMap[series] = Math.max(seriesMap[series] || 0, receiptNumber);
      }
    }
  });

  // Process local cash-receipts.json
  localReceipts.forEach(entry => {
    const series = entry.series?.toUpperCase();
    const receiptNumber = Number(entry.receiptNo);
    if (series && !isNaN(receiptNumber)) {
      seriesMap[series] = Math.max(seriesMap[series] || 0, receiptNumber);
    }
  });

  const nextSeriesReceiptNo = {};
  for (const series in seriesMap) {
    nextSeriesReceiptNo[series] = seriesMap[series] + 1;
  }

  return {
    nextLocalReceiptNo: nextLocalOverallReceiptNo.toString(), // For compatibility if a non-series specific next ID is needed
    nextSeriesReceiptNo,
  };
}

async function getCashReceiptPrintData(receiptNo, series) {
  const receipt = await getLocalCashReceiptById(receiptNo, series);
  if (!receipt) {
    throw new Error('CashReceiptNotFound: Cash receipt not found.');
  }

  const allCmplRaw = await accountsService.getRawCmplJsonData();
  const partyDetails = allCmplRaw.find(c => c.C_CODE === receipt.party);

  const amountInWords = convertAmountToWords(parseFloat(receipt.amount || 0));

  return {
    // Structure this based on what the print template for cash receipts expects
    // This is a simplified version based on orcusRoutes /print logic for receipts
    receiptNo: receipt.receiptNo,
    series: receipt.series,
    date: receipt.date, // Assuming date is already in a good format or format it here
    partyCode: receipt.party,
    partyName: partyDetails?.C_NAME || 'N/A',
    partyAddress: partyDetails?.C_ADD1 || partyDetails?.C_ADD2 || '',
    partyMobile: partyDetails?.C_MOBILE || '',
    amount: parseFloat(receipt.amount || 0).toFixed(2),
    discount: parseFloat(receipt.discount || 0).toFixed(2),
    narration: receipt.narration || '',
    amountInWords: amountInWords,
    // Add other fields from receipt or partyDetails as needed by the print format
  };
}

module.exports = {
  getLocalCashReceipts,
  getLocalCashReceiptById,
  addLocalCashReceipt,
  updateLocalCashReceipt,
  getNextCashReceiptIdentifiers,
  getCashReceiptPrintData,
  triggerDbfCashReceiptMerge, // Exporting placeholder
};
