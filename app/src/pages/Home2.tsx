/**
 * HOME CONCEPT 2 — "Vibrant Market"
 * Box/pcs UX: Tapping "Add" on a multi-unit product opens a
 * bottom-sheet drawer with BOX + PCS steppers. Single-unit shows inline stepper.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { fetchProducts, fetchBrands } from '../lib/api';
import { useStore, type Product } from '../context/StoreContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ShoppingCart, Plus, Minus, X, Loader2, Package, ChevronRight, Sparkles, ArrowDownUp } from 'lucide-react';

interface Brand { brand_code: string; brand_desc: string; image_url: string; }

const PALS = [
  { bg:'#fff7ed', acc:'#f97316', lt:'#fef3e2' },
  { bg:'#f0fdf4', acc:'#16a34a', lt:'#dcfce7' },
  { bg:'#eff6ff', acc:'#2563eb', lt:'#dbeafe' },
  { bg:'#fdf4ff', acc:'#9333ea', lt:'#f3e8ff' },
  { bg:'#fff1f2', acc:'#e11d48', lt:'#ffe4e6' },
  { bg:'#f0fdfa', acc:'#0d9488', lt:'#ccfbf1' },
];

/* ── Bottom Drawer for multi-unit ── */
const MultiDrawer = ({ product, onClose, pal }: { product: Product; onClose: () => void; pal: typeof PALS[0] }) => {
  const { addToCart, cart } = useStore();
  const ci = cart.find(i => i.product.CODE === product.CODE);
  const conv = parseFloat(product.MULT_F || '1') || 1;
  const u1 = product.UNIT_1 || 'PCS';
  const u2 = product.UNIT_2 || 'BOX';
  const rate = parseFloat(product.RATE1 || '0') || 0;
  const [pcs, setPcs] = useState(ci?.qtyPcs ?? 0);
  const [boxes, setBoxes] = useState(ci?.qtyBoxes ?? 0);

  const totalQty = pcs + boxes * conv;
  const disc = product.schemes?.reduce((b, s) => totalQty >= s.slab1 && totalQty <= s.slab2 ? Math.max(b, s.discount) : b, 0) ?? 0;
  const net = totalQty * rate * (1 - disc / 100);

  const upd = (p: number, b: number) => { setPcs(p); setBoxes(b); addToCart(product, p, b); };

  const stepBtn = (fill: boolean, onClick: () => void, icon: React.ReactNode) => (
    <button onClick={onClick} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: fill ? pal.acc : '#fff', color: fill ? '#fff' : pal.acc, boxShadow: fill ? `0 3px 10px ${pal.acc}40` : '0 1px 4px rgba(0,0,0,0.08)' }}>{icon}</button>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}>
      <motion.div initial={{ y: 300 }} animate={{ y: 0 }} exit={{ y: 300 }} transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        style={{ background: '#fff', borderRadius: '24px 24px 0 0', padding: '20px 20px 36px', width: '100%' }}
        onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div style={{ width: 36, height: 4, background: '#e5e7eb', borderRadius: 4, margin: '0 auto 16px' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#111', margin: '0 0 2px', lineHeight: 1.3 }}>{product.PRODUCT}</p>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>Rate: ₹{rate.toFixed(0)} · {conv} {u1} per {u2}</p>
          </div>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: 10, padding: 6, cursor: 'pointer' }}><X size={18} color="#6b7280" /></button>
        </div>

        {/* Scheme badges */}
        {product.schemes && product.schemes.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {product.schemes.map((s, i) => {
              const active = totalQty >= s.slab1 && totalQty <= s.slab2;
              return (
                <button key={i} onClick={() => upd(s.slab1 % conv, Math.floor(s.slab1 / conv))}
                  style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, border: 'none', cursor: 'pointer', background: active ? pal.acc : pal.lt, color: active ? '#fff' : pal.acc }}>
                  {s.discount}% off ≥{s.slab1} pcs
                </button>
              );
            })}
          </div>
        )}

        {/* BOX row */}
        <div style={{ background: pal.bg, borderRadius: 14, padding: '12px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: pal.acc }}>{u2} (Case)</p>
            <p style={{ margin: 0, fontSize: 10, color: '#9ca3af' }}>{conv} {u1} each</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {stepBtn(false, () => upd(pcs, Math.max(0, boxes - 1)), <Minus size={16} />)}
            <input type="number" inputMode="numeric" min={0} value={boxes || ''} placeholder="0"
              onChange={e => upd(pcs, Math.max(0, parseInt(e.target.value) || 0))}
              style={{ width: 52, textAlign: 'center', fontSize: 20, fontWeight: 800, color: pal.acc, border: 'none', background: 'transparent', outline: 'none' }} />
            {stepBtn(true, () => upd(pcs, boxes + 1), <Plus size={16} />)}
          </div>
        </div>

        {/* PCS row */}
        <div style={{ background: '#f9fafb', borderRadius: 14, padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #f1f3f5' }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#374151' }}>{u1} (loose)</p>
            <p style={{ margin: 0, fontSize: 10, color: '#9ca3af' }}>Individual pieces</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {stepBtn(false, () => upd(Math.max(0, pcs - 1), boxes), <Minus size={16} />)}
            <input type="number" inputMode="numeric" min={0} value={pcs || ''} placeholder="0"
              onChange={e => upd(Math.max(0, parseInt(e.target.value) || 0), boxes)}
              style={{ width: 52, textAlign: 'center', fontSize: 20, fontWeight: 800, color: '#374151', border: 'none', background: 'transparent', outline: 'none' }} />
            {stepBtn(true, () => upd(pcs + 1, boxes), <Plus size={16} />)}
          </div>
        </div>

        {/* Summary + Done */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
          <div>
            <p style={{ margin: 0, fontSize: 10, color: '#9ca3af' }}>Total qty: {totalQty} {u1}{disc > 0 && ` · ${disc}% off`}</p>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111' }}>₹{net.toFixed(0)}</p>
          </div>
          <button onClick={onClose} style={{ background: pal.acc, border: 'none', borderRadius: 14, padding: '11px 28px', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: `0 4px 16px ${pal.acc}50` }}>
            Done ✓
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

/* ── Card ── */
const MarketCard = ({ product, index, onOpenDrawer }: { product: Product; index: number; onOpenDrawer: () => void }) => {
  const { addToCart, cart, language } = useStore();
  const ci = cart.find(i => i.product.CODE === product.CODE);
  const pal = PALS[index % PALS.length];
  const conv = parseFloat(product.MULT_F || '1') || 1;
  const hasMulti = conv > 1;
  const pcs = ci?.qtyPcs ?? 0;
  const boxes = ci?.qtyBoxes ?? 0;
  const totalQty = pcs + boxes * conv;
  const rate = parseFloat(product.RATE1 || '0') || 0;
  const mrp = parseFloat(product.MRP1 || '0') || rate;
  const isInCart = pcs > 0 || boxes > 0;
  const hasScheme = (product.schemes?.length ?? 0) > 0;
  const maxDiscount = hasScheme ? Math.max(...product.schemes!.map(s => s.discount)) : 0;
  const currentDiscount = product.schemes?.reduce((b, s) => totalQty >= s.slab1 && totalQty <= s.slab2 ? Math.max(b, s.discount) : b, 0) ?? 0;
  const effectiveRate = rate * (1 - currentDiscount / 100);

  const upd = (p: number, b: number) => {
    addToCart(product, p, b);
  };

  return (
    <div style={{ borderRadius: 20, background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: `1px solid ${pal.lt}`, overflow: 'hidden', position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {hasScheme && <div style={{ position: 'absolute', top: 0, right: 0, background: pal.acc, color: '#fff', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderBottomLeftRadius: 10, zIndex: 1 }}>{maxDiscount}% OFF</div>}
      <div style={{ aspectRatio: '1/1', background: pal.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {product.image_url
          ? <img src={product.image_url} alt={product.PRODUCT} style={{ width: '72%', height: '72%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
          : <div style={{ width: 48, height: 48, borderRadius: 14, background: pal.lt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Package size={22} color={pal.acc} /></div>}
        <span style={{ position: 'absolute', bottom: 5, left: 6, fontSize: 8, color: 'rgba(0,0,0,0.25)', fontFamily: 'monospace' }}>{product.CODE}</span>
      </div>
      <div style={{ padding: '9px 11px 11px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <p style={{ fontSize: 11.5, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.3, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>{product.PRODUCT}</p>
        
        {/* Schemes inline */}
        {product.schemes && product.schemes.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
            {product.schemes.map((s, i) => {
              const active = totalQty >= s.slab1 && totalQty <= s.slab2;
              return (
                <button 
                  key={i} 
                  onClick={(e) => {
                    e.stopPropagation();
                    upd(s.slab1 % conv, Math.floor(s.slab1 / conv));
                  }}
                  style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, background: active ? pal.acc : pal.lt, color: active ? '#fff' : pal.acc, border: `1px solid ${active ? pal.acc : pal.lt}`, cursor: 'pointer' }}
                >
                  {s.discount}% ≥{s.slab1}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 9, marginTop: 'auto' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#111' }}>{language === 'en' ? 'Rate:' : 'दर:'} ₹{effectiveRate.toFixed(2)}</span>
          {mrp > effectiveRate && <span style={{ fontSize: 10, color: '#9ca3af', textDecoration: 'line-through' }}>₹{mrp.toFixed(2)}</span>}
        </div>
        <AnimatePresence mode="wait">
          {!isInCart ? (
            <motion.button key="add" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => hasMulti ? onOpenDrawer() : addToCart(product, 1, 0)}
              style={{ width: '100%', height: 34, border: `2px solid ${pal.acc}`, borderRadius: 10, background: '#fff', color: pal.acc, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer' }}>
              <Plus size={14} /> {language === 'en' ? 'Add' : 'जोड़ें'}
            </motion.button>
          ) : hasMulti ? (
            <motion.div key="multi-summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onOpenDrawer}
              style={{ height: 34, background: pal.bg, borderRadius: 10, border: `1.5px solid ${pal.lt}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', cursor: 'pointer' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: pal.acc }}>
                {boxes > 0 && `${boxes}B`}{boxes > 0 && pcs > 0 && '+'}{pcs > 0 && `${pcs}P`}
              </span>
              <span style={{ fontSize: 10, color: pal.acc, fontWeight: 600 }}>Edit ✏️</span>
            </motion.div>
          ) : (
            <motion.div key="simple" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 34, background: pal.bg, borderRadius: 10, border: `1.5px solid ${pal.lt}`, padding: '0 4px' }}>
              <button onClick={() => addToCart(product, Math.max(0, pcs - 1), 0)} style={{ width: 28, height: 26, background: '#fff', border: `1px solid ${pal.lt}`, borderRadius: 7, color: pal.acc, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={13} /></button>
              <span style={{ fontSize: 15, fontWeight: 800, color: pal.acc }}>{pcs}</span>
              <button onClick={() => addToCart(product, pcs + 1, 0)} style={{ width: 28, height: 26, background: pal.acc, border: 'none', borderRadius: 7, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={13} /></button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

/* ── Skeletons ── */
const MarketCardSkeleton = () => (
  <div style={{ borderRadius: 20, background: '#fff', border: '1px solid #f1f3f5', overflow: 'hidden', height: 240, display: 'flex', flexDirection: 'column' }}>
    <div style={{ aspectRatio: '1/1', background: '#f3f4f6', position: 'relative', overflow: 'hidden' }}>
      <div className="skeleton-shine" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)', transform: 'translateX(-100%)', animation: 'shimmer 1.5s infinite' }} />
    </div>
    <div style={{ padding: 11, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ height: 12, background: '#f3f4f6', borderRadius: 4, width: '80%' }} />
      <div style={{ height: 12, background: '#f3f4f6', borderRadius: 4, width: '60%' }} />
      <div style={{ marginTop: 'auto', height: 20, background: '#f3f4f6', borderRadius: 4, width: '40%' }} />
      <div style={{ height: 34, background: '#f3f4f6', borderRadius: 10, width: '100%' }} />
    </div>
  </div>
);

/* ── Hero Banner ── */
const heroes = [
  { title: 'Summer Deals', sub: 'Up to 40% off', color: '#f97316', bg: '#fff7ed', emoji: '🥤' },
  { title: 'New Arrivals', sub: 'Fresh products landed', color: '#2563eb', bg: '#eff6ff', emoji: '✨' },
  { title: 'Bulk Offers', sub: 'Save more on bulk', color: '#9333ea', bg: '#fdf4ff', emoji: '📦' },
];
const HeroBanner = () => {
  const [idx, setIdx] = useState(0);
  useEffect(() => { const id = setInterval(() => setIdx(p => (p + 1) % heroes.length), 3500); return () => clearInterval(id); }, []);
  const b = heroes[idx];
  return (
    <div style={{ padding: '12px 16px 0' }}>
      <AnimatePresence mode="wait">
        <motion.div key={idx} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
          style={{ background: b.bg, borderRadius: 20, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', minHeight: 86 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: b.color, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 3px', display: 'flex', alignItems: 'center', gap: 4 }}><Sparkles size={10} />Limited Offer</p>
            <h3 style={{ fontSize: 19, fontWeight: 800, color: '#111', margin: 0 }}>{b.title}</h3>
            <p style={{ fontSize: 11, color: '#555', margin: '3px 0 0' }}>{b.sub}</p>
          </div>
          <span style={{ fontSize: 48 }}>{b.emoji}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

/* ── Main ── */
const Home2 = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [activeBrand, setActiveBrand] = useState('');
  const [drawerProduct, setDrawerProduct] = useState<Product | null>(null);
  const [drawerIndex, setDrawerIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [sortOrder, setSortOrder] = useState('');
  const { cart, cartTotal, language } = useStore();
  const navigate = useNavigate();
  const loadingRef = useRef(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const currentSortRef = useRef(sortOrder);
  const currentBrandRef = useRef(activeBrand);
  const cartCount = cart.reduce((s, i) => s + i.totalQty, 0);

  useEffect(() => {
    currentSortRef.current = sortOrder;
    currentBrandRef.current = activeBrand;
  }, [sortOrder, activeBrand]);

  useEffect(() => { fetchBrands().then(setBrands).catch(() => {}); }, []);

  const load = useCallback(async (reset = false) => {
    if (loadingRef.current && !reset) return;
    if (!reset && !hasMore) return;
    const pg = reset ? 1 : page;
    loadingRef.current = true; setLoading(true);
    try {
      const currentSort = sortOrder;
      const currentBrand = activeBrand;
      const res = await fetchProducts(pg, 20, '', activeBrand, sortOrder);
      if (currentSort !== currentSortRef.current || currentBrand !== currentBrandRef.current) return;

      if (!res.data.length) { setHasMore(false); if (reset) setProducts([]); }
      else {
        setProducts(prev => reset ? res.data : [...prev, ...res.data.filter((p: Product) => !prev.some((e: Product) => e.CODE === p.CODE))]);
        setPage(pg + 1);
        if (reset) setHasMore(res.data.length === 20);
      }
    } catch { /**/ } finally { loadingRef.current = false; setLoading(false); }
  }, [page, hasMore, activeBrand, sortOrder]);

  useEffect(() => { setProducts([]); setPage(1); setHasMore(true); load(true); }, [activeBrand, sortOrder]); // eslint-disable-line

  const lastRef = useCallback((node: HTMLDivElement | null) => {
    if (loading) return;
    observer.current?.disconnect();
    observer.current = new IntersectionObserver(e => { if (e[0].isIntersecting && hasMore) load(false); });
    if (node) observer.current.observe(node);
  }, [loading, hasMore, load]);

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fb', fontFamily: "'Inter',sans-serif", paddingBottom: 110 }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '10px 16px', borderBottom: '1px solid #f1f3f5', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 onClick={() => navigate('/')} style={{ fontSize: 17, fontWeight: 800, color: '#111', margin: 0, whiteSpace: 'nowrap', cursor: 'pointer' }}>FMCG 🛒</h1>
          <div onClick={() => navigate('/search')} style={{ flex: 1, height: 38, background: '#f3f4f6', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', cursor: 'pointer', color: '#9ca3af', fontSize: 12.5 }}>
            <Search size={14} /><span>{language === 'en' ? 'Search products...' : 'उत्पाद खोजें...'}</span>
          </div>
          <button onClick={() => navigate('/cart')} style={{ width: 38, height: 38, borderRadius: 10, background: '#f0fdf4', border: '1.5px solid #dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}>
            <ShoppingCart size={18} color="#16a34a" />
            {cartCount > 0 && <span style={{ position: 'absolute', top: -3, right: -3, background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 20 }}>{cartCount}</span>}
          </button>
        </div>
      </div>

      <HeroBanner />

      {/* Brands */}
      <div style={{ padding: '12px 16px 4px' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', margin: '0 0 8px' }}>Shop by Brand</p>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 4 }}>
          {[{ brand_code: '', brand_desc: 'All', image_url: '' }, ...brands].map((b, i) => {
            const isActive = activeBrand === b.brand_code;
            const pal = PALS[i % PALS.length];
            return (
              <button key={b.brand_code} onClick={() => setActiveBrand(b.brand_code)}
                style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
                <div style={{ width: 50, height: 50, borderRadius: '50%', background: isActive ? pal.acc : pal.bg, border: isActive ? `2.5px solid ${pal.acc}` : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: isActive ? `0 4px 14px ${pal.acc}40` : 'none', transition: 'all 0.2s' }}>
                  {b.image_url
                    ? <img src={b.image_url} alt={b.brand_desc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 9, fontWeight: 700, color: isActive ? '#fff' : pal.acc }}>{b.brand_desc.slice(0, 3)}</span>}
                </div>
                <span style={{ fontSize: 8.5, fontWeight: 600, color: isActive ? pal.acc : '#6b7280', maxWidth: 50, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.brand_desc || b.brand_code}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding: '10px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: '#111', margin: 0 }}>All Products <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>{products.length}+</span></h2>
          <div style={{ position: 'relative' }}>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              style={{ appearance: 'none', background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#374151', fontSize: 11, padding: '4px 24px 4px 8px', borderRadius: 6, outline: 'none' }}
            >
              <option value="">{language === 'en' ? 'Default' : 'डिफ़ॉल्ट'}</option>
              <option value="scheme">{language === 'en' ? 'Scheme Items' : 'स्कीम आइटम'}</option>
              <option value="az">{language === 'en' ? 'A-Z' : 'A-Z'}</option>
              <option value="mrp">{language === 'en' ? 'MRP Low-High' : 'एमआरपी कम-ज्यादा'}</option>
              <option value="mrp-desc">{language === 'en' ? 'MRP High-Low' : 'एमआरपी ज्यादा-कम'}</option>
            </select>
            <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <ArrowDownUp size={10} color="#6b7280" />
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
          {products.map((p, i) => (
            <div key={p.CODE} ref={i === products.length - 1 ? lastRef : undefined}>
              <MarketCard product={p} index={i} onOpenDrawer={() => { setDrawerProduct(p); setDrawerIndex(i); }} />
            </div>
          ))}
          {loading && Array.from({ length: 4 }).map((_, i) => <MarketCardSkeleton key={i} />)}
        </div>
      </div>

      {/* Floating pill cart */}
      {cartCount > 0 && (
        <button onClick={() => navigate('/cart')} style={{ position: 'fixed', bottom: 76, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#16a34a,#10b981)', border: 'none', borderRadius: 50, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 26px', boxShadow: '0 8px 32px rgba(22,163,74,0.35)', zIndex: 100 }}>
          <ShoppingCart size={17} color="#fff" />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{cartCount} items · ₹{cartTotal.toFixed(0)}</span>
          <ChevronRight size={15} color="rgba(255,255,255,0.85)" />
        </button>
      )}

      {/* Multi-unit drawer */}
      <AnimatePresence>
        {drawerProduct && (
          <MultiDrawer product={drawerProduct} pal={PALS[drawerIndex % PALS.length]} onClose={() => setDrawerProduct(null)} />
        )}
      </AnimatePresence>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');@keyframes spin{to{transform:rotate(360deg)}}@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
};

export default Home2;
