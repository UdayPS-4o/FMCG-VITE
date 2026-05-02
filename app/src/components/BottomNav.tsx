import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Search, ShoppingCart, FileText, User } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '../context/StoreContext';

const BottomNav = () => {
    const { cart, language } = useStore();
    const cartItemCount = cart.length; // distinct products

    const navItems = [
        { to: '/', icon: Home, label: language === 'en' ? 'Home' : 'होम' },
        { to: '/search', icon: Search, label: language === 'en' ? 'Search' : 'खोजें' },
        { to: '/cart', icon: ShoppingCart, label: language === 'en' ? 'Cart' : 'कार्ट', badge: cartItemCount },
        { to: '/orders', icon: FileText, label: language === 'en' ? 'Orders' : 'ऑर्डर्स' },
        { to: '/profile', icon: User, label: language === 'en' ? 'Profile' : 'प्रोफ़ाइल' },
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-gray-200 safe-area-bottom z-50">
            <div className="flex justify-around items-center h-16">
                {navItems.map(({ to, icon: Icon, label, badge }) => (
                    <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) =>
                            clsx(
                                'flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors relative',
                                isActive ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                            )
                        }
                    >
                        <div className="relative">
                            <Icon size={24} strokeWidth={2} />
                            {badge !== undefined && badge > 0 && (
                                <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
                                    {badge > 99 ? '99+' : badge}
                                </span>
                            )}
                        </div>
                        <span className="text-[10px] font-medium">{label}</span>
                    </NavLink>
                ))}
            </div>
        </nav>
    );
};

export default BottomNav;
