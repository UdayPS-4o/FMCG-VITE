import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOrders, getPastInvoices, getInvoiceData } from '../lib/api';
import { Package, Calendar, ChevronDown, ChevronUp, RefreshCw, FileText, ExternalLink, ShoppingCart, Plus } from 'lucide-react';
import { useStore } from '../context/StoreContext';

interface OrderItem {
    productCode: string;
    productName: string;
    qtyPcs: number;
    qtyBoxes: number;
    rate: string | number;
    netAmount: number;
    image_url?: string;
}

interface Order {
    id: string;
    date: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    items: OrderItem[];
    totalAmount: number;
    notes?: string;
    adminNote?: string;
}

const statusConfig = {
    Pending:  { bg: 'bg-amber-100',   text: 'text-amber-700',   label: 'Pending'  },
    Approved: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Approved' },
    Rejected: { bg: 'bg-red-100',     text: 'text-red-700',     label: 'Rejected' },
};

const Orders = () => {
    const navigate = useNavigate();
    const { language } = useStore();
    const [activeTab, setActiveTab] = useState<'orders' | 'invoices'>('orders');
    const [orders, setOrders] = useState<Order[]>([]);
    const [invoices, setInvoices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = () => {
        setLoading(true);
        if (activeTab === 'orders') {
            getOrders()
                .then(setOrders)
                .catch(console.error)
                .finally(() => setLoading(false));
        } else {
            getPastInvoices()
                .then(setInvoices)
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    };

    useEffect(() => {
        fetchData();
        const onVisible = () => { if (document.visibilityState === 'visible') fetchData(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [activeTab]);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <div className="bg-white px-4 pt-4 border-b border-gray-100 sticky top-0 z-40">
                <h1 className="text-xl font-bold text-gray-900 mb-4">{language === 'en' ? 'My Orders' : 'मेरे ऑर्डर्स'}</h1>
                
                <div className="flex gap-4">
                    <button
                        className={`pb-3 text-sm font-semibold transition-colors relative ${activeTab === 'orders' ? 'text-indigo-600' : 'text-gray-500'}`}
                        onClick={() => setActiveTab('orders')}
                    >
                        {language === 'en' ? 'App Orders' : 'ऐप ऑर्डर्स'}
                        {activeTab === 'orders' && (
                            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-t-full" />
                        )}
                    </button>
                    <button
                        className={`pb-3 text-sm font-semibold transition-colors relative ${activeTab === 'invoices' ? 'text-indigo-600' : 'text-gray-500'}`}
                        onClick={() => setActiveTab('invoices')}
                    >
                        {language === 'en' ? 'Past Bills (DBF)' : 'पिछले बिल (DBF)'}
                        {activeTab === 'invoices' && (
                            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-t-full" />
                        )}
                    </button>
                </div>
            </div>

            <div className="p-4 space-y-3 pb-24 flex-1">
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-3 animate-pulse">
                            <div className="w-10 h-10 bg-gray-200 rounded-xl shrink-0" />
                            <div className="flex-1 space-y-2">
                                <div className="h-4 bg-gray-200 rounded w-1/2" />
                                <div className="h-3 bg-gray-100 rounded w-1/3" />
                            </div>
                            <div className="w-16 h-6 bg-gray-200 rounded-full shrink-0" />
                        </div>
                    ))
                ) : activeTab === 'orders' ? (
                    orders.length === 0 ? (
                        <div className="text-center text-gray-400 py-16">
                            <Package size={48} className="mx-auto mb-3 opacity-30" />
                            <p className="font-medium">{language === 'en' ? 'No app orders yet' : 'अभी तक कोई ऐप ऑर्डर नहीं'}</p>
                            <p className="text-sm mt-1">{language === 'en' ? 'Start shopping to place your first order' : 'अपना पहला ऑर्डर देने के लिए खरीदारी शुरू करें'}</p>
                        </div>
                    ) : (
                        orders.map(order => {
                            const s = statusConfig[order.status] || statusConfig.Pending;
                            return (
                                <div 
                                    key={order.id} 
                                    onClick={() => navigate(`/order/${order.id}`)}
                                    className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
                                >
                                    <div className="w-full text-left p-4 flex items-center gap-3">
                                        <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600 shrink-0">
                                            <Package size={20} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-gray-900 text-sm">
                                                {language === 'en' ? 'Order' : 'ऑर्डर'} #{order.id.slice(-6)}
                                            </div>
                                            <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                                <Calendar size={11} />
                                                {new Date(order.date).toLocaleDateString('en-IN', {
                                                    day: '2-digit', month: 'short', year: 'numeric'
                                                })}
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                            <span className={`px-2.5 py-1 ${s.bg} ${s.text} text-[10px] font-bold rounded-full uppercase tracking-wide`}>
                                                {language === 'en' ? s.label : (s.label === 'Pending' ? 'लंबित' : s.label === 'Approved' ? 'स्वीकृत' : 'अस्वीकृत')}
                                            </span>
                                            <div className="font-bold text-gray-900 text-sm mt-1">
                                                ₹{order.totalAmount.toFixed(2)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )
                ) : (
                    invoices.length === 0 ? (
                        <div className="text-center text-gray-400 py-16">
                            <FileText size={48} className="mx-auto mb-3 opacity-30" />
                            <p className="font-medium">{language === 'en' ? 'No past bills found' : 'कोई पिछला बिल नहीं मिला'}</p>
                        </div>
                    ) : (
                        invoices.map((inv, idx) => {
                            const rawDate = inv.DATE || inv.date || inv.DT_BILL;
                            const d = rawDate ? new Date(rawDate) : null;
                            const dateStr = d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : (language === 'en' ? 'Unknown Date' : 'अज्ञात तिथि');
                            const amt = Number(inv.N_B_AMT || 0).toFixed(2);
                            
                            return (
                                <div 
                                    key={idx} 
                                    onClick={() => navigate(`/invoice/${inv.SERIES}/${inv.BILL}`)}
                                    className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
                                >
                                    <div className="p-4 flex items-center gap-3">
                                        <div className="p-2 bg-blue-50 rounded-xl text-blue-600 shrink-0">
                                            <FileText size={20} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-gray-900 text-sm">
                                                {language === 'en' ? 'Bill' : 'बिल'} {inv.SERIES}-{inv.BILL}
                                            </div>
                                            <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                                <Calendar size={11} />
                                                {dateStr}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="font-bold text-gray-900">₹{amt}</div>
                                            <div className="text-gray-400"><ChevronDown size={16} className="-rotate-90" /></div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )
                )}
            </div>
        </div>
    );
};

export default Orders;
