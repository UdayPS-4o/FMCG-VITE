import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import logoUrl from '../../icons/icon-192.webp';

export const WELCOME_FLAG = 'app_show_welcome';
const SHOW_MS = 2600;

const greeting = (en: boolean) => {
    const h = new Date().getHours();
    if (h < 12) return { icon: '☀️', text: en ? 'Good morning! Fresh offers are waiting.' : 'सुप्रभात! नए ऑफ़र आपका इंतज़ार कर रहे हैं।', sun: true };
    if (h < 17) return { icon: '🌤️', text: en ? 'Good afternoon! Happy ordering.' : 'नमस्कार! खुशी से ऑर्डर करें।', sun: true };
    return { icon: '🌙', text: en ? 'Good evening! Happy ordering.' : 'शुभ संध्या! खुशी से ऑर्डर करें।', sun: false };
};

/**
 * One-time welcome after a successful login: logo springs in, "Namaste, {shop}" types itself,
 * then the whole screen fades into the app after ~2.6s. No button to press.
 */
const WelcomeSplash = ({ name, language }: { name: string; language: 'en' | 'hi' }) => {
    const [show, setShow] = useState(() => sessionStorage.getItem(WELCOME_FLAG) === '1');
    const [typed, setTyped] = useState(0);
    const en = language === 'en';
    const text = `${en ? 'Namaste' : 'नमस्ते'}, ${name} 🙏`;
    const chars = [...text];
    const g = greeting(en);

    useEffect(() => {
        if (!show) return;
        sessionStorage.removeItem(WELCOME_FLAG);
        const start = setTimeout(() => {
            let i = 0;
            const t = setInterval(() => { i++; setTyped(i); if (i >= chars.length) clearInterval(t); }, Math.max(25, 900 / chars.length));
        }, 500);
        const hide = setTimeout(() => setShow(false), SHOW_MS);
        return () => { clearTimeout(start); clearTimeout(hide); };
    }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    key="welcome"
                    className="fixed inset-0 z-[300] flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-emerald-50 px-6"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 1.04 }}
                    transition={{ duration: 0.45 }}
                    aria-live="polite"
                >
                    {g.sun && (
                        <motion.div
                            className="absolute right-10 w-16 h-16 rounded-full"
                            style={{ background: 'radial-gradient(#fde047,#f59e0b)', boxShadow: '0 0 40px #fcd34d' }}
                            initial={{ bottom: -80 }}
                            animate={{ bottom: 140 }}
                            transition={{ duration: 1.4, ease: 'easeOut' }}
                        />
                    )}
                    <div className="relative grid place-items-center">
                        {[0, 0.5].map(d => (
                            <motion.div
                                key={d}
                                className="absolute w-24 h-24 rounded-[28px] border-2 border-indigo-300"
                                initial={{ scale: 1, opacity: 0 }}
                                animate={{ scale: 2.3, opacity: [0.8, 0] }}
                                transition={{ duration: 1.6, delay: 0.3 + d, repeat: Infinity, ease: 'easeOut' }}
                            />
                        ))}
                        <motion.img
                            src={logoUrl}
                            alt="Ekta"
                            className="relative w-24 h-24 rounded-[28px] bg-white shadow-xl object-contain p-2"
                            initial={{ scale: 0, rotate: -20 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: 'spring', damping: 11, stiffness: 180 }}
                        />
                    </div>
                    <p className="mt-6 min-h-8 text-center text-[22px] font-extrabold text-gray-900">
                        {chars.slice(0, typed).join('')}
                        {typed < chars.length && <span className="inline-block w-0.5 h-6 bg-indigo-600 align-middle ml-0.5 animate-pulse" />}
                    </p>
                    <motion.p
                        className="mt-1 text-sm text-gray-500"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: typed >= chars.length ? 1 : 0 }}
                    >
                        {g.icon} {g.text}
                    </motion.p>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default WelcomeSplash;
