import React, { useEffect, useState, useRef, useCallback } from 'react';
import { fetchProducts, fetchBrands } from '../lib/api';
import ProductCard from '../components/ProductCard';
import type { Product } from '../context/StoreContext';
import { Search as SearchIcon, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Brand {
    brand_code: string;
    brand_desc: string;
    image_url: string;
}

const Home = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
    const [brands, setBrands] = useState<Brand[]>([]);
    const [activeBrand, setActiveBrand] = useState<string>('');
    const navigate = useNavigate();
    const observer = useRef<IntersectionObserver | null>(null);
    const loadingRef = useRef(false);

    useEffect(() => {
        fetchBrands().then(data => {
            console.log('Fetched brands:', data);
            setBrands(data);
        }).catch(err => {
            console.error('Failed to fetch brands:', err);
        });
    }, []);

    const loadProducts = useCallback(async (reset = false) => {
        if (loadingRef.current) return;
        if (!reset && !hasMore) return;
        
        const currentPage = reset ? 1 : page;
        loadingRef.current = true;
        setLoading(true);
        try {
            const res = await fetchProducts(currentPage, 20, '', activeBrand);
            if (res.data.length === 0) {
                setHasMore(false);
                if (reset) setProducts([]);
            } else {
                setProducts(prev => {
                    if (reset) return res.data;
                    const newProducts = res.data.filter((p: Product) => !prev.some(existing => existing.CODE === p.CODE));
                    return [...prev, ...newProducts];
                });
                setPage(currentPage + 1);
                if (reset) setHasMore(res.data.length === 20);
            }
        } catch (err: any) {
            console.error(err);
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }, [page, hasMore, activeBrand]);

    useEffect(() => {
        loadProducts(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeBrand]);

    const lastElementRef = useCallback((node: HTMLDivElement | null) => {
        if (loading) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) {
                loadProducts(false);
            }
        });
        if (node) observer.current.observe(node);
    }, [loading, hasMore, loadProducts]);

    const handleExpand = (code: string) => {
        setExpandedProducts(prev => ({ ...prev, [code]: true }));
    };

    const handleCollapse = (code: string) => {
        setExpandedProducts(prev => ({ ...prev, [code]: false }));
    };

    return (
        <div className="min-h-screen bg-[#f8f9fa]">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-3">
                    <div className="flex-1" onClick={() => navigate('/search')}>
                        <div className="w-full h-11 bg-gray-100 rounded-xl flex items-center px-4 text-gray-400 gap-2 cursor-pointer hover:bg-gray-150 transition-colors">
                            <SearchIcon size={18} />
                            <span className="text-sm">Search...</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Brands Horizontal Scroll */}
            <div className="bg-[#FAF5E0] py-3 px-4 overflow-x-auto whitespace-nowrap scrollbar-hide flex items-center gap-4 border-b border-gray-200">
                <button 
                    onClick={() => setActiveBrand('')}
                    className={`flex flex-col items-center flex-shrink-0 transition-opacity ${activeBrand === '' ? 'opacity-100 scale-105' : 'opacity-60 grayscale hover:opacity-80'}`}
                >
                    <div className={`w-[52px] h-[52px] rounded-full flex items-center justify-center p-[2px] ${activeBrand === '' ? 'bg-gradient-to-t from-gray-900 to-gray-600 shadow-md' : 'bg-transparent border border-gray-300'}`}>
                        <div className="w-full h-full bg-white rounded-full flex items-center justify-center shadow-inner text-[10px] font-bold text-center leading-tight text-gray-700">
                            All<br/>Brands
                        </div>
                    </div>
                </button>
                {brands && brands.length > 0 ? brands.map(b => (
                    <button 
                        key={b.brand_code || Math.random().toString()}
                        onClick={() => setActiveBrand(b.brand_code)}
                        className={`flex flex-col items-center flex-shrink-0 transition-opacity ${activeBrand === b.brand_code ? 'opacity-100 scale-105' : 'opacity-60 grayscale hover:opacity-80'}`}
                    >
                        <div className={`w-[52px] h-[52px] rounded-full flex items-center justify-center p-[2px] ${activeBrand === b.brand_code ? 'bg-gradient-to-t from-gray-900 to-gray-600 shadow-md' : 'bg-transparent border border-gray-300'}`}>
                            {b.image_url ? (
                                <img src={b.image_url} alt={b.brand_desc} className="w-full h-full rounded-full object-cover bg-white" />
                            ) : (
                                <div className="w-full h-full bg-white rounded-full flex items-center justify-center shadow-inner text-[10px] font-bold text-center leading-tight text-gray-600 overflow-hidden px-1">
                                    {(b.brand_desc || 'No Name').slice(0, 8)}
                                </div>
                            )}
                        </div>
                    </button>
                )) : (
                    <div className="text-xs text-red-500">Brands array is empty! JSON: {JSON.stringify(brands)}</div>
                )}
            </div>

            {/* Category Section - Optional header */}
            <div className="px-4 pt-4">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base font-semibold text-gray-800">
                        {activeBrand ? brands.find(b => b.brand_code === activeBrand)?.brand_desc || 'Products' : 'All Products'}
                    </h2>
                    <span className="text-xs text-gray-400">{products.length} items</span>
                </div>
            </div>

            {/* Product Grid */}
            <div className="px-4 pb-24">
                <div className="grid grid-cols-2 gap-3">
                    {products.map((product, index) => {
                        const isLast = products.length === index + 1;
                        const isExp = !!expandedProducts[product.CODE];
                        
                        // We use masonry-like flowing behavior for multiple expanded items
                        // by letting the grid naturally handle the col-span-2.
                        
                        if (isLast) {
                            return (
                                <div
                                    ref={lastElementRef}
                                    key={product.CODE}
                                    className={isExp ? 'col-span-2' : ''}
                                >
                                    <ProductCard
                                        product={product}
                                        isExpanded={isExp}
                                        onExpand={() => handleExpand(product.CODE)}
                                        onCollapse={() => handleCollapse(product.CODE)}
                                    />
                                </div>
                            );
                        }

                        return (
                            <div key={product.CODE} className={isExp ? 'col-span-2' : ''}>
                                <ProductCard
                                    product={product}
                                    isExpanded={isExp}
                                    onExpand={() => handleExpand(product.CODE)}
                                    onCollapse={() => handleCollapse(product.CODE)}
                                />
                            </div>
                        );
                    })}
                </div>

                {loading && (
                    <div className="flex justify-center py-8">
                        <Loader2 className="animate-spin text-emerald-500" size={24} />
                    </div>
                )}

                {!loading && !hasMore && products.length > 0 && (
                    <div className="text-center text-gray-400 text-xs py-8">
                        You've reached the end
                    </div>
                )}
            </div>
        </div>
    );
};

export default Home;
