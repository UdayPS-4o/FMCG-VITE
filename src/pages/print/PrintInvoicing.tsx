import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import constants from '../../constants';
import PageMeta from '../../components/common/PageMeta';
import Toast from '../../components/ui/toast/Toast';

// Interfaces for TypeScript type safety
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
  displayNo: string;
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
  mrp: number;
  pcBx?: string;
  unit1?: string;
  unit2?: string;
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
  billMadeBy: string;
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

  // Query parameters extract karna
  const getQueryParams = () => {
    const queryParams = new URLSearchParams(window.location.search);
    const id = queryParams.get('id') || '';
    return id;
  };

  const invoiceId = getQueryParams();

  // Data fetch karne ke liye useEffect
  useEffect(() => {
    const fetchData = async () => {
      if (!invoiceId) {
        setError('No invoice ID provided');
        setLoading(false);
        showToast('No invoice ID provided', 'error');
        return;
      }

      try {
        // Get token from localStorage
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('Authentication required');
        }
        
        const response = await fetch(`${constants.baseURL}/slink/printInvoice?id=${invoiceId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
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

  // Toast message dikhane ka function
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({
      visible: true,
      message,
      type
    });

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

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Error state
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

  // Tax totals calculate karna
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

  // Calculate actual totals for scheme and cash discounts
  const calculateActualTotals = () => {
    if (!data) return { totalSch: 0, totalCd: 0, netAmount: 0, roundOff: 0, grossAmount: 0 };

    let totalGrossAmount = 0;
    let totalSchDiscount = 0;
    let totalCdDiscount = 0;
    let totalNetAmountExact = 0;

    data.items.forEach(item => {
        const amount = parseFloat(item.amount) || 0;
        const schRs = parseFloat(item.schRs) || 0;
        const schPercent = parseFloat(item.sch) || 0;
        const cdPercent = parseFloat(item.cd) || 0;
        const itemNetAmount = parseFloat(item.netAmount) || 0;

        totalGrossAmount += amount;
        totalNetAmountExact += itemNetAmount;

        // Calculate discounts applied for *this item* to sum up for summary
        // Apply discounts in a compound manner: [(AMOUNT-SCHRS)-SCH%]-CD%
        let amountAfterSchRs = amount - schRs;
        
        // Calculate scheme percentage amount
        let schPercentDiscount = 0;
        if (schPercent > 0) {
            schPercentDiscount = amountAfterSchRs * (schPercent / 100);
        }
        let amountAfterSch = amountAfterSchRs - schPercentDiscount;
        
        // Calculate cash discount amount
        let cdDiscount = 0;
        if (cdPercent > 0) {
            cdDiscount = amountAfterSch * (cdPercent / 100);
        }

        totalSchDiscount += schRs + schPercentDiscount;
        totalCdDiscount += cdDiscount;
    });

    // Round final net amount
    const netAmountRounded = Math.round(totalNetAmountExact);
    const roundOff = netAmountRounded - totalNetAmountExact;

    return {
        grossAmount: totalGrossAmount,
        totalSch: totalSchDiscount,
        totalCd: totalCdDiscount,
        netAmount: netAmountRounded, // Use the rounded value for display
        roundOff: roundOff
    };
  };

  // Tax details ko group karna by tax rate
  const groupTaxDetailsByRate = () => {
    if (!data) return [];
    
    const groupedTaxes: { [key: string]: TaxDetail } = {};
    
    data.taxDetails.forEach(tax => {
      const taxRate = tax.sgst.toFixed(2);
      const goodsValue = parseFloat(tax.goods || '0');
      
      if (!groupedTaxes[taxRate]) {
        groupedTaxes[taxRate] = {
          goods: '0',
          sgst: tax.sgst,
          sgstValue: 0,
          cgst: tax.cgst,
          cgstValue: 0
        };
      }
      
      groupedTaxes[taxRate].goods = (parseFloat(groupedTaxes[taxRate].goods) + goodsValue).toFixed(2);
      groupedTaxes[taxRate].sgstValue += tax.sgstValue;
      groupedTaxes[taxRate].cgstValue += tax.cgstValue;
    });
    
    return Object.values(groupedTaxes);
  };

  const { totalGoods, totalSGST, totalCGST } = calculateTaxTotals();
  const { grossAmount, totalSch, totalCd, netAmount, roundOff } = calculateActualTotals();
  const groupedTaxDetails = groupTaxDetailsByRate();

  // Items ko chunks mein split karna
  const chunkItems = (items: InvoiceItem[]): InvoiceItem[][] => {
    const chunks: InvoiceItem[][] = [];
    const totalItems = items.length;
    const itemsPerNormalPage = 11; // Regular pages have 11 items
    const itemsPerEndPage = 9; // End page can have 7 items
    
    // If we have more than 7 items, we need at least one normal page + one end page
    if (totalItems > itemsPerEndPage) {
      // Calculate how many full normal pages we need
      const normalPagesNeeded = Math.ceil((totalItems - itemsPerEndPage) / itemsPerNormalPage);
      let processedItems = 0;
      
      // Add normal pages
      for (let i = 0; i < normalPagesNeeded; i++) {
        chunks.push(items.slice(processedItems, processedItems + itemsPerNormalPage));
        processedItems += itemsPerNormalPage;
      }
      
      // Add the end page with remaining items (max 7)
      const remainingItems = items.slice(processedItems);
      chunks.push(remainingItems);
    } else {
      // If we have 7 or fewer items, just put them all on one end page
      chunks.push(items);
    }
    
    return chunks;
  };

  // Function to add blank rows to fill space on end page
  const addBlankRowsToEndPage = (chunk: InvoiceItem[], chunkIndex: number, chunksArray: InvoiceItem[][]): InvoiceItem[] => {
    // Only apply to the last chunk (end page)
    if (chunkIndex === chunksArray.length - 1) {
      const itemsPerEndPage = 9;
      const currentItems = chunk.length;
      
      // If the end page has fewer than 7 items, add blank rows
      if (currentItems < itemsPerEndPage) {
        const blankRowsNeeded = itemsPerEndPage - currentItems;
        const blankRows: InvoiceItem[] = Array(blankRowsNeeded).fill({
          item: '',
          godown: '',
          unit: '',
          rate: 0,
          qty: '',
          cess: '',
          schRs: '',
          sch: '',
          cd: '',
          amount: '',
          netAmount: '',
          particular: '',
          pack: '',
          gst: 0,
          mrp: 0
        });
        
        return [...chunk, ...blankRows];
      }
    }
    
    return chunk;
  };

  // Function to handle text wrapping in particulars column
  const handleTextWrapping = (text: string): { text: string, needsSmallerFont: boolean } => {
    const maxChars = 27;
    if (text && text.length > maxChars) {
      return { text, needsSmallerFont: true };
    }
    return { text, needsSmallerFont: false };
  };

  return (
    <div className="p-4 mx-auto max-w-6xl">
      <PageMeta title="Invoice Print" description="Print invoice details" />
      
      {/* Print controls - printing ke time hide honge */}
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
          {chunkItems(data.items).map((chunk, chunkIndex, chunksArray) => {
            // Add blank rows to end page if needed
            const finalChunk = addBlankRowsToEndPage(chunk, chunkIndex, chunksArray);
            
            return (
              <div key={chunkIndex} className={`page-container ${chunkIndex !== 0 ? 'page-break-before' : ''}`}>
                <table
                  className="w-full border border-black text-xs"
                >
                  <thead>
                    {/* Header Row */}
                    <tr>
                      <td colSpan={11} className="border border-black p-2">
                        <div className="flex">
                          <div className="w-1/3">
                            <p className="print:font-bold print:text-black">GSTN: {data.company.gstin}</p>
                            {/* <p className="font-bold">{data.company.subject}</p> */}
                            <p className="print:font-bold print:text-black">FSSAI NO: {data.company.fssaiNo}</p>
                            <p className="print:font-bold print:text-black">D.L. No.: {data.dlNo}</p>
                          </div>
                          <div className="w-1/3 text-center">
                            <p className="font-bold print:text-black">Tax Invoice</p>
                            <p className="text-xl font-bold print:text-black">{data.company.name}</p>
                            <p className="font-bold print:text-black">{data.company.address}</p>
                          </div>
                          <div className="w-1/3 text-right">
                            <p className="print:font-bold print:text-black">{data.company.phone}</p>
                            <p className="print:font-bold print:text-black">Office No: {data.company.officeNo}</p>
                            <p className="print:font-bold print:text-black">State Code: {data.company.stateCode}</p>
                          </div>
                        </div>
                      </td>
                      <td colSpan={3} className="border border-black p-2 align-middle">
                        <div className="text-center">
                          <p className="text-xl font-bold print:text-black">BILL MADE BY: {data.billMadeBy || 'SHUBHAM'}</p>
                        </div>
                      </td>
                    </tr>
                    
                    {/* Customer Info Row */}
                    <tr>
                      <td colSpan={11} className="border border-black p-2">
                        <div className="flex">
                          <div className="w-2/3 border-r border-black pr-2">
                            <p><span className="font-bold text-blue-800 print:text-black">Party</span> {data.party.name}</p>
                            <p><span className="font-bold text-blue-800 print:text-black">Address</span> {data.party.address}</p>
                            <p>
                              <span className="font-bold text-blue-800 print:text-black">GSTIN</span> {data.party.gstin || 'N/A'}
                              <span className="ml-4 font-bold text-blue-800 print:text-black">State Code :</span> {data.party.stateCode}
                            </p>
                            <p>
                              <span className="font-bold text-blue-800 print:text-black">Mobile No.</span> {data.party.mobileNo}
                              <span className="ml-4 font-bold text-blue-800 print:text-black">Balance</span> {data.party.balanceBf ? `${data.party.balanceBf}` : 'N/A'}
                            </p>
                          </div>
                          <div className="w-1/3 pl-2">
                            <div className="flex justify-between">
                              <p><span className="font-bold text-blue-800 print:text-black">Inv. No :</span> {data.invoice.displayNo || data.invoice.no}</p>
                              <p><span className="font-bold text-blue-800 print:text-black">Mode:</span> {data.invoice.mode}</p>
                            </div>
                            <p><span className="font-bold text-blue-800 print:text-black">Date:</span> {data.invoice.time}</p>
                            {data.invoice.dueDate && (
                              <p><span className="font-bold text-blue-800 print:text-black">Due Date</span> {data.invoice.dueDate}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td colSpan={3} className="border border-black p-2">
                        <div>
                          <p><span className="font-bold text-blue-800 print:text-black">Invoice No :</span> {data.invoice.displayNo || data.invoice.no}</p>
                          <p><span className="font-bold text-blue-800 print:text-black">Date:</span> {data.invoice.date}</p>
                          <p><span className="font-bold text-blue-800 print:text-black">Party</span> {data.party.name}</p>
                          <p><span className="font-bold text-blue-800 print:text-black">Mode:</span> {data.invoice.mode}</p>
                        </div>
                      </td>
                    </tr>
                    
                    {/* IRN Row */}
                    <tr>
                      <td colSpan={11} className="border border-black p-2">
                        <div className="flex justify-between">
                          <p><span className="font-bold text-blue-800 print:text-black">Ack. No:</span> {data.ack.no}</p>
                          <p><span className="font-bold text-blue-800 print:text-black">Ack. Date:</span> {data.ack.date}</p>
                          <p><span className="font-bold text-blue-800 print:text-black">IRN No:</span> {data.irn}</p>
                        </div>
                      </td>
                      <td colSpan={3} className="border border-black"></td>
                    </tr>
                    
                    {/* Table Headers */}
                    <tr className="bg-white">
                      <th className="border border-black p-1 font-bold text-blue-800 print:text-black w-[200px]">Particulars/HSN</th>
                      <th className="border border-black p-1 font-bold text-blue-800 print:text-black">Pack</th>
                      <th className="border border-black p-1 font-bold text-blue-800 print:text-black">M.R.P</th>
                      <th className="border border-black p-1 font-bold text-blue-800 print:text-black">GST%</th>
                      <th className="border border-black p-1 font-bold text-blue-800 print:text-black">
                        Rate<br />
                        <span className="text-xs">(incl of Tax)</span>
                      </th>
                      <th className="border border-black p-1 font-bold text-blue-800 print:text-black">Unit</th>
                      <th className="border border-black p-1 font-bold text-blue-800 print:text-black">Qty</th>
                      <th className="border border-black p-1 font-bold text-blue-800 print:text-black">Free</th>
                      <th className="border border-black p-1 font-bold text-blue-800 print:text-black">Sch Rs</th>
                      <th className="border border-black p-1 font-bold text-blue-800 print:text-black">
                        Co. Sch%<br />
                        Cash Disc%
                      </th>
                      <th className="border border-black p-1 font-bold text-blue-800 print:text-black">Net Amt.</th>
                      <th className="border border-black p-1 font-bold text-blue-800 print:text-black w-[200px]">
                        Particulars<br />
                        <div className="flex justify-between">
                          <span>Unit</span>
                          <span>M.R.P.</span>
                        </div>
                      </th>
                      <th className="border border-black p-1 font-bold text-blue-800 print:text-black">Free</th>
                      <th className="border border-black p-1 font-bold text-blue-800 print:text-black">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Product Rows */}
                    {finalChunk.map((item, index) => {
                      const { text: particular, needsSmallerFont } = handleTextWrapping(item.particular);
                      const isBlankRow = !item.particular && !item.rate && !item.qty;
                      
                      // --- DEBUG LOG --- START
                      if (!isBlankRow) {
                        console.log(`PrintItem ${index} Data:`, {
                          unit: item.unit,
                          unit1: item.unit1,
                          unit2: item.unit2,
                          pcBx: item.pcBx,
                          rate: item.rate
                        });
                      }
                      // --- DEBUG LOG --- END

                      // Determine if the current unit is the box unit (UNIT_2)
                      const isBoxUnit = item.unit && item.unit2 && item.unit === item.unit2; // Added check for item.unit2 existence
                      
                      // Display rate directly as it's already calculated for the unit
                      const displayRate = Number(item.rate);
                      
                      // Format unit display: Show "BOX - {pcBx}" if it's a box unit, otherwise show the unit code
                      const unitDisplay = isBoxUnit && item.pcBx ? `BOX - ${item.pcBx}` : item.unit;

                      return (
                        <tr key={index} className={isBlankRow ? "blank-row h-10" : ""}>
                          <td className={`border border-black p-1 text-left text-blue-800 print:text-black ${needsSmallerFont ? 'text-[smaller]' : ''}`}>
                            {particular}
                            {isBlankRow && <span className="invisible">Placeholder for consistent spacing</span>}
                          </td>
                          <td className="border border-black p-1 text-center print:text-black">{!isBlankRow ? item.pack : ""}</td>
                          <td className="border border-black p-1 text-center print:text-black">{!isBlankRow && item.mrp ? Number(item.mrp).toFixed(2) : ""}</td>
                          <td className="border border-black p-1 text-center text-orange-600 print:text-black">{!isBlankRow && item.gst ? item.gst.toFixed(2) : ""}</td>
                          <td className="border border-black p-1 text-center print:text-black">{!isBlankRow && item.rate ? displayRate.toFixed(2) : ""}</td>
                          <td className="border border-black p-1 text-center text-[smaller] print:text-black">{!isBlankRow ? unitDisplay : ""}</td>
                          <td className="border border-black p-1 text-center print:text-black">{!isBlankRow ? item.qty : ""}</td>
                          <td className="border border-black p-1 text-center print:text-black">{!isBlankRow ? "" : ""}</td>
                          <td className="border border-black p-1 text-center print:text-black">{!isBlankRow ? item.schRs : ""}</td>
                          <td className="border border-black p-1 text-center print:text-black">
                            {!isBlankRow ? (
                              <>
                                <div>{item.sch}{item.sch? "%" : ""}</div>
                                <div>{item.cd}{item.cd? "%" : ""}</div>
                              </>
                            ) : ""}
                          </td>
                          <td className="border border-black p-1 text-center text-blue-800 print:text-black">{!isBlankRow ? item.netAmount : ""}</td>
                          <td className={`border border-black p-1 text-left`}>
                            {!isBlankRow ? (
                              <>
                                <span className={`text-blue-800 print:text-black ${needsSmallerFont ? 'text-[smaller]' : ''}`}>{particular}</span>
                                <div className="flex justify-between print:text-black">
                                  <span className="text-[smaller] print:text-black">{unitDisplay}</span>
                                  <span className="print:text-black">{item.mrp ? Number(item.mrp).toFixed(2) : ""}</span>
                                </div>
                              </>
                            ) : (
                              <>
                                <span className="invisible">BLANK PRODUCT LINE </span>
                                <div className="flex justify-between">
                                  <span className="invisible">PCS</span>
                                  <span className="invisible">999.99</span>
                                </div>
                              </>
                            )}
                          </td>
                          <td className="border border-black p-1 text-center print:text-black">{!isBlankRow ? "" : ""}</td>
                          <td className="border border-black p-1 text-center print:text-black">{!isBlankRow ? item.qty : ""}</td>
                        </tr>
                      );
                    })}

                    {/* Summary aur Footer - sirf last table mein */}
                    {chunkIndex === chunksArray.length - 1 && (
                      <>
                        <tr>
                          <td colSpan={11} className="border border-black p-0">
                            <table className="w-full text-xs border-collapse">
                              <tr>
                                <td className="align-top border border-black p-1 text-[11px]" style={{ width: '10%' }}>
                                  <p className="font-bold text-blue-800 print:text-black">Items in Bill: {data.summary.itemsInBill}</p>
                                  <p className="font-bold text-blue-800 print:text-black">Cases in Bill: {data.summary.casesInBill}</p>
                                  <p className="font-bold text-blue-800 print:text-black">Loose items in Bill: {data.summary.looseItemsInBill}</p>
                                </td>
                                
                                <td className="align-top border border-black p-1" style={{ width: '25%' }}>
                                  <p className="font-bold text-blue-800 print:text-black">Terms & Conditions:</p>
                                  <p className="text-[10px] print:text-black">1. We hereby certify that articles of food mentioned in the invoice are warranted to be of the nature and quality which they purport to be as per the Food Safety and Standards Act and Rules.</p>
                                  <p className="text-[10px] print:text-black">2. Goods once sold will not be taken back. E & OE.</p>
                                </td>
                                
                                <td className="align-top border border-black" style={{ width: '20%' }}>
                                  <table className="w-full text-xs border-collapse">
                                    <tr className="text-xs">
                                      <td className="border-b border-r border-black p-1 font-bold text-blue-800 print:text-black">Goods</td>
                                      <td className="border-b border-r border-black p-1 font-bold text-blue-800 print:text-black">SGST%</td>
                                      <td className="border-b border-r border-black p-1 font-bold text-blue-800 print:text-black">Value</td>
                                      <td className="border-b border-r border-black p-1 font-bold text-blue-800 print:text-black">CGST%</td>
                                      <td className="border-b border-black p-1 font-bold text-blue-800 print:text-black">Value</td>
                                    </tr>
                                    {groupedTaxDetails.map((tax, index) => (
                                      <tr key={index} className="text-xs">
                                        <td className="border-r border-black p-1 print:text-black">{tax.goods || '0.00'}</td>
                                        <td className="border-r border-black p-1 print:text-black">{tax.sgst?.toFixed(2)}%</td>
                                        <td className="border-r border-black p-1 print:text-black">{tax.sgstValue?.toFixed(2)}</td>
                                        <td className="border-r border-black p-1 print:text-black">{tax.cgst?.toFixed(2)}%</td>
                                        <td className="p-1 print:text-black">{tax.cgstValue?.toFixed(2)}</td>
                                      </tr>
                                    ))}
                                    {Array(3 - groupedTaxDetails.length).fill(0).map((_, i) => (
                                      <tr key={i} className="text-xs">
                                        <td className="border-r border-black p-1 invisible">0</td>
                                        <td className="border-r border-black p-1 invisible">0</td>
                                        <td className="border-r border-black p-1 invisible">0</td>
                                        <td className="border-r border-black p-1 invisible">0</td>
                                        <td className="p-1 invisible"></td>
                                      </tr>
                                    ))}
                                    <tr className="text-xs">
                                      <td className="border-t border-r border-black p-1 font-bold print:text-black">{totalGoods.toFixed(2)}</td>
                                      <td className="border-t border-r border-black p-1 font-bold print:text-black"></td>
                                      <td className="border-t border-r border-black p-1 font-bold print:text-black">{totalSGST.toFixed(2)}</td>
                                      <td className="border-t border-r border-black p-1 font-bold print:text-black"></td>
                                      <td className="border-t border-black p-1 font-bold print:text-black">{totalCGST.toFixed(2)}</td>
                                    </tr>
                                  </table>
                                </td>
                                
                                <td className="align-top border border-black p-0" style={{ width: '25%' }}>
                                  <table className="w-full text-xs border-collapse">
                                    <tr>
                                      <td className="border-b border-r border-black p-1 font-bold text-blue-800 print:text-black text-left">Gross Amt.</td>
                                      <td className="border-b border-black p-1 text-right print:text-black">{grossAmount?.toFixed(2)}</td>
                                    </tr>
                                    <tr>
                                      <td className="border-b border-r border-black border-b-dashed p-1 font-bold text-blue-800 print:text-black text-left">Less Sch.</td>
                                      <td className="border-b border-black border-b-dashed p-1 text-right print:text-black">{totalSch.toFixed(2)}</td>
                                    </tr>
                                    <tr>
                                      <td className="border-b border-r border-black border-b-dashed p-1 font-bold text-blue-800 print:text-black text-left">Less CD</td>
                                      <td className="border-b border-black border-b-dashed p-1 text-right print:text-black">{totalCd.toFixed(2)}</td>
                                    </tr>
                                    <tr>
                                      <td className="border-b border-r border-black p-1 font-bold text-blue-800 print:text-black text-left">R.Off</td>
                                      <td className="border-b border-black p-1 text-right print:text-black">{roundOff.toFixed(2)}</td>
                                    </tr>
                                    <tr>
                                      <td className="border-r border-black p-1 font-bold text-blue-800 print:text-black text-left">Net Amt.</td>
                                      <td className="p-1 font-bold text-right print:text-black">{netAmount.toFixed(2)}</td>
                                    </tr>
                                  </table>
                                </td>
                              </tr>
                            </table>
                          </td>
                          <td colSpan={3} className="border border-black p-0">
                            <table className="w-full text-xs border-collapse">
                              <tr>
                                <td className="border-b border-r border-black p-1 font-bold text-blue-800 print:text-black text-left">Gross Amt.</td>
                                <td className="border-b border-black p-1 text-right print:text-black">{grossAmount?.toFixed(2)}</td>
                              </tr>
                              <tr>
                                <td className="border-b border-r border-black border-b-dashed p-1 font-bold text-blue-800 print:text-black text-left">Less Sch.</td>
                                <td className="border-b border-black border-b-dashed p-1 text-right print:text-black">{totalSch.toFixed(2)}</td>
                              </tr>
                              <tr>
                                <td className="border-b border-r border-black border-b-dashed p-1 font-bold text-blue-800 print:text-black text-left">Less CD</td>
                                <td className="border-b border-black border-b-dashed p-1 text-right print:text-black">{totalCd.toFixed(2)}</td>
                              </tr>
                              <tr>
                                <td className="border-b border-r border-black p-1 font-bold text-blue-800 print:text-black text-left">R.Off</td>
                                <td className="border-b border-black p-1 text-right print:text-black">{roundOff.toFixed(2)}</td>
                              </tr>
                              <tr>
                                <td className="border-r border-black p-1 font-bold text-blue-800 print:text-black text-left">Net Amt.</td>
                                <td className="p-1 font-bold text-right print:text-black">{netAmount.toFixed(2)}</td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={11} className="border border-black p-1 text-center text-xs print:font-bold print:text-black">
                            This is computer generated Bill, No signature required. Bank:PUNJAB NATIONAL BANK SEONI 0490008700003292 PUNB0049000
                            <div className={`float-right w-fit text-right font-bold print:text-black ${chunksArray.length === 1 ? 'invisible' : ''}`}>Page {chunkIndex + 1}/{chunksArray.length}</div>
                          </td>
                          <td colSpan={3} className="border border-black p-1 text-right text-xs">
                            <div className={`font-bold print:text-black ${chunksArray.length === 1 ? 'invisible' : ''}`}>Page {chunkIndex + 1}/{chunksArray.length}</div>
                          </td>
                        </tr>
                      </>
                    )}
                    
                    {/* Page number for non-last pages */}
                    {chunkIndex !== chunksArray.length - 1 && (
                      <tr>
                        <td colSpan={11} className="border border-black p-1 text-center text-xs print:font-bold print:text-black">
                            This is computer generated Bill, No signature required. Bank:PUNJAB NATIONAL BANK SEONI 0490008700003292 PUNB0049000
                            <div className={`float-right w-fit text-right font-bold print:text-black ${chunksArray.length === 1 ? 'invisible' : ''}`}>Page {chunkIndex + 1}/{chunksArray.length}</div>
                        </td>
                        <td colSpan={3} className="border border-black p-1 text-right text-xs">
                            <div className={`font-bold print:text-black ${chunksArray.length === 1 ? 'invisible' : ''}`}>Page {chunkIndex + 1}/{chunksArray.length}</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
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

      {/* Print-specific styles */}
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
          
          .page-container {
            margin-top: 0;
            position: relative;
          }
          
          .page-container:first-child {
            margin-top: 0;
          }
          
          .page-break-before {
            page-break-before: always;
            margin-top: 10px !important;
            padding-top: 0 !important;
          }
          
          table {
            margin: 0;
          }
          
          .border-b-dashed {
            border-bottom-style: dashed !important;
          }
          
          .blank-row {
            height: 2.5rem !important;
          }
          
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
        }
        
        .blank-row {
          height: 2.5rem;
        }
        
        .page-container:not(:first-child) {
          margin-top: 15px;
        }
      `}</style>
    </div>
  );
};

export default PrintInvoicing;