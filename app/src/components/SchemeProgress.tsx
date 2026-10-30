import { motion } from 'framer-motion';
import type { Product } from '../context/StoreContext';
import { nextSchemeFor } from '../lib/cartFx';

/** "Add 3 more pcs for 5% OFF" + progress bar, shown once the product is in the cart. */
const SchemeProgress = ({ product, totalQty, language, accent = '#f97316' }: {
    product: Product;
    totalQty: number;
    language: 'en' | 'hi';
    accent?: string;
}) => {
    const next = nextSchemeFor(product, totalQty);
    if (!next || totalQty <= 0) return null;
    const need = next.slab1 - totalQty;
    const pct = Math.min(100, (totalQty / next.slab1) * 100);

    return (
        <div className="rounded-lg px-2 py-1.5 mb-2" style={{ background: `${accent}14` }}>
            <div className="text-[10px] font-semibold leading-tight" style={{ color: accent }}>
                {language === 'en'
                    ? <>Add <b>{need}</b> more pcs for <b>{next.discount}% OFF</b></>
                    : <><b>{need}</b> पीस और जोड़ें, <b>{next.discount}% छूट</b> पाएं</>}
            </div>
            <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: `${accent}26` }}>
                <motion.div
                    className="h-full rounded-full"
                    style={{ background: accent }}
                    initial={false}
                    animate={{ width: `${pct}%` }}
                    transition={{ type: 'spring', damping: 20, stiffness: 160 }}
                />
            </div>
        </div>
    );
};

export default SchemeProgress;
