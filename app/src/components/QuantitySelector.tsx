import React, { useState } from 'react';
import type { Product } from '../context/StoreContext';
import { Plus, Minus } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

interface QuantitySelectorProps {
    product: Product;
    initialPcs?: number;
    initialBoxes?: number;
    onUpdate: (pcs: number, boxes: number) => void;
    compact?: boolean;
}

const QuantitySelector: React.FC<QuantitySelectorProps> = ({
    product,
    initialPcs = 0,
    initialBoxes = 0,
    onUpdate,
    compact = false
}) => {
    const [pcs, setPcs] = useState(initialPcs);
    const [boxes, setBoxes] = useState(initialBoxes);

    const conversion = parseFloat(product.MULT_F || '1') || 1;
    const unit1 = product.UNIT_1 || 'PCS';
    const unit2 = product.UNIT_2 || 'BOX';
    const rate = parseFloat(product.RATE1 || '0') || 0;

    // Calculate potential savings (dummy logic based on image, real logic might require MRP)
    // Assuming MRP is higher than Rate.
    const mrp = parseFloat(product.MRP1 || '0') || rate;
    const savings = ((mrp - rate) * (pcs + (boxes * conversion))).toFixed(2);
    const netPrice = (rate * (pcs + (boxes * conversion))).toFixed(2);

    const handleUpdate = (newPcs: number, newBoxes: number) => {
        setPcs(newPcs);
        setBoxes(newBoxes);
        onUpdate(newPcs, newBoxes);
    };

    const incrementBox = () => handleUpdate(pcs, boxes + 1);
    const decrementBox = () => handleUpdate(pcs, Math.max(0, boxes - 1));
    const incrementPcs = () => handleUpdate(pcs + 1, boxes);
    const decrementPcs = () => handleUpdate(Math.max(0, pcs - 1), boxes);

    const totalAdded = pcs + (boxes * conversion);

    return (
        <div className={clsx("w-full space-y-3", compact ? "scale-90 origin-left" : "")}>
            <div className="flex gap-2">
                {/* Box/Case Control */}
                <div className="flex-1 bg-white border border-gray-200 rounded-lg p-2 flex flex-col items-center shadow-sm">
                    <span className="text-xs text-gray-500 mb-1">{unit2} (Case)</span>
                    <AnimatePresence mode='wait'>
                        <motion.div
                            key={boxes}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-lg font-bold text-gray-800"
                        >
                            {boxes}
                        </motion.div>
                    </AnimatePresence>
                    <div className="flex items-center gap-2 mt-2 w-full justify-between">
                        <button onClick={decrementBox} className="p-1 bg-gray-100 rounded-md active:bg-gray-200">
                            <Minus size={16} />
                        </button>
                        <span className="text-xs text-gray-400">{conversion} {unit1}</span>
                        <button onClick={incrementBox} className="p-1 bg-brand-500 text-white rounded-md active:bg-brand-600 bg-indigo-600">
                            <Plus size={16} />
                        </button>
                    </div>
                </div>

                {/* Pieces/Units Control */}
                <div className="flex-1 bg-white border border-gray-200 rounded-lg p-2 flex flex-col items-center shadow-sm">
                    <span className="text-xs text-gray-500 mb-1">{unit1} (Units)</span>

                    <AnimatePresence mode='wait'>
                        <motion.div
                            key={pcs}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-lg font-bold text-gray-800"
                        >
                            {pcs}
                        </motion.div>
                    </AnimatePresence>

                    <div className="flex items-center gap-2 mt-2 w-full justify-between">
                        <button onClick={decrementPcs} className="p-1 bg-gray-100 rounded-md active:bg-gray-200">
                            <Minus size={16} />
                        </button>
                        <span className="text-xs text-gray-400">1 {unit1}</span>
                        <button onClick={incrementPcs} className="p-1 bg-indigo-600 text-white rounded-md active:bg-indigo-700">
                            <Plus size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer Info */}
            {(totalAdded > 0 || !compact) && (
                <div className="flex justify-between items-center text-sm px-1">
                    <div className="text-green-600 font-medium text-xs">
                        Savings: ₹{savings}
                    </div>
                    <div className="text-gray-900 font-bold">
                        Net price: ₹{netPrice}
                    </div>
                </div>
            )}
        </div>
    );
};

export default QuantitySelector;
