import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Calendar, Plus, ShoppingCart, Loader2, Check } from 'lucide-react';
import { getOrders } from '../lib/api';
import { useStore, Product } from '../context/StoreContext';

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
    status: 'Pending' | 'Approved' | 'Rejected';
    totalAmount: number;
    items: OrderItem[];
    adminNote?: string;
}

const statusConfig = {
    Pending: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Processing' },
    Approved: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Confirmed' },
    Rejected: { bg: 'bg-red-100', text: 'text-red-700', label: 'Cancelled' },
};

const OrderView = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { addToCart } = useStore();
    
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

    const handleReorder = (item: OrderItem) => {
        const product = {
            CODE: item.productCode,
            PRODUCT: item.productName,
            UNIT_1: 'PCS',
            UNIT_2: 'BOX',
            MULT_F: '1',
            RATE1: '0', 
            image_url: item.image_url
        } as unknown as Product;

        addToCart(product, item.qtyPcs, item.qtyBoxes);
        
        // Show checkmark animation
        setAddedItemId(item.productCode);
        setTimeout(() => setAddedItemId(null), 1000);
    };

    const handleReorderAll = () => {
        if (!order) return;
        order.items.forEach(item => handleReorder(item));
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
                <p className="text-gray-500">Order not found.</p>
                <button onClick={() => navigate(-1)} className="mt-4 text-indigo-600 font-semibold">Go Back</button>
            </div>
        );
    }

    const s = statusConfig[order.status] || statusConfig.Pending;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col pb-24">
            <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600 hover:bg-gray-50 rounded-full transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="font-bold text-gray-900 leading-tight">Order #{order.id.slice(-6)}</h1>
                        <p className="text-[10px] text-gray-500 font-medium">
                            {new Date(order.date).toLocaleDateString('en-IN', {
                                day: '2-digit', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit'
                            })}
                        </p>
                    </div>
                </div>
                <span className={`px-2.5 py-1 ${s.bg} ${s.text} text-[10px] font-bold rounded-full uppercase tracking-wide`}>
                    {s.label}
                </span>
            </header>

            <div className="p-4 pt-[76px] space-y-4">
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-gray-500 font-medium mb-1">Order Total</p>
                        <p className="text-xl font-bold text-gray-900">₹{order.totalAmount.toFixed(2)}</p>
                    </div>
                    <button 
                        onClick={handleReorderAll}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-transform active:scale-95"
                    >
                        <ShoppingCart size={16} /> Reorder All
                    </button>
                </div>

                {order.adminNote && (
                    <div className="bg-yellow-50 text-yellow-800 text-sm p-4 rounded-2xl border border-yellow-100 shadow-sm">
                        <span className="font-bold">Note from admin:</span> {order.adminNote}
                    </div>
                )}

                <h2 className="text-sm font-bold text-gray-800 pt-2 px-1">Items ({order.items.length})</h2>

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
                                        {item.qtyBoxes > 0 && `${item.qtyBoxes} box `}
                                        {item.qtyPcs > 0 && `${item.qtyPcs} pcs`}
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
