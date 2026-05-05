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

// ── Products ─────────────────────────────────────────────────────────────────

export const fetchProducts = async (page = 1, limit = 20, query = '', brand = '', sort = '') => {
    const q = query ? `&q=${encodeURIComponent(query)}` : '';
    const b = brand ? `&brand=${encodeURIComponent(brand)}` : '';
    const s = sort ? `&sort=${encodeURIComponent(sort)}` : '';
    const res = await fetch(`${API_URL}/products?page=${page}&limit=${limit}${q}${b}${s}`);
    if (!res.ok) throw new Error('Failed to fetch products');
    return res.json();
};

export const fetchBrands = async () => {
    const res = await fetch(`${API_URL}/brands?t=${Date.now()}`);
    if (!res.ok) throw new Error('Failed to fetch brands');
    return res.json();
};

export const fetchLedger = async () => {
    const res = await fetch(`${API_URL}/ledger`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch ledger');
    return res.json();
};

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

export const getImageUrl = (url: string) => { if (!url) return url; if (url.startsWith('http') || url.startsWith('data:')) return url; const base = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api/app', '') : 'http://localhost:8000'; return base + url; };
