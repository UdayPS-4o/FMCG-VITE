import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { confettiAt } from '../lib/cartFx';

interface Props {
    orderId?: string;
    itemCount: number;
    total: number;
    images: string[];          // up to 3 product photos to drop into the box
    language: 'en' | 'hi';
    onTrack: () => void;
    onContinue: () => void;
}

// pack → close → tape → van in → load → drive into godown → done
type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const TIMELINE: [Step, number][] = [[1, 1300], [2, 1700], [3, 2100], [4, 3100], [5, 3700], [6, 5500]];

/** Full-screen "order placed" moment: items packed into a box and driven to the Ekta godown. */
const OrderPlacedOverlay = ({ orderId, itemCount, total, images, language, onTrack, onContinue }: Props) => {
    const [step, setStep] = useState<Step>(0);
    const en = language === 'en';

    useEffect(() => {
        const timers = TIMELINE.map(([s, ms]) => setTimeout(() => setStep(s), ms));
        return () => timers.forEach(clearTimeout);
    }, []);

    useEffect(() => {
        if (step === 6) {
            try { navigator.vibrate?.([30, 50, 30]); } catch { /* unsupported */ }
            confettiAt(window.innerWidth / 2, window.innerHeight * 0.55);
        }
    }, [step]);

    const flapsClosed = step >= 1;
    const taped = step >= 2;
    const vanX = step < 3 ? -160 : step < 5 ? -28 : 205;
    const boxLoaded = step >= 4;
    const godownOpen = step >= 4;
    const label = orderId ? `#${orderId}` : '#ORDER';
    const message = [
        en ? 'Packing your order…' : 'आपका ऑर्डर पैक हो रहा है…',
        en ? 'Packing your order…' : 'आपका ऑर्डर पैक हो रहा है…',
        en ? 'Sealing the box…' : 'बॉक्स सील हो रहा है…',
        en ? 'Sending to Ekta godown…' : 'एकता गोदाम भेजा जा रहा है…',
        en ? 'Sending to Ekta godown…' : 'एकता गोदाम भेजा जा रहा है…',
        en ? 'Sending to Ekta godown…' : 'एकता गोदाम भेजा जा रहा है…',
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
                <defs>
                    <linearGradient id="op-sky" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#e0e7ff" /><stop offset="1" stopColor="#ffffff" />
                    </linearGradient>
                </defs>
                <rect width="340" height="300" fill="url(#op-sky)" />

                {/* Ekta godown */}
                <g transform="translate(250,118)">
                    <path d="M0 40 L45 10 L90 40 V110 H0Z" fill="#e5e7eb" />
                    <path d="M-4 42 L45 6 L94 42" fill="none" stroke="#4f46e5" strokeWidth="7" strokeLinejoin="round" />
                    <rect x="22" y="58" width="46" height="52" fill="#374151" />
                    <rect x="22" y="58" width="46" height="52" fill="#6b7280"
                        style={{ transform: godownOpen ? 'translateY(-46px)' : 'none', transition: 'transform .5s ease' }} />
                    <rect x="18" y="22" width="54" height="16" rx="3" fill="#111827" />
                    <text x="45" y="34" textAnchor="middle" fontSize="9" fontWeight="800" fill="#a5b4fc">EKTA</text>
                </g>

                {/* road */}
                <rect y="228" width="340" height="40" fill="#374151" />
                <line x1="0" y1="248" x2="340" y2="248" stroke="#fde68a" strokeWidth="3" strokeDasharray="18 18">
                    <animate attributeName="stroke-dashoffset" from="0" to="-36" dur="0.5s" repeatCount="indefinite" />
                </line>
                <rect y="268" width="340" height="32" fill="#d1fae5" />

                {/* box */}
                <g style={{
                    transform: boxLoaded ? 'translate(-6px,160px) scale(.6)' : 'translate(120px,150px)',
                    opacity: boxLoaded ? 0 : 1,
                    transition: 'transform .5s ease, opacity .3s .35s',
                }}>
                    <rect x="0" y="20" width="100" height="62" fill="#c08a4a" stroke="#8b5e2b" strokeWidth="2" />
                    {!taped && images.slice(0, 3).map((src, i) => (
                        <motion.image
                            key={src + i}
                            href={src}
                            width={40} height={40}
                            x={4 + i * 32} y={-12}
                            initial={{ y: -160, opacity: 0 }}
                            animate={{ y: -12, opacity: 1 }}
                            transition={{ delay: 0.15 + i * 0.32, type: 'spring', damping: 12, stiffness: 160 }}
                        />
                    ))}
                    <path d="M0 20 L-22 4 L28 4 L50 20Z" fill="#d9a066" stroke="#8b5e2b" strokeWidth="2"
                        style={{ transformOrigin: '0px 20px', transform: flapsClosed ? 'rotate(0deg)' : 'rotate(-150deg)', transition: 'transform .35s' }} />
                    <path d="M100 20 L122 4 L72 4 L50 20Z" fill="#d9a066" stroke="#8b5e2b" strokeWidth="2"
                        style={{ transformOrigin: '100px 20px', transform: flapsClosed ? 'rotate(0deg)' : 'rotate(150deg)', transition: 'transform .35s .15s' }} />
                    <rect x="44" y="20" width="12" height={taped ? 62 : 0} fill="#fde68a" style={{ transition: 'height .3s' }} />
                    <text x="50" y="62" textAnchor="middle" fontSize="10" fontWeight="800" fill="#5b3b16" opacity={taped ? 1 : 0}>{label}</text>
                </g>

                {/* van */}
                <g style={{ transform: `translateX(${vanX}px)`, transition: step >= 5 ? 'transform 1.6s cubic-bezier(.5,0,.4,1)' : 'transform 1s cubic-bezier(.2,.8,.3,1)' }}>
                    <rect x="0" y="176" width="92" height="52" rx="5" fill="#4f46e5" />
                    <text x="46" y="207" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff">EKTA</text>
                    <path d="M94 192 H120 L134 210 V228 H94Z" fill="#111827" />
                    <path d="M100 196 H118 L128 210 H100Z" fill="#93c5fd" />
                    {[24, 112].map(cx => (
                        <g key={cx}>
                            <circle cx={cx} cy="230" r="10" fill="#111" />
                            <circle cx={cx} cy="230" r="4" fill="#9ca3af" />
                            <rect x={cx - 1} y="221" width="2" height="5" fill="#9ca3af">
                                <animateTransform attributeName="transform" type="rotate" from={`0 ${cx} 230`} to={`360 ${cx} 230`} dur="0.4s" repeatCount="indefinite" />
                            </rect>
                        </g>
                    ))}
                </g>
            </svg>

            {step < 6 ? (
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
