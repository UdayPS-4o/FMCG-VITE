import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { confettiAt } from '../lib/cartFx';

interface Props {
    orderId?: string;
    itemCount: number;
    total: number;
    images: string[];          // up to 3 product photos shown on the phone
    language: 'en' | 'hi';
    onTrack: () => void;
    onContinue: () => void;
}

// phone appears → signal pulses to the Ekta Enterprises shop → shop screen lights up → tick
// (the order is only sent/received here; the van belongs to "billed / on the way")
type Step = 0 | 1 | 2 | 3;
const TIMELINE: [Step, number][] = [[1, 700], [2, 2500], [3, 3900]];
const DONE: Step = 3;
const PULSES = 4;

/** Full-screen "order placed" moment: the order is beamed from the phone to the Ekta Enterprises shop. */
const OrderPlacedOverlay = ({ orderId, itemCount, total, images, language, onTrack, onContinue }: Props) => {
    const [step, setStep] = useState<Step>(0);
    const en = language === 'en';

    useEffect(() => {
        const timers = TIMELINE.map(([s, ms]) => setTimeout(() => setStep(s), ms));
        return () => timers.forEach(clearTimeout);
    }, []);

    useEffect(() => {
        if (step === 2) {
            try { navigator.vibrate?.(25); } catch { /* unsupported */ }
        }
        if (step === DONE) {
            try { navigator.vibrate?.([30, 50, 30]); } catch { /* unsupported */ }
            confettiAt(window.innerWidth / 2, window.innerHeight * 0.55);
        }
    }, [step]);

    const sending = step === 1;
    const received = step >= 2;
    const label = orderId ? `#${orderId}` : '#ORDER';
    const message = [
        en ? 'Sending your order…' : 'आपका ऑर्डर भेजा जा रहा है…',
        en ? 'Sending your order to Ekta Enterprises…' : 'आपका ऑर्डर एकता एंटरप्राइजेज़ को भेजा जा रहा है…',
        en ? 'Ekta Enterprises received your order' : 'एकता एंटरप्राइजेज़ को आपका ऑर्डर मिल गया',
        '',
    ][step];

    return (
        <motion.div
            className="fixed inset-0 z-[200] bg-white flex flex-col items-center pt-[max(48px,env(safe-area-inset-top))] px-4 overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            role="dialog"
            aria-modal="true"
        >
            <svg viewBox="0 0 340 300" className="w-full max-w-md h-auto">
                <rect width="340" height="300" fill="#eff6ff" />

                {/* customer's phone with the order */}
                <motion.g
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', damping: 16, stiffness: 160 }}
                >
                    <g transform="translate(30,110)">
                        <rect width="60" height="110" rx="12" fill="#111827" />
                        <rect x="5" y="10" width="50" height="88" rx="6" fill="#fff" />
                        {images.slice(0, 3).map((src, i) => (
                            <image key={src + i} href={src} x={7 + (i % 2) * 24} y={16 + Math.floor(i / 2) * 24} width="22" height="22" />
                        ))}
                        <rect x="11" y="70" width="38" height="18" rx="5" fill="#000" />
                        <text x="30" y="82" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#fff">
                            {en ? 'Place Order' : 'ऑर्डर करें'}
                        </text>
                    </g>
                </motion.g>

                {/* signal pulses travelling to the shop */}
                {sending && Array.from({ length: PULSES }).map((_, i) => (
                    <motion.path
                        key={i}
                        d="M0 -16 A16 16 0 0 1 0 16"
                        fill="none" stroke="#6366f1" strokeWidth="4" strokeLinecap="round"
                        initial={{ x: 100, y: 165, scale: 0.6, opacity: 0 }}
                        animate={{ x: 214, y: 155, scale: 1.4, opacity: [0, 1, 0.15] }}
                        transition={{ duration: 0.9, delay: i * 0.28, repeat: 1, repeatDelay: PULSES * 0.28 - 0.9 + 0.3, ease: 'easeOut' }}
                    />
                ))}

                {/* Ekta Enterprises shop */}
                <g transform="translate(195,80)">
                    <rect x="0" y="30" width="120" height="110" rx="6" fill="#fff" stroke="#c7d2fe" strokeWidth="2" />
                    <path d="M-6 34 L10 6 H110 L126 34Z" fill="#4f46e5" />
                    {[0, 1, 2, 3, 4].map(i => (
                        <path key={i} d={`M${-6 + i * 26.4} 34 q13.2 14 26.4 0`} fill={i % 2 ? '#818cf8' : '#c7d2fe'} />
                    ))}
                    <rect x="8" y="10" width="104" height="16" rx="3" fill="#111827" />
                    <text x="60" y="21.5" textAnchor="middle" fontSize="8" fontWeight="800" fill="#a5b4fc">EKTA ENTERPRISES</text>
                    {/* the shop's order screen */}
                    <motion.rect
                        x="20" y="50" width="80" height="50" rx="6"
                        initial={false}
                        animate={{ fill: received ? '#065f46' : '#1f2937' }}
                        transition={{ duration: 0.4 }}
                    />
                    <motion.text
                        x="60" y="73" textAnchor="middle" fontSize="8" fontWeight="800" fill="#34d399"
                        initial={false}
                        animate={{ opacity: received ? [0, 1, 0.4, 1] : 0 }}
                        transition={{ duration: 0.9 }}
                    >
                        {en ? 'NEW ORDER' : 'नया ऑर्डर'}
                    </motion.text>
                    <motion.text
                        x="60" y="88" textAnchor="middle" fontSize="8" fontWeight="800" fill="#a7f3d0"
                        initial={false}
                        animate={{ opacity: received ? 1 : 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        {label}
                    </motion.text>
                    {/* glow when it arrives */}
                    {received && (
                        <motion.rect
                            x="20" y="50" width="80" height="50" rx="6" fill="none" stroke="#34d399" strokeWidth="3"
                            initial={{ opacity: 0.9, scale: 1 }}
                            animate={{ opacity: 0, scale: 1.35 }}
                            transition={{ duration: 0.9, ease: 'easeOut' }}
                        />
                    )}
                    <rect x="45" y="106" width="30" height="34" fill="#e0e7ff" />
                </g>
            </svg>

            {step < DONE ? (
                <p className="text-gray-500 text-[15px] mt-2 h-6" aria-live="polite">{message}</p>
            ) : (
                <motion.div
                    className="flex flex-col items-center gap-1.5 mt-1 w-full max-w-md"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    aria-live="polite"
                >
                    <svg width="84" height="84" viewBox="0 0 100 100">
                        <motion.circle cx="50" cy="50" r="45" fill="#ecfdf5" stroke="#10b981" strokeWidth="6" transform="rotate(-90 50 50)"
                            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }} />
                        <motion.path d="M30 52 L45 66 L71 37" fill="none" stroke="#10b981" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"
                            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.5, duration: 0.35, ease: 'easeOut' }} />
                    </svg>
                    <h2 className="text-2xl font-extrabold text-emerald-600 mt-1">{en ? 'Order Placed!' : 'ऑर्डर हो गया!'}</h2>
                    <p className="text-sm text-gray-500">
                        {label} · {itemCount} {en ? (itemCount === 1 ? 'item' : 'items') : 'आइटम'} · ₹{total.toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-500">
                        {en ? "We'll confirm it shortly." : 'हम जल्द ही इसकी पुष्टि करेंगे।'}
                    </p>
                    <div className="flex gap-2.5 mt-4 w-full">
                        <button onClick={onContinue} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-800 font-bold text-sm">
                            {en ? 'Continue shopping' : 'खरीदारी जारी रखें'}
                        </button>
                        <button onClick={onTrack} className="flex-1 py-3 rounded-xl bg-black text-white font-bold text-sm">
                            {en ? 'Track order' : 'ऑर्डर ट्रैक करें'}
                        </button>
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
};

export default OrderPlacedOverlay;
