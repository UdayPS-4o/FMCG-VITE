import { motion } from 'framer-motion';

const HOP = { duration: 1.6, repeat: Infinity, ease: 'easeInOut' as const };

/** Smiling cardboard box that hops and flaps its lids (empty cart). */
const EmptyCartBox = () => (
    <svg viewBox="0 0 170 150" className="w-44 h-40" aria-hidden="true">
        <motion.ellipse
            cx="85" cy="140" rx="48" ry="7" fill="#e5e7eb"
            style={{ originX: '85px', originY: '140px' }}
            animate={{ scaleX: [1, 0.7, 1, 1], opacity: [1, 0.45, 1, 1] }}
            transition={{ ...HOP, times: [0, 0.4, 0.55, 1] }}
        />
        <motion.g
            style={{ originX: '85px', originY: '132px' }}
            animate={{ y: [0, -14, 0, 0], rotate: [0, -3, 0, 0], scaleY: [1, 1, 0.93, 1] }}
            transition={{ ...HOP, times: [0, 0.4, 0.55, 0.65] }}
        >
            <rect x="40" y="62" width="90" height="70" rx="4" fill="#c08a4a" stroke="#8b5e2b" strokeWidth="2" />
            <motion.path
                d="M40 62 L18 44 L64 44 L85 62Z" fill="#d9a066" stroke="#8b5e2b" strokeWidth="2"
                style={{ originX: '40px', originY: '62px' }}
                animate={{ rotate: [0, -18, 0, 0] }} transition={{ ...HOP, times: [0, 0.4, 0.55, 1] }}
            />
            <motion.path
                d="M130 62 L152 44 L106 44 L85 62Z" fill="#d9a066" stroke="#8b5e2b" strokeWidth="2"
                style={{ originX: '130px', originY: '62px' }}
                animate={{ rotate: [0, 18, 0, 0] }} transition={{ ...HOP, times: [0, 0.4, 0.55, 1] }}
            />
            <circle cx="70" cy="95" r="4" fill="#5b3b16" />
            <circle cx="100" cy="95" r="4" fill="#5b3b16" />
            <path d="M76 106 Q85 116 94 106" stroke="#5b3b16" strokeWidth="3" fill="none" strokeLinecap="round" />
        </motion.g>
    </svg>
);

export default EmptyCartBox;
