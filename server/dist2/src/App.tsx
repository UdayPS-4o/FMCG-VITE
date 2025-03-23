import { useState } from 'react';

interface Company {
  name: string;
  gstin: string;
  subject: string;
  fssaiNo: string;
  address: string;
  phone: string;
  officeNo: string;
  stateCode: string;
}

interface Party {
  name: string;
  address: string;
  gstin: string;
  stateCode: string;
  mobileNo: string;
  balanceBf: number;
}

interface Invoice {
  no: string;
  mode: string;
  date: string;
  time: string;
  dueDate: string;
}

interface Ack {
  no: string;
  date: string;
}

interface Item {
  item: string;
  godown: string;
  unit: string;
  rate: number;
  qty: string;
  cess: string;
  schRs: string;
  sch: string;
  cd: string;
  amount: string;
  netAmount: string;
  particular: string;
  pack: string;
  gst: number;
}

interface TaxDetail {
  goods: string;
  sgst: number;
  sgstValue: number;
  cgst: number;
  cgstValue: number;
}

interface Totals {
  grossAmt: number;
  lessSch: number;
  lessCd: number;
  rOff: number;
  netAmount: number;
}

interface InvoiceData {
  company: Company;
  dlNo: string;
  party: Party;
  invoice: Invoice;
  ack: Ack;
  irn: string;
  items: Item[];
  summary: {
    itemsInBill: number;
    casesInBill: number;
    looseItemsInBill: number;
  };
  taxDetails: TaxDetail[];
  totals: Totals;
}

const invoiceData: InvoiceData = {
  "company": {
    "name": "EKTA ENTERPRICE",
    "gstin": "23AJBPS6285R1ZF",
    "subject": "Subject to SEONI Jurisdiction",
    "fssaiNo": "11417230000027",
    "address": "BUDHWARI BAZAR,GN ROAD SEONI,",
    "phone": "Ph : 9179174888 , 9826623188",
    "officeNo": "07692-220897",
    "stateCode": "23"
  },
  "dlNo": " 20B/807/54/2022 , 21B/808/54/2022 , 20/805/54/2022 , 21/806/54/2022",
  "party": {
    "name": "SHRI BALRAM SEVLANI",
    "address": "G N ROAD SEONI",
    "gstin": "",
    "stateCode": "23",
    "mobileNo": "SEONI",
    "balanceBf": 0
  },
  "invoice": {
    "no": "5",
    "mode": "CASH",
    "date": "2025-03-19",
    "time": "6:32:33 pm",
    "dueDate": ""
  },
  "ack": {
    "no": "5",
    "date": "2025-03-19"
  },
  "irn": "0265cdbc86f02a327272925c34fd6014d5701a832b58d00f5b5b85cf452f30b8",
  "items": [
    {
      "item": "MK001",
      "godown": "02",
      "unit": "PCS",
      "rate": 675,
      "qty": "12",
      "cess": "",
      "schRs": "",
      "sch": "",
      "cd": "",
      "amount": "8100.00",
      "netAmount": "8100.00",
      "particular": "MK SOYA OIL 4.210KG JAR",
      "pack": "4.21KG",
      "gst": 5
    },
    {
      "item": "ME006",
      "godown": "",
      "unit": "BOX",
      "rate": 440,
      "qty": "",
      "cess": "",
      "schRs": "",
      "sch": "",
      "cd": "",
      "amount": "",
      "netAmount": "",
      "particular": "CHAVI CB 35'S YELLOW",
      "pack": "10'SPACK",
      "gst": 12
    },
    {
      "item": "ME032",
      "godown": "03",
      "unit": "BOX",
      "rate": 430,
      "qty": "20",
      "cess": "",
      "schRs": "",
      "sch": "",
      "cd": "",
      "amount": "8600.00",
      "netAmount": "8600.00",
      "particular": "CAP WAX HM MATCHES 23'S",
      "pack": "BDL",
      "gst": 12
    },
    {
      "item": "MK080",
      "godown": "04",
      "unit": "PCS",
      "rate": 145,
      "qty": "20",
      "cess": "",
      "schRs": "",
      "sch": "",
      "cd": "",
      "amount": "2900.00",
      "netAmount": "2900.00",
      "particular": "AATA PATANJALI 5KGS",
      "pack": "6 PKTS",
      "gst": 5
    }
  ],
  "summary": {
    "itemsInBill": 4,
    "casesInBill": 52,
    "looseItemsInBill": 0
  },
  "taxDetails": [
    {
      "goods": "8100.00",
      "sgst": 2.5,
      "sgstValue": 202.5,
      "cgst": 2.5,
      "cgstValue": 202.5
    },
    {
      "goods": "",
      "sgst": 6,
      "sgstValue": 0,
      "cgst": 6,
      "cgstValue": 0
    },
    {
      "goods": "8600.00",
      "sgst": 6,
      "sgstValue": 516,
      "cgst": 6,
      "cgstValue": 516
    },
    {
      "goods": "2900.00",
      "sgst": 2.5,
      "sgstValue": 72.5,
      "cgst": 2.5,
      "cgstValue": 72.5
    }
  ],
  "totals": {
    "grossAmt": 19600,
    "lessSch": 0,
    "lessCd": 0,
    "rOff": 0,
    "netAmount": 19600
  }
};

function App() {
  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <button 
        className="print-button bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full"
        onClick={handlePrint}
      >
        Print
      </button>
      <div className="invoice-container">
        <div className="print-page">
          <div className="bg-white p-1 sm:p-4 flex mx-auto text-[0.6rem] sm:text-xs print:text-[0.6rem] max-w-[1300px] print-page">
            {/* Main Invoice Section */}
            <div className="border border-black w-[75%]">
              {/* Header */}
              <div className="grid grid-cols-3 border-black">
                <div className="p-1 flex justify-center items-center font-bold">
                  <div>
                    <p>GSTN : {invoiceData.company.gstin}</p>
                    <p>{invoiceData.company.subject}</p>
                    <p>FSSAI NO : {invoiceData.company.fssaiNo}</p>
                  </div>
                </div>
                <div className="text-center border-black p-1">
                  <p className="uppercase">tax invoice</p>
                  <h1 className="text-base sm:text-xl font-bold">{invoiceData.company.name}</h1>
                  <p>{invoiceData.company.address}</p>
                </div>
                <div className="text-right p-1 flex justify-center items-center font-bold">
                  <div>
                    <p>{invoiceData.company.phone}</p>
                    <p>Office No. {invoiceData.company.officeNo}</p>
                    <p>state code: {invoiceData.company.stateCode}</p>
                  </div>
                </div>
              </div>

              {/* DL Number */}
              <div className="border-b border-black p-1 font-bold">
                <p>D.L. No.: {invoiceData.dlNo}</p>
              </div>

              {/* Party Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 border-b border-black">
                <div className="p-1">
                  <p><span className="font-bold">Party</span> {invoiceData.party.name}</p>
                  <p><span className="font-bold">Address</span> {invoiceData.party.address}</p>
                  <p>
                    <span className="font-bold">GSTIN</span> {invoiceData.party.gstin}
                    <span className="font-bold ml-4">State Code :</span> {invoiceData.party.stateCode}
                  </p>
                  <p>
                    <span className="font-bold">Mobile No.</span> {invoiceData.party.mobileNo}
                    <span className="font-bold ml-4">Balance B/f</span> {invoiceData.party.balanceBf}
                  </p>
                </div>
                <div className="sm:border-l border-black p-1">
                  <p>
                    <span className="font-bold">Inv. No :</span> {invoiceData.invoice.no}
                    <span className="font-bold ml-4">Mode:</span> {invoiceData.invoice.mode}
                  </p>
                  <p>
                    <span className="font-bold">Date:</span> {invoiceData.invoice.date}
                    <span className="ml-4">10:27:06 pm</span>
                  </p>
                  <p><span className="font-bold">Due Date</span> {invoiceData.invoice.dueDate}</p>
                </div>
              </div>

              {/* IRN Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 border-b border-black text-[0.5rem] sm:text-[0.6rem]">
                <p className="p-1">
                  Ack. No.{invoiceData.ack.no}
                  <span className="ml-4">Ack.Date {invoiceData.ack.date}</span>
                </p>
                <p className="border-b p-1">IRN No.{invoiceData.irn}</p>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-black">
                      <th className="border-r border-black p-1 text-left">Particulars/HSN</th>
                      <th className="border-r border-black p-1">Pack</th>
                      <th className="border-r border-black p-1">M.R.P</th>
                      <th className="border-r border-black p-1">GST%</th>
                      <th className="border-r border-black p-1">Rate (incl of Tax)</th>
                      <th className="border-r border-black p-1">Unit</th>
                      <th className="border-r border-black p-1">Qty</th>
                      <th className="border-r border-black p-1">Free</th>
                      <th className="border-r border-black p-1">Sch Rs.</th>
                      <th className="p-1">Net Amt.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceData.items.map((item, index) => (
                      <tr key={index} className="border-b border-black">
                        <td className="border-r border-black p-1">{item.particular}</td>
                        <td className="border-r border-black p-1 text-center">{item.pack}</td>
                        <td className="border-r border-black p-1 text-right"></td>
                        <td className="border-r border-black p-1 text-right">{item.gst.toFixed(2)}</td>
                        <td className="border-r border-black p-1 text-right">{item.rate.toFixed(2)}</td>
                        <td className="border-r border-black p-1 text-center">{item.unit}</td>
                        <td className="border-r border-black p-1 text-right">{item.qty}</td>
                        <td className="border-r border-black p-1 text-right">0</td>
                        <td className="border-r border-black p-1 text-right">0</td>
                        <td className="p-1 text-right">{item.particular === "CHAVI CB 35'S YELLOW" ? "NaN" : item.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary Section */}
              <div className="flex">
                <div className="flex border-black w-[100%]">
                  <div className="border-black border-solid border-2 p-1 w-[30%]">
                    <p className="w-max">Items in Bill: {invoiceData.summary.itemsInBill}</p>
                    <p className="w-max">Cases in Bill: {invoiceData.summary.casesInBill}</p>
                    <p className="w-max">Loose items in Bill: {invoiceData.summary.looseItemsInBill}</p>
                  </div>
                  <div className="p-1 w-[70%] border-black border-2 border-r border-l">
                    <p className="font-bold">Terms & Conditions:</p>
                    <p>1. We hereby certify that articles of food mentioned in the invoice are warranted to be of the nature and quality which they purport to be as per the Food Safety and Standards Act and Rules.</p>
                    <p>2. Goods once sold will not be taken back. E & OE.</p>
                  </div>
                </div>
              </div>
              
              {/* Tax Details */}
              <div className="flex w-full">
                <table className="w-1/2 border-black border-r border-t border-l border-b border-2">
                  <thead>
                    <tr className="border-b border-black">
                      <th className="border-r border-black p-1">Goods</th>
                      <th className="border-r border-black p-1">SGST%</th>
                      <th className="border-r border-black p-1">Value</th>
                      <th className="border-r border-black p-1">CGST%</th>
                      <th className="p-1">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceData.taxDetails.filter(tax => tax.goods).map((tax, index) => (
                      <tr key={index} className="border-b border-black">
                        <td className="p-1 text-right font-bold border-black border-r">
                          {tax.goods}
                        </td>
                        <td className="p-1 text-right font-bold border-black border-r">
                          {tax.sgst.toFixed(2)}
                        </td>
                        <td className="p-1 text-right font-bold border-black border-r">
                          {tax.sgstValue.toFixed(2)}
                        </td>
                        <td className="p-1 text-right font-bold border-black border-r">
                          {tax.cgst.toFixed(2)}
                        </td>
                        <td className="p-1 text-right font-bold">
                          {(tax.cgstValue + tax.sgstValue).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <table className="w-1/2 border-black border-2 border-l-0">
                  <tbody>
                    <tr className="border-b border-black">
                      <td className="p-1 border-r border-black">Gross Amt.</td>
                      <td className="p-1 text-right">{invoiceData.totals.grossAmt.toFixed(2)}</td>
                    </tr>
                    <tr className="border-b border-black">
                      <td className="p-1 border-r border-black">Less Sch.</td>
                      <td className="p-1 text-right">{invoiceData.totals.lessSch.toFixed(2)}</td>
                    </tr>
                    <tr className="border-b border-black">
                      <td className="p-1 border-r border-black">Less CD</td>
                      <td className="p-1 text-right">{invoiceData.totals.lessCd.toFixed(2)}</td>
                    </tr>
                    <tr className="border-b border-black">
                      <td className="p-1 border-r border-black">R.Off</td>
                      <td className="p-1 text-right">{invoiceData.totals.rOff.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td className="p-1 font-bold border-r border-black">Net Amt.</td>
                      <td className="p-1 text-right font-bold">{invoiceData.totals.netAmount.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Side QR Code Section */}
            <div className="border border-black w-[25%] flex flex-col justify-between">
              {/* QR Code */}
              <div className="qr-code-section">
                <div className="qr-code bg-white w-full h-[200px] flex justify-center items-center border-b border-black">
                  <p className="text-center">QR Code</p>
                </div>
                <div className="p-2 text-center w-full">
                  <h2 className="font-bold text-xs">E-Invoice</h2>
                  <p className="text-[0.5rem] sm:text-[0.6rem]">Invoice generated through e-invoice portal</p>
                </div>
              </div>
              
              {/* Signature Section - Will be pushed to bottom because of justify-between */}
              <div className="signature-section">
                <div className="for-signature border-t border-black pt-1 pb-4 flex justify-between">
                  <p>For {invoiceData.company.name}</p>
                </div>
                <div className="border-t border-black pt-1">
                  <p className="text-center">Authorized Signatory</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;