import { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFestivalTheme } from '../context/FestivalThemeContext';
import { useStore } from '../context/StoreContext';
import { FestiveBurst, FestiveLights } from './FestiveEffects';

/**
 * Festival theme pieces for the home page (see context/FestivalThemeContext).
 * Both render nothing when no festival is live, so the normal page returns as
 * soon as the theme ends.
 *
 *   <FestiveBackdrop />     festive colours in place of the white page
 *                           background, with lights / rockets / chakri
 *   <FestiveThemeButton />  small round button for the header that switches
 *                           between the admin's colour sets
 */

export const FestiveBackdrop = () => {
    const { theme, variant, variantIndex, switchCount, effectsOn } = useFestivalTheme();
    const [autoPlay, setAutoPlay] = useState(0);

    // Play rockets / chakri once per app session when the home page opens
    useEffect(() => {
        if (!theme) return;
        const key = `festive_played_${theme.id}_${variantIndex}`;
        if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, '1');
            // Syncing from sessionStorage (external); runs once per theme + colour set
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setAutoPlay(n => n + 1);
        }
    }, [theme?.id, variantIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!theme || !variant) return null;

    const playKey = autoPlay + switchCount; // switching always replays
    const burst = effectsOn && playKey > 0 && (variant.effect === 'rockets' || variant.effect === 'chakri') ? variant.effect : null;

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
            >
                {effectsOn && variant.effect === 'lights' && (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(58px + env(safe-area-inset-top))', height: 230, opacity: 0.95 }}>
                        <FestiveLights />
                    </div>
                )}
            </div>
            {burst && <FestiveBurst effect={burst} playKey={playKey} />}
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
        sessionStorage.setItem(`festive_played_${theme.id}_${nextIndex}`, '1'); // the switch itself replays it
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
