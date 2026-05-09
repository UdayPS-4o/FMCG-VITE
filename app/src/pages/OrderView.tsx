import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Plus, ShoppingCart, Loader2, Check } from 'lucide-react';
import { getOrders, fetchProducts } from '../lib/api';
import { useStore, type Product } from '../context/StoreContext';

interface OrderItem {
    productCode: string;
    productName: string;
    qtyPcs: number;
    qtyBoxes: number;
    netAmount: number;
    image_url?: string;
}

interface Order {
    id: string;
    date: string;
    status: 'Pending' | 'Approved' | 'Rejected' | 'Invoiced';
    totalAmount: number;
    items: OrderItem[];
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

    useEffect(() => {
        setLoading(true);
        getOrders()
            .then(orders => {
                const found = orders.find((o: Order) => o.id === id);
                if (found) setOrder(found);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
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
            // Fallback
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
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-gray-500 font-medium mb-1">{language === 'en' ? 'Order Total' : 'कुल ऑर्डर'}</p>
                        <p className="text-xl font-bold text-gray-900">₹{order.totalAmount.toFixed(2)}</p>
                    </div>
                    <button 
                        onClick={handleReorderAll}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-transform active:scale-95"
                    >
                        <ShoppingCart size={16} /> {language === 'en' ? 'Reorder All' : 'सभी फिर से ऑर्डर करें'}
                    </button>
                </div>

                {order.adminNote && (
                    <div className="bg-yellow-50 text-yellow-800 text-sm p-4 rounded-2xl border border-yellow-100 shadow-sm">
                        <span className="font-bold">{language === 'en' ? 'Note from admin:' : 'व्यवस्थापक से नोट:'}</span> {order.adminNote}
                    </div>
                )}

                {order.status === 'Invoiced' && order.invoiceSeries && order.invoiceBillNo && (
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
                        <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-xs text-blue-500 font-medium">{language === 'en' ? 'Bill Number' : 'बिल नंबर'}</p>
                            <p className="text-lg font-black text-blue-800 leading-tight">
                                {order.invoiceSeries}{order.invoiceBillNo}
                            </p>
                        </div>
                    </div>
                )}

                <h2 className="text-sm font-bold text-gray-800 pt-2 px-1">{language === 'en' ? 'Items' : 'आइटम'} ({order.items.length})</h2>

                <div className="space-y-3">
                    {order.items.map((item, idx) => (
                        <div key={idx} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex gap-4 items-center">
                            <div className="w-14 h-14 bg-gray-50 rounded-xl flex items-center justify-center shrink-0 border border-gray-100">
                                {item.image_url ? (
                                    <img src={item.image_url} alt="" className="w-10 h-10 object-contain mix-blend-multiply" />
                                ) : (
                                    <Package size={20} className="text-gray-300" />
                                )}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-gray-900 text-sm line-clamp-2 leading-tight mb-1">{item.productName}</h3>
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span className="bg-gray-100 px-2 py-0.5 rounded-md font-medium text-gray-600">
                                        {item.qtyBoxes > 0 && `${item.qtyBoxes} ${language === 'en' ? 'box ' : 'बॉक्स '}`}
                                        {item.qtyPcs > 0 && `${item.qtyPcs} ${language === 'en' ? 'pcs' : 'पीस'}`}
                                    </span>
                                </div>
                                <div className="mt-1.5 font-bold text-gray-900">₹{item.netAmount.toFixed(2)}</div>
                            </div>

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
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default OrderView;
