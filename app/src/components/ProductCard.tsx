import React, { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import type { Product } from '../context/StoreContext';
import { Plus, Minus, ShoppingCart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AdminImageModal } from './AdminImageModal';
import { getImageUrl } from '../lib/api';

interface ProductCardProps {
    product: Product;
    isExpanded: boolean;
    onExpand: () => void;
    onCollapse: () => void;
    style?: React.CSSProperties;
}

const ProductCard: React.FC<ProductCardProps> = ({ product: initialProduct, isExpanded, onExpand, onCollapse, style }) => {
    const { addToCart, cart, language, user } = useStore();
    const isAdmin = user?.partyCode === 'ADMIN' || user?.partyCode === '8081121020';
    
    const [product, setProduct] = useState(initialProduct);
    const [showAdminImageModal, setShowAdminImageModal] = useState(false);

    const cartItem = cart.find(item => item.product.CODE === product.CODE);
    const [pcs, setPcs] = useState(cartItem ? cartItem.qtyPcs : 0);
    const [boxes, setBoxes] = useState(cartItem ? cartItem.qtyBoxes : 0);

    const conversion = parseFloat(product.MULT_F || '1') || 1;
    const hasMultipleUnits = conversion > 1;
    const unit1 = product.UNIT_1 || 'PCS';
    const unit2 = product.UNIT_2 || 'BOX';
    const rate = parseFloat(product.RATE1 || '0') || 0;
    const mrp = parseFloat(product.MRP1 || '0') || rate;
    
    let schemeDiscount = 0;
    const totalQty = pcs + (boxes * conversion);
    if (product.schemes && product.schemes.length > 0) {
        const applicableSchemes = product.schemes.filter(sch => totalQty >= sch.slab1);
        if (applicableSchemes.length > 0) {
            schemeDiscount = applicableSchemes.reduce((sum, sch) => sum + sch.discount, 0);
        }
    }
    
    const grossAmount = totalQty * rate;
    const schemeSavingsAmount = grossAmount * schemeDiscount / 100;
    const netAmount = grossAmount - schemeSavingsAmount;
    const effectiveRate = rate * (1 - schemeDiscount / 100);

    useEffect(() => {
        if (cartItem) {
            setPcs(cartItem.qtyPcs);
            setBoxes(cartItem.qtyBoxes);
        } else {
            setPcs(0);
            setBoxes(0);
        }
    }, [cartItem]);

    const isInCart = cartItem && (cartItem.qtyPcs > 0 || cartItem.qtyBoxes > 0);

    const handleAddToCart = () => {
        if (!hasMultipleUnits) {
            addToCart(product, 1, 0);
        } else {
            onExpand();
        }
    };

    const handleUpdate = (newPcs: number, newBoxes: number) => {
        setPcs(newPcs);
        setBoxes(newBoxes);
        addToCart(product, newPcs, newBoxes);
        if (newPcs === 0 && newBoxes === 0) {
            onCollapse();
        }
    };

    const incrementBox = () => handleUpdate(pcs, boxes + 1);
    const decrementBox = () => handleUpdate(pcs, Math.max(0, boxes - 1));
    const incrementPcs = () => handleUpdate(pcs + 1, boxes);
    const decrementPcs = () => handleUpdate(Math.max(0, pcs - 1), boxes);
    const quickIncrement = () => handleUpdate(pcs + 1, 0);
    const quickDecrement = () => handleUpdate(Math.max(0, pcs - 1), 0);

    return (
        <motion.div
            layout
            className={`bg-white rounded-2xl overflow-hidden ${isExpanded && hasMultipleUnits ? 'col-span-2' : ''
                }`}
            style={{
                boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                ...style
            }}
        >
            <motion.div layout className={`p-3 flex ${isExpanded && hasMultipleUnits ? 'flex-row gap-3' : 'flex-col'} h-full`}>
                {/* Left side (or top) */}
                <motion.div layout className={isExpanded && hasMultipleUnits ? 'flex-1 min-w-0 flex flex-col' : ''}>
                    {/* Product Image */}
                    <motion.div layout className="relative mb-3">
                        <motion.div layout className="aspect-square bg-gray-50 rounded-xl flex items-center justify-center overflow-hidden relative">
                            {product.image_url ? (
                                <img src={getImageUrl(product.image_url)} alt={product.PRODUCT} className="w-full h-full object-contain p-2" />
                            ) : isAdmin ? (
                                <button onClick={() => setShowAdminImageModal(true)} className="w-12 h-12 bg-white shadow-sm rounded-full flex items-center justify-center text-gray-400 hover:text-emerald-500 hover:bg-emerald-50 transition-colors border border-gray-100">
                                    <Plus size={24} />
                                </button>
                            ) : (
                                <svg className="w-12 h-12 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            )}
                        </motion.div>
                        {/* Code Badge */}
                        <div className="absolute top-2 right-2 bg-white/80 backdrop-blur text-gray-400 text-[9px] font-mono px-1.5 py-0.5 rounded">
                            {product.CODE}
                        </div>
                    </motion.div>

                    {/* Product Info */}
                    <motion.h3 layout className="font-medium text-gray-800 text-[13px] leading-tight line-clamp-2 mb-1 min-h-[32px]">
                        {product.PRODUCT}
                    </motion.h3>
                
                {product.schemes && product.schemes.length > 0 && (
                    <div className="flex gap-1 flex-wrap mb-2">
                        {product.schemes.map((sch, i) => {
                            const isActive = totalQty >= sch.slab1;
                            return (
                                <button
                                    key={i}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const newBoxes = Math.floor(sch.slab1 / conversion);
                                        const newPcs = sch.slab1 % conversion;
                                        handleUpdate(newPcs, newBoxes);
                                    }}
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                                        isActive 
                                        ? 'bg-orange-500 text-white border-orange-600 shadow-sm' 
                                        : 'bg-orange-50 text-orange-600 border-orange-100 hover:bg-orange-100'
                                    }`}
                                >
                                    {sch.discount}% {language === 'en' ? 'OFF' : 'छूट'} ({sch.slab1}+ {language === 'en' ? 'pcs' : 'पीस'})
                                </button>
                            );
                        })}
                    </div>
                )}

                    {/* Price Row */}
                    <motion.div layout className={`flex items-baseline gap-1.5 ${isExpanded && hasMultipleUnits ? 'mb-0' : 'mb-3'}`}>
                        <span className="text-sm font-bold text-gray-900">{language === 'en' ? 'Rate:' : 'दर:'} ₹{effectiveRate.toFixed(2)}</span>
                        {mrp > effectiveRate && (
                            <span className="text-xs text-gray-500">{language === 'en' ? 'MRP:' : 'एमआरपी:'} ₹{mrp.toFixed(2)}</span>
                        )}
                    </motion.div>
                </motion.div>

                {/* Right side (or bottom) */}
                <motion.div layout className={isExpanded && hasMultipleUnits ? 'flex-1 min-w-0 flex flex-col justify-end' : ''}>
                    {/* Action Area */}
                    <AnimatePresence mode="wait">
                    {!isExpanded && !isInCart ? (
                        /* Add Button - Small cart icon */
                        <motion.button
                            key="add-btn"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={handleAddToCart}
                            className="w-full h-9 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-xl font-medium text-sm flex items-center justify-center gap-1.5 transition-colors"
                        >
                            <ShoppingCart size={14} />
                            <span>{language === 'en' ? 'Add' : 'जोड़ें'}</span>
                        </motion.button>
                    ) : !isExpanded && isInCart && !hasMultipleUnits ? (
                        /* Inline Quantity Control */
                        <motion.div
                            key="simple-qty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center justify-between h-9 bg-emerald-50 rounded-xl px-1"
                        >
                            <button
                                onClick={quickDecrement}
                                className="w-8 h-7 flex items-center justify-center bg-white rounded-lg text-gray-600 active:bg-gray-100 transition-colors"
                            >
                                <Minus size={14} />
                            </button>
                            <span className="text-sm font-semibold text-gray-800">{pcs}</span>
                            <button
                                onClick={quickIncrement}
                                className="w-8 h-7 flex items-center justify-center bg-emerald-500 rounded-lg text-white active:bg-emerald-600 transition-colors"
                            >
                                <Plus size={14} />
                            </button>
                        </motion.div>
                    ) : isInCart && !isExpanded && hasMultipleUnits ? (
                        /* Compact view when in cart */
                        <motion.div
                            key="compact-cart"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={onExpand}
                            className="flex items-center justify-between h-9 bg-emerald-50 rounded-xl px-3 cursor-pointer"
                        >
                            <span className="text-xs font-medium text-emerald-700">
                                {boxes > 0 && `${boxes} ${unit2}`}
                                {boxes > 0 && pcs > 0 && ' + '}
                                {pcs > 0 && `${pcs} ${unit1}`}
                            </span>
                            <span className="text-xs font-semibold text-gray-700">{language === 'en' ? 'Edit' : 'बदलें'}</span>
                        </motion.div>
                    ) : isExpanded && hasMultipleUnits ? (
                        /* Expanded Selector - Box and PCS side by side */
                        <motion.div
                            key="expanded"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-3"
                        >
                            {/* Side by Side Controls (now stacked vertically to fit half width) */}
                            <div className="flex flex-col gap-2">
                                {/* Box/Case Control */}
                                <div className="bg-gray-50 rounded-xl p-2.5 flex flex-col items-center">
                                    <span className="text-[10px] text-gray-500 mb-1">{unit2} ({language === 'en' ? 'Case' : 'केस'})</span>
                                    <input 
                                        type="number"
                                        inputMode="numeric"
                                        min="0"
                                        value={boxes === 0 ? '' : boxes}
                                        placeholder="0"
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value, 10);
                                            handleUpdate(pcs, isNaN(val) ? 0 : Math.max(0, val));
                                        }}
                                        className="text-lg font-bold text-gray-800 bg-white border border-gray-200 rounded text-center w-20 py-0.5 mb-2 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <div className="flex items-center justify-between w-full">
                                        <button
                                            onClick={decrementBox}
                                            className="w-8 h-8 flex items-center justify-center bg-white rounded-lg border border-gray-200 text-gray-500 active:bg-gray-100"
                                        >
                                            <Minus size={14} />
                                        </button>
                                        <span className="text-[10px] text-gray-400">{conversion} {unit1}</span>
                                        <button
                                            onClick={incrementBox}
                                            className="w-8 h-8 flex items-center justify-center bg-emerald-500 rounded-lg text-white active:bg-emerald-600"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* PCS/Units Control */}
                                <div className="bg-gray-50 rounded-xl p-2.5 flex flex-col items-center">
                                    <span className="text-[10px] text-gray-500 mb-1">{unit1} ({language === 'en' ? 'Units' : 'इकाइयां'})</span>
                                    <input 
                                        type="number"
                                        inputMode="numeric"
                                        min="0"
                                        value={pcs === 0 ? '' : pcs}
                                        placeholder="0"
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value, 10);
                                            handleUpdate(isNaN(val) ? 0 : Math.max(0, val), boxes);
                                        }}
                                        className="text-lg font-bold text-gray-800 bg-white border border-gray-200 rounded text-center w-20 py-0.5 mb-2 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <div className="flex items-center justify-between w-full">
                                        <button
                                            onClick={decrementPcs}
                                            className="w-8 h-8 flex items-center justify-center bg-white rounded-lg border border-gray-200 text-gray-500 active:bg-gray-100"
                                        >
                                            <Minus size={14} />
                                        </button>
                                        <span className="text-[10px] text-gray-400">1 {unit1}</span>
                                        <button
                                            onClick={incrementPcs}
                                            className="w-8 h-8 flex items-center justify-center bg-emerald-500 rounded-lg text-white active:bg-emerald-600"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Savings & Net Price Footer */}
                            <div className="flex justify-end items-center text-xs px-1">
                                <span className="text-gray-900 font-bold">
                                    {language === 'en' ? 'Net:' : 'कुल:'} ₹{netAmount.toFixed(2)}
                                </span>
                            </div>

                            {/* Done */}
                            <button
                                onClick={onCollapse}
                                className="w-full h-9 bg-gray-900 text-white rounded-xl font-medium text-sm active:bg-gray-800 transition-colors"
                            >
                                {language === 'en' ? 'Done' : 'हो गया'}
                            </button>
                        </motion.div>
                    ) : null}
                    </AnimatePresence>
                </motion.div>
            </motion.div>
            
            <AdminImageModal 
                isOpen={showAdminImageModal}
                onClose={() => setShowAdminImageModal(false)}
                product={product}
                onImageUpdated={(url) => setProduct({...product, image_url: url})}
            />
        </motion.div>
    );
};

export default ProductCard;
