import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import constants from '../../constants';
import PageMeta from '../../components/common/PageMeta';
import Toast from '../../components/ui/toast/Toast';

interface CompanyInfo {
  name: string;
  gstin: string;
  subject: string;
  fssaiNo: string;
  address: string;
  phone: string;
  officeNo: string;
  stateCode: string;
}

interface PartyInfo {
  name: string;
  address: string;
  gstin: string;
  stateCode: string;
  mobileNo: string;
  balanceBf: number;
}

interface InvoiceInfo {
  no: string;
  mode: string;
  date: string;
  time: string;
  dueDate: string;
}

interface AckInfo {
  no: string;
  date: string;
}

interface InvoiceItem {
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

interface Summary {
  itemsInBill: number;
  casesInBill: number;
  looseItemsInBill: number;
}

interface TaxDetail {
  goods: string;
  sgst: number;
  sgstValue: number;
  cgst: number;
  cgstValue: number;
}

interface TotalInfo {
  grossAmt: number;
  lessSch: number;
  lessCd: number;
  rOff: number;
  netAmount: number;
}

interface InvoiceData {
  company: CompanyInfo;
  dlNo: string;
  party: PartyInfo;
  invoice: InvoiceInfo;
  ack: AckInfo;
  irn: string;
  items: InvoiceItem[];
  summary: Summary;
  taxDetails: TaxDetail[];
  totals: TotalInfo;
}

const PrintInvoicing: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InvoiceData | null>(null);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    visible: false,
    message: '',
    type: 'info'
  });
  const printRef = useRef<HTMLDivElement>(null);

  // Extract the query parameters
  const getQueryParams = () => {
    const queryParams = new URLSearchParams(window.location.search);
    const id = queryParams.get('id') || '';
    return id;
  };

  const invoiceId = getQueryParams();

  useEffect(() => {
    const fetchData = async () => {
      if (!invoiceId) {
        setError('No invoice ID provided');
        setLoading(false);
        showToast('No invoice ID provided', 'error');
        return;
      }

      try {
        const response = await fetch(`${constants.baseURL}/slink/printInvoice?id=${invoiceId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch invoice data');
        }

        const responseData = await response.json();
        console.log('Fetched invoice data:', responseData);
        setData(responseData);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching invoice data:', err);
        setError('Failed to load invoice data');
        setLoading(false);
        showToast('Failed to load invoice data', 'error');
      }
    };

    fetchData();
  }, [invoiceId]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({
      visible: true,
      message,
      type
    });

    // Auto-hide toast after 3 seconds
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 3000);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleBack = () => {
    navigate('/db/invoicing');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <PageMeta title="Error | Invoice Print" description="Error loading invoice data" />
        <div className="text-red-500 text-xl mb-4">{error}</div>
        <button
          onClick={handleBack}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Back to Invoices
        </button>
        {toast.visible && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(prev => ({ ...prev, visible: false }))}
            isVisible={toast.visible}
          />
        )}
      </div>
    );
  }

  // Calculate tax totals
  const calculateTaxTotals = () => {
    if (!data) return { totalGoods: 0, totalSGST: 0, totalCGST: 0 };
    
    return data.taxDetails.reduce((acc, tax) => {
      const goodsValue = tax.goods ? parseFloat(tax.goods) : 0;
      return {
        totalGoods: acc.totalGoods + goodsValue,
        totalSGST: acc.totalSGST + tax.sgstValue,
        totalCGST: acc.totalCGST + tax.cgstValue
      };
    }, { totalGoods: 0, totalSGST: 0, totalCGST: 0 });
  };

  const { totalGoods, totalSGST, totalCGST } = calculateTaxTotals();

  return (
    <div className="p-4 mx-auto max-w-6xl">
      <PageMeta title="Invoice Print" description="Print invoice details" />
      
      {/* Print controls - hidden when printing */}
      <div className="print:hidden mb-6 flex justify-between">
        <button
          onClick={handleBack}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
        >
          Back
        </button>
        <button
          onClick={handlePrint}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Print
        </button>
      </div>
      
      {/* Invoice Content */}
      {data && (
        <div ref={printRef} className="bg-white shadow-md print:shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full border border-black text-xs">
              <thead>
                {/* Header Row */}
                <tr>
                  <td colSpan={11} className="border border-black p-2">
                    <div className="flex">
                      <div className="w-1/3">
                        <p className="font-bold">GSTN: {data.company.gstin}</p>
                        <p className="font-bold">{data.company.subject}</p>
                        <p className="font-bold">FSSAI NO: {data.company.fssaiNo}</p>
                        <p className="font-bold">D.L. No.: {data.dlNo}</p>
                      </div>
                      <div className="w-1/3 text-center">
                        <p className="font-bold">Tax Invoice</p>
                        <p className="text-xl font-bold">{data.company.name}</p>
                        <p className="font-bold">{data.company.address}</p>
                      </div>
                      <div className="w-1/3 text-right">
                        <p className="font-bold">{data.company.phone}</p>
                        <p>Office No: {data.company.officeNo}</p>
                        <p className="font-bold">State Code: {data.company.stateCode}</p>
                      </div>
                    </div>
                  </td>
                  <td colSpan={3} className="border border-black p-2 align-middle">
                    <div className="text-center">
                      <p className="text-xl font-bold">{data.company.name}</p>
                      <p>BILL MADE BY: SHUBHAM</p>
                    </div>
                  </td>
                </tr>
                
                {/* Customer Info Row */}
                <tr>
                  <td colSpan={11} className="border border-black p-2">
                    <div className="flex">
                      <div className="w-2/3 border-r border-black pr-2">
                        <p><span className="font-bold text-blue-800">Party</span> {data.party.name}</p>
                        <p><span className="font-bold text-blue-800">Address</span> {data.party.address}</p>
                        <p>
                          <span className="font-bold text-blue-800">GSTIN</span> {data.party.gstin || 'N/A'}
                          <span className="ml-4 font-bold text-blue-800">State Code :</span> {data.party.stateCode}
                        </p>
                        <p>
                          <span className="font-bold text-blue-800">Mobile No.</span> {data.party.mobileNo}
                          <span className="ml-4 font-bold text-blue-800">Balance</span> {data.party.balanceBf ? `Bal: ${data.party.balanceBf.toFixed(2)} Dr` : 'N/A'}
                        </p>
                      </div>
                      <div className="w-1/3 pl-2">
                        <div className="flex justify-between">
                          <p><span className="font-bold text-blue-800">Inv. No :</span> {data.invoice.no}</p>
                          <p><span className="font-bold text-blue-800">Mode:</span> {data.invoice.mode}</p>
                        </div>
                        <p><span className="font-bold text-blue-800">Date:</span> {data.invoice.date} {data.invoice.time}</p>
                        {data.invoice.dueDate && (
                          <p><span className="font-bold text-blue-800">Due Date</span> {data.invoice.dueDate}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td colSpan={3} className="border border-black p-2">
                    <div>
                      <p><span className="font-bold text-blue-800">Invoice No :</span> {data.invoice.no}</p>
                      <p><span className="font-bold text-blue-800">Date:</span> {data.invoice.date}</p>
                      <p><span className="font-bold text-blue-800">Party</span> {data.party.name}</p>
                      <p><span className="font-bold text-blue-800">Mode:</span> {data.invoice.mode}</p>
                    </div>
                  </td>
                </tr>
                
                {/* IRN Row */}
                <tr>
                  <td colSpan={11} className="border border-black p-2">
                    <div className="flex justify-between">
                      <p><span className="font-bold text-blue-800">Ack. No:</span> {data.ack.no}</p>
                      <p><span className="font-bold text-blue-800">Ack. Date:</span> {data.ack.date}</p>
                      <p><span className="font-bold text-blue-800">IRN No:</span> {data.irn}</p>
                    </div>
                  </td>
                  <td colSpan={3} className="border border-black"></td>
                </tr>
                
                {/* Table Headers */}
                <tr className="bg-white">
                  <th className="border border-black p-1 font-bold text-blue-800 w-[200px]">Particulars/HSN</th>
                  <th className="border border-black p-1 font-bold text-blue-800">Pack</th>
                  <th className="border border-black p-1 font-bold text-blue-800">M.R.P</th>
                  <th className="border border-black p-1 font-bold text-blue-800">GST%</th>
                  <th className="border border-black p-1 font-bold text-blue-800">
                    Rate<br />
                    <span className="text-xs">(incl of Tax)</span>
                  </th>
                  <th className="border border-black p-1 font-bold text-blue-800">Unit</th>
                  <th className="border border-black p-1 font-bold text-blue-800">Qty</th>
                  <th className="border border-black p-1 font-bold text-blue-800">Free</th>
                  <th className="border border-black p-1 font-bold text-blue-800">Sch Rs</th>
                  <th className="border border-black p-1 font-bold text-blue-800">
                    Co. Sch%<br />
                    Cash Disc%
                  </th>
                  <th className="border border-black p-1 font-bold text-blue-800">Net Amt.</th>
                  <th className="border border-black p-1 font-bold text-blue-800 w-[200px]">
                    Particulars<br />
                    <div className="flex justify-between">
                      <span>Unit</span>
                      <span>M.R.P.</span>
                    </div>
                  </th>
                  <th className="border border-black p-1 font-bold text-blue-800">Free</th>
                  <th className="border border-black p-1 font-bold text-blue-800">Qty</th>
                </tr>
              </thead>
              <tbody>
                {/* Product Rows */}
                {data.items.map((item, index) => (
                  <tr key={index}>
                    <td className="border border-black p-1 text-left text-blue-800">{item.particular}</td>
                    <td className="border border-black p-1 text-center">{item.pack}</td>
                    <td className="border border-black p-1 text-center">{item.rate?.toFixed(2)}</td>
                    <td className="border border-black p-1 text-center text-orange-600">{item.gst?.toFixed(2)}</td>
                    <td className="border border-black p-1 text-center">{item.rate?.toFixed(2)}</td>
                    <td className="border border-black p-1 text-center">{item.unit}</td>
                    <td className="border border-black p-1 text-center">{item.qty}</td>
                    <td className="border border-black p-1 text-center">{item.cess}</td>
                    <td className="border border-black p-1 text-center">{item.schRs}</td>
                    <td className="border border-black p-1 text-center">{item.sch}</td>
                    <td className="border border-black p-1 text-center text-blue-800">{item.netAmount}</td>
                    <td className="border border-black p-1 text-left">
                      <span className="text-blue-800">{item.particular}</span>
                      <div className="flex justify-between">
                        <span>{item.unit}</span>
                        <span>{item.rate?.toFixed(2)}</span>
                      </div>
                    </td>
                    <td className="border border-black p-1 text-center">{item.cess}</td>
                    <td className="border border-black p-1 text-center">{item.qty}</td>
                  </tr>
                ))}

                <tr>
                  <td colSpan={11} className="border border-black p-0">
                    <table className="w-full text-xs border-collapse">
                      <tr>
                        <td className="align-top border border-black p-1 text-[11px]" style={{ width: '10%' }}>
                          <p className="font-bold text-blue-800">Items in Bill: {data.summary.itemsInBill}</p>
                          <p className="font-bold text-blue-800">Cases in Bill: {data.summary.casesInBill}</p>
                          <p className="font-bold text-blue-800">Loose items in Bill: {data.summary.looseItemsInBill}</p>
                        </td>
                        
                        <td className="align-top border border-black p-1" style={{ width: '25%' }}>
                          <p className="font-bold text-blue-800">Terms & Conditions:</p>
                          <p className="text-[10px]">1. We hereby certify that articles of food mentioned in the invoice are warranted to be of the nature and quality which they purport to be as per the Food Safety and Standards Act and Rules.</p>
                          <p className="text-[10px] mt-1">2. Goods once sold will not be taken back. E & OE.</p>
                        </td>
                        
                        <td className="align-top border border-black p-1" style={{ width: '20%' }}>
                          <table className="w-full text-xs border-collapse">
                            <tr className="text-xs">
                              <td className="border-b border-r border-black p-1 font-bold text-blue-800">Goods</td>
                              <td className="border-b border-r border-black p-1 font-bold text-blue-800">SGST%</td>
                              <td className="border-b border-r border-black p-1 font-bold text-blue-800">Value</td>
                              <td className="border-b border-r border-black p-1 font-bold text-blue-800">CGST%</td>
                              <td className="border-b border-black p-1 font-bold text-blue-800">Value</td>
                            </tr>
                            {data.taxDetails.map((tax, index) => (
                              <tr key={index} className="text-xs">
                                <td className="border-r border-black p-1">{tax.goods || '0.00'}</td>
                                <td className="border-r border-black p-1">{tax.sgst?.toFixed(2)}%</td>
                                <td className="border-r border-black p-1">{tax.sgstValue?.toFixed(2)}</td>
                                <td className="border-r border-black p-1">{tax.cgst?.toFixed(2)}%</td>
                                <td className="p-1">{tax.cgstValue?.toFixed(2)}</td>
                              </tr>
                            ))}
                            <tr className="text-xs">
                              <td className="border-t border-r border-black p-1 font-bold">{totalGoods.toFixed(2)}</td>
                              <td className="border-t border-r border-black p-1 font-bold"></td>
                              <td className="border-t border-r border-black p-1 font-bold">{totalSGST.toFixed(2)}</td>
                              <td className="border-t border-r border-black p-1 font-bold"></td>
                              <td className="border-t border-black p-1 font-bold">{totalCGST.toFixed(2)}</td>
                            </tr>
                          </table>
                        </td>
                        
                        <td className="align-top border border-black p-0" style={{ width: '25%' }}>
                          <table className="w-full text-xs border-collapse">
                            <tr>
                              <td className="border-b border-r border-black p-1 font-bold text-blue-800 text-left">Gross Amt.</td>
                              <td className="border-b border-black p-1 text-right">{data.totals.grossAmt?.toFixed(2)}</td>
                            </tr>
                            <tr>
                              <td className="border-b border-r border-black p-1 font-bold text-blue-800 text-left">Less Sch.</td>
                              <td className="border-b border-black p-1 text-right">{data.totals.lessSch?.toFixed(2)}</td>
                            </tr>
                            <tr>
                              <td className="border-b border-r border-black p-1 font-bold text-blue-800 text-left">Less CD</td>
                              <td className="border-b border-black p-1 text-right">{data.totals.lessCd?.toFixed(2)}</td>
                            </tr>
                            <tr>
                              <td className="border-b border-r border-black p-1 font-bold text-blue-800 text-left">R.Off</td>
                              <td className="border-b border-black p-1 text-right">{data.totals.rOff?.toFixed(2)}</td>
                            </tr>
                            <tr>
                              <td className="border-r border-black p-1 font-bold text-blue-800 text-left">Net Amt.</td>
                              <td className="p-1 font-bold text-right">{data.totals.netAmount?.toFixed(2)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td colSpan={3} className="border border-black p-0">
                    <table className="w-full text-xs border-collapse">
                      <tr>
                        <td className="border-b border-r border-black p-1 font-bold text-blue-800 text-left">Gross Amt.</td>
                        <td className="border-b border-black p-1 text-right">{data.totals.grossAmt?.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="border-b border-r border-black p-1 font-bold text-blue-800 text-left">Less Sch.</td>
                        <td className="border-b border-black p-1 text-right">{data.totals.lessSch?.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="border-b border-r border-black p-1 font-bold text-blue-800 text-left">Less CD</td>
                        <td className="border-b border-black p-1 text-right">{data.totals.lessCd?.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="border-b border-r border-black p-1 font-bold text-blue-800 text-left">R.Off</td>
                        <td className="border-b border-black p-1 text-right">{data.totals.rOff?.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td className="border-r border-black p-1 font-bold text-blue-800 text-left">Net Amt.</td>
                        <td className="p-1 font-bold text-right">{data.totals.netAmount?.toFixed(2)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td colSpan={14} className="border border-black p-1 text-center text-xs">
                    This is computer generated Bill, No signature required. Bank:PUNJAB NATIONAL BANK SEONI 0490008700003292 PUNB0049000
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {toast.visible && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(prev => ({ ...prev, visible: false }))}
          isVisible={toast.visible}
        />
      )}

      {/* Add print-specific styles */}
      <style>{`
        @media print {
          body {
            background-color: white;
            color: black;
            margin: 0;
            padding: 0;
          }
          
          .print\\:hidden {
            display: none !important;
          }
          
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          
          .print\\:text-black {
            color: black !important;
          }
          
          .print\\:border-black {
            border-color: black !important;
          }
          
          /* Adjust page orientation to landscape for invoices */
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
        }
      `}</style>
    </div>
  );
};

export default PrintInvoicing; 