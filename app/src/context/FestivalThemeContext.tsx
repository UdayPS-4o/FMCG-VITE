import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchActiveFestivalTheme, type FestivalTheme, type FestiveVariant } from '../lib/api';

/**
 * Festival theme scheduled by the admin (Notification Suite > Festival Themes).
 *
 * - Refetched on start, every 5 minutes and whenever the app comes back to the
 *   foreground, so a theme turns on soon after its start time.
 * - A timer also clears the theme exactly at its end time, so the app returns to
 *   its normal look on time without needing the network.
 * - The retailer's chosen colour set is remembered per theme.
 */

const REFRESH_MS = 5 * 60 * 1000;
const variantKey = (themeId: number) => `festive_variant_${themeId}`;

interface FestivalThemeValue {
    theme: FestivalTheme | null;
    variant: FestiveVariant | null;
    variantIndex: number;
    /** Moves to the next colour set (wraps around). */
    nextVariant: () => void;
    /** Goes up by one on every switch, so effects can replay. */
    switchCount: number;
    /** Effects are off when the admin disabled them or the phone asks for reduced motion. */
    effectsOn: boolean;
}

const FestivalThemeContext = createContext<FestivalThemeValue>({
    theme: null, variant: null, variantIndex: 0, nextVariant: () => { }, switchCount: 0, effectsOn: false,
});

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const FestivalThemeProvider = ({ children }: { children: ReactNode }) => {
    const [theme, setTheme] = useState<FestivalTheme | null>(null);
    // Colour set picked in this session, per theme id (falls back to the saved one)
    const [picked, setPicked] = useState<Record<number, number>>({});
    const [switchCount, setSwitchCount] = useState(0);
    const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);

    const refresh = useCallback(async () => {
        try {
            const t = await fetchActiveFestivalTheme();
            setTheme(t && t.variants.length && new Date(t.endAt) > new Date() ? t : null);
        } catch {
            // Offline / server down: keep whatever we have; the end-time timer still applies.
        }
    }, []);

    useEffect(() => {
        refresh();
        const id = window.setInterval(refresh, REFRESH_MS);
        const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
    }, [refresh]);

    // Switch back to the normal look exactly at the end time
    useEffect(() => {
        if (!theme) return;
        const ms = Math.max(new Date(theme.endAt).getTime() - Date.now(), 0);
        // setTimeout caps at ~24.8 days; re-check then if the theme is longer
        const id = window.setTimeout(() => (ms > 2 ** 31 - 1 ? refresh() : setTheme(null)), Math.min(ms, 2 ** 31 - 1));
        return () => window.clearTimeout(id);
    }, [theme, refresh]);

    // The retailer's colour set for this theme (remembered across app restarts)
    const variantIndex = useMemo(() => {
        if (!theme) return 0;
        const i = picked[theme.id] ?? parseInt(localStorage.getItem(variantKey(theme.id)) || '0', 10);
        return i >= 0 && i < theme.variants.length ? i : 0;
    }, [theme, picked]);

    useEffect(() => {
        const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (!mq) return;
        const onChange = () => setReducedMotion(mq.matches);
        mq.addEventListener?.('change', onChange);
        return () => mq.removeEventListener?.('change', onChange);
    }, []);

    const nextVariant = useCallback(() => {
        if (!theme) return;
        const n = (variantIndex + 1) % theme.variants.length;
        localStorage.setItem(variantKey(theme.id), String(n));
        setPicked(p => ({ ...p, [theme.id]: n }));
        setSwitchCount(c => c + 1);
    }, [theme, variantIndex]);

    const value = useMemo<FestivalThemeValue>(() => ({
        theme,
        variant: theme ? theme.variants[variantIndex] ?? theme.variants[0] : null,
        variantIndex,
        nextVariant,
        switchCount,
        effectsOn: !!theme?.effectsEnabled && !reducedMotion,
    }), [theme, variantIndex, nextVariant, switchCount, reducedMotion]);

    return <FestivalThemeContext.Provider value={value}>{children}</FestivalThemeContext.Provider>;
};

export const useFestivalTheme = () => useContext(FestivalThemeContext);
