import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProducts } from '../lib/api';
import ProductCard from '../components/ProductCard';
import type { Product } from '../context/StoreContext';
import { Search as SearchIcon, X, Loader2, ArrowLeft } from 'lucide-react';

const Search = () => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (!query.trim()) {
            setProducts([]);
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetchProducts(1, 50, query);
                setProducts(res.data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [query]);

    const handleExpand = (code: string) => {
        setExpandedProducts(prev => ({ ...prev, [code]: true }));
    };

    const handleCollapse = (code: string) => {
        setExpandedProducts(prev => ({ ...prev, [code]: false }));
    };

    return (
        <div className="min-h-screen bg-[#f8f9fa] flex flex-col">
            <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600 hover:bg-gray-50 rounded-full">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex-1 relative">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            <SearchIcon size={18} className="text-gray-400" />
                        </div>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search products..."
                            autoFocus
                            className="w-full h-11 bg-gray-100 rounded-xl pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                        {query && (
                            <button 
                                onClick={() => setQuery('')}
                                className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <div className="flex-1 px-4 pt-[76px] pb-4">
                {loading ? (
                    <div className="flex justify-center py-8 text-gray-400">
                        <Loader2 className="animate-spin text-emerald-500" size={24} />
                    </div>
                ) : products.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 pb-20">
                        {products.map((product) => {
                            const isExp = !!expandedProducts[product.CODE];
                            
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
                ) : query.trim() ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <SearchIcon size={48} className="text-gray-200 mb-4" />
                        <p className="text-gray-500 font-medium">No products found</p>
                        <p className="text-gray-400 text-sm mt-1">Try a different search term</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <SearchIcon size={48} className="text-gray-200 mb-4" />
                        <p className="text-gray-500 font-medium">Search for products</p>
                        <p className="text-gray-400 text-sm mt-1">Type name, category, or code</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Search;
