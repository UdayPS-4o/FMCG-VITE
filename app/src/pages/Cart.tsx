import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { ShoppingBag, ArrowRight, Trash2, Plus, Minus } from 'lucide-react';
import { placeOrder } from '../lib/api';
import { useNavigate } from 'react-router-dom';

const Cart = () => {
    const { cart, cartTotal, user, clearCart, removeFromCart, addToCart } = useStore();
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleCheckout = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const orderData = {
                items: cart.map(item => ({
                    productCode: item.product.CODE,
                    productName: item.product.PRODUCT,
                    qtyPcs: item.qtyPcs,
                    qtyBoxes: item.qtyBoxes,
                    rate: item.product.RATE1,
                    netAmount: item.netAmount,
                    image_url: item.product.image_url
                })),
                totalAmount: cartTotal
            };

            await placeOrder(orderData);
            clearCart();
            navigate('/orders');
        } catch (error) {
            console.error(error);
            alert('Failed to place order');
        } finally {
            setLoading(false);
        }
    };

    if (cart.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
                <div className="bg-white p-6 rounded-full shadow-sm mb-4">
                    <ShoppingBag size={48} className="text-gray-300" />
                </div>
                <h2 className="text-xl font-bold text-gray-800 mb-2">Your cart is empty</h2>
                <p className="text-gray-500 mb-8 max-w-xs">Looks like you haven't added any items to your cart yet.</p>
                <button
                    onClick={() => navigate('/')}
                    className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-medium shadow-lg hover:bg-indigo-700 transition-colors"
                >
                    Start Shopping
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-32">
            <div className="bg-white p-4 border-b border-gray-100 sticky top-0 z-40 flex justify-between items-center shadow-sm">
                <h1 className="text-xl font-bold text-gray-900">My Cart ({cart.length})</h1>
                <button 
                    onClick={() => {
                        if (window.confirm('Are you sure you want to clear your cart?')) clearCart();
                    }} 
                    className="text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                    Clear Cart
                </button>
            </div>

            <div className="p-3 space-y-3">
                {cart.map(item => {
                    const conversion = parseFloat(item.product.MULT_F || '1') || 1;
                    const hasMultipleUnits = conversion > 1;
                    
                    return (
                        <div key={item.product.CODE} className="flex gap-3 bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
                            {/* Product Image */}
                            <div className="w-20 h-20 bg-gray-50 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-50">
                                {item.product.image_url ? (
                                    <img src={item.product.image_url} alt={item.product.PRODUCT} className="w-full h-full object-contain p-1" />
                                ) : (
                                    <svg className="w-8 h-8 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                )}
                            </div>

                            {/* Product Details & Controls */}
                            <div className="flex-1 flex flex-col justify-between">
                                {/* Title and Delete */}
                                <div className="flex justify-between items-start gap-2">
                                    <h3 className="font-medium text-gray-800 text-sm leading-tight line-clamp-2">
                                        {item.product.PRODUCT}
                                    </h3>
                                    <button 
                                        onClick={() => removeFromCart(item.product.CODE)}
                                        className="text-gray-400 hover:text-red-500 transition-colors p-1 -mt-1 -mr-1"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                {/* Rate */}
                                <div className="text-[11px] text-gray-500 mt-0.5">
                                    Rate: ₹{parseFloat(item.product.RATE1 || '0').toFixed(2)}
                                </div>

                                {/* Quantity Controls & Net Amount */}
                                <div className="flex items-end justify-between mt-2">
                                    <div className="flex flex-col gap-1.5">
                                        {hasMultipleUnits && (
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-gray-500 w-7">{item.product.UNIT_2 || 'BOX'}</span>
                                                <div className="flex items-center bg-gray-50 rounded border border-gray-200">
                                                    <button onClick={() => addToCart(item.product, item.qtyPcs, Math.max(0, item.qtyBoxes - 1))} className="w-6 h-6 flex items-center justify-center text-gray-600 active:bg-gray-200 rounded-l"><Minus size={12}/></button>
                                                    <span className="w-6 text-center text-[11px] font-semibold text-gray-800">{item.qtyBoxes}</span>
                                                    <button onClick={() => addToCart(item.product, item.qtyPcs, item.qtyBoxes + 1)} className="w-6 h-6 flex items-center justify-center text-gray-600 active:bg-gray-200 rounded-r"><Plus size={12}/></button>
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-gray-500 w-7">{item.product.UNIT_1 || 'PCS'}</span>
                                            <div className="flex items-center bg-gray-50 rounded border border-gray-200">
                                                <button onClick={() => addToCart(item.product, Math.max(0, item.qtyPcs - 1), item.qtyBoxes)} className="w-6 h-6 flex items-center justify-center text-gray-600 active:bg-gray-200 rounded-l"><Minus size={12}/></button>
                                                <span className="w-6 text-center text-[11px] font-semibold text-gray-800">{item.qtyPcs}</span>
                                                <button onClick={() => addToCart(item.product, item.qtyPcs + 1, item.qtyBoxes)} className="w-6 h-6 flex items-center justify-center text-gray-600 active:bg-gray-200 rounded-r"><Plus size={12}/></button>
                                            </div>
                                        </div>
                                    </div>
                                    <span className="font-bold text-indigo-600 text-sm">₹{item.netAmount.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Checkout Footer */}
            <div className="fixed bottom-[64px] left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40">
                <div className="flex justify-between items-center mb-4">
                    <span className="text-gray-500 font-medium text-sm">Total Amount</span>
                    <span className="text-xl font-bold text-indigo-600">₹{cartTotal.toFixed(2)}</span>
                </div>

                <button
                    onClick={handleCheckout}
                    disabled={loading}
                    className="w-full bg-black text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-70 shadow-md"
                >
                    {loading ? 'Processing...' : 'Place Order'}
                    {!loading && <ArrowRight size={18} />}
                </button>
            </div>
        </div>
    );
};

export default Cart;

