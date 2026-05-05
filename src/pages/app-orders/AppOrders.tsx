import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageMeta from '../../components/common/PageMeta';
import PageBreadcrumb from '../../components/common/PageBreadCrumb';
import constants from '../../constants';
import useAuth from '../../hooks/useAuth';

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
    status: 'Pending' | 'Approved' | 'Rejected' | 'Invoiced';
    partyCode: string;
    partyName: string;
    items: OrderItem[];
    totalAmount: number;
    notes?: string;
    adminNote?: string;
    updatedAt?: string;
    invoiceBillNo?: string;
    invoiceSeries?: string;
    invoiceRef?: string;
    billNo?: number;
    series?: string;
}

type StatusFilter = 'All' | 'Pending' | 'Rejected' | 'Invoiced';

const STATUS_TABS: StatusFilter[] = ['All', 'Pending', 'Rejected', 'Invoiced'];

const statusStyle: Record<string, { pill: string; dot: string }> = {
    Pending:  { pill: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500'   },
    Approved: { pill: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
    Rejected: { pill: 'bg-red-100 text-red-700',         dot: 'bg-red-500'     },
    Invoiced: { pill: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500'    },
};

const AppOrders: React.FC = () => {
    const [orders, setOrders] = useState<AppOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState<StatusFilter>('All');
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const { user } = useAuth();

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

    const updateOrderStatus = async (id: string, status: 'Rejected') => {
        setActionLoading(id + status);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${constants.baseURL}/api/app/admin/orders/${id}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) throw new Error('Failed to update');
            await fetchOrders();
        } catch (e) {
            console.error(e);
        } finally {
            setActionLoading(null);
        }
    };

    const isAdmin = user?.routeAccess?.includes('Admin');
    
    // Get all subgroup objects (handling both new and old formats)
    let userSubgroups: any[] = [];
    if (user?.subgroups) {
        userSubgroups = Array.isArray(user.subgroups) ? user.subgroups : [user.subgroups];
    } else if (user?.subgroup) {
        userSubgroups = Array.isArray(user.subgroup) ? user.subgroup : [user.subgroup];
    }

    const allowedPrefixes = userSubgroups.map(sg => 
        (typeof sg === 'string' ? sg : sg.subgroupCode || '').substring(0, 2)
    ).filter(Boolean);

    /** Filter orders by allowed subgroups first */
    const allowedOrders = orders.filter(o => {
        if (isAdmin) return true;
        const pCode = o.partyCode || '';
        return allowedPrefixes.includes(pCode.substring(0, 2));
    });

    /** Visible orders based on filter — "Approved" is treated as "Pending" bucket for UX */
    const visibleOrders = (activeFilter === 'All'
        ? allowedOrders
        : allowedOrders.filter(o => o.status === activeFilter)
    );

    /** Count for tab badge */
    const countFor = (tab: StatusFilter) => {
        if (tab === 'All') return allowedOrders.length;
        return allowedOrders.filter(o => o.status === tab).length;
    };

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

            {/* Status filter tabs */}
            <div className="flex gap-2 mb-4 flex-wrap">
                {STATUS_TABS.map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveFilter(tab)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                            activeFilter === tab
                                ? 'bg-brand-500 text-white'
                                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-brand-500'
                        }`}
                    >
                        {tab}
                        {tab !== 'All' && (
                            <span className="ml-1 opacity-70">({countFor(tab)})</span>
                        )}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="text-center py-16 text-gray-400">Loading orders…</div>
            ) : visibleOrders.length === 0 ? (
                <div className="text-center py-16 text-gray-400">No orders</div>
            ) : (
                <div className="space-y-4">
                    {visibleOrders.map(order => {
                        const s = statusStyle[order.status] || statusStyle['Pending'];
                        const isOpen = expandedId === order.id;
                        const isActioning = actionLoading !== null;

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
                                            <span className="text-xs text-gray-400">#{order.id}</span>
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
                                            {order.status === 'Invoiced' && order.invoiceSeries && order.invoiceBillNo
                                                ? `✓ ${order.invoiceSeries}${order.invoiceBillNo}`
                                                : order.status}
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
                                        <div className="mb-3 text-xs text-gray-500 flex gap-4 flex-wrap">
                                            <span>Party Code: <strong className="text-gray-800 dark:text-gray-200">{order.partyCode}</strong></span>
                                            {order.notes && <span>Note: {order.notes}</span>}
                                            {order.adminNote && (
                                                <span className="text-red-500">Admin Note: {order.adminNote}</span>
                                            )}
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
                                        <div className="mt-4 space-y-2">

                                            {/* ── INVOICED ─────────────────────────── */}
                                            {order.status === 'Invoiced' && (
                                                <>
                                                    {/* Invoiced badge */}
                                                    <div className="w-full flex items-center justify-center gap-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-bold py-2.5 rounded-lg text-sm">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        Invoiced ✓&nbsp;
                                                        <span className="font-black text-blue-800 dark:text-blue-200">
                                                            {order.invoiceSeries}{order.invoiceBillNo}
                                                        </span>
                                                    </div>
                                                    {/* Re-Invoice */}
                                                    <button
                                                        onClick={() => navigate('/invoicing', { state: { prefilledOrder: order } })}
                                                        className="w-full flex items-center justify-center gap-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-brand-500 hover:text-brand-500 font-semibold py-2 rounded-lg text-sm transition-colors"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                        </svg>
                                                        Re-Invoice
                                                    </button>
                                                </>
                                            )}

                                            {/* ── REJECTED ─────────────────────────── */}
                                            {order.status === 'Rejected' && (
                                                <>
                                                    <div className="w-full flex items-center justify-center gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 font-bold py-2.5 rounded-lg text-sm">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        Rejected
                                                    </div>
                                                    {/* Re-Invoice */}
                                                    <button
                                                        onClick={() => navigate('/invoicing', { state: { prefilledOrder: order } })}
                                                        className="w-full flex items-center justify-center gap-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-brand-500 hover:text-brand-500 font-semibold py-2 rounded-lg text-sm transition-colors"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                        </svg>
                                                        Re-Invoice
                                                    </button>
                                                </>
                                            )}

                                            {/* ── PENDING / APPROVED ───────────────── */}
                                            {(order.status === 'Pending' || order.status === 'Approved') && (
                                                <div className="flex gap-2">
                                                    {/* Create Invoice */}
                                                    <button
                                                        onClick={() => navigate('/invoicing', { state: { prefilledOrder: order } })}
                                                        className="flex-1 bg-brand-500 hover:bg-brand-600 text-white font-bold py-2.5 rounded-lg text-sm transition-colors"
                                                    >
                                                        Create Invoice
                                                    </button>
                                                    {/* Reject */}
                                                    <button
                                                        onClick={() => updateOrderStatus(order.id, 'Rejected')}
                                                        disabled={isActioning}
                                                        className="flex items-center justify-center gap-1.5 px-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900 font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                                                    >
                                                        {actionLoading === order.id + 'Rejected' ? (
                                                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                                            </svg>
                                                        ) : (
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        )}
                                                        Reject
                                                    </button>
                                                </div>
                                            )}

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
