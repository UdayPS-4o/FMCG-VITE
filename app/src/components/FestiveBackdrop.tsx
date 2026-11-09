import { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFestivalTheme } from '../context/FestivalThemeContext';
import { useStore } from '../context/StoreContext';
import { createPortal } from 'react-dom';
import { FestiveBurst, FestiveLights, FESTIVE_FX_Z } from './FestiveEffects';
import { WELCOME_FLAG } from './WelcomeSplash';

/**
 * Festival theme pieces (see context/FestivalThemeContext). The backdrop is
 * rendered once by Layout, so it covers every page.
 * Both render nothing when no festival is live, so the normal page returns as
 * soon as the theme ends.
 *
 *   <FestiveBackdrop />     festive colours in place of the white page
 *                           background, with lights / rockets / chakri
 *   <FestiveThemeButton />  small round button for the header that switches
 *                           between the admin's colour sets
 */

// Page headers the lights hang from: the offer banner, sticky / fixed page headers,
// or anything marked data-festive-anchor (the home header)
const ANCHOR_SELECTOR = '[data-festive-anchor], .sticky.top-0, header.fixed.top-0';

/** Bottom edge (px) of the header stack at the top of the screen; 0 when there is none. */
const headerBottom = () => {
    let bottom = 0;
    document.querySelectorAll<HTMLElement>(ANCHOR_SELECTOR).forEach(el => {
        const r = el.getBoundingClientRect();
        // Only headers pinned to the top of the screen, not ones scrolled past or further down
        if (r.height > 0 && r.top <= bottom + 2 && r.top > -2) bottom = Math.max(bottom, r.bottom);
    });
    return Math.round(bottom);
};

/** Keeps the lights just under the page header, whichever page is open. */
const useHeaderBottom = (enabled: boolean) => {
    const [top, setTop] = useState(0);
    useEffect(() => {
        if (!enabled) return;
        const update = () => setTop(headerBottom());
        update();
        // Headers change with the page and the offer banner can appear later
        const id = window.setInterval(update, 400);
        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        return () => {
            window.clearInterval(id);
            window.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
        };
    }, [enabled]);
    return top;
};

const LIGHTS_SHOW_MS = 3500; // lights + toran hang over the brand row, so they only stay briefly

/** Lights + marigold toran that fade away after LIGHTS_SHOW_MS (the canvas stops once gone). */
const LIGHTS_FADE_MS = 800;

const TimedLights = ({ top }: { top: number }) => {
    const [phase, setPhase] = useState<'on' | 'fading' | 'off'>('on');
    useEffect(() => {
        const fade = window.setTimeout(() => setPhase('fading'), LIGHTS_SHOW_MS);
        const off = window.setTimeout(() => setPhase('off'), LIGHTS_SHOW_MS + LIGHTS_FADE_MS);
        return () => { window.clearTimeout(fade); window.clearTimeout(off); };
    }, []);
    if (phase === 'off') return null; // unmounts the canvas, so its animation loop stops
    return (
        <div
            aria-hidden="true"
            style={{
                position: 'fixed', left: 0, right: 0, top, height: 230, zIndex: FESTIVE_FX_Z, pointerEvents: 'none',
                opacity: phase === 'on' ? 0.95 : 0, transition: `opacity ${LIGHTS_FADE_MS}ms ease, top 0.25s`,
            }}
        >
            <FestiveLights />
        </div>
    );
};

const STARTUP_DELAY_MS = 600;          // let the first page paint first
const STARTUP_AFTER_SPLASH_MS = 2900;  // right after login: after the welcome splash

export const FestiveBackdrop = () => {
    const { theme, variant, switchCount, effectsOn } = useFestivalTheme();
    const [startup, setStartup] = useState(0);
    const lightsTop = useHeaderBottom(!!(theme && variant && effectsOn && variant.effect === 'lights'));
    // Waits for the post-login welcome splash, so the show isn't hidden behind it
    const [startDelay] = useState(() => (sessionStorage.getItem(WELCOME_FLAG) === '1' ? STARTUP_AFTER_SPLASH_MS : STARTUP_DELAY_MS));

    // Every time the app opens: play the chakri once the festival theme has loaded
    const themeId = theme?.id;
    useEffect(() => {
        if (themeId == null || startup > 0) return;
        const t = window.setTimeout(() => setStartup(1), startDelay);
        return () => window.clearTimeout(t);
    }, [themeId, startup, startDelay]);

    if (!theme || !variant) return null;

    // Startup plays the chakri; the theme button plays the chosen colour set's own effect
    const playKey = startup + switchCount;
    const ownBurst = variant.effect === 'rockets' || variant.effect === 'chakri' ? variant.effect : null;
    const burst = !effectsOn || playKey === 0 ? null : switchCount > 0 ? ownBurst : 'chakri';

    return (
        <>
            {/* Fixed behind all home content (the page itself is transparent) */}
            <div
                aria-hidden="true"
                style={{
                    position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none',
                    background: `linear-gradient(180deg, ${variant.bgFrom} 0%, ${variant.bgTo} 100%)`,
                    transition: 'background 0.8s',
                }}
            />
            {/* Lights / rockets / chakri go on a top-level layer in FRONT of the page
                (cards, header, bottom nav); touches pass straight through. Portalled
                to <body> because the home page is its own stacking context. */}
            {createPortal(
                <>
                    {effectsOn && variant.effect === 'lights' && playKey > 0 && (
                        // key: a fresh timer every time the lights are replayed
                        <TimedLights key={playKey} top={lightsTop} />
                    )}
                    {burst && <FestiveBurst effect={burst} playKey={playKey} />}
                </>,
                document.body
            )}
        </>
    );
};

export const FestiveThemeButton = () => {
    const { theme, variant, variantIndex, nextVariant } = useFestivalTheme();
    const { language } = useStore();
    const [toast, setToast] = useState('');

    useEffect(() => {
        if (!toast) return;
        const id = window.setTimeout(() => setToast(''), 1300);
        return () => window.clearTimeout(id);
    }, [toast]);

    if (!theme || !variant || !theme.allowSwitch || theme.variants.length < 2) return null;

    const onSwitch = () => {
        const nextIndex = (variantIndex + 1) % theme.variants.length;
        nextVariant();
        setToast(theme.variants[nextIndex].label);
    };

    return (
        <div style={{ position: 'relative', flexShrink: 0 }}>
            <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={onSwitch}
                aria-label={language === 'en' ? 'Switch festival theme' : 'त्योहार थीम बदलें'}
                style={{
                    width: 38, height: 38, borderRadius: 10, cursor: 'pointer', position: 'relative',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(255,255,255,0.14)', border: `1.5px solid ${variant.accent}`, color: variant.accent,
                    boxShadow: `0 0 12px ${variant.accent}55`,
                }}
            >
                <Palette size={18} />
                {/* which colour set is on */}
                <span style={{ position: 'absolute', bottom: 3, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 2 }}>
                    {theme.variants.map((_, i) => (
                        <span key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: variant.accent, opacity: i === variantIndex ? 1 : 0.35 }} />
                    ))}
                </span>
            </motion.button>
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ position: 'absolute', top: 44, right: 0, background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 14, whiteSpace: 'nowrap', zIndex: 5 }}
                    >
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
