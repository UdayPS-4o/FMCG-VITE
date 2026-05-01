import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import { fetchActiveSchemes } from '../lib/api';

const Layout = () => {
    const [banners, setBanners] = useState<any[]>([]);

    const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

    useEffect(() => {
        const loadBanners = async () => {
            try {
                const data = await fetchActiveSchemes();
                setBanners(data);
            } catch (err) {
                console.error(err);
            }
        };
        loadBanners();
    }, []);

    useEffect(() => {
        if (banners.length <= 1) return;
        const timer = setInterval(() => {
            setCurrentBannerIndex((prev) => (prev + 1) % banners.length);
        }, 4000);
        return () => clearInterval(timer);
    }, [banners.length]);

    return (
        <div className="flex flex-col min-h-screen relative bg-gray-50">

            {banners.length > 0 && (
                <div className="sticky top-0 z-50 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 shadow-md">
                    <div className="max-w-7xl mx-auto py-2.5 px-3 overflow-hidden">
                        <div className="relative h-6 flex items-center justify-center">
                            {banners.map((b, idx) => (
                                <div 
                                    key={idx} 
                                    className={`absolute flex items-center justify-center gap-2 transition-all duration-700 ease-in-out ${
                                        idx === currentBannerIndex 
                                            ? 'translate-x-0 opacity-100 pointer-events-auto' 
                                            : idx < currentBannerIndex 
                                                ? '-translate-x-full opacity-0 pointer-events-none' 
                                                : 'translate-x-full opacity-0 pointer-events-none'
                                    }`}
                                >
                                    <span className="bg-white text-blue-700 font-bold px-2 py-0.5 rounded text-[10px] tracking-wider shadow-sm">OFFER</span>
                                    <span className="text-white font-bold text-xs sm:text-sm tracking-wide">
                                        {b.banner_text}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            <main className="flex-1 pb-20"> {/* Add padding bottom to avoid overlap with nav */}
                <Outlet />
            </main>
            <BottomNav />
        </div>
    );
};

export default Layout;
