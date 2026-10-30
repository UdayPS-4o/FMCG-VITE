import { useEffect, useRef, useState } from 'react';
import { animate } from 'framer-motion';

/** ₹ amount that counts up/down to its new value instead of jumping. */
const AnimatedAmount = ({ value, className }: { value: number; className?: string }) => {
    const [shown, setShown] = useState(value);
    const from = useRef(value);

    useEffect(() => {
        const controls = animate(from.current, value, {
            duration: 0.5,
            ease: 'easeOut',
            onUpdate: v => { from.current = v; setShown(v); },
        });
        return () => controls.stop();
    }, [value]);

    return <span className={className}>₹{shown.toFixed(2)}</span>;
};

export default AnimatedAmount;
