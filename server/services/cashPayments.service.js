const path = require('path');
const jsonDbService = require('./jsonDbService');
const accountsService = require('./accounts.service'); // For CMPL data
// const { triggerDbfCashPaymentMerge } = require('../dbf-sync/cashPaymentSyncService'); // Placeholder

const PAYMENTS_DB_PATH = path.join(__dirname, '..', 'db', 'cash-payments.json');
const CASH_JSON_PATH = process.env.DBF_FOLDER_PATH ? path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'CASH.json') : path.join(__dirname, '..', '..', 'DBF_FALLBACK_DATA', 'CASH.json');

// Placeholder for DBF merge logic
async function triggerDbfCashPaymentMerge(paymentData) {
  console.log(`[CashPaymentsService] Placeholder: Triggering DBF merge for cash payment: Series ${paymentData.series}, No ${paymentData.voucherNo}`);
  // Example: await require('../dbf-sync/cashPaymentSyncService').syncToDbf(paymentData);
  return true;
}

// Re-using the amount to words function (can be moved to a shared utility later)
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

  if (amount === 0) return 'Rupees Zero Only';
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
  if (words === '') words = 'Zero'; // Handles case where amount is < 1 Rupee but > 0 Paise

  let result = `Rupees ${words}`;
  if (decimalPart > 0) {
    let decimalWords = '';
    if (decimalPart % 100 < 20) {
        decimalWords = oneToTwenty[decimalPart % 100];
    } else {
        let tempDecimal = decimalPart % 10; // Store last digit
        decimalWords = oneToTwenty[tempDecimal];
        decimalPart = Math.floor(decimalPart / 10);
        decimalWords = tens[decimalPart % 10] + (decimalWords ? ' ' + decimalWords : '');
    }
    result += ` and ${decimalWords} Paise`;
  }
  return result + ' Only';
}

async function getLocalCashPayments() {
  const payments = await jsonDbService.readJsonFile(PAYMENTS_DB_PATH);
  return payments || [];
}

async function getLocalCashPaymentById(voucherNo, series) {
  const payments = await getLocalCashPayments();
  const upperSeries = series?.toUpperCase();
  return payments.find(p => String(p.voucherNo) === String(voucherNo) && p.series?.toUpperCase() === upperSeries);
}

async function addLocalCashPayment(paymentData) {
  let payments = await getLocalCashPayments();

  if (!paymentData.series || !paymentData.voucherNo) {
    throw new Error('ValidationError: Payment series and voucher number are required.');
  }
  const series = paymentData.series.toUpperCase();
  const voucherNo = String(paymentData.voucherNo);

  if (payments.some(p => p.series?.toUpperCase() === series && String(p.voucherNo) === voucherNo)) {
    throw new Error(`DuplicateError: Cash payment with series '${series}' and voucher number '${voucherNo}' already exists.`);
  }

  const newPayment = {
    ...paymentData,
    series: series,
    voucherNo: voucherNo,
    createdAt: new Date().toISOString(),
  };

  payments.push(newPayment);
  const success = await jsonDbService.writeJsonFile(PAYMENTS_DB_PATH, payments);

  if (success) {
    await triggerDbfCashPaymentMerge(newPayment);
    return newPayment;
  }
  return null;
}

async function updateLocalCashPayment(voucherNoParam, seriesParam, paymentData) {
  let payments = await getLocalCashPayments();
  const sParam = seriesParam?.toUpperCase();
  const vNoParam = String(voucherNoParam);

  const paymentIndex = payments.findIndex(p => String(p.voucherNo) === vNoParam && p.series?.toUpperCase() === sParam);

  if (paymentIndex === -1) {
    return null; // Payment not found
  }

  const newSeries = paymentData.series ? paymentData.series.toUpperCase() : payments[paymentIndex].series.toUpperCase();
  const newVoucherNo = paymentData.voucherNo ? String(paymentData.voucherNo) : String(payments[paymentIndex].voucherNo);

  if ((paymentData.series || paymentData.voucherNo) &&
      (newSeries !== payments[paymentIndex].series.toUpperCase() || newVoucherNo !== String(payments[paymentIndex].voucherNo))) {
    if (payments.some((p, idx) =>
        idx !== paymentIndex &&
        p.series?.toUpperCase() === newSeries &&
        String(p.voucherNo) === newVoucherNo
    )) {
      throw new Error(`DuplicateError: Another cash payment with series '${newSeries}' and voucher number '${newVoucherNo}' already exists.`);
    }
  }

  payments[paymentIndex] = {
    ...payments[paymentIndex],
    ...paymentData,
    series: newSeries,
    voucherNo: newVoucherNo,
    lastUpdated: new Date().toISOString(),
  };

  const success = await jsonDbService.writeJsonFile(PAYMENTS_DB_PATH, payments);
  if (success) {
    await triggerDbfCashPaymentMerge(payments[paymentIndex]);
    return payments[paymentIndex];
  }
  return null;
}

async function getNextCashPaymentIdentifiers() {
  const localPayments = await getLocalCashPayments();
  const cashDbfRaw = await jsonDbService.readJsonFile(CASH_JSON_PATH);
  const cashDbfData = Array.isArray(cashDbfRaw) ? cashDbfRaw : [];

  const maxLocalOverallVoucherNo = localPayments.reduce((max, p) => Math.max(max, parseInt(p.voucherNo || 0)), 0);
  const nextLocalOverallVoucherNo = maxLocalOverallVoucherNo + 1;

  const seriesMap = {};

  // Process DBF CASH.json entries (VR starting with "CP" for Cash Payment)
  cashDbfData.forEach(entry => {
    if (entry.VR && entry.VR.substring(0, 2).toUpperCase() === "CP" && !entry._deleted) {
      const series = entry.SERIES?.toUpperCase();
      const voucherNumber = Number(entry.R_NO); // Assuming R_NO is used for voucher number in DBF for payments too
      if (series && !isNaN(voucherNumber)) {
        seriesMap[series] = Math.max(seriesMap[series] || 0, voucherNumber);
      }
    }
  });

  // Process local cash-payments.json
  localPayments.forEach(entry => {
    const series = entry.series?.toUpperCase();
    const voucherNumber = Number(entry.voucherNo);
    if (series && !isNaN(voucherNumber)) {
      seriesMap[series] = Math.max(seriesMap[series] || 0, voucherNumber);
    }
  });

  const nextSeriesVoucherNo = {};
  for (const series in seriesMap) {
    nextSeriesVoucherNo[series] = seriesMap[series] + 1;
  }

  return {
    nextLocalVoucherNo: nextLocalOverallVoucherNo.toString(),
    nextSeriesVoucherNo,
  };
}

async function getCashPaymentPrintData(voucherNo, series) {
  const payment = await getLocalCashPaymentById(voucherNo, series);
  if (!payment) {
    throw new Error('CashPaymentNotFound: Cash payment not found.');
  }

  const allCmplRaw = await accountsService.getRawCmplJsonData();
  const partyDetails = allCmplRaw.find(c => c.C_CODE === payment.party);
  const amountInWords = convertAmountToWords(parseFloat(payment.amount || 0));

  return {
    voucherNo: payment.voucherNo,
    series: payment.series,
    date: payment.date,
    partyCode: payment.party,
    partyName: partyDetails?.C_NAME || 'N/A',
    partyAddress: partyDetails?.C_ADD1 || partyDetails?.C_ADD2 || '',
    partyMobile: partyDetails?.C_MOBILE || '',
    amount: parseFloat(payment.amount || 0).toFixed(2),
    discount: parseFloat(payment.discount || 0).toFixed(2), // Assuming discount field exists
    narration: payment.narration || '', // Assuming narration field exists
    amountInWords: amountInWords,
  };
}

module.exports = {
  getLocalCashPayments,
  getLocalCashPaymentById,
  addLocalCashPayment,
  updateLocalCashPayment,
  getNextCashPaymentIdentifiers,
  getCashPaymentPrintData,
  triggerDbfCashPaymentMerge,
};
