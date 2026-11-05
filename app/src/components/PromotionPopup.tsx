import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { fetchActivePromotions, type Promotion } from '../lib/api';
import { useStore } from '../context/StoreContext';
import { PROMO_PUSH_EVENT } from '../lib/orderEvents';
import { WELCOME_FLAG } from './WelcomeSplash';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/app';
const SERVER_BASE = API_URL.replace(/\/api\/app\/?$/, '');
const HOUR_MS = 60 * 60 * 1000;
const REFRESH_MS = 10 * 60 * 1000;
const SPLASH_DELAY_MS = 2900;

interface PromoState {
    dismissed: Record<string, true>;   // ONCE promos closed with X / CTA
    lastShown: Record<string, number>; // HOURLY promos: last time shown
}

const stateKey = (party: string) => `app_promo_state_${party}`;
const loadState = (party: string): PromoState => {
    try {
        const s = JSON.parse(localStorage.getItem(stateKey(party)) || '');
        return { dismissed: s.dismissed || {}, lastShown: s.lastShown || {} };
    } catch {
        return { dismissed: {}, lastShown: {} };
    }
};
const saveState = (party: string, s: PromoState) => localStorage.setItem(stateKey(party), JSON.stringify(s));

const mediaSrc = (url: string) => (/^https?:\/\//i.test(url) ? url : `${SERVER_BASE}${url}`);

/**
 * Admin-created image / GIF popups (Notification Suite → In-App Promotion).
 *   ONCE        – shown until the user closes it with X, then never again
 *   HOURLY      – shown at most once an hour
 *   EVERY_PAGE  – shown on every page change
 * A tapped promotion notification opens the app with ?promo=<id>, which shows it straight away.
 */
const PromotionPopup = () => {
    const { user } = useStore();
    const location = useLocation();
    const navigate = useNavigate();
    const party = user?.partyCode || '';

    const [promos, setPromos] = useState<Promotion[]>([]);
    const [current, setCurrent] = useState<Promotion | null>(null);
    const [ready, setReady] = useState(() => sessionStorage.getItem(WELCOME_FLAG) !== '1');
    const [tick, setTick] = useState(0); // re-check HOURLY promos
    const forcedId = useRef<string | null>(null);
    // EVERY_PAGE: location.key of the page each promo was last shown on
    const shownOnPage = useRef<Record<string, string>>({});

    const load = useCallback(async () => {
        if (!party) return;
        try {
            setPromos(await fetchActivePromotions());
        } catch (err) {
            console.error('Failed to load promotions', err);
        }
    }, [party]);

    // Wait for the post-login welcome splash to finish
    useEffect(() => {
        if (ready) return;
        const t = setTimeout(() => setReady(true), SPLASH_DELAY_MS);
        return () => clearTimeout(t);
    }, [ready]);

    // Initial load, periodic refresh, refresh on app resume, hourly re-check
    useEffect(() => {
        load();
        const refresh = setInterval(load, REFRESH_MS);
        const minute = setInterval(() => setTick(t => t + 1), 60 * 1000);
        const onVisible = () => {
            if (document.visibilityState === 'visible') { load(); setTick(t => t + 1); }
        };
        const onPush = (e: Event) => {
            forcedId.current = (e as CustomEvent<string>).detail;
            load();
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener(PROMO_PUSH_EVENT, onPush);
        return () => {
            clearInterval(refresh);
            clearInterval(minute);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener(PROMO_PUSH_EVENT, onPush);
        };
    }, [load]);

    // Opened from a tapped notification: /?promo=<id>
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const id = params.get('promo');
        if (!id) return;
        forcedId.current = id;
        params.delete('promo');
        const qs = params.toString();
        navigate({ pathname: location.pathname, search: qs ? `?${qs}` : '' }, { replace: true });
        load();
    }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

    // Pick the next promotion to show
    useEffect(() => {
        if (!ready || current || !party || promos.length === 0) return;
        const state = loadState(party);
        const now = Date.now();

        let next: Promotion | undefined;
        if (forcedId.current) {
            // Not in the list yet? Keep waiting for the refetch that's in flight
            next = promos.find(p => String(p.id) === forcedId.current);
            if (next) forcedId.current = null;
        }
        if (!next) {
            next = promos.find(p => {
                const id = String(p.id);
                if (p.frequency === 'ONCE') return !state.dismissed[id];
                if (p.frequency === 'HOURLY') return !state.lastShown[id] || now - state.lastShown[id] >= HOUR_MS;
                if (p.frequency === 'EVERY_PAGE') return shownOnPage.current[id] !== location.key;
                return false;
            });
        }
        if (!next) return;

        const id = String(next.id);
        if (next.frequency === 'HOURLY') {
            state.lastShown[id] = now;
            saveState(party, state);
        }
        shownOnPage.current[id] = location.key;
        setCurrent(next);
    }, [ready, current, party, promos, tick, location.key]);

    const close = () => {
        if (!current) return;
        if (current.frequency === 'ONCE') {
            const state = loadState(party);
            state.dismissed[String(current.id)] = true;
            saveState(party, state);
        }
        setCurrent(null);
    };

    const openAction = () => {
        if (!current?.actionUrl) return;
        const url = current.actionUrl;
        close();
        if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener');
        else navigate(url.startsWith('/') ? url : `/${url}`);
    };

    return (
        <AnimatePresence>
            {current && (
                <motion.div
                    key={current.id}
                    className="fixed inset-0 z-[90] flex items-center justify-center p-5 bg-black/60 backdrop-blur-[2px]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={close}
                >
                    <motion.div
                        className="relative w-full max-w-sm bg-white rounded-2xl overflow-hidden shadow-2xl"
                        initial={{ scale: 0.85, y: 30, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.9, y: 20, opacity: 0 }}
                        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            onClick={close}
                            aria-label="Close"
                            className="absolute top-2.5 right-2.5 z-10 w-8 h-8 rounded-full bg-black/45 text-white flex items-center justify-center backdrop-blur-sm active:scale-90 transition-transform"
                        >
                            <X size={18} strokeWidth={2.5} />
                        </button>

                        <img
                            src={mediaSrc(current.mediaUrl)}
                            alt={current.title || 'Offer'}
                            onClick={current.actionUrl ? openAction : undefined}
                            className={`w-full max-h-[70vh] object-contain bg-gray-100 block ${current.actionUrl ? 'cursor-pointer' : ''}`}
                        />

                        {current.actionUrl && (
                            <div className="p-3">
                                <button
                                    onClick={openAction}
                                    className="w-full py-3 rounded-xl bg-blue-600 active:bg-blue-700 text-white font-semibold text-base shadow"
                                >
                                    {current.ctaText || 'View Offer'}
                                </button>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default PromotionPopup;
