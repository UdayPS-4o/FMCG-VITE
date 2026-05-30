import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Plus, Minus, ShoppingCart, Loader2, Check, Edit2, Save, X, Trash2, Search as SearchIcon } from 'lucide-react';
import { getOrders, fetchProducts, updateOrder } from '../lib/api';
import { useStore, type Product } from '../context/StoreContext';

interface OrderItem {
    productCode: string;
    productName: string;
    qtyPcs: number;
    qtyBoxes: number;
    rate?: number;
    mrp?: string;
    netAmount: number;
    image_url?: string;
    multF?: number;
}

interface Order {
    id: string;
    date: string;
    status: 'Pending' | 'Approved' | 'Rejected' | 'Invoiced';
    totalAmount: number;
    items: OrderItem[];
    paymentMode?: string;
    notes?: string;
    adminNote?: string;
    invoiceBillNo?: string;
    invoiceSeries?: string;
    invoiceRef?: string;
}

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    Pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Processing' },
    Approved: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Confirmed' },
    Rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Cancelled' },
    Invoiced: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Invoiced' },
};

const OrderView = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { addToCart, language } = useStore();
    
    const [order, setOrder] = useState<Order | null>(null);
    const [loading, setLoading] = useState(true);
    const [addedItemId, setAddedItemId] = useState<string | null>(null);

    // Edit state
    const [isEditing, setIsEditing] = useState(false);
    const [editItems, setEditItems] = useState<OrderItem[]>([]);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchDebounce, setSearchDebounce] = useState<ReturnType<typeof setTimeout> | null>(null);
    const [editPaymentMode, setEditPaymentMode] = useState<'Cash' | 'Credit' | null>(null);
    const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

    const loadOrder = () => {
        setLoading(true);
        getOrders()
            .then(orders => {
                const found = orders.find((o: Order) => o.id === id);
                if (found) {
                    setOrder(found);
                    const initItems = found.items.map((it: any) => {
                        let multF = 1;
                        if (it.qtyBoxes > 0 && it.rate > 0) {
                            multF = Math.round(((it.netAmount / it.rate) - it.qtyPcs) / it.qtyBoxes);
                        }
                        return { ...it, multF: multF || 1 };
                    });
                    setEditItems(initItems);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadOrder();
    }, [id]);

    const handleReorder = async (item: OrderItem) => {
        setAddedItemId(item.productCode);
        try {
            const res = await fetchProducts(1, 1, '', '', '', item.productCode);
            let productToUse: any = {
                CODE: item.productCode,
                PRODUCT: item.productName,
                UNIT_1: 'PCS',
                UNIT_2: 'BOX',
                MULT_F: '1',
                RATE1: '0', 
                image_url: item.image_url
            };
            
            if (res.data && res.data.length > 0) {
                const found = res.data.find((p: any) => p.CODE === item.productCode);
                if (found) productToUse = found;
            }
            
            addToCart(productToUse, item.qtyPcs, item.qtyBoxes);
        } catch (e) {
            console.error(e);
        }
        setTimeout(() => setAddedItemId(null), 1000);
    };

    const handleReorderAll = async () => {
        if (!order) return;
        const codes = order.items.map(i => i.productCode).join(',');
        try {
            const res = await fetchProducts(1, 1000, '', '', '', codes);
            const productsMap = new Map(res.data?.map((p: any) => [p.CODE, p]));
            
            order.items.forEach(item => {
                const productToUse = (productsMap.get(item.productCode) || {
                    CODE: item.productCode,
                    PRODUCT: item.productName,
                    UNIT_1: 'PCS',
                    UNIT_2: 'BOX',
                    MULT_F: '1',
                    RATE1: '0',
                    image_url: item.image_url
                }) as unknown as Product;
                addToCart(productToUse, item.qtyPcs, item.qtyBoxes);
            });
        } catch (e) {
            console.error(e);
            order.items.forEach(item => {
                addToCart({
                    CODE: item.productCode,
                    PRODUCT: item.productName,
                    UNIT_1: 'PCS',
                    UNIT_2: 'BOX',
                    MULT_F: '1',
                    RATE1: '0',
                    image_url: item.image_url
                } as unknown as Product, item.qtyPcs, item.qtyBoxes);
            });
        }
    };

    const handleSearch = (q: string) => {
        setSearchQuery(q);
        if (searchDebounce) clearTimeout(searchDebounce);
        if (!q.trim()) {
            setSearchResults([]);
            return;
        }
        setSearchDebounce(setTimeout(async () => {
            setIsSearching(true);
            try {
                const res = await fetchProducts(1, 15, q);
                setSearchResults(res.data || []);
            } catch (e) {
                console.error(e);
            } finally {
                setIsSearching(false);
            }
        }, 500));
    };

    const addEditItem = (prod: any) => {
        const rate = parseFloat(prod.RATE1 || '0');
        const newItem: OrderItem = {
            productCode: prod.CODE,
            productName: prod.PRODUCT,
            qtyPcs: 1,
            qtyBoxes: 0,
            rate: rate,
            mrp: prod.MRP1,
            netAmount: rate,
            image_url: prod.image_url,
            multF: parseFloat(prod.MULT_F || '1') || 1
        };
        const existingIdx = editItems.findIndex(i => i.productCode === prod.CODE);
        if (existingIdx >= 0) {
            const items = [...editItems];
            items[existingIdx].qtyPcs += 1;
            items[existingIdx].netAmount = (items[existingIdx].qtyPcs * (items[existingIdx].rate || 0)) + (items[existingIdx].qtyBoxes * (items[existingIdx].multF || 1) * (items[existingIdx].rate || 0));
            setEditItems(items);
        } else {
            setEditItems([newItem, ...editItems]);
        }
        setSearchQuery('');
        setSearchResults([]);
    };

    const updateEditQty = (idx: number, isBox: boolean, delta: number) => {
        const items = [...editItems];
        const item = items[idx];
        if (isBox) item.qtyBoxes = Math.max(0, item.qtyBoxes + delta);
        else item.qtyPcs = Math.max(0, item.qtyPcs + delta);
        
        item.netAmount = (item.qtyPcs * (item.rate || 0)) + (item.qtyBoxes * (item.multF || 1) * (item.rate || 0));
        
        items[idx] = { ...item };
        setEditItems(items);
    };

    const handleSaveOrder = async () => {
        if (!order) return;
        setSaving(true);
        try {
            const codes = editItems.map(i => i.productCode).join(',');
            let finalTotal = 0;
            let finalItems = [...editItems];
            
            let orderNotes = order.notes || '';
            if (editPaymentMode) {
                if (editPaymentMode === 'Credit') {
                    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                    orderNotes = `Payment Mode: Credit (Due: ${dueDate})`;
                } else {
                    orderNotes = `Payment Mode: Cash`;
                }
            }
            
            if (codes) {
                const res = await fetchProducts(1, 1000, '', '', '', codes);
                const productsMap = new Map(res.data?.map((p: any) => [p.CODE, p]));
                
                finalItems = editItems.map(item => {
                    const prod = productsMap.get(item.productCode) as any;
                    let multF = 1;
                    let rate = item.rate || 0;
                    if (prod) {
                        multF = parseFloat(prod.MULT_F || '1') || 1;
                        rate = parseFloat(prod.RATE1 || '0') || 0;
                    }
                    const netAmt = (item.qtyPcs * rate) + (item.qtyBoxes * multF * rate);
                    finalTotal += netAmt;
                    return { ...item, rate, netAmount: netAmt };
                }).filter(item => item.qtyPcs > 0 || item.qtyBoxes > 0);
            }
            
            await updateOrder(order.id, { 
                items: finalItems, 
                totalAmount: finalTotal, 
                paymentMode: editPaymentMode, 
                notes: orderNotes 
            });
            
            setIsEditing(false);
            loadOrder();
        } catch (e: any) {
            alert(e.message || 'Failed to update order');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="animate-spin text-indigo-500" size={32} />
            </div>
        );
    }

    if (!order) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
                <Package size={48} className="text-gray-300 mb-4" />
                <p className="text-gray-500">{language === 'en' ? 'Order not found.' : 'ऑर्डर नहीं मिला।'}</p>
                <button onClick={() => navigate(-1)} className="mt-4 text-indigo-600 font-semibold">{language === 'en' ? 'Go Back' : 'वापस जाएं'}</button>
            </div>
        );
    }

    const s = statusConfig[order.status] || statusConfig.Pending;
    const labelTranslated = language === 'en' ? s.label : (s.label === 'Processing' ? 'प्रोसेसिंग' : s.label === 'Confirmed' ? 'पुष्टि की गई' : 'रद्द');
    const isPending = order.status === 'Pending';
    
    const displayItems = isEditing ? editItems : order.items;
    
    // Calculate temp total accurately using the dynamically maintained netAmount which uses proper multF
    const tempTotal = isEditing ? displayItems.reduce((acc, it) => acc + (it.netAmount || 0), 0) : order.totalAmount;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col pb-24">
            <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600 hover:bg-gray-50 rounded-full transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="font-bold text-gray-900 leading-tight">{language === 'en' ? 'Order' : 'ऑर्डर'} #{order.id.slice(-6)}</h1>
                        <p className="text-[10px] text-gray-500 font-medium">
                            {new Date(order.date).toLocaleDateString('en-IN', {
                                day: '2-digit', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit'
                            })}
                        </p>
                    </div>
                </div>
                <span className={`px-2.5 py-1 ${s.bg} ${s.text} text-[10px] font-bold rounded-full uppercase tracking-wide`}>
                    {labelTranslated}
                </span>
            </header>

            <div className="p-4 pt-[76px] space-y-4">
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-500 font-medium mb-1">{language === 'en' ? 'Order Total' : 'कुल ऑर्डर'}</p>
                            <p className="text-xl font-bold text-gray-900">₹{isEditing ? tempTotal.toFixed(2) + ' (est)' : order.totalAmount.toFixed(2)}</p>
                        </div>
                        
                        {!isEditing && (
                            <div className="flex gap-2">
                                {isPending && (
                                    <button 
                                        onClick={() => { setIsEditing(true); setEditPaymentMode((order.paymentMode as any) || 'Cash'); }}
                                        className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-transform active:scale-95"
                                    >
                                        <Edit2 size={16} /> {language === 'en' ? 'Edit' : 'बदलें'}
                                    </button>
                                )}
                                <button 
                                    onClick={handleReorderAll}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-transform active:scale-95"
                                >
                                    <ShoppingCart size={16} /> {language === 'en' ? 'Reorder' : 'फिर से'}
                                </button>
                            </div>
                        )}
                        {isEditing && (
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => {
                                        setIsEditing(false);
                                        setEditItems(JSON.parse(JSON.stringify(order.items)));
                                        setSearchQuery('');
                                    }}
                                    className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1"
                                >
                                    <X size={16} />
                                </button>
                                <button 
                                    onClick={handleSaveOrder}
                                    disabled={saving}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-transform active:scale-95 disabled:opacity-70"
                                >
                                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                                    {language === 'en' ? 'Save' : 'सेव'}
                                </button>
                            </div>
                        )}
                    </div>
                    
                    {isEditing && (
                        <div className="pt-3 border-t border-gray-100 mt-1">
                            <div className="flex justify-between items-center mb-2">
                                <p className="text-xs text-gray-500 font-medium">{language === 'en' ? 'Payment Mode' : 'भुगतान का तरीका'}</p>
                                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">{editPaymentMode}</span>
                            </div>
                            <div 
                                className="relative flex items-center bg-gray-100 rounded-full p-1 cursor-pointer w-full h-11 shadow-inner border border-gray-200"
                                onClick={() => setEditPaymentMode(editPaymentMode === 'Cash' ? 'Credit' : 'Cash')}
                            >
                                <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full shadow-sm transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${editPaymentMode === 'Credit' ? 'translate-x-[calc(100%+4px)] bg-orange-500' : 'translate-x-0 bg-emerald-500'}`} />
                                
                                <div className={`flex-1 flex justify-center items-center gap-1.5 z-10 text-sm font-bold transition-colors duration-300 ${editPaymentMode === 'Cash' ? 'text-white' : 'text-gray-500'}`}>
                                    {language === 'en' ? 'Cash' : 'नकद'}
                                </div>
                                <div className={`flex-1 flex justify-center items-center gap-1.5 z-10 text-sm font-bold transition-colors duration-300 ${editPaymentMode === 'Credit' ? 'text-white' : 'text-gray-500'}`}>
                                    {language === 'en' ? 'Credit' : 'उधार'}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {order.adminNote && !isEditing && (
                    <div className="bg-yellow-50 text-yellow-800 text-sm p-4 rounded-2xl border border-yellow-100 shadow-sm">
                        <span className="font-bold">{language === 'en' ? 'Note from admin:' : 'व्यवस्थापक से नोट:'}</span> {order.adminNote}
                    </div>
                )}

                <h2 className="text-sm font-bold text-gray-800 pt-2 px-1">{language === 'en' ? 'Items' : 'आइटम'} ({displayItems.length})</h2>

                {isEditing && (
                    <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 sticky top-[68px] z-40">
                        <div className="relative">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder={language === 'en' ? "Search to add item..." : "आइटम जोड़ने के लिए खोजें..."}
                                value={searchQuery}
                                onChange={(e) => handleSearch(e.target.value)}
                                className="w-full bg-gray-50 border-none rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                        </div>
                        
                        {searchQuery && (
                            <div className="mt-2 max-h-60 overflow-y-auto border-t border-gray-100">
                                {isSearching ? (
                                    <div className="p-4 text-center text-gray-500"><Loader2 size={16} className="animate-spin mx-auto" /></div>
                                ) : searchResults.length === 0 ? (
                                    <div className="p-4 text-center text-gray-500 text-sm">No results</div>
                                ) : (
                                    searchResults.map((prod) => (
                                        <div key={prod.CODE} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg border-b border-gray-50 last:border-0">
                                            <div className="flex-1 min-w-0 pr-2">
                                                <div className="text-sm font-medium text-gray-900 truncate">{prod.PRODUCT}</div>
                                                <div className="text-xs text-gray-500">₹{parseFloat(prod.RATE1||'0').toFixed(2)}</div>
                                            </div>
                                            <button 
                                                onClick={() => addEditItem(prod)}
                                                className="bg-indigo-50 text-indigo-600 p-1.5 rounded-lg shrink-0 hover:bg-indigo-100"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                )}

                <div className="space-y-3">
                    {displayItems.map((item, idx) => (
                        <div key={idx} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex gap-4 items-center">
                            <div className="w-14 h-14 bg-gray-50 rounded-xl flex items-center justify-center shrink-0 border border-gray-100">
                                {item.image_url ? (
                                    <img 
                                        src={item.image_url} 
                                        alt="" 
                                        className="w-10 h-10 object-contain mix-blend-multiply cursor-pointer" 
                                        onClick={() => setEnlargedImage(item.image_url!)}
                                    />
                                ) : (
                                    <Package size={20} className="text-gray-300" />
                                )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-gray-900 text-sm line-clamp-2 leading-tight mb-1">{item.productName}</h3>
                                
                                {!isEditing ? (
                                    <>
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <span className="bg-gray-100 px-2 py-0.5 rounded-md font-medium text-gray-600">
                                                {item.qtyBoxes > 0 && `${item.qtyBoxes} ${language === 'en' ? 'box ' : 'बॉक्स '}`}
                                                {item.qtyPcs > 0 && `${item.qtyPcs} ${language === 'en' ? 'pcs' : 'पीस'}`}
                                            </span>
                                        </div>
                                        <div className="mt-1.5 font-bold text-gray-900">₹{item.netAmount.toFixed(2)}</div>
                                    </>
                                ) : (
                                    <div className="mt-2 flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-gray-500 w-7">PCS</span>
                                            <div className="flex items-center bg-gray-50 rounded border border-gray-200">
                                                <button onClick={() => updateEditQty(idx, false, -1)} className="w-6 h-6 flex items-center justify-center text-gray-600 active:bg-gray-200 rounded-l"><Minus size={12}/></button>
                                                <span className="w-6 text-center text-[11px] font-semibold text-gray-800">{item.qtyPcs}</span>
                                                <button onClick={() => updateEditQty(idx, false, 1)} className="w-6 h-6 flex items-center justify-center text-gray-600 active:bg-gray-200 rounded-r"><Plus size={12}/></button>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-gray-500 w-7">BOX</span>
                                            <div className="flex items-center bg-gray-50 rounded border border-gray-200">
                                                <button onClick={() => updateEditQty(idx, true, -1)} className="w-6 h-6 flex items-center justify-center text-gray-600 active:bg-gray-200 rounded-l"><Minus size={12}/></button>
                                                <span className="w-6 text-center text-[11px] font-semibold text-gray-800">{item.qtyBoxes}</span>
                                                <button onClick={() => updateEditQty(idx, true, 1)} className="w-6 h-6 flex items-center justify-center text-gray-600 active:bg-gray-200 rounded-r"><Plus size={12}/></button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {!isEditing ? (
                                <button 
                                    onClick={() => handleReorder(item)}
                                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
                                        addedItemId === item.productCode
                                            ? 'bg-emerald-500 text-white shadow-md scale-110'
                                            : 'bg-gray-50 hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 border border-gray-200 hover:border-indigo-200'
                                    }`}
                                    title="Add to Cart"
                                >
                                    {addedItemId === item.productCode ? (
                                        <Check size={18} strokeWidth={3} className="animate-in zoom-in duration-200" />
                                    ) : (
                                        <Plus size={18} strokeWidth={2.5} />
                                    )}
                                </button>
                            ) : (
                                <button
                                    onClick={() => {
                                        const items = [...editItems];
                                        items.splice(idx, 1);
                                        setEditItems(items);
                                    }}
                                    className="w-10 h-10 rounded-full flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-100 shrink-0"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    ))}
                    
                    {isEditing && displayItems.length === 0 && (
                        <div className="text-center p-6 text-gray-500 text-sm">
                            {language === 'en' ? 'No items. Add items or save to cancel order.' : 'कोई आइटम नहीं। आइटम जोड़ें या ऑर्डर रद्द करने के लिए सेव करें।'}
                        </div>
                    )}
                </div>
            </div>
            
            {/* Enlarged Image Modal */}
            {enlargedImage && (
                <div 
                    className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 animate-in fade-in duration-200"
                    onClick={() => setEnlargedImage(null)}
                >
                    <div className="relative max-w-sm w-full bg-white rounded-2xl p-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <button 
                            onClick={() => setEnlargedImage(null)}
                            className="absolute -top-3 -right-3 w-8 h-8 bg-black text-white rounded-full flex items-center justify-center shadow-lg"
                        >
                            <X size={16} />
                        </button>
                        <img src={enlargedImage} alt="Enlarged" className="w-full h-auto max-h-[70vh] object-contain rounded-xl" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrderView;
