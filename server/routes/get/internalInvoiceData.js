const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
// Assuming utilities.js is in the same parent directory or adjust path
// const { getDbfData } = require('../utilities'); // If getDbfData is needed by copied functions

// --- Copied and adapted from slink.js ---

// Helper function to get PMPL data (copied from slink.js)
const getPMPLData = async () => {
  const jsonPmplPath = path.join(process.env.DBF_FOLDER_PATH, 'data/json', 'PMPL.json');
  try {
    const pmplJsonData = await fs.readFile(jsonPmplPath, 'utf8');
        let jsonData = JSON.parse(pmplJsonData);
        return jsonData.map(entry => ({ CODE: entry.CODE, PRODUCT: entry.PRODUCT, PACK: entry.PACK, MRP1: entry.MRP1, GST: entry.GST, UNIT_1: entry.UNIT_1, UNIT_2: entry.UNIT_2, MULT_F: entry.MULT_F, H_CODE: entry.H_CODE }));
  } catch (error) {
    console.error('[InternalInvoiceData] Error reading PMPL.json:', error);
    throw new Error('Failed to get PMPL data. Ensure PMPL.json exists.');
  }
};

// Helper function to get complete CMPL data (copied and adapted from slink.js)
const completeCmplData = async (C_CODE) => {
  const dbfFilePath = path.join(process.env.DBF_FOLDER_PATH, 'data/json', 'CMPL.json');
  try {
    const cmplData = await fs.readFile(dbfFilePath, 'utf8');
    let jsonData = JSON.parse(cmplData);
    let cmpld = jsonData.find((item) => item.C_CODE === C_CODE);
    return cmpld;
  } catch (error) {
    console.error('[InternalInvoiceData] Error reading CMPL.json:', error);
    throw new Error('Failed to get CMPL data. Ensure CMPL.json exists.');
  }
};


const getInvoiceDataById = async (invoiceId) => {
    console.log(`[InternalInvoiceData] Fetching data for invoice ID: ${invoiceId}`);
    try {
        let invoiceData = await fs.readFile(path.join(__dirname, '..', '..', 'db', 'invoicing.json'), 'utf8');
        invoiceData = JSON.parse(invoiceData);
        const invoice = invoiceData.find((inv) => inv.id == invoiceId);
        
        if (!invoice) {
            console.error(`[InternalInvoiceData] Invoice with ID ${invoiceId} not found.`);
            throw new Error('Invoice not found');
        }
        console.log(`[InternalInvoiceData] Found invoice: ${invoice.id}, SM Code: ${invoice.sm || 'N/A'}`);

        // Read users data to find the salesperson
        let users = [];
        try {
            const usersData = await fs.readFile(path.join(__dirname, '..', '..', 'db', 'users.json'), 'utf8');
            users = JSON.parse(usersData);
        } catch (userError) {
            console.error(`[InternalInvoiceData] Error reading users.json:`, userError);
        }

        // Find user by smCode from the invoice record
        let billMadeByName = 'System'; // Default for PDF generation if not found or no smCode
        if (invoice.sm && users.length > 0) {
            const salesperson = users.find(user => user.smCode === invoice.sm);
            if (salesperson) {
                billMadeByName = salesperson.name;
                 console.log(`[InternalInvoiceData] Found salesperson: ${billMadeByName} for SM Code: ${invoice.sm}`);
            } else {
                console.warn(`[InternalInvoiceData] Salesperson with SM Code ${invoice.sm} not found in users.json. Defaulting to 'System'.`);
            }
        } else if (!invoice.sm) {
             console.warn(`[InternalInvoiceData] Invoice ID ${invoiceId} does not have an smCode field. Defaulting billMadeBy to 'System'.`);
        }

        const pmplData = await getPMPLData();
        let balanceData = await fs.readFile(path.join(__dirname, '..', '..', 'db', 'balance.json'), 'utf8');
        balanceData = JSON.parse(balanceData);
        let cmpl = await completeCmplData(invoice.party);
        if (!cmpl) {
            console.warn(`[InternalInvoiceData] CMPL data not found for party code: ${invoice.party}. Proceeding with defaults.`);
            cmpl = { C_NAME: 'N/A', C_ADD1: 'N/A', C_GST: 'N/A', C_STATE: 'N/A', C_MOBILE: 'N/A' };
        }
        const partyBalance = balanceData.data.find(item => item.partycode === invoice.party);
        const balanceValue = partyBalance ? partyBalance.result : "0 CR";
        
        const formatDate = (dateString) => {
            if (!dateString) return '';
            const date = new Date(dateString);
            return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
        };
        
        const getCurrentDateTime = () => {
            const now = new Date();
            const date = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
            const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
            return `${date} ${time}`;
        };

        const calculateDueDate = (dateString, dueDays) => {
            if (!dueDays || !dateString) return '';
            const parts = dateString.split('-');
            let date;
            if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) { // DD-MM-YYYY
                 date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            } else { // Assume YYYY-MM-DD or other parsable
                 date = new Date(dateString);
            }
            if (isNaN(date.getTime())) return '';
            date.setDate(date.getDate() + parseInt(dueDays));
            return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
        };
        
        const countBoxesAndLooseItems = (items) => {
            const pmplDataForInvoice = items.map(item => pmplData.find(p => p.CODE === item.item)).filter(Boolean);
            const boxes = items.reduce((acc, item) => {
                const pmplItem = pmplDataForInvoice.find(p => p.CODE === item.item);
                if (pmplItem && item.unit === pmplItem.UNIT_2) {
                    return acc + Number(item.qty);
                }
                return acc;
            }, 0);
            const looseItems = items.reduce((acc, item) => {
                const pmplItem = pmplDataForInvoice.find(p => p.CODE === item.item);
                if (pmplItem && item.unit === pmplItem.UNIT_1) {
                    return acc + Number(item.qty);
                }
                return acc;
            }, 0);
            return { boxes, looseItems };
        };
        
        const { boxes, looseItems } = countBoxesAndLooseItems(invoice.items);

        const originalDate = invoice.date;
        const formattedDate = formatDate(originalDate);
        const currentDateTime = getCurrentDateTime();

        const ModifiedInv = {
            company: {
                name: 'EKTA ENTERPRISES', gstin: '23AJBPS6285R1ZF', subject: 'Subject to SEONI Jurisdiction',
                fssaiNo: '11417230000027', address: 'BUDHWARI BAZAR,GN ROAD SEONI,',
                phone: 'Ph : 9179174888 , 9826623188', officeNo: '07692-220897', stateCode: '23',
            },
            dlNo: invoice.party?.dlno || ' 20B/807/54/2022 , 21B/808/54/2022 , 20/805/54/2022 , 21/806/54/2022',
            party: {
                name: cmpl.C_NAME, address: cmpl.C_ADD1 || cmpl.C_ADD2, gstin: cmpl.C_GST,
                stateCode: cmpl.C_STATE, mobileNo: cmpl.C_MOBILE, balanceBf: balanceValue,
            },
            invoice: {
                no: `${invoice.id} - ${invoice.series || ''} - ${invoice.billNo || ''}`,
                mode: invoice.cash == 'Y' ? 'CASH' : 'CREDIT',
                date: formattedDate,
                time: currentDateTime,
                dueDate: calculateDueDate(originalDate, invoice.dueDays),
                displayNo: `${invoice.series || ''} - ${invoice.billNo || ''}`
            },
            ack: { no: invoice.ackNo || "", date: invoice.ackDate ? formatDate(invoice.ackDate) : "" },
            irn: invoice.irnNo || "",
            billMadeBy: billMadeByName,
            tst:2,
            items: [
                ...invoice.items.map((item) => {
                    const pmplItem = pmplData.find((pmplItemData) => pmplItemData.CODE === item.item);
                    return {
                        ...item,
                        particular: pmplItem ? pmplItem.PRODUCT : item.item,
                        pack: pmplItem ? pmplItem.PACK : '',
                        gst: pmplItem ? parseFloat(pmplItem.GST) : 0,
                        mrp: pmplItem ? parseFloat(pmplItem.MRP1) : 0,
                        pcBx: pmplItem ? pmplItem.MULT_F : undefined,
                        unit1: pmplItem ? pmplItem.UNIT_1 : undefined,
                        unit2: pmplItem ? pmplItem.UNIT_2 : undefined,
                        hsn: pmplItem ? pmplItem.H_CODE : "X",
                        item: pmplItem ? JSON.stringify(pmplItem) : "",
                    };
                }),
            ],
            summary: {
                itemsInBill: invoice.items.length, casesInBill: boxes, looseItemsInBill: looseItems,
            },
            taxDetails: [
                ...invoice.items.reduce((acc, item) => {
                    const pmplItem = pmplData.find((p) => p.CODE === item.item);
                    const gstRate = pmplItem ? parseFloat(pmplItem.GST) : 0;
                    if (gstRate > 0) {
                        const taxableValue = (Number(item.netAmount) * 100) / (100 + gstRate);
                        const sgstValue = (taxableValue * (gstRate / 2)) / 100;
                        const cgstValue = (taxableValue * (gstRate / 2)) / 100;

                        let existingTaxDetail = acc.find(td => td.sgst === gstRate / 2);
                        if (existingTaxDetail) {
                            existingTaxDetail.goods = (parseFloat(existingTaxDetail.goods) + taxableValue).toFixed(2);
                            existingTaxDetail.sgstValue += sgstValue;
                            existingTaxDetail.cgstValue += cgstValue;
                        } else {
                            acc.push({
                                goods: taxableValue.toFixed(2),
                                sgst: gstRate / 2,
                                sgstValue: sgstValue,
                                cgst: gstRate / 2,
                                cgstValue: cgstValue,
                            });
                        }
                    }
                    return acc;
                }, [])
            ],
            totals: {
                grossAmt: invoice.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
                lessSch: invoice.items.reduce((sum, item) => {
                    const amount = parseFloat(item.amount) || 0;
                    const schRs = parseFloat(item.schRs) || 0;
                    const schPercent = parseFloat(item.sch) || 0;
                    const schPercentDiscount = (amount - schRs) * (schPercent / 100);
                    return sum + schRs + schPercentDiscount;
                }, 0),
                lessCd: invoice.items.reduce((sum, item) => {
                     const amount = parseFloat(item.amount) || 0;
                    const schRs = parseFloat(item.schRs) || 0;
                    const schPercent = parseFloat(item.sch) || 0;
                    const cdPercent = parseFloat(item.cd) || 0;
                    const amountAfterSch = (amount - schRs) * (1 - schPercent / 100);
                    return sum + (amountAfterSch * (cdPercent / 100));
                }, 0),
                netAmount: invoice.items.reduce((sum, item) => sum + (parseFloat(item.netAmount) || 0), 0),
            },
        };

        const preciseNetAmount = ModifiedInv.totals.netAmount;
        ModifiedInv.totals.netAmount = Math.round(preciseNetAmount);
        ModifiedInv.totals.rOff = ModifiedInv.totals.netAmount - preciseNetAmount;

        console.log("[InternalInvoiceData] Successfully generated ModifiedInv for ID:", invoiceId);
        return ModifiedInv;

    } catch (error) {
        console.error(`[InternalInvoiceData] Error fetching invoice data for ID ${invoiceId}:`, error);
        throw error;
    }
};

// --- End of copied/adapted logic ---

router.get('/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).json({ message: 'Invoice ID is required' });
    }

    try {
        const invoiceFullData = await getInvoiceDataById(id);
        if (!invoiceFullData) {
            return res.status(404).json({ message: 'Invoice data not found' });
        }
        res.status(200).json(invoiceFullData);
    } catch (error) {
        console.error(`[API /api/internal/invoice-data/:id] Failed to fetch invoice data for ID ${id}:`, error.message, error.stack);
        res.status(500).json({ message: 'Failed to retrieve invoice details.', error: error.message });
    }
});

module.exports = router; 