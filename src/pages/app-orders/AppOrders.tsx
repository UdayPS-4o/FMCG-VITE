import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageMeta from '../../components/common/PageMeta';
import PageBreadcrumb from '../../components/common/PageBreadCrumb';
import constants from '../../constants';

interface OrderItem {
    productCode: string;
    productName: string;
    qtyPcs: number;
    qtyBoxes: number;
    rate: string | number;
    netAmount: number;
}

interface AppOrder {
    id: string;
    date: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    partyCode: string;
    partyName: string;
    items: OrderItem[];
    totalAmount: number;
    notes?: string;
    adminNote?: string;
    updatedAt?: string;
}

type StatusFilter = 'All' | 'Pending' | 'Approved' | 'Rejected';

const STATUS_TABS: StatusFilter[] = ['All', 'Pending', 'Approved', 'Rejected'];

const statusStyle: Record<string, { pill: string, dot: string }> = {
    Pending:  { pill: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500'   },
    Approved: { pill: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
    Rejected: { pill: 'bg-red-100 text-red-700',       dot: 'bg-red-500'     },
    Invoiced: { pill: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500'    },
};

const AppOrders: React.FC = () => {
    const [orders, setOrders] = useState<AppOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${constants.baseURL}/api/app/admin/orders`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error('Failed to fetch');
            const data: AppOrder[] = await res.json();
            setOrders(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    const navigate = useNavigate();


    return (
        <>
            <PageMeta title="App Orders | FMCG" description="Review and approve orders from the customer app" />
            <PageBreadcrumb pageTitle="App Orders" />

            {/* Header actions */}
            <div className="flex gap-2 mb-6 flex-wrap justify-end">
                <button
                    onClick={fetchOrders}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-brand-500 transition-colors"
                >
                    ↻ Refresh
                </button>
            </div>

            {loading ? (
                <div className="text-center py-16 text-gray-400">Loading orders…</div>
            ) : orders.length === 0 ? (
                <div className="text-center py-16 text-gray-400">No orders</div>
            ) : (
                <div className="space-y-4">
                    {orders.map(order => {
                        const s = statusStyle[order.status] || statusStyle['Pending'];
                        const isOpen = expandedId === order.id;

                        return (
                            <div
                                key={order.id}
                                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
                            >
                                {/* Header */}
                                <button
                                    className="w-full text-left px-5 py-4 flex items-center gap-4"
                                    onClick={() => setExpandedId(isOpen ? null : order.id)}
                                >
                                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot}`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-gray-900 dark:text-white text-sm">
                                                {order.partyName}
                                            </span>
                                            <span className="text-xs text-gray-400">#{order.id.slice(-6)}</span>
                                        </div>
                                        <div className="text-xs text-gray-400 mt-0.5 flex gap-3">
                                            <span>{new Date(order.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                            <span>{order.items.length} items</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className="font-bold text-gray-900 dark:text-white">
                                            ₹{order.totalAmount.toFixed(2)}
                                        </span>
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${s.pill}`}>
                                            {order.status}
                                        </span>
                                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </div>
                                </button>

                                {/* Expanded body */}
                                {isOpen && (
                                    <div className="border-t border-gray-100 dark:border-gray-700 px-5 pb-5 pt-4">
                                        {/* Party info */}
                                        <div className="mb-3 text-xs text-gray-500 flex gap-4">
                                            <span>Party Code: <strong className="text-gray-800 dark:text-gray-200">{order.partyCode}</strong></span>
                                            {order.notes && <span>Note: {order.notes}</span>}
                                        </div>

                                        {/* Items table */}
                                        <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-gray-700 mb-4">
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 dark:bg-gray-700">
                                                    <tr>
                                                        <th className="text-left px-3 py-2 text-xs text-gray-500 font-semibold">Product</th>
                                                        <th className="text-center px-3 py-2 text-xs text-gray-500 font-semibold">Boxes</th>
                                                        <th className="text-center px-3 py-2 text-xs text-gray-500 font-semibold">Pcs</th>
                                                        <th className="text-right px-3 py-2 text-xs text-gray-500 font-semibold">Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {order.items.map((item, i) => (
                                                        <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                                                            <td className="px-3 py-2 text-gray-800 dark:text-gray-200">{item.productName}</td>
                                                            <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">{item.qtyBoxes || '—'}</td>
                                                            <td className="px-3 py-2 text-center text-gray-600 dark:text-gray-400">{item.qtyPcs || '—'}</td>
                                                            <td className="px-3 py-2 text-right font-medium text-gray-800 dark:text-gray-200">₹{item.netAmount.toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot className="bg-gray-50 dark:bg-gray-700">
                                                    <tr>
                                                        <td colSpan={3} className="px-3 py-2 text-sm font-bold text-gray-700 dark:text-gray-200 text-right">Total</td>
                                                        <td className="px-3 py-2 text-right font-bold text-gray-900 dark:text-white">₹{order.totalAmount.toFixed(2)}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>

                                        {/* Action buttons */}
                                        <div className="space-y-3 mt-4">
                                            <button
                                                onClick={() => {
                                                    navigate('/invoicing', { state: { prefilledOrder: order } });
                                                }}
                                                className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-2.5 rounded-lg text-sm transition-colors"
                                            >
                                                Create Invoice
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    );
};

export default AppOrders;
