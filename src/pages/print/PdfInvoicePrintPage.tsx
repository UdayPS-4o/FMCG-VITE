import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import constants from '../../constants';
import PageMeta from '../../components/common/PageMeta';

// Re-use interfaces from PrintInvoicing or define them here
interface CompanyInfo { name: string; gstin: string; subject: string; fssaiNo: string; address: string; phone: string; officeNo: string; stateCode: string; }
interface PartyInfo { name: string; address: string; gstin: string; stateCode: string; mobileNo: string; balanceBf: number; }
interface InvoiceInfo { no: string; mode: string; date: string; time: string; dueDate: string; displayNo: string; }
interface AckInfo { no: string; date: string; }
interface InvoiceItem { item: string; godown: string; unit: string; rate: number; qty: string; cess: string; schRs: string; sch: string; cd: string; amount: string; netAmount: string; particular: string; pack: string; gst: number; mrp: number; pcBx?: string; unit1?: string; unit2?: string; hsn?: string; }
interface Summary { itemsInBill: number; casesInBill: number; looseItemsInBill: number; }
interface TaxDetail { goods: string; sgst: number; sgstValue: number; cgst: number; cgstValue: number; }
interface TotalInfo { grossAmt: number; lessSch: number; lessCd: number; rOff: number; netAmount: number; }
interface InvoiceData { company: CompanyInfo; dlNo: string; party: PartyInfo; invoice: InvoiceInfo; ack: AckInfo; irn: string; billMadeBy: string; items: InvoiceItem[]; summary: Summary; taxDetails: TaxDetail[]; totals: TotalInfo; }

const PdfInvoicePrintPage: React.FC = () => {
    const { id: invoiceId } = useParams<{ id: string }>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<InvoiceData | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!invoiceId) {
                setError('No invoice ID provided in URL');
                setLoading(false);
                return;
            }

            try {
                const response = await fetch(`${constants.baseURL}/api/internal/invoice-data/${invoiceId}`);
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Failed to fetch invoice data');
                }

                const responseData = await response.json();
                setData(responseData);
                setLoading(false);
            } catch (err: any) {
                console.error('Error fetching internal invoice data:', err);
                setError(err.message || 'Failed to load invoice data');
                setLoading(false);
            }
        };

        fetchData();
    }, [invoiceId]);

    // --- Re-use calculation and rendering logic from PrintInvoicing --- START
    // (Omitting calculations for brevity - assume they are copied here)
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
            // Apply discounts in a compound manner: [(AMOUNT-SCHRS)-SCH%]-CD%
            let amountAfterSchRs = amount - schRs;
            let schPercentDiscount = 0;
            if (schPercent > 0) {
                schPercentDiscount = amountAfterSchRs * (schPercent / 100);
            }
            let amountAfterSch = amountAfterSchRs - schPercentDiscount;
            let cdDiscount = 0;
            if (cdPercent > 0) {
                cdDiscount = amountAfterSch * (cdPercent / 100);
            }
            totalSchDiscount += schRs + schPercentDiscount;
            totalCdDiscount += cdDiscount;
        });
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
    const chunkItems = (items: InvoiceItem[]): InvoiceItem[][] => { 
        const chunks: InvoiceItem[][] = [];
        const totalItems = items.length;
        const itemsPerNormalPage = 14; // Regular pages have 11 items
        const itemsPerEndPage = 10; // End page can have 9 items (updated)
        if (totalItems > itemsPerEndPage) {
          // Calculate how many full normal pages we need
          const normalPagesNeeded = Math.ceil((totalItems - itemsPerEndPage) / itemsPerNormalPage);
          let processedItems = 0;
          // Add normal pages
          for (let i = 0; i < normalPagesNeeded; i++) {
            chunks.push(items.slice(processedItems, processedItems + itemsPerNormalPage));
            processedItems += itemsPerNormalPage;
          }
          // Add the end page with remaining items
          const remainingItems = items.slice(processedItems);
          chunks.push(remainingItems);
        } else {
          // If we have 9 or fewer items, just put them all on one end page
          chunks.push(items);
        }
        return chunks;
    };
    const addBlankRowsToEndPage = (chunk: InvoiceItem[], chunkIndex: number, chunksArray: InvoiceItem[][]): InvoiceItem[] => { 
        // Only apply to the last chunk (end page)
        if (chunkIndex === chunksArray.length - 1) {
          const itemsPerEndPage = 10; // Match end page item count
          const currentItems = chunk.length;
          // If the end page has fewer than 9 items, add blank rows
          if (currentItems < itemsPerEndPage) {
            const blankRowsNeeded = itemsPerEndPage - currentItems;
            const blankRows: InvoiceItem[] = Array(blankRowsNeeded).fill({
              item: '', godown: '', unit: '', rate: 0, qty: '', cess: '', schRs: '', sch: '', cd: '', amount: '', netAmount: '', particular: '', pack: '', gst: 0, mrp: 0, hsn: ''
            });
            return [...chunk, ...blankRows];
          }
        }
        return chunk;
    };
    const handleTextWrapping = (text: string): { text: string, needsSmallerFont: boolean } => { 
        const maxChars = 27; // Keep max chars consistent
        if (text && text.length > maxChars) {
            return { text, needsSmallerFont: true };
        }
        return { text, needsSmallerFont: false };
    };

    const { totalGoods, totalSGST, totalCGST } = calculateTaxTotals();
    const { grossAmount, totalSch, totalCd, netAmount, roundOff } = calculateActualTotals();
    const groupedTaxDetails = groupTaxDetailsByRate();

    // --- Re-use calculation and rendering logic from PrintInvoicing --- END

    if (loading) {
        return <div data-status="loading">Loading invoice data...</div>;
    }

    if (error) {
        return <div data-status="error">Error: {error}</div>;
    }

    if (!data) {
        return <div data-status="no-data">No invoice data found.</div>;
    }

    return (
        // Basic container, styling primarily handled by print CSS
        <div className="pdf-print-container">
            <PageMeta title={`Invoice ${data.invoice.displayNo || data.invoice.no}`} description="Invoice for PDF Generation" />

            {/* Invoice Content - Copied structure from PrintInvoicing */} 
            <div ref={printRef} className="invoice-render-area">
                {chunkItems(data.items).map((chunk, chunkIndex, chunksArray) => {
                    const finalChunk = addBlankRowsToEndPage(chunk, chunkIndex, chunksArray);
                    return (
                        <div key={chunkIndex} className={`page-container ${chunkIndex !== 0 ? 'page-break-before' : ''}`}>
                            {/* --- Copy the entire table structure from PrintInvoicing.tsx here --- */}
                            {/* Make sure to use the calculated variables (totalGoods, etc.) */}
                            {/* and the `finalChunk` data */}
                            <table className="w-full border border-black text-xs">
                                {/* Header Row */}
                                <thead>
                                    <tr>
                                        <td colSpan={11} className="border border-black p-2">
                                            <div className="flex">
                                                <div className="w-1/3">
                                                    <p className="print:font-bold print:text-black">GSTN: {data.company.gstin}</p>
                                                    <p className="print:font-bold print:text-black">FSSAI NO: {data.company.fssaiNo}</p>
                                                    <p className="print:font-bold print:text-black">D.L. No.: {data.dlNo}</p>
                                                </div>
                                                <div className="w-1/3 text-center">
                                                    <p className="font-bold print:text-black">Tax Invoice</p>
                                                    <p className="text-xl font-bold print:text-black">EKTA ENTERPRISES</p>
                                                    <p className="font-bold print:text-black">BUDHWARI BAZAR,GN ROAD SEONI,</p>
                                                </div>
                                                <div className="w-1/3 text-right">
                                                    <p className="print:font-bold print:text-black">{data.company.phone}</p>
                                                    <p className="print:font-bold print:text-black">Office No: {data.company.officeNo}</p>
                                                    <p className="print:font-bold print:text-black">State Code: {data.company.stateCode}</p>
                                                    <p className="text-[10px] mt-1 print:text-black text-right">Bill Made By: {data.billMadeBy}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td colSpan={3} className="border border-black p-2 align-middle">
                                            <div className="text-center">
                                                <p className="font-bold print:text-black">Tax Invoice</p>
                                                <p className="text-xl font-bold print:text-black">EKTA ENTERPRISES</p>
                                                <p className="font-bold print:text-black">BUDHWARI BAZAR,GN ROAD SEONI,</p>
                                            </div>
                                        </td>
                                    </tr>
                                    {/* Customer Info Row */}
                                    <tr>
                                        <td colSpan={11} className="border border-black p-2">
                                            <div className="flex">
                                                <div className="w-2/3 border-r border-black pr-2">
                                                    <p><span className="font-bold print:text-black">Party</span> {data.party.name}</p>
                                                    <p><span className="font-bold print:text-black">Address</span> {data.party.address}</p>
                                                    <div className="grid grid-cols-2">
                                                        <div className="col-span-1">
                                                            <p><span className="font-bold print:text-black">GSTIN</span> {data.party.gstin || 'N/A'}</p>
                                                            <p><span className="font-bold print:text-black">Mobile No.</span> {data.party.mobileNo}</p>
                                                        </div>
                                                        <div className="col-span-1">
                                                            <p><span className="font-bold print:text-black">State Code :</span> {data.party.stateCode}</p>
                                                            <p><span className="font-bold print:text-black">Balance</span> {data.party.balanceBf ? `${data.party.balanceBf}` : 'N/A'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="w-1/3 pl-2">
                                                    <p><span className="font-bold print:text-black">Inv. No :</span> {data.invoice.displayNo || data.invoice.no}</p>
                                                    <p><span className="font-bold print:text-black">Date:</span> {data.invoice.time} {/* Using time here as per PrintInvoicing */}</p>
                                                    {data.invoice.dueDate && (
                                                        <p><span className="font-bold print:text-black">Due Date:</span> {data.invoice.dueDate}</p>
                                                    )}
                                                    <p><span className="font-bold print:text-black">Mode:</span> {data.invoice.mode}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td colSpan={3} className="border border-black p-2">
                                            <div>
                                                <div className="flex justify-between items-center">
                                                    <p className="mb-0"><span className="font-bold print:text-black">Invoice No :</span> {data.invoice.displayNo || data.invoice.no}</p>
                                                    <p className="mb-0"><span className="font-bold print:text-black">Mode:</span> {data.invoice.mode}</p>
                                                </div>
                                                <p className="mb-0"><span className="font-bold print:text-black">Date:</span> {data.invoice.date}</p>
                                                <p className="mt-1 mb-0"><span className="font-bold print:text-black">Party</span> {data.party.name}</p>
                                            </div>
                                        </td>
                                    </tr>
                                    {/* IRN Row */}
                                    <tr>
                                        <td colSpan={11} className="border border-black p-2">
                                            <div className="flex justify-between">
                                                <p><span className="font-bold print:text-black">Ack. No:</span> {data.ack.no}</p>
                                                <p><span className="font-bold print:text-black">Ack. Date:</span> {data.ack.date}</p>
                                                <p><span className="font-bold print:text-black">IRN No:</span> {data.irn}</p>
                                            </div>
                                        </td>
                                        <td colSpan={3} className="border border-black"></td>
                                    </tr>
                                    {/* Table Headers */}
                                    <tr className="bg-white">
                                        <th className="border border-black p-1 font-bold print:text-black w-[200px]">Particulars/HSN</th>
                                        <th className="border border-black p-1 font-bold print:text-black">Pack</th>
                                        <th className="border border-black p-1 font-bold print:text-black">M.R.P</th>
                                        <th className="border border-black p-1 font-bold print:text-black">GST%</th>
                                        <th className="border border-black p-1 font-bold print:text-black">Rate<br /><span className="text-xs">(incl of Tax)</span></th>
                                        <th className="border border-black p-1 font-bold print:text-black">Unit</th>
                                        <th className="border border-black p-1 font-bold print:text-black">Qty</th>
                                        <th className="border border-black p-1 font-bold print:text-black">Free</th>
                                        <th className="border border-black p-1 font-bold print:text-black">Sch Rs</th>
                                        <th className="border border-black p-1 font-bold print:text-black">Co. Sch%<br />Cash Disc%</th>
                                        <th className="border border-black p-1 font-bold print:text-black">Net Amt.</th>
                                        <th className="border border-black p-1 font-bold print:text-black w-[200px]">
                                            Particulars<br />
                                            <div className="flex justify-between">
                                                <span>Unit</span>
                                                <span>M.R.P.</span>
                                            </div>
                                        </th>
                                        <th className="border border-black p-1 font-bold print:text-black">Free</th>
                                        <th className="border border-black p-1 font-bold print:text-black">Qty</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Product Rows */}
                                    {finalChunk.map((item, index) => {
                                        // --- DEBUG LOG --- Add this log
                                        if (!item.particular && !item.rate && !item.qty) {
                                            // Don't log blank rows
                                        } else {
                                            console.log(`[PdfInvoicePrintPage] Item ${index} Data:`, item);
                                        }
                                        // --- END DEBUG LOG ---

                                        const { text: particular, needsSmallerFont } = handleTextWrapping(item.particular);
                                        const isBlankRow = !item.particular && !item.rate && !item.qty;
                                        const isSecondUnit = item.unit && item.unit2 &&
                                            item.unit.trim().toLowerCase() === item.unit2.trim().toLowerCase();
                                        const displayRate = Number(item.rate);
                                        const unitDisplay = isSecondUnit && item.pcBx
                                            ? `${item.unit2.toUpperCase()} - ${item.pcBx}`
                                            : (item.unit || "");

                                        return (
                                            <tr key={index} className={isBlankRow ? "blank-row h-10" : ""}>
                                                <td className={`border border-black p-1 text-left print:text-black align-top ${needsSmallerFont ? 'text-[smaller]' : ''}`}>
                                                    {particular}
                                                    {!isBlankRow && item.hsn && <div className="text-[9px]">HSN: {item.hsn}</div>} 
                                                    {isBlankRow && <span className="invisible">Placeholder</span>}{/* Placeholder for consistent spacing */}
                                                </td>
                                                <td className="border border-black p-1 text-center print:text-black">{!isBlankRow ? item.pack : ""}</td>
                                                <td className="border border-black p-1 text-center print:text-black">{!isBlankRow && item.mrp ? Number(item.mrp).toFixed(2) : ""}</td>
                                                <td className="border border-black p-1 text-center print:text-black">{!isBlankRow && item.gst ? item.gst.toFixed(2) : ""}</td>
                                                <td className="border border-black p-1 text-center print:text-black">{!isBlankRow && item.rate ? displayRate.toFixed(2) : ""}</td>
                                                <td className="border border-black p-1 text-center text-[smaller] print:text-black">{!isBlankRow ? unitDisplay : ""}</td>
                                                <td className="border border-black p-1 text-center print:text-black">{!isBlankRow ? item.qty : ""}</td>
                                                <td className="border border-black p-1 text-center print:text-black">{!isBlankRow ? "" : ""}</td> {/* Free column - typically empty */}
                                                <td className="border border-black p-1 text-center print:text-black">{!isBlankRow ? item.schRs : ""}</td>
                                                <td className="border border-black p-1 text-center print:text-black">
                                                    {!isBlankRow ? (
                                                        <>
                                                            {item.sch && item.cd ? (
                                                                <>
                                                                    <div>{item.sch}{item.sch ? "%" : ""}</div>
                                                                    <div>{item.cd}{item.cd ? "%" : ""}</div>
                                                                </>
                                                            ) : item.sch ? (
                                                                <>
                                                                    <div>{item.sch}{item.sch ? "%" : ""}</div>
                                                                    <div>&nbsp;</div>
                                                                </>
                                                            ) : item.cd ? (
                                                                <>
                                                                    <div>&nbsp;</div>
                                                                    <div>{item.cd}{item.cd ? "%" : ""}</div>
                                                                </>
                                                            ) : (
                                                                "" 
                                                            )}
                                                        </>
                                                    ) : ""}
                                                </td>
                                                <td className="border border-black p-1 text-center print:text-black">{!isBlankRow ? item.netAmount : ""}</td>
                                                {/* Duplicate columns for the second half of the A4 landscape page */}
                                                <td className={`border border-black p-1 text-left align-top`}>
                                                    {!isBlankRow ? (
                                                        <>
                                                            <span className={`print:text-black ${needsSmallerFont ? 'text-[smaller]' : ''}`}>{particular}</span>
                                                            {/* {!isBlankRow && item.hsn && <div className="text-[9px]">HSN: {item.hsn}</div>} */}
                                                            <div className="flex justify-between print:text-black">
                                                                <span className="text-[smaller] print:text-black">{unitDisplay}</span>
                                                                <span className="print:text-black">{item.mrp ? Number(item.mrp).toFixed(2) : ""}</span>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="invisible">BLANK</span>
                                                            <div className="flex justify-between"><span className="invisible">PCS</span><span className="invisible">999.99</span></div>
                                                        </>
                                                    )}
                                                </td>
                                                <td className="border border-black p-1 text-center print:text-black">{!isBlankRow ? "" : ""}</td> {/* Free column */}
                                                <td className="border border-black p-1 text-center print:text-black">{!isBlankRow ? item.qty : ""}</td>
                                            </tr>
                                        );
                                    })}

                                    {/* Summary aur Footer - sirf last table mein */}
                                    {chunkIndex === chunksArray.length - 1 && (
                                        <>
                                            <tr>
                                                {/* Left side summary - Remove outer border */}
                                                <td colSpan={11} className="p-0"> {/* Removed border border-black */}
                                                    <table className="w-full text-xs border-collapse">
                                                        <tr>
                                                            <td className="align-top border border-black p-1 text-[11px]" style={{ width: '10%' }}>
                                                                <p className="font-bold print:text-black">Items: {data.summary.itemsInBill}</p>
                                                                <p className="font-bold print:text-black">Cases: {data.summary.casesInBill}</p>
                                                                <p className="font-bold print:text-black">Loose: {data.summary.looseItemsInBill}</p>
                                                            </td>
                                                            <td className="align-top border border-black p-1" style={{ width: '25%' }}>
                                                                <p className="font-bold print:text-black">Terms & Conditions:</p>
                                                                <p className="text-[10px] print:text-black">1. We hereby certify that articles of food mentioned in the invoice are warranted to be of the nature and quality which they purport to be as per the Food Safety and Standards Act and Rules.</p>
                                                                <p className="text-[10px] print:text-black">2. Goods once sold will not be taken back. E & OE.</p>
                                                            </td>
                                                            <td className="align-top border border-black" style={{ width: '20%' }}>
                                                                <table className="w-full text-xs border-collapse">
                                                                    <tr className="text-xs">
                                                                        <td className="border-b border-r border-black p-1 font-bold print:text-black">Goods</td>
                                                                        <td className="border-b border-r border-black p-1 font-bold print:text-black">SGST%</td>
                                                                        <td className="border-b border-r border-black p-1 font-bold print:text-black">Value</td>
                                                                        <td className="border-b border-r border-black p-1 font-bold print:text-black">CGST%</td>
                                                                        <td className="border-b border-black p-1 font-bold print:text-black">Value</td>
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
                                                                    <tr><td className="border-b border-r border-black p-1 font-bold print:text-black text-left">Gross Amt.</td><td className="border-b border-black p-1 text-right print:text-black">{grossAmount?.toFixed(2)}</td></tr>
                                                                    <tr><td className="border-b border-r border-black border-b-dashed p-1 font-bold print:text-black text-left">Less Sch.</td><td className="border-b border-black border-b-dashed p-1 text-right print:text-black">{totalSch.toFixed(2)}</td></tr>
                                                                    <tr><td className="border-b border-r border-black border-b-dashed p-1 font-bold print:text-black text-left">Less CD</td><td className="border-b border-black border-b-dashed p-1 text-right print:text-black">{totalCd.toFixed(2)}</td></tr>
                                                                    <tr><td className="border-b border-r border-black p-1 font-bold print:text-black text-left">R.Off</td><td className="border-b border-black p-1 text-right print:text-black">{roundOff.toFixed(2)}</td></tr>
                                                                    <tr><td className="border-r border-black p-1 font-bold print:text-black text-left">Net Amt.</td><td className="p-1 font-bold text-right print:text-black">{netAmount.toFixed(2)}</td></tr>
                                                                </table>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                                {/* Right side summary (duplicate totals) - Remove outer border */}
                                                <td colSpan={3} className="p-0"> {/* Removed border border-black */}
                                                    <table className="w-full text-xs border-collapse">
                                                        <tr><td className="border-b border-r border-black p-1 font-bold print:text-black text-left">Gross Amt.</td><td className="border-b border-black p-1 text-right print:text-black">{grossAmount?.toFixed(2)}</td></tr>
                                                        <tr><td className="border-b border-r border-black border-b-dashed p-1 font-bold print:text-black text-left">Less Sch.</td><td className="border-b border-black border-b-dashed p-1 text-right print:text-black">{totalSch.toFixed(2)}</td></tr>
                                                        <tr><td className="border-b border-r border-black border-b-dashed p-1 font-bold print:text-black text-left">Less CD</td><td className="border-b border-black border-b-dashed p-1 text-right print:text-black">{totalCd.toFixed(2)}</td></tr>
                                                        <tr><td className="border-b border-r border-black p-1 font-bold print:text-black text-left">R.Off</td><td className="border-b border-black p-1 text-right print:text-black">{roundOff.toFixed(2)}</td></tr>
                                                        <tr><td className="border-r border-black p-1 font-bold print:text-black text-left">Net Amt.</td><td className="p-1 font-bold text-right print:text-black">{netAmount.toFixed(2)}</td></tr>
                                                    </table>
                                                </td>
                                            </tr>
                                            {/* Page Number Footer */}
                                            <tr>
                                                <td colSpan={11} className="border border-black p-1 text-xs print:font-bold print:text-black">
                                                    <div className="flex justify-between items-center">
                                                        <span>
                                                            This is computer generated Bill, No signature required. Bank:PUNJAB NATIONAL BANK SEONI 0490008700003292 PUNB0049000
                                                        </span>
                                                        <span className="font-bold print:text-black">Page {chunkIndex + 1}/{chunksArray.length}</span>
                                                    </div>
                                                </td>
                                                <td colSpan={3} className="border border-black p-1 text-xs">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[10px] print:text-black">bill made by: {data.billMadeBy}</span>
                                                        <span className="font-bold print:text-black">Page {chunkIndex + 1}/{chunksArray.length}</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        </>
                                    )}
                                    {/* Page number for non-last pages */}
                                    {chunkIndex !== chunksArray.length - 1 && (
                                        <tr>
                                            <td colSpan={11} className="border border-black p-1 text-xs print:font-bold print:text-black">
                                                <div className="flex justify-between items-center">
                                                    <span>
                                                         This is computer generated Bill, No signature required. Bank:PUNJAB NATIONAL BANK SEONI 0490008700003292 PUNB0049000
                                                    </span>
                                                    <span className="font-bold print:text-black">Page {chunkIndex + 1}/{chunksArray.length}</span>
                                                </div>
                                            </td>
                                            <td colSpan={3} className="border border-black p-1 text-xs">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[10px] print:text-black">bill made by: {data.billMadeBy}</span>
                                                    <span className="font-bold print:text-black">Page {chunkIndex + 1}/{chunksArray.length}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    );
                })}
            </div>

            {/* --- Styles for PDF generation --- */}
            <style>{`
                /* Force landscape orientation using @page */
                @page {
                    size: A4 landscape;
                    margin: 2mm; /* Ensure no default margins */
                }

                /* Base page setup for PDF */
                body {
                    margin: 0;
                    padding: 0;
                    background-color: white !important; /* Ensure background */
                    color: black !important;
                    -webkit-print-color-adjust: exact !important; 
                    print-color-adjust: exact !important;
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; /* Define a default font stack */
                }
                .pdf-print-container {
                    margin: 0;
                    padding: 0;
                }
                .invoice-render-area {
                    /* No extra styles needed here usually */
                }
                .page-container {
                    page-break-inside: avoid; /* Try to avoid breaking tables mid-page if possible */
                }
                .page-break-before {
                    page-break-before: always;
                    margin-top: 0; /* Reset margin from screen styles */
                    padding-top: 0; /* Reset padding */
                }
                table {
                    border-collapse: collapse;
                    width: 100%;
                    border-spacing: 0;
                    margin: 0; /* Remove margin for print */
                }
                td, th {
                    /* REMOVED: border: 1px solid black !important; */ /* Let utility classes handle borders */
                    padding: 2px;
                    font-size: 10px;
                    vertical-align: top;
                    color: black !important; /* Ensure text is black */
                }
                th {
                    font-weight: bold; 
                    background-color: #eee !important; /* Light gray background for headers */
                    color: black !important; /* Ensure header text is black */
                }

                /* Specific styles copied/adapted from PrintInvoicing's @media print block */
                 .print\:hidden { display: none !important; }
                 .print\:shadow-none { box-shadow: none !important; }
                 .print\:text-black { color: black !important; }
                 .print\:font-bold { font-weight: bold !important; }
                 .print\:border-black { border-color: black !important; }
                 .border-b-dashed { border-bottom-style: dashed !important; }
                 .blank-row { height: 2.5rem !important; /* Height from PrintInvoicing */ }
                 .blank-row td {
                     /* REMOVED: background-color: white !important; */ /* Let utility classes handle background */
                 }
                 .invisible { visibility: hidden; }

                 /* Utility classes needed for rendering (ensure these match Tailwind if used) */
                 .w-full { width: 100%; }
                 .border { border-width: 1px; }
                 .border-black { border-color: #000 !important; }
                 .p-0 { padding: 0; }
                 .p-1 { padding: 0.25rem; }
                 .p-2 { padding: 0.5rem; }
                 .text-center { text-align: center; }
                 .text-left { text-align: left; }
                 .text-right { text-align: right; }
                 .font-bold { font-weight: 700 !important; /* Use important for overrides */ }
                 .text-xs { font-size: 10px !important; }
                 .text-sm { font-size: 0.875rem; } /* Adjust as needed */
                 .text-base { font-size: 1rem; }
                 .text-lg { font-size: 1.125rem; }
                 .text-xl { font-size: 1.25rem !important; }
                 .text-\[smaller\] { font-size: 9px !important; }
                 .text-\[10px\] { font-size: 10px !important; }
                 .text-\[11px\] { font-size: 11px !important; }
                 .flex { display: flex; }
                 .justify-between { justify-content: space-between; }
                 .items-center { align-items: center; }
                 .w-1\/3 { width: 33.333333%; }
                 .w-2\/3 { width: 66.666667%; }
                 .grid { display: grid; }
                 .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                 .col-span-1 { grid-column: span 1 / span 1; }
                 .pl-2 { padding-left: 0.5rem; }
                 .pr-2 { padding-right: 0.5rem; }
                 .border-r { border-right-width: 1px !important; border-right-color: black !important; }
                 .border-b { border-bottom-width: 1px !important; border-bottom-color: black !important; }
                 .border-t { border-top-width: 1px !important; border-top-color: black !important; }
                 .mt-1 { margin-top: 0.25rem; }
                 .mb-0 { margin-bottom: 0; }
                 .align-middle { vertical-align: middle; }
                 .align-top { vertical-align: top; }
                 .border-collapse { border-collapse: collapse; }
                 .bg-white { background-color: #fff !important; }
                 /* Remove text color utilities if everything should be black */
                 /* .text-blue-800 { color: #1e40af !important; } */
                 /* .text-orange-600 { color: #ea580c !important; } */

                 /* Ensure any other utilities used in the JSX are defined here */
            `}</style>
        </div>
    );
};

export default PdfInvoicePrintPage; 