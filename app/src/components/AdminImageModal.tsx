import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Camera, Search, Loader2 } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import type { Product } from '../context/StoreContext';

interface AdminImageModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Product;
    onImageUpdated: (newUrl: string) => void;
}

export const AdminImageModal: React.FC<AdminImageModalProps> = ({ isOpen, onClose, product, onImageUpdated }) => {
    const { language } = useStore();
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/app';
    const [view, setView] = useState<'menu' | 'amazon'>('menu');
    const [searchQuery, setSearchQuery] = useState(product.PRODUCT);
    const [amazonImages, setAmazonImages] = useState<string[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);

    const handleUpload = async (file: File) => {
        setIsUploading(true);
        try {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                await submitImage(base64);
            };
            reader.readAsDataURL(file);
        } catch {
            setIsUploading(false);
        }
    };

    const submitImage = async (imageUrl: string) => {
        setIsUploading(true);
        try {
            const token = localStorage.getItem('app_token') || '';
            const res = await fetch(`${API_URL}/admin/product-image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ productCode: product.CODE, imageUrl })
            });
            const data = await res.json();
            if (data.success) {
                onImageUpdated(data.imageUrl);
                onClose();
            } else {
                alert(data.error || 'Upload failed');
            }
        } catch {
            alert('Upload failed');
        } finally {
            setIsUploading(false);
        }
    };

    const searchAmazon = async () => {
        setIsSearching(true);
        try {
            const token = localStorage.getItem('app_token') || '';
            const res = await fetch(`${API_URL}/admin/amazon-search?q=${encodeURIComponent(searchQuery)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.images) {
                setAmazonImages(data.images);
            }
        } catch {
            console.error('Amazon search failed');
        } finally {
            setIsSearching(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
                <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="w-full sm:w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
                >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                        <h3 className="font-semibold text-gray-800">
                            {view === 'menu' 
                                ? (language === 'en' ? 'Update Image' : 'इमेज अपडेट करें') 
                                : (language === 'en' ? 'Import from Amazon' : 'अमेज़न से खोजें')}
                        </h3>
                        <button onClick={onClose} className="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="p-4 pb-24 sm:pb-6 overflow-y-auto">
                        {isUploading ? (
                            <div className="flex flex-col items-center justify-center py-8">
                                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-4" />
                                <p className="text-gray-500">{language === 'en' ? 'Uploading...' : 'अपलोड हो रहा है...'}</p>
                            </div>
                        ) : view === 'menu' ? (
                            <div className="space-y-3">
                                <p className="text-sm text-gray-500 mb-4 text-center">{product.PRODUCT}</p>
                                
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    ref={fileInputRef} 
                                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} 
                                />
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full flex items-center justify-center gap-3 bg-gray-50 hover:bg-gray-100 p-4 rounded-xl border border-gray-200 transition-colors"
                                >
                                    <Upload className="text-blue-500" />
                                    <span className="font-medium">{language === 'en' ? 'Select from Gallery' : 'गैलरी से चुनें'}</span>
                                </button>

                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    capture="environment" 
                                    className="hidden" 
                                    ref={cameraInputRef} 
                                    onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} 
                                />
                                <button 
                                    onClick={() => cameraInputRef.current?.click()}
                                    className="w-full flex items-center justify-center gap-3 bg-gray-50 hover:bg-gray-100 p-4 rounded-xl border border-gray-200 transition-colors"
                                >
                                    <Camera className="text-emerald-500" />
                                    <span className="font-medium">{language === 'en' ? 'Click Picture' : 'फोटो खींचे'}</span>
                                </button>

                                <button 
                                    onClick={() => { setView('amazon'); searchAmazon(); }}
                                    className="w-full flex items-center justify-center gap-3 bg-gray-50 hover:bg-gray-100 p-4 rounded-xl border border-gray-200 transition-colors"
                                >
                                    <Search className="text-orange-500" />
                                    <span className="font-medium">{language === 'en' ? 'Import from Amazon' : 'अमेज़न से खोजें'}</span>
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col h-full">
                                <div className="flex gap-2 mb-4">
                                    <input 
                                        type="text" 
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                        placeholder={language === 'en' ? 'Search Product...' : 'प्रोडक्ट खोजें...'}
                                    />
                                    <button 
                                        onClick={searchAmazon}
                                        disabled={isSearching}
                                        className="bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center justify-center"
                                    >
                                        {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                                    </button>
                                </div>

                                {isSearching ? (
                                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-emerald-500" /></div>
                                ) : amazonImages.length > 0 ? (
                                    <div className="grid grid-cols-2 gap-3">
                                        {amazonImages.map((img, idx) => (
                                            <div key={idx} className="relative group rounded-lg overflow-hidden border border-gray-100 shadow-sm aspect-square bg-white flex items-center justify-center">
                                                <img src={img} alt="Amazon" className="w-full h-full object-contain p-2" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                    <button 
                                                        onClick={() => submitImage(img)}
                                                        className="bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium text-sm shadow-lg transform hover:scale-105 transition-transform"
                                                    >
                                                        {language === 'en' ? 'Import' : 'इम्पोर्ट करें'}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-center text-gray-400 py-8 text-sm">
                                        {language === 'en' ? 'No images found' : 'कोई इमेज नहीं मिली'}
                                    </p>
                                )}
                                
                                <button onClick={() => setView('menu')} className="mt-4 text-sm text-gray-500 text-center w-full py-2">
                                    {language === 'en' ? 'Back to Options' : 'वापस जाएँ'}
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
