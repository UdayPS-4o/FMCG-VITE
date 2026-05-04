/**
 * HOME CONCEPT 3 — "Vibrant Market + Sliding Panel"
 * Theme: Vibrant Market (Home2)
 * Box/pcs UX: Sliding panel below card (Home3 concept)
 */
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
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

/* ── Card with side panel ── */
const MarketSlidingCard = ({ product, index, isExpanded, toggleExpand }: { 
  product: Product; 
  index: number; 
  isExpanded: boolean;
  toggleExpand: (expand: boolean) => void;
}) => {
  const { addToCart, cart, language } = useStore();
  const ci = cart.find(i => i.product.CODE === product.CODE);
  const pal = PALS[index % PALS.length];
  const conv = parseFloat(product.MULT_F || '1') || 1;
  const hasMulti = conv > 1;
  const u1 = product.UNIT_1 || 'PCS';
  const u2 = product.UNIT_2 || 'BOX';
  const rate = parseFloat(product.RATE1 || '0') || 0;
  const mrp = parseFloat(product.MRP1 || '0') || rate;

  const [pcs, setPcs] = useState(ci?.qtyPcs ?? 0);
  const [boxes, setBoxes] = useState(ci?.qtyBoxes ?? 0);
  useEffect(() => { setPcs(ci?.qtyPcs ?? 0); setBoxes(ci?.qtyBoxes ?? 0); }, [ci]);

  const totalQty = pcs + boxes * conv;
  const hasScheme = (product.schemes?.length ?? 0) > 0;
  const maxDiscount = hasScheme ? Math.max(...product.schemes!.map(s => s.discount)) : 0;
  const currentDiscount = product.schemes?.reduce((b, s) => totalQty >= s.slab1 && totalQty <= s.slab2 ? Math.max(b, s.discount) : b, 0) ?? 0;
  const effectiveRate = rate * (1 - currentDiscount / 100);
  const isInCart = pcs > 0 || boxes > 0;

  const upd = (p: number, b: number) => { setPcs(p); setBoxes(b); addToCart(product, p, b); if (p === 0 && b === 0) toggleExpand(false); };

  const stepBtn = (fill: boolean, onClick: () => void, icon: React.ReactNode, isGray: boolean = false) => {
    const acc = isGray ? '#6b7280' : pal.acc;
    return (
      <button onClick={onClick} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: fill ? acc : '#fff', color: fill ? '#fff' : acc, boxShadow: fill ? `0 2px 8px ${acc}30` : '0 1px 3px rgba(0,0,0,0.08)' }}>{icon}</button>
    );
  };

  return (
    <motion.div layout style={{ borderRadius: 20, background: '#fff', boxShadow: isExpanded ? `0 4px 20px ${pal.acc}20` : '0 2px 12px rgba(0,0,0,0.06)', border: isExpanded ? `2px solid ${pal.acc}` : `1px solid ${pal.lt}`, overflow: 'hidden', position: 'relative', transition: 'box-shadow 0.2s', height: '100%', display: 'flex', flexDirection: isExpanded && hasMulti ? 'row' : 'column' }}>
      {hasScheme && <div style={{ position: 'absolute', top: 0, right: 0, background: pal.acc, color: '#fff', fontSize: 9, fontWeight: 700, padding: '3px 8px', borderBottomLeftRadius: 10, zIndex: 1 }}>{maxDiscount}% OFF</div>}
      
      <motion.div layout style={{ flex: isExpanded && hasMulti ? '0 0 calc(50% - 6px)' : undefined, display: 'flex', flexDirection: 'column' }}>
        <div style={{ aspectRatio: '1/1', background: pal.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          {product.image_url
            ? <img src={product.image_url} alt={product.PRODUCT} style={{ width: '72%', height: '72%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
            : <div style={{ width: 48, height: 48, borderRadius: 14, background: pal.lt, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Package size={22} color={pal.acc} /></div>}
        </div>
        
        <div style={{ padding: '9px 11px 11px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <p style={{ fontSize: 11.5, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.3, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>{product.PRODUCT}</p>
          
          {product.schemes && product.schemes.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
              {product.schemes.map((s, i) => {
                const active = totalQty >= s.slab1;
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
            {mrp > effectiveRate && <span style={{ fontSize: 10, color: '#9ca3af' }}>MRP: ₹{mrp.toFixed(2)}</span>}
          </div>
          {isExpanded && hasMulti && <div style={{ height: 45 }} />}
        </div>
      </motion.div>
      
      <motion.div layout style={{ flex: isExpanded && hasMulti ? 1 : undefined, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: isExpanded && hasMulti ? '10px 10px 10px 0' : '0 11px 11px', overflow: 'hidden', position: 'relative' }}>
        <AnimatePresence mode="popLayout">
          {!isExpanded && !isInCart ? (
            <motion.button key="add" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
              onClick={() => hasMulti ? toggleExpand(true) : addToCart(product, 1, 0)}
              style={{ width: '100%', height: 34, border: `2px solid ${pal.acc}`, borderRadius: 10, background: '#fff', color: pal.acc, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer' }}>
              <Plus size={14} /> {language === 'en' ? 'Add' : 'जोड़ें'}
            </motion.button>
          ) : !isExpanded && hasMulti && isInCart ? (
            <motion.div key="multi-summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
              onClick={() => toggleExpand(true)}
              style={{ height: 34, background: pal.bg, borderRadius: 10, border: `1.5px solid ${pal.lt}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', cursor: 'pointer' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: pal.acc }}>{boxes > 0 && `${boxes}B`}{boxes > 0 && pcs > 0 && '+'}{pcs > 0 && `${pcs}P`}</span>
              <span style={{ fontSize: 10, color: pal.acc, fontWeight: 600 }}>Edit ✏️</span>
            </motion.div>
          ) : !isExpanded && !hasMulti && isInCart ? (
            <motion.div key="simple" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 34, background: pal.bg, borderRadius: 10, border: `1.5px solid ${pal.lt}`, padding: '0 4px' }}>
              <button onClick={() => upd(Math.max(0, pcs - 1), 0)} style={{ width: 28, height: 26, background: '#fff', border: `1px solid ${pal.lt}`, borderRadius: 7, color: pal.acc, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={13} /></button>
              <span style={{ fontSize: 15, fontWeight: 800, color: pal.acc }}>{pcs}</span>
              <button onClick={() => upd(pcs + 1, 0)} style={{ width: 28, height: 26, background: pal.acc, border: 'none', borderRadius: 7, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={13} /></button>
            </motion.div>
          ) : isExpanded && hasMulti ? (
            <motion.div key="expanded" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%', justifyContent: 'center' }}>
               <div style={{ background: '#f9fafb', borderRadius: 12, padding: '8px 10px', border: '1px solid #f3f4f6' }}>
                <p style={{ margin: '0 0 5px', fontSize: 9, fontWeight: 700, color: pal.acc, textTransform: 'uppercase' }}>{u2} (Case)</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {stepBtn(false, () => upd(pcs, Math.max(0, boxes - 1)), <Minus size={14} />)}
                  <input type="number" inputMode="numeric" value={boxes === 0 ? '' : boxes} placeholder="0" onChange={e => upd(pcs, Math.max(0, parseInt(e.target.value) || 0))} style={{ width: 40, textAlign: 'center', fontSize: 16, fontWeight: 800, color: '#111', border: 'none', outline: 'none', background: 'transparent' }} />
                  {stepBtn(true, () => upd(pcs, boxes + 1), <Plus size={14} />)}
                </div>
               </div>
               <div style={{ background: '#f9fafb', borderRadius: 12, padding: '8px 10px', border: '1px solid #f3f4f6' }}>
                <p style={{ margin: '0 0 5px', fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>{u1} (Loose)</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {stepBtn(false, () => upd(Math.max(0, pcs - 1), boxes), <Minus size={14} />, true)}
                  <input type="number" inputMode="numeric" value={pcs === 0 ? '' : pcs} placeholder="0" onChange={e => upd(Math.max(0, parseInt(e.target.value) || 0), boxes)} style={{ width: 40, textAlign: 'center', fontSize: 16, fontWeight: 800, color: '#111', border: 'none', outline: 'none', background: 'transparent' }} />
                  {stepBtn(true, () => upd(pcs + 1, boxes), <Plus size={14} />, true)}
                </div>
               </div>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                 <span style={{ fontSize: 11, fontWeight: 800, color: pal.acc }}>Net ₹{(totalQty * effectiveRate).toFixed(0)}</span>
                 <button onClick={() => toggleExpand(false)} style={{ padding: '6px 14px', background: pal.acc, border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 11 }}>Done</button>
               </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </motion.div>
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

/* ── Main ── */
const Home = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [activeBrand, setActiveBrand] = useState('');
  const [expandedCodes, setExpandedCodes] = useState<string[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [showSort, setShowSort] = useState(false);
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
  const totalB = cart.reduce((s, i) => s + (i.qtyBoxes || 0), 0);
  const totalP = cart.reduce((s, i) => s + (i.qtyPcs || 0), 0);
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

      if (res.total !== undefined) setTotalProducts(res.total);

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

  const toggleExpand = useCallback((code: string, expand: boolean) => {
    setExpandedCodes(prev => expand ? [...prev, code] : prev.filter(c => c !== code));
  }, []);

  const { displayProducts, shiftedCodes } = useMemo(() => {
    if (expandedCodes.length === 0) return { displayProducts: products, shiftedCodes: new Set<string>() };

    const normal: Product[] = [];
    const shifted: Product[] = [];
    const shiftedSet = new Set<string>();

    for (let i = 0; i < products.length; i += 2) {
      const left = products[i];
      const right = products[i + 1];

      const leftExp = expandedCodes.includes(left.CODE) && (parseFloat(left.MULT_F || '1') || 1) > 1;
      
      if (!right) {
        normal.push(left);
        continue;
      }

      const rightExp = expandedCodes.includes(right.CODE) && (parseFloat(right.MULT_F || '1') || 1) > 1;

      if (leftExp && !rightExp) {
        normal.push(left);
        shifted.push(right);
        shiftedSet.add(right.CODE);
      } else if (rightExp && !leftExp) {
        normal.push(right);
        shifted.push(left);
        shiftedSet.add(left.CODE);
      } else {
        normal.push(left);
        normal.push(right);
      }
    }

    return { displayProducts: [...normal, ...shifted], shiftedCodes: shiftedSet };
  }, [products, expandedCodes]);

  const sortOptions = [
    { value: '', label: language === 'en' ? 'Default' : 'डिफ़ॉल्ट' },
    { value: 'scheme', label: language === 'en' ? 'Scheme Items' : 'स्कीम आइटम' },
    { value: 'az', label: language === 'en' ? 'A-Z' : 'A-Z' },
    { value: 'mrp', label: language === 'en' ? 'MRP Low-High' : 'एमआरपी कम-ज्यादा' },
    { value: 'mrp-desc', label: language === 'en' ? 'MRP High-Low' : 'एमआरपी ज्यादा-कम' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fb', fontFamily: "'Inter',sans-serif", paddingBottom: 120 }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '10px 16px', borderBottom: '1px solid #f1f3f5', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
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

      {/* Brands */}
      <div style={{ padding: '12px 0 4px' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', margin: '0 16px 8px' }}>Shop by Brand</p>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 4, paddingLeft: 16, paddingRight: 16 }}>
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
      <div style={{ padding: '0 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 800, color: '#111', margin: 0 }}>All Products <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>{totalProducts || ''}</span></h2>
          <button onClick={() => setShowSort(true)} style={{ background: '#fff', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
             <ArrowDownUp size={12} color="#4b5563" />
             <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>
                {sortOrder ? sortOptions.find(o => o.value === sortOrder)?.label : (language === 'en' ? 'Sort' : 'क्रमबद्ध करें')}
             </span>
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {displayProducts.map((p, i) => {
            const originalIndex = products.findIndex(op => op.CODE === p.CODE);
            const isExpanded = expandedCodes.includes(p.CODE) && (parseFloat(p.MULT_F || '1') || 1) > 1;
            const isShifted = shiftedCodes.has(p.CODE);
            return (
              <motion.div layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ opacity: { duration: 0.3 } }}
                key={`${p.CODE}-${isShifted ? 'shifted' : 'normal'}`} 
                ref={i === displayProducts.length - 1 ? lastRef : undefined} 
                style={{ gridColumn: isExpanded ? 'span 2' : 'span 1' }}
              >
                <MarketSlidingCard product={p} index={originalIndex} isExpanded={isExpanded} toggleExpand={(expand) => toggleExpand(p.CODE, expand)} />
              </motion.div>
            );
          })}
          {loading && Array.from({ length: 4 }).map((_, i) => <MarketCardSkeleton key={i} />)}
        </div>
      </div>

      {/* Pill Cart */}
      {cartCount > 0 && (
        <button onClick={() => navigate('/cart')} style={{ position: 'fixed', bottom: 76, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#16a34a,#10b981)', border: 'none', borderRadius: 50, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 26px', boxShadow: '0 8px 32px rgba(22,163,74,0.35)', zIndex: 100 }}>
          <ShoppingCart size={17} color="#fff" />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>
            {totalB > 0 && `${totalB}B`}{totalB > 0 && totalP > 0 && '+'}{totalP > 0 && `${totalP}P`}{totalB === 0 && totalP === 0 && '0'} · ₹{cartTotal.toFixed(0)}
          </span>
          <ChevronRight size={15} color="rgba(255,255,255,0.85)" />
        </button>
      )}

      {/* Sort Bottom Sheet */}
      <AnimatePresence>
        {showSort && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSort(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999 }} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: '20px 20px 30px', zIndex: 1000, boxShadow: '0 -4px 20px rgba(0,0,0,0.1)' }}>
              <div style={{ width: 40, height: 4, background: '#e5e7eb', borderRadius: 2, margin: '0 auto 20px' }} />
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111', margin: '0 0 16px' }}>{language === 'en' ? 'Sort Products' : 'उत्पाद क्रमबद्ध करें'}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sortOptions.map(opt => {
                  const isActive = sortOrder === opt.value;
                  return (
                    <button key={opt.value} onClick={() => { setSortOrder(opt.value); setShowSort(false); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: isActive ? '#f0fdf4' : '#f9fafb', border: `1px solid ${isActive ? '#16a34a' : '#f3f4f6'}`, borderRadius: 12, cursor: 'pointer', transition: 'all 0.2s' }}>
                      <span style={{ fontSize: 14, fontWeight: isActive ? 700 : 600, color: isActive ? '#16a34a' : '#374151' }}>{opt.label}</span>
                      {isActive && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');@keyframes spin{to{transform:rotate(360deg)}}@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
};

export default Home;
