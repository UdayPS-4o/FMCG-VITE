import React, { createContext, useContext, useState, useEffect } from 'react';

// Types
export interface User {
    partyCode: string;
    name: string;
    mobile: string;
    address: string;
    gst: string;
    balance?: string;
    mustChangePassword: boolean;
}

export interface Scheme {
    slab1: number;
    slab2: number;
    discount: number;
}

export interface Product {
    CODE: string;
    PRODUCT: string;
    UNIT_1: string; // PCS
    UNIT_2: string; // BOX / CASE
    MULT_F: string; // Conversion Factor (1 box = MULT_F pcs)
    RATE1: string;  // Price per base unit
    MRP1?: string;
    PACK?: string;
    stock?: number;
    image_url?: string;
    schemes?: Scheme[];
}

export interface CartItem {
    product: Product;
    qtyPcs: number;
    qtyBoxes: number;
    totalQty: number;    // total in base unit (pcs)
    netAmount: number;
}

interface StoreContextType {
    user: User | null;
    isLoading: boolean;
    login: (user: User, token: string) => void;
    logout: () => void;
    updateUser: (patch: Partial<User>) => void;
    cart: CartItem[];
    addToCart: (product: Product, pcs: number, boxes: number) => void;
    removeFromCart: (productCode: string) => void;
    clearCart: () => void;
    cartTotal: number;
    cartCount: number;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Hydrate from localStorage on mount
    useEffect(() => {
        const storedUser = localStorage.getItem('app_user');
        if (storedUser) {
            try { setUser(JSON.parse(storedUser)); } catch { localStorage.removeItem('app_user'); }
        }

        const storedCart = localStorage.getItem('app_cart');
        if (storedCart) {
            try { setCart(JSON.parse(storedCart)); } catch { localStorage.removeItem('app_cart'); }
        }

        setIsLoading(false);
    }, []);

    // Persist cart changes
    useEffect(() => {
        localStorage.setItem('app_cart', JSON.stringify(cart));
    }, [cart]);

    const login = (userData: User, token: string) => {
        localStorage.setItem('app_token', token);
        localStorage.setItem('app_user', JSON.stringify(userData));
        setUser(userData);
    };

    const logout = () => {
        localStorage.removeItem('app_token');
        localStorage.removeItem('app_user');
        setUser(null);
        setCart([]);
    };

    const updateUser = (patch: Partial<User>) => {
        setUser(prev => {
            if (!prev) return prev;
            const updated = { ...prev, ...patch };
            localStorage.setItem('app_user', JSON.stringify(updated));
            return updated;
        });
    };

    const addToCart = (product: Product, pcs: number, boxes: number) => {
        const conversion = parseFloat(product.MULT_F) || 1;
        const rate = parseFloat(product.RATE1) || 0;
        const totalQty = pcs + boxes * conversion;

        // Auto-calculate scheme
        let schemeDiscount = 0;
        if (product.schemes && product.schemes.length > 0) {
            const applicableSchemes = product.schemes.filter(sch => totalQty >= sch.slab1 && totalQty <= sch.slab2);
            if (applicableSchemes.length > 0) {
                schemeDiscount = applicableSchemes.reduce((sum, sch) => sum + sch.discount, 0);
            }
        }

        const grossAmount = totalQty * rate;
        const netAmount = grossAmount - (grossAmount * schemeDiscount / 100);

        setCart(prev => {
            const existing = prev.find(item => item.product.CODE === product.CODE);
            if (existing) {
                if (totalQty <= 0) return prev.filter(item => item.product.CODE !== product.CODE);
                return prev.map(item =>
                    item.product.CODE === product.CODE
                        ? { ...item, qtyPcs: pcs, qtyBoxes: boxes, totalQty, netAmount }
                        : item
                );
            }
            if (totalQty <= 0) return prev;
            return [...prev, { product, qtyPcs: pcs, qtyBoxes: boxes, totalQty, netAmount }];
        });
    };

    const removeFromCart = (productCode: string) =>
        setCart(prev => prev.filter(item => item.product.CODE !== productCode));

    const clearCart = () => setCart([]);

    const cartTotal = cart.reduce((sum, item) => sum + item.netAmount, 0);
    const cartCount = cart.reduce((sum, item) => sum + item.totalQty, 0);

    return (
        <StoreContext.Provider value={{
            user, isLoading,
            login, logout, updateUser,
            cart, addToCart, removeFromCart, clearCart,
            cartTotal, cartCount,
        }}>
            {children}
        </StoreContext.Provider>
    );
};

export const useStore = () => {
    const context = useContext(StoreContext);
    if (!context) throw new Error('useStore must be used within a StoreProvider');
    return context;
};
