import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getInvoiceData, fetchProducts } from '../lib/api';
import { ChevronLeft, Download, ShoppingCart, Plus, Package, Check } from 'lucide-react';
import { useStore } from '../context/StoreContext';

const InvoiceView = () => {
    const { series, billNo } = useParams<{ series: string; billNo: string }>();
    const navigate = useNavigate();
    const { addToCart, language } = useStore();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [addedItemId, setAddedItemId] = useState<string | null>(null);

    useEffect(() => {
        if (!series || !billNo) return;
        setLoading(true);
        getInvoiceData(series, billNo)
            .then(setData)
            .catch(err => setError(err.message || 'Failed to load invoice'))
            .finally(() => setLoading(false));
    }, [series, billNo]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col">
                <div className="bg-white px-4 pt-4 pb-3 border-b border-gray-100 flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full">
                        <ChevronLeft size={20} />
                    </button>
                    <h1 className="text-lg font-bold">{language === 'en' ? 'Loading Bill...' : 'बिल लोड हो रहा है...'}</h1>
                </div>
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                    {language === 'en' ? 'Please wait...' : 'कृपया प्रतीक्षा करें...'}
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col">
                <div className="bg-white px-4 pt-4 pb-3 border-b border-gray-100 flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full">
                        <ChevronLeft size={20} />
                    </button>
                    <h1 className="text-lg font-bold">{language === 'en' ? 'Error' : 'त्रुटि'}</h1>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                    <p className="text-red-500 mb-4">{error || (language === 'en' ? 'Invoice not found' : 'इनवॉइस नहीं मिला')}</p>
                    <button onClick={() => navigate(-1)} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium">
                        {language === 'en' ? 'Go Back' : 'वापस जाएं'}
                    </button>
                </div>
            </div>
        );
    }

    // Helper to calculate specific exact totals logic
    const calculateActualTotals = () => {
        if (!data) return { grossAmount: 0, totalSch: 0, totalCd: 0, netAmount: 0, roundOff: 0 };
        let totalGrossAmount = 0;
        let totalSchDiscount = 0;
        let totalCdDiscount = 0;
        let totalNetAmountExact = 0;

        data.items.forEach((item: any) => {
            const amount = parseFloat(item.amount) || 0;
            const schRs = parseFloat(item.schRs) || 0;
            const schPercent = parseFloat(item.sch) || 0;
            const cdPercent = parseFloat(item.cd) || 0;
            const itemNetAmount = parseFloat(item.netAmount) || 0;

            totalGrossAmount += amount;
            totalNetAmountExact += itemNetAmount;

            let amountAfterSchRs = amount - schRs;
            let schPercentDiscount = (schPercent > 0) ? amountAfterSchRs * (schPercent / 100) : 0;
            let amountAfterSch = amountAfterSchRs - schPercentDiscount;
            let cdDiscount = (cdPercent > 0) ? amountAfterSch * (cdPercent / 100) : 0;

            totalSchDiscount += schRs + schPercentDiscount;
            totalCdDiscount += cdDiscount;
        });

        const netAmountRounded = Math.round(totalNetAmountExact);
        const roundOff = netAmountRounded - totalNetAmountExact;

        return {
            grossAmount: totalGrossAmount,
            totalSch: totalSchDiscount,
            totalCd: totalCdDiscount,
            netAmount: netAmountRounded,
            roundOff: roundOff
        };
    };

    const { grossAmount, totalSch, netAmount } = calculateActualTotals();

    const handleDownload = () => {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/app';
        const BASE_URL = API_URL.replace('/api/app', '');
        const url = `${BASE_URL}/api/generate-pdf/dbf-invoice/${series}/${billNo}?redirect=true`;
        window.open(url, '_blank');
    };

    const handleReorder = async (item: any) => {
        setAddedItemId(item.item || item.particular);
        let pcs = 0, boxes = 0;
        if (item.unit?.toUpperCase() === 'BOX') {
            boxes = parseInt(item.qty, 10) || 1;
        } else {
            pcs = parseInt(item.qty, 10) || 1;
        }

        try {
            const res = await fetchProducts(1, 1, '', '', '', item.item);
            let productToUse: any = {
                CODE: item.item,
                PRODUCT: item.particular,
                UNIT_1: item.unit1 || item.unit || 'PCS',
                UNIT_2: item.unit2 || 'BOX',
                MULT_F: item.pcBx || '1',
                RATE1: item.rate,
                MRP1: item.mrp,
                PACK: item.pack
            };

            if (res.data && res.data.length > 0) {
                const found = res.data.find((p: any) => p.CODE === item.item);
                if (found) productToUse = found;
            }

            addToCart(productToUse, pcs, boxes);
        } catch (e) {
            console.error(e);
        }

        setTimeout(() => setAddedItemId(null), 1000);
    };

    const handleReorderAll = async () => {
        if (!data || !data.items) return;
        const codes = data.items.map((i: any) => i.item).filter(Boolean).join(',');
        try {
            const res = await fetchProducts(1, 1000, '', '', '', codes);
            const productsMap = new Map(res.data?.map((p: any) => [p.CODE, p]));

            data.items.forEach((item: any) => {
                let pcs = 0, boxes = 0;
                if (item.unit?.toUpperCase() === 'BOX') {
                    boxes = parseInt(item.qty, 10) || 1;
                } else {
                    pcs = parseInt(item.qty, 10) || 1;
                }

                const productToUse = (productsMap.get(item.item) || {
                    CODE: item.item,
                    PRODUCT: item.particular,
                    UNIT_1: item.unit1 || item.unit || 'PCS',
                    UNIT_2: item.unit2 || 'BOX',
                    MULT_F: item.pcBx || '1',
                    RATE1: item.rate,
                    MRP1: item.mrp,
                    PACK: item.pack
                }) as unknown as any;

                addToCart(productToUse, pcs, boxes);
            });
        } catch (e) {
            console.error(e);
            // Fallback
            data.items.forEach((item: any) => {
                let pcs = 0, boxes = 0;
                if (item.unit?.toUpperCase() === 'BOX') {
                    boxes = parseInt(item.qty, 10) || 1;
                } else {
                    pcs = parseInt(item.qty, 10) || 1;
                }
                addToCart({
                    CODE: item.item,
                    PRODUCT: item.particular,
                    UNIT_1: item.unit1 || item.unit || 'PCS',
                    UNIT_2: item.unit2 || 'BOX',
                    MULT_F: item.pcBx || '1',
                    RATE1: item.rate,
                    MRP1: item.mrp,
                    PACK: item.pack
                } as any, pcs, boxes);
            });
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col pb-6">
            <div className="fixed top-0 left-0 right-0 z-50 bg-white px-4 pt-4 pb-3 border-b border-gray-200 flex justify-between items-center shadow-sm">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                        <ChevronLeft size={20} />
                    </button>
                    <h1 className="text-lg font-bold text-gray-900">{language === 'en' ? 'Bill' : 'बिल'} {series}-{billNo}</h1>
                </div>
                <button onClick={handleDownload} className="text-indigo-600 bg-indigo-50 hover:bg-indigo-100 p-2 rounded-full transition-colors">
                    <Download size={18} />
                </button>
            </div>

            <div className="p-4 pt-[76px] space-y-4">
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-gray-500 font-medium mb-1">{language === 'en' ? 'Bill Net Amount' : 'बिल की शुद्ध राशि'}</p>
                        <p className="text-xl font-bold text-gray-900">₹{netAmount.toFixed(2)}</p>
                    </div>
                    <button 
                        onClick={handleReorderAll}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-transform active:scale-95"
                    >
                        <ShoppingCart size={16} /> {language === 'en' ? 'Reorder All' : 'सभी फिर से ऑर्डर करें'}
                    </button>
                </div>

                <h2 className="text-sm font-bold text-gray-800 px-1 pt-2">{language === 'en' ? 'Order Summary' : 'ऑर्डर का सारांश'} ({data.summary?.itemsInBill || data.items.length})</h2>
                <div className="space-y-3">
                    {data.items.map((item: any, i: number) => (
                        <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex gap-4 items-center">
                            <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center shrink-0 border border-gray-100">
                                <Package size={20} className="text-gray-300" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-gray-900 text-sm line-clamp-2 leading-tight mb-1">{item.particular}</h3>
                                <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-gray-500 mt-1.5">
                                    <span className="bg-gray-100 px-2 py-0.5 rounded-md font-medium text-gray-600">
                                        {item.qty} {item.unit}
                                    </span>
                                    <span className="self-center">•</span>
                                    <span className="self-center">₹{parseFloat(item.rate).toFixed(2)}/unit</span>
                                </div>
                                <div className="mt-1.5 font-bold text-gray-900">₹{parseFloat(item.netAmount).toFixed(2)}</div>
                            </div>
                            <button 
                                onClick={() => handleReorder(item)}
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
                                    addedItemId === (item.item || item.particular)
                                        ? 'bg-emerald-500 text-white shadow-md scale-110'
                                        : 'bg-gray-50 hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 border border-gray-200 hover:border-indigo-200'
                                }`}
                                title="Add to Cart"
                            >
                                {addedItemId === (item.item || item.particular) ? (
                                    <Check size={18} strokeWidth={3} className="animate-in zoom-in duration-200" />
                                ) : (
                                    <Plus size={18} strokeWidth={2.5} />
                                )}
                            </button>
                        </div>
                    ))}
                </div>

                <h2 className="text-sm font-bold text-gray-800 px-1 pt-6 pb-2">{language === 'en' ? 'Original Printed Bill' : 'मूल मुद्रित बिल'}</h2>
            </div>

            <div className="p-2 flex-1 overflow-x-auto">
                <div className="bg-white border border-gray-300 shadow-sm min-w-[1000px] mx-auto text-xs text-black" style={{ fontFamily: 'sans-serif' }}>
                    {/* Header */}
                    <table className="w-full border-collapse border border-black">
                        <tbody>
                            <tr>
                                <td colSpan={11} className="border border-black p-2">
                                    <div className="flex">
                                        <div className="w-1/3">
                                            <p className="font-bold">GSTN: {data.company.gstin}</p>
                                            <p className="font-bold">FSSAI NO: {data.company.fssaiNo}</p>
                                            <p className="font-bold">D.L. No.: {data.dlNo}</p>
                                        </div>
                                        <div className="w-1/3 text-center">
                                            <p className="font-bold">Tax Invoice</p>
                                            <p className="text-xl font-extrabold">{data.company.name}</p>
                                            <p className="font-bold">{data.company.address}</p>
                                        </div>
                                        <div className="w-1/3 text-right">
                                            <p className="font-bold">Ph: {data.company.phone}</p>
                                            <p className="font-bold">Office No: {data.company.officeNo}</p>
                                            <p className="font-bold">State Code: {data.company.stateCode}</p>
                                            <p className="text-[10px] mt-1">Bill Made By: {data.billMadeBy}</p>
                                        </div>
                                    </div>
                                </td>
                                <td colSpan={3} className="border border-black p-2 align-middle">
                                    <div className="text-center">
                                        <p className="font-bold">Tax Invoice</p>
                                        <p className="text-xl font-extrabold">{data.company.name}</p>
                                        <p className="font-bold">{data.company.address}</p>
                                    </div>
                                </td>
                            </tr>

                            {/* Customer Info Row */}
                            <tr>
                                <td colSpan={11} className="border border-black p-2">
                                    <div className="flex">
                                        <div className="w-3/4 border-r border-black pr-2">
                                            <div className="flex items-start">
                                                <span className="font-bold text-blue-800 w-16">Party</span>
                                                <span className="mx-1">:</span>
                                                <span className="flex-1 font-semibold">{data.party.name}</span>
                                            </div>
                                            <div className="flex items-start">
                                                <span className="font-bold text-blue-800 w-16">Address</span>
                                                <span className="mx-1">:</span>
                                                <span className="flex-1">{data.party.address}</span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-x-2 mt-1">
                                                <div className="col-span-1">
                                                    <div className="flex items-start">
                                                        <span className="font-bold text-blue-800 w-16">GSTIN</span>
                                                        <span className="mr-1">:</span>
                                                        <span className="flex-1">{data.party.gstin || 'N/A'}</span>
                                                    </div>
                                                    <div className="flex items-start">
                                                        <span className="font-bold text-blue-800 w-16">Mobile No.</span>
                                                        <span className="mr-1">:</span>
                                                        <span className="flex-1">{data.party.mobileNo}</span>
                                                    </div>
                                                </div>
                                                <div className="col-span-1">
                                                    {data.party.stateCode && (
                                                        <div className="flex items-start">
                                                            <span className="font-bold text-blue-800 w-16">State Code</span>
                                                            <span className="mr-1">:</span>
                                                            <span className="flex-1">{data.party.stateCode}</span>
                                                        </div>
                                                    )}
                                                    {data.party.balanceBf > 0 && (
                                                        <div className="flex items-start">
                                                            <span className="font-bold text-blue-800 w-16">Balance</span>
                                                            <span className="mr-1">:</span>
                                                            <span className="flex-1">{data.party.balanceBf} CR</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="col-span-1">
                                                    {data.party.fssaiNo && (
                                                        <div className="flex items-start">
                                                            <span className="font-bold text-blue-800 w-16">FSSAI No.</span>
                                                            <span className="mr-1">:</span>
                                                            <span className="flex-1">{data.party.fssaiNo}</span>
                                                        </div>
                                                    )}
                                                    {data.party.dlNo && (
                                                        <div className="flex items-start">
                                                            <span className="font-bold text-blue-800 w-16">DL. No.</span>
                                                            <span className="mr-1">:</span>
                                                            <span className="flex-1">{data.party.dlNo}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="w-1/4 pl-2">
                                            <div className="flex items-start">
                                                <span className="font-bold text-blue-800 w-14">Inv. No</span>
                                                <span className="mx-1">:</span>
                                                <span className="flex-1">{data.invoice.displayNo || data.invoice.no}</span>
                                            </div>
                                            <div className="flex items-start">
                                                <span className="font-bold text-blue-800 w-14">Date</span>
                                                <span className="mx-1">:</span>
                                                <span className="flex-1">{data.invoice.date}</span>
                                            </div>
                                            {data.invoice.dueDate && (
                                                <div className="flex items-start">
                                                    <span className="font-bold text-blue-800 w-14">Due Date</span>
                                                    <span className="mx-1">:</span>
                                                    <span className="flex-1">{data.invoice.dueDate}</span>
                                                </div>
                                            )}
                                            <div className="flex items-start">
                                                <span className="font-bold text-blue-800 w-14">Mode</span>
                                                <span className="mx-1">:</span>
                                                <span className="flex-1">{data.invoice.mode}</span>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td colSpan={3} className="border border-black p-2">
                                    <div>
                                        <div className="flex items-start">
                                            <span className="font-bold text-blue-800 w-16">Invoice No</span>
                                            <span className="mx-1">:</span>
                                            <span className="flex-1">{data.invoice.displayNo || data.invoice.no}</span>
                                            <div className="font-bold text-blue-800 ml-2">Mode : <span className="text-black font-normal">{data.invoice.mode}</span></div>
                                        </div>
                                        <div className="flex items-start mt-1">
                                            <span className="font-bold text-blue-800 w-16">Date</span>
                                            <span className="mx-1">:</span>
                                            <span className="flex-1">{data.invoice.date}</span>
                                        </div>
                                        <div className="flex items-start mt-1">
                                            <span className="font-bold text-blue-800 w-16">Party</span>
                                            <span className="mx-1">:</span>
                                            <span className="flex-1 font-semibold">{data.party.name.slice(0, 20)}</span>
                                        </div>
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
                                <th className="border border-black p-1 font-bold text-blue-800">Rate<br/><span className="text-[10px]">(incl of Tax)</span></th>
                                <th className="border border-black p-1 font-bold text-blue-800">Unit</th>
                                <th className="border border-black p-1 font-bold text-blue-800">Qty</th>
                                <th className="border border-black p-1 font-bold text-blue-800">Free</th>
                                <th className="border border-black p-1 font-bold text-blue-800">Sch Rs</th>
                                <th className="border border-black p-1 font-bold text-blue-800">Co. Sch%<br/>Cash Disc%</th>
                                <th className="border border-black p-1 font-bold text-blue-800">Net Amt.</th>
                                <th className="border border-black p-1 font-bold text-blue-800 w-[200px]">
                                    Particulars<br/>
                                    <div className="flex justify-between px-2"><span>Unit</span><span>M.R.P.</span></div>
                                </th>
                                <th className="border border-black p-1 font-bold text-blue-800">Free</th>
                                <th className="border border-black p-1 font-bold text-blue-800">Qty</th>
                            </tr>

                            {/* Items */}
                            {data.items.map((item: any, idx: number) => (
                                <tr key={idx} className="border-b border-black">
                                    <td className="border-r border-black p-1 font-semibold text-blue-800">
                                        <div className="truncate w-[190px]">{item.particular}</div>
                                        {item.hsn && <div className="text-[10px] font-normal text-blue-600">HSN: {item.hsn}</div>}
                                    </td>
                                    <td className="border-r border-black p-1 text-center">{item.pack}</td>
                                    <td className="border-r border-black p-1 text-right">{parseFloat(item.mrp).toFixed(2)}</td>
                                    <td className="border-r border-black p-1 text-center text-orange-600">{parseFloat(item.gst).toFixed(2)}</td>
                                    <td className="border-r border-black p-1 text-right">{parseFloat(item.rate).toFixed(2)}</td>
                                    <td className="border-r border-black p-1 text-center">{item.unit}</td>
                                    <td className="border-r border-black p-1 text-center">{item.qty}</td>
                                    <td className="border-r border-black p-1 text-center">{item.free}</td>
                                    <td className="border-r border-black p-1 text-right">{item.schRs}</td>
                                    <td className="border-r border-black p-1 text-right">
                                        <div>{item.sch}%</div>
                                        <div>{item.cd}%</div>
                                    </td>
                                    <td className="border-r border-black p-1 text-right text-blue-600 font-semibold">{parseFloat(item.netAmount).toFixed(2)}</td>
                                    <td className="border-r border-black p-1">
                                        <div className="text-blue-800 font-semibold truncate w-[190px]">{item.particular}</div>
                                        <div className="flex justify-between text-black px-1 mt-1">
                                            <span>{item.unit}</span>
                                            <span>{parseFloat(item.mrp).toFixed(2)}</span>
                                        </div>
                                    </td>
                                    <td className="border-r border-black p-1 text-center font-semibold text-blue-800">{item.free}</td>
                                    <td className="p-1 text-center font-semibold">{item.qty}</td>
                                </tr>
                            ))}

                            {/* Blank filler rows to make table look complete if needed (simulate 5 items min height) */}
                            {Array.from({ length: Math.max(0, 5 - data.items.length) }).map((_, i) => (
                                <tr key={`blank-${i}`} className="border-b border-black h-8">
                                    <td className="border-r border-black"></td><td className="border-r border-black"></td>
                                    <td className="border-r border-black"></td><td className="border-r border-black"></td>
                                    <td className="border-r border-black"></td><td className="border-r border-black"></td>
                                    <td className="border-r border-black"></td><td className="border-r border-black"></td>
                                    <td className="border-r border-black"></td><td className="border-r border-black"></td>
                                    <td className="border-r border-black"></td><td className="border-r border-black"></td>
                                    <td className="border-r border-black"></td><td></td>
                                </tr>
                            ))}

                            {/* Summary & Footer */}
                            <tr>
                                <td colSpan={3} className="border border-black p-1 align-top">
                                    <div className="font-bold text-blue-800">Items in Bill: <span className="text-black font-normal">{data.summary.itemsInBill}</span></div>
                                    <div className="font-bold text-blue-800">Cases in Bill: <span className="text-black font-normal">{data.summary.casesInBill}</span></div>
                                    <div className="font-bold text-blue-800">Loose Items in Bill: <span className="text-black font-normal">{data.summary.looseItemsInBill}</span></div>
                                </td>
                                <td colSpan={3} className="border border-black p-1 align-top">
                                    <div className="font-bold text-blue-800">Terms & Conditions:</div>
                                    <div className="text-[9px]">1. We hereby certify that articles of food mentioned in the invoice are warranted to be of the nature and quality which these purports to be.</div>
                                    <div className="text-[9px]">2. Goods once sold will not be taken back.</div>
                                    <div className="text-[9px]">3. Subject to SEONI Jurisdiction only.</div>
                                </td>
                                <td colSpan={5} className="border border-black p-0 align-top">
                                    <table className="w-full text-center text-[10px]">
                                        <thead>
                                            <tr className="border-b border-black font-bold text-blue-800">
                                                <th className="p-1 border-r border-black">Goods</th>
                                                <th className="p-1 border-r border-black">SGST%</th>
                                                <th className="p-1 border-r border-black">Value</th>
                                                <th className="p-1 border-r border-black">CGST%</th>
                                                <th className="p-1">Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.taxDetails.map((tax: any, idx: number) => (
                                                <tr key={idx} className="border-b border-black">
                                                    <td className="p-1 border-r border-black">{parseFloat(tax.goods).toFixed(2)}</td>
                                                    <td className="p-1 border-r border-black">{parseFloat(tax.sgst).toFixed(2)}%</td>
                                                    <td className="p-1 border-r border-black">{parseFloat(tax.sgstValue).toFixed(2)}</td>
                                                    <td className="p-1 border-r border-black">{parseFloat(tax.cgst).toFixed(2)}%</td>
                                                    <td className="p-1">{parseFloat(tax.cgstValue).toFixed(2)}</td>
                                                </tr>
                                            ))}
                                            <tr className="font-bold bg-gray-50">
                                                <td className="p-1 border-r border-black">Total</td>
                                                <td className="p-1 border-r border-black"></td>
                                                <td className="p-1 border-r border-black">{data.taxDetails.reduce((s:number, t:any)=>s+parseFloat(t.sgstValue), 0).toFixed(2)}</td>
                                                <td className="p-1 border-r border-black"></td>
                                                <td className="p-1">{data.taxDetails.reduce((s:number, t:any)=>s+parseFloat(t.cgstValue), 0).toFixed(2)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </td>
                                <td colSpan={3} className="border border-black p-0 align-top h-full">
                                    <table className="w-full h-full">
                                        <tbody>
                                            <tr className="border-b border-black">
                                                <td className="p-1 font-bold text-blue-800 border-r border-black">Gross Amt.</td>
                                                <td className="p-1 text-right">{grossAmount.toFixed(2)}</td>
                                            </tr>
                                            <tr className="border-b border-black">
                                                <td className="p-1 font-bold text-blue-800 border-r border-black">Less Sch.</td>
                                                <td className="p-1 text-right">{totalSch.toFixed(2)}</td>
                                            </tr>
                                            <tr className="border-b border-black h-full">
                                                <td className="p-1 font-bold text-blue-800 border-r border-black align-bottom">Net Amount</td>
                                                <td className="p-1 text-right text-lg font-bold align-bottom">₹ {netAmount.toFixed(2)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <div className="mt-4 text-center pb-8 font-bold text-xl">
                        *** END OF INVOICE ***
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InvoiceView;
