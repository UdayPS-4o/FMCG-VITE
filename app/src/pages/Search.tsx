import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProducts } from '../lib/api';
import ProductCard from '../components/ProductCard';
import { useStore, type Product } from '../context/StoreContext';
import { Search as SearchIcon, X, Loader2, ArrowLeft, Mic } from 'lucide-react';

const Search = () => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [, setIsFuzzy] = useState(false);
    const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
    const [isListening, setIsListening] = useState(false);
    const { language } = useStore();

    useEffect(() => {
        if (!query.trim()) {
            setProducts([]);
            setIsFuzzy(false);
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetchProducts(1, 50, query);
                setProducts(res.data);
                setIsFuzzy(!!res.isFuzzy);
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

    const startListening = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert(language === 'en' ? 'Voice search is not supported in this browser.' : 'आपके ब्राउज़र में वॉइस सर्च सपोर्ट नहीं करता है।');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = language === 'en' ? 'en-IN' : 'hi-IN';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => {
            setIsListening(true);
        };

        recognition.onresult = (event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            const transcript = event.results[0][0].transcript;
            setQuery(transcript);
        };

        recognition.onerror = (event: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            console.error('Speech recognition error', event.error);
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognition.start();
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
                            placeholder={language === 'en' ? 'Search products...' : 'उत्पाद खोजें...'}
                            autoFocus
                            className="w-full h-11 bg-gray-100 rounded-xl pl-10 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <div className="absolute inset-y-0 right-2 flex items-center gap-1">
                            {query && (
                                <button
                                    onClick={() => setQuery('')}
                                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full"
                                >
                                    <X size={16} />
                                </button>
                            )}
                            <button
                                onClick={startListening}
                                className={`p-1.5 rounded-full transition-colors ${isListening ? 'text-white bg-red-500 animate-pulse' : 'text-gray-400 hover:text-emerald-500 hover:bg-emerald-50'}`}
                            >
                                <Mic size={18} />
                            </button>
                        </div>
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
                        <p className="text-gray-500 font-medium">{language === 'en' ? 'No products found' : 'कोई उत्पाद नहीं मिला'}</p>
                        <p className="text-gray-400 text-sm mt-1">{language === 'en' ? 'Try a different search term' : 'कोई अन्य खोज शब्द आज़माएं'}</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <SearchIcon size={48} className="text-gray-200 mb-4" />
                        <p className="text-gray-500 font-medium">{language === 'en' ? 'Search for products' : 'उत्पाद खोजें'}</p>
                        <p className="text-gray-400 text-sm mt-1">{language === 'en' ? 'Type name, category, or code' : 'नाम, श्रेणी या कोड टाइप करें'}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Search;

