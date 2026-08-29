import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { fetchProducts, getImageUrl, identifyByPhone } from '../lib/api';
import { useStore, type Product } from '../context/StoreContext';
import {
    ArrowLeft, ShoppingCart, MessageCircle, Package, Tag,
    Loader2, AlertCircle, CheckCircle, Star, User, Sparkles
} from 'lucide-react';

const ProductPage = () => {
    const { code } = useParams<{ code: string }>();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { user, login, addToCart, cart } = useStore();

    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [qty, setQty] = useState(1);
    const [addedToCart, setAddedToCart] = useState(false);
    const [imgError, setImgError] = useState(false);

    // WhatsApp auto-login state
    const [waIdentifying, setWaIdentifying] = useState(false);
    const [waWelcome, setWaWelcome] = useState('');       // party name shown in banner
    const [waError, setWaError] = useState('');           // non-blocking note if not found
    const waAttempted = useRef(false);

    // ── WhatsApp auto-identification ──────────────────────────────────────────
    useEffect(() => {
        const phone = searchParams.get('phone');
        if (!phone || user || waAttempted.current) return;
        waAttempted.current = true;

        const tryIdentify = async () => {
            setWaIdentifying(true);
            try {
                const data = await identifyByPhone(phone);
                if (data.success && data.token && data.user) {
                    // Store session — same as normal login
                    localStorage.setItem('app_token', data.token);
                    localStorage.setItem('app_user', JSON.stringify(data.user));
                    login(data.user, data.token);
                    setWaWelcome(data.user.name || 'Customer');
                }
            } catch (err: unknown) {
                // Not found in CMPL — silently show a hint (don't block the page)
                const msg = err instanceof Error ? err.message : '';
                if (msg.includes('not registered')) {
                    setWaError('Your number isn\'t registered yet. You can browse or order via WhatsApp.');
                }
                // Any other errors are silent (bad network etc.)
            } finally {
                setWaIdentifying(false);
            }
        };

        tryIdentify();
    }, [searchParams, user, login]);

    // ── Product fetch ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!code) return;
        const load = async () => {
            setLoading(true);
            try {
                const res = await fetchProducts(1, 1, '', '', '', code.toUpperCase());
                if (res.data && res.data.length > 0) {
                    setProduct(res.data[0]);
                } else {
                    setNotFound(true);
                }
            } catch {
                setNotFound(true);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [code]);

    const cartItem = product ? cart.find(i => i.product.CODE === product.CODE) : null;

    const handleAddToCart = () => {
        if (!product) return;
        if (!user) { navigate('/login'); return; }
        addToCart(product, qty, 0);
        setAddedToCart(true);
        setTimeout(() => setAddedToCart(false), 2000);
    };

    const handleWhatsApp = () => {
        const msg = product
            ? `Hi, I'm interested in *${product.PRODUCT}* (Code: ${product.CODE}). Please share details.`
            : 'Hi, I need product information.';
        window.open(`https://wa.me/918080121020?text=${encodeURIComponent(msg)}`, '_blank');
    };

    // ── Loading ───────────────────────────────────────────────────────────────
    if (loading || waIdentifying) {
        return (
            <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-gray-400">
                    <Loader2 className="animate-spin text-emerald-500" size={32} />
                    <span className="text-sm">
                        {waIdentifying ? 'Identifying you…' : 'Loading product…'}
                    </span>
                </div>
            </div>
        );
    }

    // ── Not found ─────────────────────────────────────────────────────────────
    if (notFound || !product) {
        return (
            <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center px-6 text-center">
                <AlertCircle size={48} className="text-gray-300 mb-4" />
                <h1 className="text-xl font-semibold text-gray-700 mb-2">Product Not Found</h1>
                <p className="text-gray-400 text-sm mb-6">
                    This product doesn't exist or may be discontinued.
                </p>
                <Link
                    to="/"
                    className="px-5 py-2.5 bg-emerald-500 text-white rounded-xl font-medium text-sm hover:bg-emerald-600 transition-colors"
                >
                    Browse Products
                </Link>
            </div>
        );
    }

    const price = parseFloat(product.RATE1) || 0;
    const mrp = parseFloat(product.MRP1 || '0') || 0;
    const discount = mrp > 0 && price > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;
    const inStock = (product.stock ?? 1) > 0;
    const imageUrl = product.image_url ? getImageUrl(product.image_url) : null;
    const conversion = parseFloat(product.MULT_F) || 1;

    return (
        <div className="min-h-screen bg-[#f8f9fa] flex flex-col">

            {/* ── WhatsApp welcome banner ── */}
            {waWelcome && (
                <div className="fixed top-0 left-0 right-0 z-[60] bg-[#25D366] text-white px-4 py-2.5 flex items-center gap-2 shadow-lg animate-slide-down">
                    <Sparkles size={16} className="shrink-0" />
                    <p className="text-sm font-medium flex-1">
                        Welcome, <span className="font-bold">{waWelcome}</span>! You're signed in automatically.
                    </p>
                    <button onClick={() => setWaWelcome('')} className="text-white/70 hover:text-white text-lg leading-none">×</button>
                </div>
            )}

            {/* ── Non-registered phone hint ── */}
            {waError && !waWelcome && (
                <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2">
                    <AlertCircle size={14} className="text-amber-500 shrink-0" />
                    <p className="text-xs text-amber-700 flex-1">{waError}</p>
                    <button onClick={() => setWaError('')} className="text-amber-400 hover:text-amber-600 text-lg leading-none">×</button>
                </div>
            )}

            {/* ── Header ── */}
            <header
                className={`fixed left-0 right-0 z-50 bg-white border-b border-gray-100 px-4 py-3 transition-all ${waWelcome || waError ? 'top-[44px]' : 'top-0'}`}
            >
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600 hover:bg-gray-50 rounded-full">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-sm font-semibold text-gray-800 truncate">{product.PRODUCT}</h1>
                        <p className="text-xs text-gray-400">Code: {product.CODE}</p>
                    </div>
                    <div className="flex items-center gap-1">
                        {/* Show party name pill if auto-identified */}
                        {user && waWelcome && (
                            <div className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 rounded-full">
                                <User size={11} className="text-emerald-600" />
                                <span className="text-[11px] font-semibold text-emerald-700 max-w-[80px] truncate">{user.name}</span>
                            </div>
                        )}
                        {user && (
                            <Link to="/cart" className="relative p-2 text-gray-600 hover:bg-gray-50 rounded-full">
                                <ShoppingCart size={20} />
                                {cart.length > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-emerald-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                                        {cart.length}
                                    </span>
                                )}
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            {/* ── Content ── */}
            <div className={`flex-1 pb-36 transition-all ${waWelcome || waError ? 'pt-[108px]' : 'pt-[64px]'}`}>

                {/* Product Image */}
                <div className="bg-white">
                    {imageUrl && !imgError ? (
                        <img
                            src={imageUrl}
                            alt={product.PRODUCT}
                            onError={() => setImgError(true)}
                            className="w-full h-72 object-contain p-4"
                        />
                    ) : (
                        <div className="w-full h-72 flex items-center justify-center bg-gray-50">
                            <Package size={64} className="text-gray-200" />
                        </div>
                    )}
                </div>

                {/* Product Info */}
                <div className="px-4 py-5 bg-white mt-2">
                    <div className="flex items-start justify-between gap-3 mb-3">
                        <h2 className="text-lg font-bold text-gray-900 leading-tight flex-1">
                            {product.PRODUCT}
                        </h2>
                        <span className={`shrink-0 mt-0.5 px-2.5 py-1 rounded-full text-xs font-semibold ${inStock ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                            {inStock
                                ? <span className="flex items-center gap-1"><CheckCircle size={11} /> In Stock</span>
                                : 'Out of Stock'
                            }
                        </span>
                    </div>

                    {/* Price */}
                    <div className="flex items-end gap-3 mb-4">
                        <span className="text-2xl font-bold text-gray-900">₹{price.toFixed(2)}</span>
                        {mrp > 0 && mrp !== price && (
                            <>
                                <span className="text-base text-gray-400 line-through mb-0.5">₹{mrp.toFixed(2)}</span>
                                {discount > 0 && (
                                    <span className="mb-0.5 px-2 py-0.5 bg-orange-100 text-orange-600 text-xs font-bold rounded-full flex items-center gap-1">
                                        <Tag size={10} /> {discount}% OFF
                                    </span>
                                )}
                            </>
                        )}
                    </div>

                    {/* Pack / Unit info */}
                    <div className="flex gap-2 flex-wrap">
                        {product.PACK && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg">
                                <Package size={13} className="text-gray-400" />
                                <span className="text-xs text-gray-600 font-medium">Pack: {product.PACK}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg">
                            <span className="text-xs text-gray-600 font-medium">
                                1 {product.UNIT_2} = {conversion} {product.UNIT_1}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg">
                            <span className="text-xs text-gray-600 font-medium">Unit: {product.UNIT_1}</span>
                        </div>
                    </div>
                </div>

                {/* Schemes */}
                {product.schemes && product.schemes.length > 0 && (
                    <div className="mx-4 mt-3 p-4 bg-white rounded-2xl">
                        <div className="flex items-center gap-2 mb-3">
                            <Star size={14} className="text-amber-500" />
                            <span className="text-sm font-semibold text-gray-800">Available Schemes</span>
                        </div>
                        <div className="space-y-2">
                            {product.schemes.map((sch, i) => (
                                <div key={i} className="flex items-center justify-between px-3 py-2 bg-amber-50 rounded-xl">
                                    <span className="text-xs text-gray-600">
                                        Buy {sch.slab1}{sch.slab2 ? `–${sch.slab2}` : '+'} {product.UNIT_1}
                                    </span>
                                    <span className="text-xs font-bold text-amber-600">{sch.discount}% OFF</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Browse more */}
                <div className="mx-4 mt-3 p-4 bg-white rounded-2xl">
                    <p className="text-xs text-gray-500 mb-1">Looking for more?</p>
                    <Link to="/" className="text-emerald-600 text-sm font-medium hover:underline">
                        Browse all products →
                    </Link>
                </div>
            </div>

            {/* ── Fixed Bottom Actions ── */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 space-y-2">
                {user ? (
                    <div className="flex gap-3">
                        {/* Qty stepper */}
                        <div className="flex items-center bg-gray-100 rounded-xl px-2">
                            <button
                                onClick={() => setQty(q => Math.max(1, q - 1))}
                                className="w-8 h-8 flex items-center justify-center text-gray-600 font-bold text-lg"
                            >−</button>
                            <span className="w-8 text-center text-sm font-semibold text-gray-800">{qty}</span>
                            <button
                                onClick={() => setQty(q => q + 1)}
                                className="w-8 h-8 flex items-center justify-center text-gray-600 font-bold text-lg"
                            >+</button>
                        </div>
                        {/* Add to Cart */}
                        <button
                            onClick={handleAddToCart}
                            disabled={!inStock}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${
                                addedToCart
                                    ? 'bg-emerald-500 text-white scale-95'
                                    : cartItem
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : inStock
                                    ? 'bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95'
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                            }`}
                        >
                            {addedToCart
                                ? <><CheckCircle size={16} /> Added!</>
                                : cartItem
                                ? <><ShoppingCart size={16} /> Update Cart</>
                                : <><ShoppingCart size={16} /> Add to Cart</>
                            }
                        </button>
                    </div>
                ) : (
                    <>
                        <button
                            onClick={() => navigate('/login')}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 text-white rounded-xl font-semibold text-sm hover:bg-emerald-600 active:scale-95 transition-all"
                        >
                            <ShoppingCart size={16} /> Login to Order
                        </button>
                        <button
                            onClick={handleWhatsApp}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#25D366] text-white rounded-xl font-semibold text-sm hover:opacity-90 active:scale-95 transition-all"
                        >
                            <MessageCircle size={16} /> Order on WhatsApp
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default ProductPage;
