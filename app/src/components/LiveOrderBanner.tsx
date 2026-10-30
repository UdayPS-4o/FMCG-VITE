import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import logoUrl from '../../icons/icon-192.webp';
import {
    APP_NAVIGATE_EVENT, ORDER_PUSH_EVENT, ORDER_REFRESH_EVENT, PENDING_NAV_KEY, type OrderPushDetail,
} from '../lib/orderEvents';

const SHOW_MS = 5000;

/** Two-note "ding" made with WebAudio (no sound file needed). */
const playChime = () => {
    try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        [[880, 0], [1320, 0.12]].forEach(([freq, at]) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
            gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.45);
            osc.connect(gain).connect(ctx.destination);
            osc.start(ctx.currentTime + at);
            osc.stop(ctx.currentTime + at + 0.5);
        });
        setTimeout(() => ctx.close(), 900);
    } catch { /* audio blocked or unsupported */ }
};

/**
 * Live order updates while the app is open: a push drops a banner from the top,
 * the phone buzzes, a chime plays, and order screens reload (tracker animates forward).
 * Also routes notification taps to the right page.
 */
const LiveOrderBanner = () => {
    const navigate = useNavigate();
    const [banner, setBanner] = useState<(OrderPushDetail & { key: number }) | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const go = (url: string) => {
            sessionStorage.removeItem(PENDING_NAV_KEY);
            navigate(url);
        };
        // Notification tapped before the app was ready
        const pending = sessionStorage.getItem(PENDING_NAV_KEY);
        if (pending) go(pending);

        const onNavigate = (e: Event) => go((e as CustomEvent<string>).detail);
        const onPush = (e: Event) => {
            const detail = (e as CustomEvent<OrderPushDetail>).detail;
            setBanner({ ...detail, key: Date.now() });
            playChime();
            try { navigator.vibrate?.([30, 60, 30]); } catch { /* unsupported */ }
            window.dispatchEvent(new CustomEvent(ORDER_REFRESH_EVENT, { detail }));
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setBanner(null), SHOW_MS);
        };
        window.addEventListener(APP_NAVIGATE_EVENT, onNavigate);
        window.addEventListener(ORDER_PUSH_EVENT, onPush);
        return () => {
            window.removeEventListener(APP_NAVIGATE_EVENT, onNavigate);
            window.removeEventListener(ORDER_PUSH_EVENT, onPush);
            if (timer.current) clearTimeout(timer.current);
        };
    }, [navigate]);

    return (
        <div className="fixed top-2 left-2.5 right-2.5 z-[250] flex justify-center pointer-events-none pt-[env(safe-area-inset-top)]">
            <AnimatePresence>
                {banner && (
                    <motion.button
                        key={banner.key}
                        type="button"
                        onClick={() => { setBanner(null); if (banner.url) navigate(banner.url); }}
                        initial={{ y: -120, opacity: 0 }}
                        animate={{ y: 0, opacity: 1, x: [0, -5, 5, -3, 2, 0] }}
                        exit={{ y: -120, opacity: 0 }}
                        transition={{ y: { type: 'spring', damping: 18, stiffness: 260 }, x: { delay: 0.35, duration: 0.45 } }}
                        drag="y"
                        dragConstraints={{ top: 0, bottom: 0 }}
                        onDragEnd={(_, info) => { if (info.offset.y < -30) setBanner(null); }}
                        className="pointer-events-auto w-full max-w-md text-left bg-white/95 backdrop-blur rounded-2xl px-3 py-2.5 flex gap-3 shadow-[0_12px_30px_rgba(0,0,0,.18)] border border-gray-100"
                    >
                        <img src={logoUrl} alt="" className="w-10 h-10 rounded-xl object-contain bg-white shrink-0" />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[13px] font-bold text-gray-900 truncate">{banner.title}</span>
                                <motion.span
                                    className="text-base"
                                    animate={{ rotate: [0, 18, -14, 10, -6, 0] }}
                                    transition={{ duration: 0.9, delay: 0.3 }}
                                >🔔</motion.span>
                            </div>
                            <p className="text-xs text-gray-600 leading-snug line-clamp-2">{banner.body}</p>
                        </div>
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
};

export default LiveOrderBanner;
