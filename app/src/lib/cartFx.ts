// Cart "premium moments": fly-to-cart, scheme unlocked celebration, haptics.
// Cards call notifyCartChange(); BottomNav and CartFxLayer listen to the window events below.
import type { Product } from '../context/StoreContext';
import { getImageUrl } from './api';

export const CARTFX_BUMP = 'cartfx:bump';
export const CARTFX_ADDED = 'cartfx:added';
export const CARTFX_SCHEME = 'cartfx:scheme';

export interface CartFxAddedDetail { name: string; image?: string; title?: string }
export interface CartFxSchemeDetail { name: string; discount: number; savings: number }

const emit = <T,>(name: string, detail?: T) => window.dispatchEvent(new CustomEvent(name, { detail }));

const vibrate = (pattern: number | number[]) => {
    try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
};

type Slab = { slab1: number; slab2: number; discount: number };

// SLAB2 at or above this means "no upper limit"
const NO_LIMIT = 1_000_000;

/** A slab applies only while qty is inside slab1..slab2. Steps of one ladder (3-5, 6+) don't stack. */
export const inSlab = (s: Slab, qty: number) => qty >= s.slab1 && qty <= (s.slab2 || Infinity);

/** "3-5" or "6+" for badges */
export const slabRange = (s: Slab) => (!s.slab2 || s.slab2 >= NO_LIMIT ? `${s.slab1}+` : `${s.slab1}-${s.slab2}`);

/** Total scheme % at this quantity; same rule as billing and the cart (separate schemes, e.g. base + top-up, add up). */
export const schemeDiscountFor = (product: Product, qty: number) =>
    product.schemes?.reduce((sum, s) => (inSlab(s, qty) ? sum + s.discount : sum), 0) ?? 0;

/** The smallest quantity above qty that gives a higher total %, and that total. */
export const nextSchemeFor = (product: Product, qty: number) => {
    const current = schemeDiscountFor(product, qty);
    const steps = [...new Set((product.schemes ?? []).map(s => s.slab1))].filter(q => q > qty).sort((a, b) => a - b);
    for (const step of steps) {
        const discount = schemeDiscountFor(product, step);
        if (discount > current) return { slab1: step, discount };
    }
    return undefined;
};

/** Animate a copy of the product photo from the card into the bottom-nav cart icon. */
export function flyToCart(fromEl: Element | null | undefined, imageUrl?: string) {
    const target = document.querySelector('[data-cart-icon]');
    if (!fromEl || !target) { emit(CARTFX_BUMP); return; }

    const source = fromEl.querySelector('img') ?? fromEl;
    const a = source.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const size = Math.round(Math.min(84, Math.max(52, a.width * 0.6)));

    const flyer = document.createElement('div');
    Object.assign(flyer.style, {
        position: 'fixed',
        left: `${a.left + a.width / 2 - size / 2}px`,
        top: `${a.top + a.height / 2 - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        zIndex: '9999',
        pointerEvents: 'none',
        borderRadius: '16px',
        background: '#fff',
        boxShadow: '0 10px 25px rgba(0,0,0,.25)',
        padding: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${size / 2}px`,
    } as Partial<CSSStyleDeclaration>);
    if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'contain' });
        flyer.appendChild(img);
    } else {
        flyer.textContent = '📦';
    }
    document.body.appendChild(flyer);

    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const anim = flyer.animate([
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 130}px) scale(.8) rotate(-12deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(.18) rotate(8deg)`, opacity: 0.7 },
    ], { duration: 820, easing: 'cubic-bezier(.45,.05,.55,.95)' });
    const done = () => { flyer.remove(); emit(CARTFX_BUMP); };
    anim.onfinish = done;
    anim.oncancel = done;
}

/** Reorder: several photos fly from the same spot one after another, then one toast. */
export function flyManyToCart(fromEl: Element | null | undefined, images: (string | undefined)[], title: string) {
    vibrate(12);
    images.forEach((img, i) => setTimeout(() => flyToCart(fromEl, img), i * 260));
    setTimeout(() => emit<CartFxAddedDetail>(CARTFX_ADDED, { name: '', image: images.find(Boolean), title }), images.length * 260 + 500);
}

/** Small confetti burst at a viewport point. */
export function confettiAt(x: number, y: number) {
    const colors = ['#f97316', '#10b981', '#6366f1', '#facc15', '#ec4899'];
    for (let i = 0; i < 26; i++) {
        const c = document.createElement('div');
        Object.assign(c.style, {
            position: 'fixed', left: `${x}px`, top: `${y}px`, width: '8px', height: '12px', borderRadius: '2px',
            background: colors[i % colors.length], zIndex: '9999', pointerEvents: 'none',
        } as Partial<CSSStyleDeclaration>);
        document.body.appendChild(c);
        const ang = Math.random() * Math.PI * 2;
        const dist = 60 + Math.random() * 90;
        const anim = c.animate([
            { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
            { transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist - 40}px) rotate(${Math.random() * 540}deg)`, opacity: 1, offset: 0.6 },
            { transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist + 80}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
        ], { duration: 1300, easing: 'cubic-bezier(.2,.7,.4,1)' });
        anim.onfinish = () => c.remove();
        anim.oncancel = () => c.remove();
    }
}

/**
 * Call after a card changes its cart quantity.
 * - first add (0 → n): photo flies to cart + "Added to cart" toast
 * - crossing a scheme slab upward: confetti + "X% OFF unlocked" toast
 */
export function notifyCartChange({ product, prevQty, newQty, anchor }: {
    product: Product;
    prevQty: number;
    newQty: number;
    anchor?: Element | null;
}) {
    if (newQty <= prevQty) return;
    vibrate(12);

    const image = product.image_url ? getImageUrl(product.image_url) : undefined;
    if (prevQty <= 0) {
        flyToCart(anchor, image);
        emit<CartFxAddedDetail>(CARTFX_ADDED, { name: product.PRODUCT, image });
    }

    const before = schemeDiscountFor(product, prevQty);
    const after = schemeDiscountFor(product, newQty);
    if (after > before) {
        const r = anchor?.getBoundingClientRect();
        confettiAt(r ? r.left + r.width / 2 : window.innerWidth / 2, r ? r.top + r.height * 0.35 : window.innerHeight / 2);
        vibrate([20, 40, 20]);
        const rate = parseFloat(product.RATE1 || '0') || 0;
        emit<CartFxSchemeDetail>(CARTFX_SCHEME, { name: product.PRODUCT, discount: after, savings: newQty * rate * after / 100 });
    }
}
