import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';

const TRIGGER = 80;   // px pulled before release refreshes
const MAX = 110;

type Phase = 'idle' | 'pulling' | 'ready' | 'refreshing' | 'done';

/**
 * Pull down at the top of the page to refresh. The header shows a road; on release
 * the EKTA van drives across while onRefresh() runs. Touch only (phones).
 */
const PullToRefresh = ({ onRefresh, language, children }: {
    onRefresh: () => Promise<unknown>;
    language: 'en' | 'hi';
    children?: ReactNode;
}) => {
    const [pull, setPull] = useState(0);
    const [phase, setPhase] = useState<Phase>('idle');
    const startY = useRef<number | null>(null);
    const pullRef = useRef(0);
    const setPullBoth = (v: number) => { pullRef.current = v; setPull(v); };
    const busy = useRef(false);
    const refreshRef = useRef(onRefresh);
    useEffect(() => { refreshRef.current = onRefresh; }, [onRefresh]);

    useEffect(() => {
        const onStart = (e: TouchEvent) => {
            if (busy.current || window.scrollY > 0) { startY.current = null; return; }
            startY.current = e.touches[0].clientY;
        };
        const onMove = (e: TouchEvent) => {
            if (startY.current === null || busy.current) return;
            const dy = e.touches[0].clientY - startY.current;
            if (dy <= 0 || window.scrollY > 0) { setPullBoth(0); setPhase('idle'); return; }
            const d = Math.min(MAX, dy * 0.5); // resistance
            setPullBoth(d);
            setPhase(d >= TRIGGER ? 'ready' : 'pulling');
        };
        const onEnd = async () => {
            if (startY.current === null || busy.current) return;
            startY.current = null;
            if (pullRef.current < TRIGGER) { setPullBoth(0); setPhase('idle'); return; }
            busy.current = true;
            setPullBoth(96);
            setPhase('refreshing');
            const minVan = new Promise(r => setTimeout(r, 1600)); // let the van finish its trip
            await Promise.allSettled([refreshRef.current(), minVan]);
            setPhase('done');
            setTimeout(() => { setPullBoth(0); setPhase('idle'); busy.current = false; }, 650);
        };
        window.addEventListener('touchstart', onStart, { passive: true });
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onEnd);
        window.addEventListener('touchcancel', onEnd);
        return () => {
            window.removeEventListener('touchstart', onStart);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
            window.removeEventListener('touchcancel', onEnd);
        };
    }, []);

    const en = language === 'en';
    const label = {
        idle: '', pulling: en ? 'Pull to refresh' : 'रीफ़्रेश के लिए खींचें',
        ready: en ? 'Release to refresh' : 'छोड़ें',
        refreshing: en ? 'Refreshing…' : 'रीफ़्रेश हो रहा है…',
        done: en ? '✓ Updated just now' : '✓ अपडेट हो गया',
    }[phase];
    const driving = phase === 'refreshing';

    return (
        <>
            <motion.div
                className="relative overflow-hidden bg-gradient-to-b from-indigo-100 to-gray-50"
                animate={{ height: pull }}
                transition={phase === 'pulling' || phase === 'ready' ? { duration: 0 } : { type: 'spring', damping: 26, stiffness: 260 }}
                aria-live="polite"
            >
                <div className="absolute top-2 inset-x-0 text-center text-[11px] font-bold text-indigo-600">{label}</div>
                <svg className="absolute bottom-0 left-0 w-full h-[34px]" viewBox="0 0 360 34" preserveAspectRatio="none">
                    <rect y="10" width="360" height="24" fill="#374151" />
                    <line x1="0" y1="22" x2="360" y2="22" stroke="#fde68a" strokeWidth="2" strokeDasharray="12 12" />
                </svg>
                <motion.svg
                    viewBox="0 0 134 64" width="70" height="34"
                    className="absolute bottom-[14px]"
                    initial={false}
                    animate={{ left: driving || phase === 'done' ? '110%' : `${Math.min(1, pull / TRIGGER) * 12 - 20}%` }}
                    transition={driving ? { duration: 1.5, ease: [0.5, 0, 0.4, 1] } : { duration: 0 }}
                >
                    <rect x="0" y="6" width="92" height="44" rx="5" fill="#4f46e5" />
                    <text x="46" y="34" textAnchor="middle" fontSize="14" fontWeight="800" fill="#fff">EKTA</text>
                    <path d="M94 18 H118 L132 34 V50 H94Z" fill="#111827" />
                    <path d="M100 22 H116 L126 34 H100Z" fill="#93c5fd" />
                    <circle cx="24" cy="52" r="10" fill="#111" /><circle cx="24" cy="52" r="4" fill="#9ca3af" />
                    <circle cx="112" cy="52" r="10" fill="#111" /><circle cx="112" cy="52" r="4" fill="#9ca3af" />
                </motion.svg>
            </motion.div>
            {children}
        </>
    );
};

export default PullToRefresh;
