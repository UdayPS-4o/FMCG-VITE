import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { ShoppingBag, ArrowRight, Trash2, Plus, Minus, X } from 'lucide-react';
import { placeOrder } from '../lib/api';
import { useNavigate } from 'react-router-dom';

const Cart = () => {
    const { cart, cartTotal, user, clearCart, removeFromCart, addToCart, language } = useStore();
    const [loading, setLoading] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentMode, setPaymentMode] = useState<'Cash' | 'Credit' | null>(null);
    const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
    const navigate = useNavigate();

    const handleCheckout = async (mode: string | null) => {
        if (!user) return;
        setLoading(true);
        try {
            let orderNotes = '';
            if (mode) {
                if (mode === 'Credit') {
                    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                    orderNotes = `Payment Mode: Credit (Due: ${dueDate})`;
                } else {
                    orderNotes = `Payment Mode: Cash`;
                }
            }

            const orderData = {
                items: cart.map(item => {
                    const pcsRate = parseFloat(item.product.RATE1 || '0');
                    let finalRate = pcsRate;
                    if (item.qtyBoxes > 0 && item.qtyPcs === 0) {
                        const multF = parseFloat(item.product.MULT_F || '1') || 1;
                        finalRate = pcsRate * multF;
                    }
                    return {
                        productCode: item.product.CODE,
                        productName: item.product.PRODUCT,
                        qtyPcs: item.qtyPcs,
                        qtyBoxes: item.qtyBoxes,
                        rate: finalRate,
                        mrp: item.product.MRP1,
                        sch: item.sch,
                        netAmount: item.netAmount,
                        image_url: item.product.image_url
                    };
                }),
                totalAmount: cartTotal,
                notes: orderNotes,
                paymentMode: mode
            };

            await placeOrder(orderData);
            clearCart();
            navigate('/orders');
        } catch (error) {
            console.error(error);
            alert(language === 'en' ? 'Failed to place order' : 'ऑर्डर करने में विफल');
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
                <h2 className="text-xl font-bold text-gray-800 mb-2">{language === 'en' ? 'Your cart is empty' : 'आपका कार्ट खाली है'}</h2>
                <p className="text-gray-500 mb-8 max-w-xs">{language === 'en' ? "Looks like you haven't added any items to your cart yet." : 'ऐसा लगता है कि आपने अभी तक अपने कार्ट में कोई आइटम नहीं जोड़ा है।'}</p>
                <button
                    onClick={() => navigate('/')}
                    className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-medium shadow-lg hover:bg-indigo-700 transition-colors"
                >
                    {language === 'en' ? 'Start Shopping' : 'खरीदारी शुरू करें'}
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-32">
            <div className="bg-white p-4 border-b border-gray-100 sticky top-0 z-40 flex justify-between items-center shadow-sm">
                <h1 className="text-xl font-bold text-gray-900">{language === 'en' ? 'My Cart' : 'मेरा कार्ट'} ({cart.length})</h1>
                <button 
                    onClick={() => {
                        const msg = language === 'en' ? 'Are you sure you want to clear your cart?' : 'क्या आप वाकई अपना कार्ट खाली करना चाहते हैं?';
                        if (window.confirm(msg)) clearCart();
                    }} 
                    className="text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                    {language === 'en' ? 'Clear Cart' : 'कार्ट खाली करें'}
                </button>
            </div>

            <div className="p-3 space-y-3">
                {cart.map(item => {
                    const conversion = parseFloat(item.product.MULT_F || '1') || 1;
                    const hasMultipleUnits = conversion > 1 || item.qtyBoxes > 0;
                    
                    return (
                        <div key={item.product.CODE} className="flex gap-3 bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
                            {/* Product Image */}
                            <div className="w-20 h-20 bg-gray-50 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-50">
                                {item.product.image_url ? (
                                    <img 
                                        src={item.product.image_url} 
                                        alt={item.product.PRODUCT} 
                                        className="w-full h-full object-contain p-1 cursor-pointer"
                                        onClick={() => setEnlargedImage(item.product.image_url || null)}
                                    />
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
                                    {language === 'en' ? 'Rate' : 'दर'}: ₹{parseFloat(item.product.RATE1 || '0').toFixed(2)}
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
                    <span className="text-gray-500 font-medium text-sm">{language === 'en' ? 'Total Amount' : 'कुल राशि'}</span>
                    <span className="text-xl font-bold text-indigo-600">₹{cartTotal.toFixed(2)}</span>
                </div>

                <button
                    onClick={() => setShowPaymentModal(true)}
                    disabled={loading}
                    className="w-full bg-black text-white py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-70 shadow-md"
                >
                    {loading ? (language === 'en' ? 'Processing...' : 'प्रोसेस हो रहा है...') : (language === 'en' ? 'Place Order' : 'ऑर्डर करें')}
                    {!loading && <ArrowRight size={18} />}
                </button>
            </div>

            {/* Payment Modal */}
            {showPaymentModal && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center animate-in fade-in duration-200">
                    <div className="bg-white w-full sm:w-[400px] rounded-t-3xl sm:rounded-3xl p-6 pb-8 shadow-xl animate-in slide-in-from-bottom-8">
                        <h3 className="text-xl font-bold text-gray-900 mb-1">{language === 'en' ? 'Select Payment Mode' : 'भुगतान का तरीका चुनें'}</h3>
                        <p className="text-sm text-gray-500 mb-6">{language === 'en' ? 'How would you like to pay for this order?' : 'आप इस ऑर्डर के लिए भुगतान कैसे करना चाहेंगे?'}</p>
                        
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <button 
                                onClick={() => setPaymentMode('Cash')}
                                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                                    paymentMode === 'Cash' 
                                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                                        : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${paymentMode === 'Cash' ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                                    <span className="text-2xl font-bold">₹</span>
                                </div>
                                <span className="font-bold">{language === 'en' ? 'Cash' : 'नकद (Cash)'}</span>
                            </button>
                            
                            <button 
                                onClick={() => setPaymentMode('Credit')}
                                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${
                                    paymentMode === 'Credit' 
                                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                                        : 'border-gray-100 bg-white text-gray-600 hover:border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${paymentMode === 'Credit' ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                                </div>
                                <span className="font-bold">{language === 'en' ? 'Credit' : 'उधार (Credit)'}</span>
                            </button>
                        </div>
                        
                        {paymentMode === 'Credit' && (
                            <div className="mb-6 p-4 bg-orange-50 border border-orange-100 rounded-xl flex items-start gap-3">
                                <svg className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <div>
                                    <p className="text-sm font-bold text-orange-900">{language === 'en' ? 'Payment Due Date' : 'भुगतान की देय तिथि'}</p>
                                    <p className="text-orange-700 text-sm mt-1 font-semibold">
                                        {new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                                    </p>
                                </div>
                            </div>
                        )}
                        
                        <div className="flex gap-3">
                            <button 
                                onClick={() => { setShowPaymentModal(false); setPaymentMode(null); }}
                                className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200"
                            >
                                {language === 'en' ? 'Cancel' : 'रद्द करें'}
                            </button>
                            <button 
                                onClick={() => {
                                    setShowPaymentModal(false);
                                    handleCheckout(paymentMode);
                                }}
                                disabled={!paymentMode}
                                className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-opacity"
                            >
                                {language === 'en' ? 'Confirm Order' : 'ऑर्डर पक्का करें'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Enlarged Image Modal */}
            {enlargedImage && (
                <div 
                    className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 animate-in fade-in duration-200"
                    onClick={() => setEnlargedImage(null)}
                >
                    <div className="relative max-w-sm w-full bg-white rounded-2xl p-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <button 
                            onClick={() => setEnlargedImage(null)}
                            className="absolute -top-3 -right-3 w-8 h-8 bg-black text-white rounded-full flex items-center justify-center shadow-lg"
                        >
                            <X size={16} />
                        </button>
                        <img src={enlargedImage} alt="Enlarged" className="w-full h-auto max-h-[70vh] object-contain rounded-xl" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default Cart;

