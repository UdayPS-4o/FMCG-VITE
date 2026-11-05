import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const HINT_INTERVAL_MS = 1800;

/**
 * Search placeholder that cycles "Shop for <brand>..." through the brand list
 * (Home header search bar and the Search page). Brand names come from
 * useBrandHints() in lib/brandHints.ts.
 */
const RotatingSearchHint = ({ names, en, color = '#6b7280' }: { names: string[]; en: boolean; color?: string }) => {
    const [idx, setIdx] = useState(0);

    useEffect(() => {
        if (names.length < 2) return;
        const t = window.setInterval(() => setIdx(i => (i + 1) % names.length), HINT_INTERVAL_MS);
        return () => window.clearInterval(t);
    }, [names.length]);

    if (names.length === 0) return <span>{en ? 'Search products...' : 'उत्पाद खोजें...'}</span>;
    const name = names[idx % names.length];

    return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <span style={{ flexShrink: 0 }}>{en ? 'Shop for' : 'खरीदें'}</span>
            <span style={{ position: 'relative', height: 18, flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <AnimatePresence initial={false}>
                    <motion.span
                        key={name}
                        initial={{ y: 18, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -18, opacity: 0 }}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                        style={{ position: 'absolute', left: 0, right: 0, lineHeight: '18px', fontWeight: 600, color, overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                        {name}...
                    </motion.span>
                </AnimatePresence>
            </span>
        </span>
    );
};

export default RotatingSearchHint;
