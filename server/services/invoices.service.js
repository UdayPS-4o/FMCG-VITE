const path = require('path');
const jsonDbService = require('./jsonDbService');
const accountsService = require('./accounts.service'); // For CMPL, PMPL data
const usersService = require('./users.service'); // For user data (salesperson)
// const { triggerDbfInvoiceMerge } = require('../dbf-sync/invoiceSyncService'); // Placeholder for actual DBF sync

const INVOICES_DB_PATH = path.join(__dirname, '..', 'db', 'invoicing.json');
const BILLDTL_JSON_PATH = process.env.DBF_FOLDER_PATH ? path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'BILLDTL.json') : path.join(__dirname, '..', '..', 'DBF_FALLBACK_DATA', 'BILLDTL.json');
const BALANCE_DB_PATH = path.join(__dirname, '..', 'db', 'balance.json');


async function getLocalInvoices() {
  const invoices = await jsonDbService.readJsonFile(INVOICES_DB_PATH);
  return invoices || [];
}

async function getLocalInvoiceById(invoiceInternalId) {
  const invoices = await getLocalInvoices();
  // Ensure comparison is type-safe, as ID from params might be string
  return invoices.find(inv => String(inv.id) === String(invoiceInternalId));
}

// Placeholder for DBF merge logic
async function triggerDbfInvoiceMerge(invoiceData) {
  console.log(`[InvoiceService] Placeholder: Triggering DBF merge for invoice ID: ${invoiceData.id}, Series: ${invoiceData.series}, BillNo: ${invoiceData.billNo}`);
  // Here, you would typically call a function that handles the logic
  // currently in server/routes/merge/invoicing.js, adapting it to use invoiceData
  // For example: await require('../dbf-sync/invoiceSyncService').syncInvoiceToDbf(invoiceData);
  return true;
}

async function addLocalInvoice(invoiceData) {
  let invoices = await getLocalInvoices();

  if (!invoiceData.series || !invoiceData.billNo) {
    throw new Error('ValidationError: Invoice series and bill number are required.');
  }

  const series = invoiceData.series.toUpperCase();
  const billNo = String(invoiceData.billNo);

  if (invoices.some(inv => inv.series && inv.series.toUpperCase() === series && String(inv.billNo) === billNo)) {
    throw new Error(`DuplicateError: Invoice with series '${series}' and bill number '${billNo}' already exists.`);
  }

  const maxId = invoices.reduce((max, inv) => Math.max(max, parseInt(inv.id || 0)), 0);
  const newInternalId = maxId + 1;

  const newInvoice = {
    ...invoiceData,
    id: newInternalId.toString(), // Ensure id is string if other ids are strings
    series: series, // Ensure series is uppercase
    billNo: billNo, // Ensure billNo is string
    createdAt: new Date().toISOString(),
  };

  invoices.push(newInvoice);
  const success = await jsonDbService.writeJsonFile(INVOICES_DB_PATH, invoices);

  if (success) {
    await triggerDbfInvoiceMerge(newInvoice); // Call DBF merge placeholder
    return newInvoice;
  }
  return null;
}

async function updateLocalInvoice(invoiceInternalId, invoiceData) {
  let invoices = await getLocalInvoices();
  const invoiceIndex = invoices.findIndex(inv => String(inv.id) === String(invoiceInternalId));

  if (invoiceIndex === -1) {
    return null; // Invoice not found
  }

  // If series or billNo are being changed, check for duplicates
  const newSeries = invoiceData.series ? invoiceData.series.toUpperCase() : invoices[invoiceIndex].series;
  const newBillNo = invoiceData.billNo ? String(invoiceData.billNo) : invoices[invoiceIndex].billNo;

  if ((invoiceData.series || invoiceData.billNo) && // Only check if series or billNo is actually changing
      (newSeries !== invoices[invoiceIndex].series || newBillNo !== invoices[invoiceIndex].billNo)) {
    if (invoices.some((inv, idx) =>
        idx !== invoiceIndex &&
        inv.series && inv.series.toUpperCase() === newSeries &&
        String(inv.billNo) === newBillNo
    )) {
      throw new Error(`DuplicateError: Another invoice with series '${newSeries}' and bill number '${newBillNo}' already exists.`);
    }
  }

  invoices[invoiceIndex] = {
    ...invoices[invoiceIndex],
    ...invoiceData,
    series: newSeries, // Ensure series is uppercase
    billNo: newBillNo, // Ensure billNo is string
    lastUpdated: new Date().toISOString(),
  };

  const success = await jsonDbService.writeJsonFile(INVOICES_DB_PATH, invoices);
  if (success) {
    await triggerDbfInvoiceMerge(invoices[invoiceIndex]); // Call DBF merge placeholder
    return invoices[invoiceIndex];
  }
  return null;
}

async function getNextInvoiceIdentifiers() {
  const localInvoices = await getLocalInvoices();
  const billDtlData = await jsonDbService.readJsonFile(BILLDTL_JSON_PATH) || [];

  const maxInternalId = localInvoices.reduce((maxId, inv) => Math.max(maxId, parseInt(inv.id || 0)), 0);
  const nextInternalId = maxInternalId + 1;

  const seriesMap = {};

  // Process DBF billdtl.json
  billDtlData.forEach(entry => {
    const series = entry.SERIES?.toUpperCase();
    const billNumber = Number(entry.BILL);
    if (series && !isNaN(billNumber)) {
      if (!seriesMap[series] || billNumber > seriesMap[series]) {
        seriesMap[series] = billNumber;
      }
    }
  });

  // Process local invoicing.json
  localInvoices.forEach(entry => {
    const series = entry.series?.toUpperCase();
    const billNumber = Number(entry.billNo);
    if (series && !isNaN(billNumber)) {
      if (!seriesMap[series] || billNumber > seriesMap[series]) {
        seriesMap[series] = billNumber;
      }
    }
  });

  const nextSeriesBillNo = {};
  for (const series in seriesMap) {
    nextSeriesBillNo[series] = seriesMap[series] + 1;
  }

  return {
    nextInternalId: nextInternalId.toString(),
    nextSeriesBillNo,
  };
}

async function getInvoicePrintData(invoiceInternalId) {
  const invoice = await getLocalInvoiceById(invoiceInternalId);
  if (!invoice) {
    throw new Error('InvoiceNotFound: Invoice with specified ID not found.');
  }

  const allPmplRaw = await accountsService.getRawPmplJsonData();
  const allCmplRaw = await accountsService.getRawCmplJsonData();
  const allUsers = await usersService.getAllUsers(); // Assuming getAllUsers excludes passwords
  const balanceDataRaw = await jsonDbService.readJsonFile(BALANCE_DB_PATH);
  const balanceData = balanceDataRaw?.data || [];


  const partyDetails = allCmplRaw.find(c => c.C_CODE === invoice.party);
  const salesperson = invoice.sm ? allUsers.find(u => u.smCode === invoice.sm) : null;
  const billMadeByName = salesperson ? salesperson.name : (invoice.sm ? `SM Code: ${invoice.sm}`: 'N/A');


  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString); // Assumes dateString is parsable (e.g., ISO)
    return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
  };

  const calculateDueDate = (dateString, dueDays) => {
    if (!dueDays || !dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    date.setDate(date.getDate() + parseInt(dueDays));
    return formatDate(date.toISOString());
  };

  const countBoxesAndLooseItems = (items) => {
      let boxes = 0;
      let looseItems = 0;
      items.forEach(item => {
          const pmplItem = allPmplRaw.find(p => p.CODE === item.item);
          if (pmplItem) {
              if (item.unit === pmplItem.UNIT_2) { // UNIT_2 is typically 'BOX' or 'CASE'
                  boxes += Number(item.qty);
              } else if (item.unit === pmplItem.UNIT_1) { // UNIT_1 is typically 'PCS' or 'NOS'
                  looseItems += Number(item.qty);
              } else { // Fallback if unit doesn't match PMPL, assume loose or handle as error
                  looseItems += Number(item.qty);
              }
          } else {
              looseItems += Number(item.qty); // If no PMPL item, count as loose
          }
      });
      return { boxes, looseItems };
  };

  const { boxes, looseItems } = countBoxesAndLooseItems(invoice.items || []);


  let calculatedGrossAmt = 0;
  let calculatedTotalSchemeDiscount = 0;
  let calculatedTotalCashDiscount = 0;

  const processedItems = (invoice.items || []).map(item => {
    const pmplItem = allPmplRaw.find(p => p.CODE === item.item);
    const rate = parseFloat(item.rate || '0');
    const qty = parseFloat(item.qty || '0');
    const schRs = parseFloat(item.schRs || '0');
    const schP = parseFloat(item.sch || '0');
    const cdP = parseFloat(item.cd || '0');

    const baseAmount = qty * rate;
    const itemSchemeDiscountValue = schRs + (baseAmount * schP / 100);
    const amountAfterScheme = baseAmount - itemSchemeDiscountValue;
    const itemCashDiscountValue = amountAfterScheme * cdP / 100;
    const finalItemNetAmount = amountAfterScheme - itemCashDiscountValue;

    calculatedGrossAmt += baseAmount;
    calculatedTotalSchemeDiscount += itemSchemeDiscountValue;
    calculatedTotalCashDiscount += itemCashDiscountValue;

    return {
      ...item,
      amount: baseAmount.toFixed(2),
      netAmount: finalItemNetAmount.toFixed(2),
      particular: pmplItem?.PRODUCT || 'N/A',
      pack: pmplItem?.PACK || '',
      gst: parseFloat(pmplItem?.GST || '0'),
      mrp: pmplItem?.MRP1 || "",
      pcBx: pmplItem?.MULT_F || undefined,
      unit1: pmplItem?.UNIT_1 || undefined,
      unit2: pmplItem?.UNIT_2 || undefined,
      hsn: pmplItem?.H_CODE || undefined,
    };
  });

  const exactTotalNetAmount = processedItems.reduce((acc, currentItem) => acc + parseFloat(currentItem.netAmount), 0);
  const roundedTotalNetAmount = Math.round(exactTotalNetAmount);
  const roundOffValue = roundedTotalNetAmount - exactTotalNetAmount;

  const partyBalanceEntry = balanceData.find(b => b.partycode === invoice.party);
  const balanceBfValue = partyBalanceEntry ? partyBalanceEntry.result : "0.00";


  // This structure largely mimics the one in `slink.js printInvoicing`
  return {
    company: { // Static company data, can be moved to config
      name: 'EKTA ENTERPRISES', gstin: '23AJBPS6285R1ZF', subject: 'Subject to SEONI Jurisdiction',
      fssaiNo: '11417230000027', address: 'BUDHWARI BAZAR,GN ROAD SEONI,',
      phone: 'Ph : 9179174888 , 9826623188', officeNo: '07692-220897', stateCode: '23',
    },
    dlNo: ' 20B/807/54/2022 , 21B/808/54/2022 , 20/805/54/2022 , 21/806/54/2022', // Static
    party: {
      name: partyDetails?.C_NAME || 'N/A',
      address: partyDetails?.C_ADD1 || partyDetails?.C_ADD2 || '',
      gstin: partyDetails?.C_GST || '',
      stateCode: partyDetails?.C_STATE || '', // Make sure this is state code, not name
      mobileNo: partyDetails?.C_MOBILE || '',
      balanceBf: balanceBfValue,
      fssaiNo: partyDetails?.FSAAINO || '',
      dlNo: partyDetails?.C_DL_NO || '',
    },
    invoice: {
      no: `${invoice.id} - ${invoice.series || ''} - ${invoice.billNo || ''}`,
      mode: invoice.cash === 'Y' ? 'CASH' : 'CREDIT',
      date: formatDate(invoice.date),
      // time: invoice.time, // Assuming invoice.date contains time or it's not needed separately
      dueDate: calculateDueDate(invoice.date, invoice.dueDays),
      displayNo: `${invoice.series || ''} - ${invoice.billNo || ''}`
    },
    ack: { no: "", date: "" }, // Placeholder
    irn: '', // Placeholder
    billMadeBy: billMadeByName,
    items: processedItems,
    summary: {
      itemsInBill: processedItems.length,
      casesInBill: boxes,
      looseItemsInBill: looseItems,
    },
    // Tax details need to be grouped by GST rate from processedItems
    taxDetails: Object.values(processedItems.reduce((acc, item) => {
        const gstRate = item.gst;
        // Taxable value is netAmount before GST is applied.
        // If item.netAmount already includes GST, then taxableValue = item.netAmount / (1 + GST_Rate/100)
        // Assuming item.netAmount is pre-tax for this calculation structure based on typical invoice formats.
        // If item.netAmount is POST-TAX, the calculation for taxableValue would be:
        const taxableValue = parseFloat(item.netAmount); // Assuming netAmount is PRE-TAX for this structure
                                                        // If it's POST-TAX, then: parseFloat(item.netAmount) / (1 + gstRate / 100);
                                                        // Given the context of `finalItemNetAmount` being calculated before GST,
                                                        // this `taxableValue` should be `finalItemNetAmount`.
                                                        // The current `item.netAmount` IS `finalItemNetAmount`.

        if (!acc[gstRate]) {
            // Initialize with goods = 0, then add taxableValue.
            acc[gstRate] = { goods: 0, sgst: gstRate / 2, sgstValue: 0, cgst: gstRate / 2, cgstValue: 0, rate: gstRate };
        }
        acc[gstRate].goods += taxableValue; // Add the item's net amount (pre-tax) to the 'goods' total for this GST rate
        acc[gstRate].sgstValue += (taxableValue * (gstRate / 2)) / 100;
        acc[gstRate].cgstValue += (taxableValue * (gstRate / 2)) / 100;
        return acc;
    }, {})).map(detail => ({ // Ensure values are fixed to 2 decimal places
        rate: detail.rate, // include the rate for display
        goods: detail.goods.toFixed(2),
        sgst: detail.sgst,
        sgstValue: detail.sgstValue.toFixed(2),
        cgst: detail.cgst,
        cgstValue: detail.cgstValue.toFixed(2),
    })),
    totals: {
      grossAmt: calculatedGrossAmt.toFixed(2),
      lessSch: calculatedTotalSchemeDiscount.toFixed(2),
      lessCd: calculatedTotalCashDiscount.toFixed(2),
      rOff: roundOffValue.toFixed(2),
      netAmount: roundedTotalNetAmount.toFixed(2),
    },
  };
}

module.exports = {
  getLocalInvoices,
  getLocalInvoiceById,
  addLocalInvoice,
  updateLocalInvoice,
  getNextInvoiceIdentifiers,
  getInvoicePrintData,
  triggerDbfInvoiceMerge, // Exporting placeholder for potential direct use or testing
};
