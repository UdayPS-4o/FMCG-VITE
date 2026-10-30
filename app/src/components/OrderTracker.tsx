import { motion } from 'framer-motion';
import { FileText, Truck, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export type OrderStatus = 'Pending' | 'Approved' | 'Rejected' | 'Invoiced';

interface TrackableOrder {
    date: string;
    status: OrderStatus;
    updatedAt?: string;
    adminNote?: string;
    invoiceBillNo?: string;
    invoiceSeries?: string;
}

// Only the stages the order record really has: placed → confirmed (Approved) → billed (Invoiced)
const STEP_OF: Record<OrderStatus, number> = { Pending: 0, Approved: 1, Invoiced: 2, Rejected: 0 };

const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

/** Animated tracker for the order detail page. */
const OrderTracker = ({ order, language }: { order: TrackableOrder; language: 'en' | 'hi' }) => {
    const navigate = useNavigate();
    const en = language === 'en';

    if (order.status === 'Rejected') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 border border-red-100 rounded-2xl p-4 flex gap-3"
            >
                <XCircle className="text-red-500 shrink-0" size={22} />
                <div>
                    <p className="font-bold text-red-700 text-sm">{en ? 'Order cancelled' : 'ऑर्डर रद्द हुआ'}</p>
                    {order.adminNote && <p className="text-xs text-red-600 mt-0.5">{order.adminNote}</p>}
                    {order.updatedAt && <p className="text-[11px] text-red-400 mt-1">{fmt(order.updatedAt)}</p>}
                </div>
            </motion.div>
        );
    }

    const step = STEP_OF[order.status] ?? 0;
    const labels = en ? ['Placed', 'Confirmed', 'Billed'] : ['ऑर्डर हुआ', 'पुष्टि', 'बिल बना'];
    const pct = (step / (labels.length - 1)) * 100;
    const headline = [
        en ? 'Waiting for Ekta to confirm your order' : 'एकता द्वारा पुष्टि का इंतज़ार',
        en ? 'Confirmed! Your bill is being prepared' : 'पुष्टि हो गई! बिल बन रहा है',
        en ? 'Billed and ready for dispatch' : 'बिल बन गया, भेजने के लिए तैयार',
    ][step];

    const events = [
        { icon: '🧾', title: en ? 'Order placed' : 'ऑर्डर किया गया', time: fmt(order.date) },
        step >= 1 && { icon: '✅', title: en ? 'Confirmed by Ekta Enterprises' : 'एकता एंटरप्राइजेज़ ने पुष्टि की', time: step === 1 ? fmt(order.updatedAt) : '' },
        step >= 2 && {
            icon: '📄',
            title: `${en ? 'Billed' : 'बिल बना'}${order.invoiceSeries && order.invoiceBillNo ? ` · ${order.invoiceSeries}-${order.invoiceBillNo}` : ''}`,
            time: fmt(order.updatedAt),
        },
    ].filter(Boolean).reverse() as { icon: string; title: string; time: string }[];

    return (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-sm font-semibold text-emerald-600 mb-4">{headline}</p>

            {/* progress line with moving van */}
            <div className="relative h-12 mx-2">
                <div className="absolute left-0 right-0 top-[22px] h-1 rounded-full bg-gray-200" />
                <motion.div
                    className="absolute left-0 top-[22px] h-1 rounded-full bg-emerald-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1.1, ease: 'easeInOut', delay: 0.2 }}
                />
                <div className="absolute left-0 right-0 top-4 flex justify-between">
                    {labels.map((_, i) => (
                        <motion.div
                            key={i}
                            className={`relative w-4 h-4 rounded-full border-[3px] ${i < step ? 'bg-emerald-500 border-emerald-500' : i === step ? 'bg-white border-emerald-500' : 'bg-white border-gray-300'}`}
                            initial={{ scale: 0.6 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2 + i * 0.35, type: 'spring', stiffness: 400, damping: 15 }}
                        >
                            {i === step && <span className="absolute -inset-2 rounded-full border-2 border-emerald-400 animate-ping" />}
                        </motion.div>
                    ))}
                </div>
                <motion.div
                    className="absolute -top-1 text-emerald-600"
                    initial={{ left: '0%' }}
                    animate={{ left: `${pct}%` }}
                    transition={{ duration: 1.1, ease: 'easeInOut', delay: 0.2 }}
                    style={{ x: '-50%' }}
                >
                    <Truck size={22} />
                </motion.div>
            </div>
            <div className="flex justify-between text-[10px] mb-3 -mx-1">
                {labels.map((l, i) => (
                    <span key={l} className={`w-16 text-center ${i === 0 ? 'text-left' : i === labels.length - 1 ? 'text-right' : ''} ${i === step ? 'text-gray-900 font-bold' : 'text-gray-500'}`}>{l}</span>
                ))}
            </div>

            <div className="border-t border-dashed border-gray-200 pt-2">
                {events.map((ev, i) => (
                    <motion.div
                        key={ev.title}
                        className="flex gap-2.5 py-1.5 text-xs"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + i * 0.15 }}
                    >
                        <span className="w-6 h-6 rounded-full bg-emerald-50 grid place-items-center shrink-0">{ev.icon}</span>
                        <div>
                            <div className="text-gray-800 font-medium">{ev.title}</div>
                            {ev.time && <div className="text-[10.5px] text-gray-400">{ev.time}</div>}
                        </div>
                    </motion.div>
                ))}
            </div>

            {step === 2 && order.invoiceSeries && order.invoiceBillNo && (
                <motion.button
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 1.2, type: 'spring', stiffness: 300, damping: 14 }}
                    onClick={() => navigate(`/invoice/${order.invoiceSeries}/${order.invoiceBillNo}`)}
                    className="mt-2 w-full flex items-center gap-2 bg-indigo-50 text-indigo-700 rounded-xl px-3 py-2.5 text-xs font-semibold"
                >
                    <FileText size={16} />
                    <span className="flex-1 text-left">
                        {en ? 'Your invoice is ready' : 'आपका बिल तैयार है'} · {order.invoiceSeries}-{order.invoiceBillNo}
                    </span>
                    <span className="underline">{en ? 'View' : 'देखें'}</span>
                </motion.button>
            )}
        </div>
    );
};

/** Three-segment progress for order cards on the Orders list. */
export const OrderMiniProgress = ({ status }: { status: OrderStatus }) => {
    if (status === 'Rejected') return null;
    const step = STEP_OF[status] ?? 0;
    return (
        <div className="flex gap-1 mt-2" aria-hidden="true">
            {[0, 1, 2].map(i => (
                <div key={i} className="h-1 flex-1 rounded-full bg-gray-200 overflow-hidden">
                    <motion.div
                        className="h-full bg-emerald-500"
                        initial={{ width: 0 }}
                        animate={{ width: i <= step ? '100%' : 0 }}
                        transition={{ delay: 0.15 + i * 0.2, duration: 0.4 }}
                    />
                </div>
            ))}
        </div>
    );
};

export default OrderTracker;
