/**
 * app/src/lib/api.ts
 * All API calls to /api/app on the backend.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/app';

const getToken = () => localStorage.getItem('app_token') || '';

const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
});

// ── Auth ─────────────────────────────────────────────────────────────────────

export const loginUser = async (loginId: string, password: string) => {
    const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    return data; // { success, token, user, mustChangePassword }
};

export const requestOtp = async (loginId: string) => {
    const res = await fetch(`${API_URL}/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to request OTP');
    return data;
};

export const verifyOtp = async (loginId: string, otp: string) => {
    const res = await fetch(`${API_URL}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, otp }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to verify OTP');
    return data;
};

export const logoutUser = async () => {
    try {
        await fetch(`${API_URL}/logout`, {
            method: 'POST',
            headers: authHeaders(),
        });
    } catch (error) {
        console.error('Logout error:', error);
    }
    localStorage.removeItem('app_token');
    localStorage.removeItem('app_user');
};

export const fetchMe = async () => {
    const res = await fetch(`${API_URL}/me`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch user');
    return res.json();
};

export const changePassword = async (currentPassword: string, newPassword: string) => {
    const res = await fetch(`${API_URL}/change-password`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to change password');
    return data;
};

export const getMe = async () => {
    const res = await fetch(`${API_URL}/me`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Session expired');
    return res.json();
};

export const fetchActiveSchemes = async () => {
    const res = await fetch(`${API_URL}/schemes/active`);
    if (!res.ok) throw new Error('Failed to fetch schemes');
    return res.json();
};

// ── In-app promotions ────────────────────────────────────────────────────────

export interface Promotion {
    id: number;
    title: string;
    message: string;
    mediaUrl: string;
    actionUrl: string;
    ctaText: string;
    frequency: 'ONCE' | 'HOURLY' | 'EVERY_PAGE';
    startDate: string | null;
    endDate: string | null;
}

export const fetchActivePromotions = async (): Promise<Promotion[]> => {
    const res = await fetch(`${API_URL}/promotions/active`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch promotions');
    return res.json();
};

// ── Festival themes ──────────────────────────────────────────────────────────

export type FestiveEffect = 'rockets' | 'chakri' | 'lights' | 'none';

export interface FestiveVariant {
    label: string;
    bgFrom: string;
    bgTo: string;
    accent: string;
    effect: FestiveEffect;
}

export interface FestivalTheme {
    id: number;
    name: string;
    festival: string;
    startAt: string;
    endAt: string;
    variants: FestiveVariant[];
    allowSwitch: boolean;
    effectsEnabled: boolean;
}

/** The festival theme live right now, or null (public endpoint). */
export const fetchActiveFestivalTheme = async (): Promise<FestivalTheme | null> => {
    const res = await fetch(`${API_URL}/festival-theme/active`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch festival theme');
    return (await res.json()).theme ?? null;
};

// ── Products ─────────────────────────────────────────────────────────────────

export const fetchProducts = async (page = 1, limit = 20, query = '', brand = '', sort = '', codes = '') => {
    const q = query ? `&q=${encodeURIComponent(query)}` : '';
    const b = brand ? `&brand=${encodeURIComponent(brand)}` : '';
    const s = sort ? `&sort=${encodeURIComponent(sort)}` : '';
    const c = codes ? `&codes=${encodeURIComponent(codes)}` : '';
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/products?page=${page}&limit=${limit}${q}${b}${s}${c}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch products');
    return res.json();
};

export const fetchBrands = async () => {
    const res = await fetch(`${API_URL}/brands?t=${Date.now()}`);
    if (!res.ok) throw new Error('Failed to fetch brands');
    return res.json();
};

/**
 * WhatsApp deep-link auto-login.
 * Called when /product/:code?phone=XXXXXXXXXX is opened.
 * The server matches the phone against CMPL.json and issues a session token.
 */
export const identifyByPhone = async (phone: string) => {
    const res = await fetch(`${API_URL}/identify-by-phone?phone=${encodeURIComponent(phone)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Identification failed');
    return data; // { success, token, user, mustChangePassword }
};

export const fetchLedger = async () => {
    const res = await fetch(`${API_URL}/ledger`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch ledger');
    return res.json();
};

// ── Profile page ─────────────────────────────────────────────────────────────

export interface UnpaidBill {
    date: string;
    series: string;
    billNo: string;
    label: string;
    amount: number;
    pending: number;
    ageDays: number;
    dueDays: number;
    /** null when no credit days are set on the bill or the party */
    overdueDays: number | null;
}

export interface ProfileContact {
    name: string;
    mobile: string;
    role: string;
}

export interface ProfilePrefs {
    orderUpdates: boolean;
    paymentReminders: boolean;
    schemeAlerts: boolean;
    contacts: ProfileContact[];
}

export interface ProfileSummary {
    details: { gst: string; fssai: string; pan: string; email: string; address: string; pincode: string };
    credit: { limit: number; days: number };
    balance: { amount: number; type: string };
    outstanding: { bills: UnpaidBill[]; total: number };
    location: { latitude: number; longitude: number; capturedAt: string | null } | null;
    prefs: ProfilePrefs;
}

export interface LedgerEntry {
    date: string;
    narration: string;
    book: string;
    cr: number;
    dr: number;
    amount: number;
    type: 'CR' | 'DR';
    series: string;
    billNo: string;
}

export interface DeviceSession {
    id: number;
    device: string;
    createdAt: string;
    lastSeen: string | null;
    current: boolean;
}

const profileCall = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${API_URL}/profile/${path}`, { ...init, headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
};

export const fetchProfileSummary = (): Promise<ProfileSummary> => profileCall('summary');

/** Ledger of one financial year ("2627"); the current year when fy is omitted. */
export const fetchProfileLedger = (fy = ''): Promise<{ fy: string; years: string[]; data: LedgerEntry[] }> =>
    profileCall(`ledger${fy ? `?fy=${encodeURIComponent(fy)}` : ''}`);

export const saveProfilePrefs = (patch: Partial<ProfilePrefs>): Promise<{ prefs: ProfilePrefs }> =>
    profileCall('prefs', { method: 'PUT', body: JSON.stringify(patch) });

export const fetchSessions = (): Promise<DeviceSession[]> => profileCall('sessions');

export const logoutOtherDevices = (): Promise<{ removed: number }> =>
    profileCall('sessions/logout-others', { method: 'POST' });

/** Issue / detail-change / location request; lands in the admin's messages. */
export const sendProfileRequest = (body: {
    type: 'issue' | 'change' | 'location';
    subject?: string;
    details: string;
    invoice?: string;
    photo?: string | null;
}) => profileCall('request', { method: 'POST', body: JSON.stringify(body) });

// ── Orders ───────────────────────────────────────────────────────────────────

export const getOrders = async () => {
    const res = await fetch(`${API_URL}/orders`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch orders');
    return res.json();
};

export const getPastInvoices = async () => {
    const res = await fetch(`${API_URL}/past-invoices`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch past invoices');
    return res.json();
};

export const getInvoiceData = async (series: string, billNo: string | number) => {
    const BASE_URL = API_URL.replace('/api/app', '');
    const res = await fetch(`${BASE_URL}/api/generate-pdf/dbf-invoice-data/${series}/${billNo}`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch invoice data');
    return res.json();
};

export const placeOrder = async (orderData: {
    items: any[];
    totalAmount: number;
    notes?: string;
    paymentMode?: string | null;
}) => {
    const res = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(orderData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to place order');
    return data;
};

export const updateOrder = async (orderId: string, orderData: {
    items: any[];
    totalAmount: number;
    paymentMode?: string | null;
    notes?: string;
}) => {
    const res = await fetch(`${API_URL}/orders/${orderId}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(orderData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update order');
    return data;
};

export const getImageUrl = (url: string) => { if (!url) return url; if (url.startsWith('http') || url.startsWith('data:')) return url; const base = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api/app', '') : 'http://localhost:8000'; return base + url; };
