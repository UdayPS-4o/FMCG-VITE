import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import constants from '../../constants';

interface Scheme {
  slab1: number;
  slab2?: number;
  discount: number;
  scheme_type?: string;
}

interface Product {
  CODE: string;
  PRODUCT: string;
  UNIT_1?: string;
  UNIT_2?: string;
  MULT_F?: string;
  RATE1: string;
  MRP1: string;
  PACK?: string;
  stock?: number | string;
  image_url?: string;
  brand_name?: string;
  brand_code?: string;
  schemes?: Scheme[];
}

const ProductPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (!code) { setError('No product code provided.'); setLoading(false); return; }

    const fetchProduct = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${constants.baseURL}/api/app/products?codes=${encodeURIComponent(code)}&limit=1`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const json = await res.json();
        const products: Product[] = json.data ?? json;
        const found = products.find(p => p.CODE === code) ?? products[0] ?? null;
        setProduct(found);
        if (!found) setError('Product not found.');
      } catch (e: unknown) {
        setError((e as Error).message || 'Failed to load product.');
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [code]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const rate = product ? parseFloat(product.RATE1 || '0') || 0 : 0;
  const mrp  = product ? parseFloat(product.MRP1  || '0') || 0 : 0;
  const hasDiscount = mrp > rate && rate > 0;
  const discountPct = hasDiscount ? Math.round(((mrp - rate) / mrp) * 100) : 0;
  const stock = product ? (typeof product.stock === 'number' ? product.stock : parseInt(String(product.stock || '0'), 10)) : 0;
  const inStock = stock > 0;

  const imageUrl = !imgError && product?.image_url ? product.image_url : null;

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-14 h-14 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-500 text-sm font-medium">Loading product…</p>
        </div>
      </div>
    );
  }

  // ── Error / Not Found ──────────────────────────────────────────────────────

  if (error || !product) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">📦</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Product Not Found</h1>
          <p className="text-gray-500 mb-6">{error || `We couldn't find product "${code}".`}</p>
          <a
            href="https://app.ekta-enterprises.com"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-md"
          >
            Back to Store
          </a>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const packDetails = [product.PACK, product.UNIT_1, product.UNIT_2].filter(Boolean);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Minimal Header */}
      <header className="bg-white shadow-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-sm shadow-md">
            E
          </div>
          <span className="font-bold text-gray-800 text-sm hidden sm:block">Ekta Enterprises</span>
        </a>
        <span className="text-gray-300 text-sm">›</span>
        <span className="text-gray-500 text-sm truncate max-w-[200px]">{product.PRODUCT}</span>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
          <div className="grid md:grid-cols-2 gap-0">

            {/* ── Image Panel ─────────────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-8 min-h-[300px] md:min-h-[460px]">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={product.PRODUCT}
                  className="max-h-72 max-w-full object-contain drop-shadow-lg rounded-xl"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-gray-400">
                  <div className="text-7xl">📦</div>
                  <span className="text-sm font-medium">No image available</span>
                </div>
              )}
            </div>

            {/* ── Details Panel ────────────────────────────────────────────── */}
            <div className="p-6 sm:p-8 flex flex-col gap-4">

              {/* Brand */}
              {product.brand_name && (
                <span className="inline-flex items-center w-fit px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 tracking-wide uppercase">
                  {product.brand_name}
                </span>
              )}

              {/* Product Name */}
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 leading-tight">
                  {product.PRODUCT}
                </h1>
                <p className="text-xs text-gray-400 font-mono mt-1">Code: {product.CODE}</p>
              </div>

              {/* Stock Badge */}
              <div>
                {inStock ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    In Stock
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-600">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    Out of Stock
                  </span>
                )}
              </div>

              {/* Pricing */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                <div className="flex items-end gap-3 flex-wrap">
                  <span className="text-3xl font-extrabold text-gray-900">
                    ₹{rate.toFixed(2)}
                  </span>
                  {hasDiscount && (
                    <>
                      <span className="text-base text-gray-400 line-through font-medium pb-0.5">
                        ₹{mrp.toFixed(2)}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg text-xs font-extrabold bg-green-500 text-white shadow-sm">
                        {discountPct}% OFF
                      </span>
                    </>
                  )}
                </div>
                {hasDiscount && (
                  <p className="text-xs text-green-700 font-semibold mt-1">
                    You save ₹{(mrp - rate).toFixed(2)}
                  </p>
                )}
                <p className="text-[10px] text-gray-400 mt-1">* Prices exclusive of GST. For bulk/B2B orders, contact us.</p>
              </div>

              {/* Pack Details */}
              {packDetails.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {packDetails.map((detail, i) => (
                    <span key={i} className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                      {detail}
                    </span>
                  ))}
                </div>
              )}

              {/* Schemes */}
              {product.schemes && product.schemes.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    🎁 Active Schemes
                  </p>
                  <ul className="space-y-1.5">
                    {product.schemes.map((s, i) => (
                      <li key={i} className="text-sm text-amber-800 font-medium">
                        Order {s.slab1}{s.slab2 ? `–${s.slab2}` : '+'} units →{' '}
                        <span className="font-extrabold text-green-700">{s.discount}% discount</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* CTA */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <a
                  href={`https://wa.me/919826623188?text=Hi%2C%20I%20want%20to%20order%20${encodeURIComponent(product.PRODUCT)}%20(Code%3A%20${product.CODE})`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-3 px-5 rounded-xl shadow-md transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 text-sm"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.098.543 4.07 1.49 5.783L0 24l6.383-1.474A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.794 9.794 0 01-5.003-1.373l-.36-.213-3.73.861.88-3.627-.234-.374A9.794 9.794 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
                  </svg>
                  Order on WhatsApp
                </a>
                <a
                  href="/"
                  className="flex-1 flex items-center justify-center gap-2 bg-white border-2 border-gray-200 hover:border-blue-400 text-gray-700 hover:text-blue-600 font-bold py-3 px-5 rounded-xl transition-all duration-200 text-sm"
                >
                  ← Browse Products
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* SEO / Info footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Ekta Enterprises · FMCG Distributor · Jabalpur, MP
        </p>
      </main>
    </div>
  );
};

export default ProductPage;
