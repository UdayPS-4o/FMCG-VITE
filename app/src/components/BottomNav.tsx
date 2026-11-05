import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Search, ShoppingCart, FileText, User } from 'lucide-react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import clsx from 'clsx';
import { useStore } from '../context/StoreContext';
import { CARTFX_BUMP } from '../lib/cartFx';
import { useFestivalTheme } from '../context/FestivalThemeContext';

// Same matching rule NavLink uses: exact match, or a sub-path ("/orders/12").
const isPathActive = (pathname: string, to: string) =>
    to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(to + '/');

// Torch beam: narrow at the lamp, widening down onto the icon.
const BEAM_CLIP = 'polygon(32% 0, 68% 0, 100% 100%, 0 100%)';

const BottomNav = () => {
    const { cart, language } = useStore();
    const { pathname } = useLocation();
    // During a festival the bar takes the retailer's chosen festive colour set
    const { variant: festive } = useFestivalTheme();
    const cartItemCount = cart.length; // distinct products
    const cartIconControls = useAnimationControls();

    // Cart wobble when a flying product lands (see lib/cartFx)
    useEffect(() => {
        const bump = () => cartIconControls.start({
            scale: [1, 1.35, 0.92, 1],
            rotate: [0, -10, 4, 0],
            transition: { duration: 0.55, ease: 'easeOut' },
        });
        window.addEventListener(CARTFX_BUMP, bump);
        return () => window.removeEventListener(CARTFX_BUMP, bump);
    }, [cartIconControls]);

    const navItems = [
        { to: '/', icon: Home, label: language === 'en' ? 'Home' : 'होम' },
        { to: '/search', icon: Search, label: language === 'en' ? 'Search' : 'खोजें' },
        { to: '/cart', icon: ShoppingCart, label: language === 'en' ? 'Cart' : 'कार्ट', badge: cartItemCount },
        { to: '/orders', icon: FileText, label: language === 'en' ? 'Orders' : 'ऑर्डर्स' },
        { to: '/profile', icon: User, label: language === 'en' ? 'Profile' : 'प्रोफ़ाइल' },
    ];
    const activeIndex = navItems.findIndex(item => isPathActive(pathname, item.to));

    return (
        <nav
            className="fixed left-3 right-3 z-50"
            style={{ bottom: 'calc(10px + env(safe-area-inset-bottom))' }}
        >
            <div
                className={clsx(
                    'relative flex h-16 overflow-hidden rounded-[22px] backdrop-blur-xl backdrop-saturate-150 transition-colors duration-700',
                    festive
                        ? 'shadow-[0_12px_30px_rgba(0,0,0,0.4)]'
                        : [
                            // Light phone: frosted white glass
                            'bg-white/75 border border-white/90 shadow-[0_10px_28px_rgba(15,23,42,0.18)]',
                            // Dark phone: smoked dark glass
                            'dark:bg-slate-900/75 dark:border-white/10 dark:shadow-[0_12px_30px_rgba(0,0,0,0.5)]',
                        ]
                )}
                style={festive ? { background: `${festive.bgFrom}e6`, border: `1px solid ${festive.accent}59` } : undefined}
            >
                {/* Torch: lamp on the top edge + light beam, slides to the active tab */}
                <motion.div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-0 w-1/5"
                    initial={false}
                    animate={{
                        x: `${Math.max(activeIndex, 0) * 100}%`,
                        opacity: activeIndex >= 0 ? 1 : 0,
                    }}
                    transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                >
                    <motion.div
                        className={clsx(
                            'absolute left-1/2 top-[3px] h-[62px] w-[72px] -translate-x-1/2 blur-[2px]',
                            !festive && 'bg-gradient-to-b from-blue-600/30 via-blue-600/5 to-transparent dark:from-blue-400/55 dark:via-blue-400/10'
                        )}
                        style={{
                            clipPath: BEAM_CLIP,
                            ...(festive && { background: `linear-gradient(180deg, ${festive.accent}8c, ${festive.accent}10 75%, transparent)` }),
                        }}
                        animate={{ opacity: [1, 0.82, 1] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <div
                        className={clsx(
                            'absolute left-1/2 top-0 h-1 w-8 -translate-x-1/2 rounded-b-md',
                            !festive && 'bg-blue-600 shadow-[0_0_8px_2px_rgba(37,99,235,0.6)] dark:bg-blue-400 dark:shadow-[0_0_10px_2px_#3b82f6,0_0_22px_4px_rgba(59,130,246,0.7)]'
                        )}
                        style={festive ? { background: festive.accent, boxShadow: `0 0 10px 3px ${festive.accent}` } : undefined}
                    />
                </motion.div>

                {navItems.map(({ to, icon: Icon, label, badge }, i) => {
                    const isActive = i === activeIndex;
                    return (
                        <NavLink
                            key={to}
                            to={to}
                            className={clsx(
                                'relative z-10 flex h-full w-full flex-col items-center justify-center gap-1 transition-colors duration-300',
                                festive
                                    ? (isActive ? 'text-white' : 'text-white/60')
                                    : (isActive ? 'text-blue-700 dark:text-white' : 'text-slate-500 dark:text-slate-400/70')
                            )}
                        >
                            {/* Outer span holds the CSS lift/glow; inner motion.div owns the cart wobble transform */}
                            <span
                                className={clsx(
                                    'block transition-[transform,filter] duration-300',
                                    isActive && 'translate-y-0.5',
                                    isActive && !festive && 'dark:drop-shadow-[0_0_6px_#60a5fa]'
                                )}
                                style={isActive && festive ? { filter: `drop-shadow(0 0 6px ${festive.accent})` } : undefined}
                            >
                            <motion.div
                                className="relative"
                                animate={to === '/cart' ? cartIconControls : undefined}
                                {...(to === '/cart' ? { 'data-cart-icon': '' } : {})}
                            >
                                <Icon size={22} strokeWidth={2} />
                                <AnimatePresence>
                                    {badge !== undefined && badge > 0 && (
                                        <motion.span
                                            key={badge}
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            exit={{ scale: 0 }}
                                            transition={{ type: 'spring', damping: 12, stiffness: 400 }}
                                            className="absolute -top-1 -right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center"
                                        >
                                            {badge > 99 ? '99+' : badge}
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                            </span>
                            <span className="text-[10px] font-medium">{label}</span>
                        </NavLink>
                    );
                })}
            </div>
        </nav>
    );
};

export default BottomNav;
