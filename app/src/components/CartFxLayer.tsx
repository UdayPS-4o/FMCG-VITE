import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../context/StoreContext';
import { CARTFX_ADDED, CARTFX_SCHEME, type CartFxAddedDetail, type CartFxSchemeDetail } from '../lib/cartFx';

type Toast =
    | { kind: 'added'; key: number; detail: CartFxAddedDetail }
    | { kind: 'scheme'; key: number; detail: CartFxSchemeDetail };

/** Toasts above the bottom nav for "Added to cart" and "Scheme unlocked". */
const CartFxLayer = () => {
    const { cart, cartTotal, language } = useStore();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [toast, setToast] = useState<Toast | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const show = (t: Toast, ms: number) => {
            setToast(t);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setToast(null), ms);
        };
        const onAdded = (e: Event) => show({ kind: 'added', key: Date.now(), detail: (e as CustomEvent<CartFxAddedDetail>).detail }, 2400);
        const onScheme = (e: Event) => show({ kind: 'scheme', key: Date.now(), detail: (e as CustomEvent<CartFxSchemeDetail>).detail }, 3200);
        window.addEventListener(CARTFX_ADDED, onAdded);
        window.addEventListener(CARTFX_SCHEME, onScheme);
        return () => {
            window.removeEventListener(CARTFX_ADDED, onAdded);
            window.removeEventListener(CARTFX_SCHEME, onScheme);
            if (timer.current) clearTimeout(timer.current);
        };
    }, []);

    const en = language === 'en';
    // Home shows its own floating cart pill at bottom 76px once the cart has items; sit above it
    const bottom = pathname === '/' && cart.length > 0 ? 136 : 76;

    return (
        <div className="fixed left-3 right-3 z-[110] pointer-events-none flex justify-center" style={{ bottom }}>
            <AnimatePresence>
                {toast && (
                    <motion.div
                        key={toast.key}
                        initial={{ y: 40, opacity: 0, scale: 0.96 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 30, opacity: 0 }}
                        transition={{ type: 'spring', damping: 22, stiffness: 320 }}
                        className={`pointer-events-auto w-full max-w-md rounded-2xl px-3.5 py-2.5 flex items-center gap-3 shadow-xl ${toast.kind === 'scheme' ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white' : 'bg-gray-900 text-white'}`}
                    >
                        {toast.kind === 'added' ? (
                            <>
                                <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center overflow-hidden shrink-0">
                                    {toast.detail.image ? <img src={toast.detail.image} alt="" className="w-full h-full object-contain p-0.5" /> : <span>📦</span>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold">{toast.detail.title || (en ? 'Added to cart' : 'कार्ट में जोड़ा गया')}</div>
                                    <div className="text-[11px] text-gray-300 truncate">
                                        {cart.length} {en ? (cart.length === 1 ? 'item' : 'items') : 'आइटम'} · ₹{cartTotal.toFixed(2)}
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setToast(null); navigate('/cart'); }}
                                    className="text-emerald-300 text-xs font-extrabold tracking-wide px-1 py-2"
                                >
                                    {en ? 'VIEW CART' : 'कार्ट देखें'}
                                </button>
                            </>
                        ) : (
                            <>
                                <span className="text-2xl">🎉</span>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-extrabold">
                                        {toast.detail.discount}% {en ? 'OFF unlocked!' : 'छूट मिल गई!'}
                                    </div>
                                    <div className="text-[11px] text-orange-50 truncate">
                                        {en ? 'You save' : 'आपकी बचत'} ₹{toast.detail.savings.toFixed(2)} · {toast.detail.name}
                                    </div>
                                </div>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CartFxLayer;
