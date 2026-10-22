import constants from '../../../constants';

export class GstApiError extends Error {
  needAuth: boolean;
  data: any;
  constructor(message: string, needAuth: boolean, data: any) {
    super(message);
    this.needAuth = needAuth;
    this.data = data;
  }
}

// Calls /api/reports/gst/<path>. Throws GstApiError with the server / GST portal message on failure.
export async function gstApi<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(`${constants.baseURL}/api/reports/gst${path}`, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    if (res.status === 401 || data?.needAuth) {
      window.dispatchEvent(new Event('gst-auth-changed'));
    }
    throw new GstApiError(data?.message || `Request failed (HTTP ${res.status})`, !!data?.needAuth || res.status === 401, data);
  }
  return data as T;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// MMYYYY of the previous month (default return period)
export const previousPeriod = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
};

export const isValidPeriod = (p: string) => /^(0[1-9]|1[0-2])20\d\d$/.test(p);

export const fmtNum = (v: unknown, digits = 2) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '';
};

export const downloadText = (name: string, text: string, type = 'text/csv;charset=utf-8;') => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// GSTIN -> "PARTY NAME, PLACE", fetched once per page load and shared by all GST sections
let partyNamesPromise: Promise<Record<string, string>> | null = null;
export const loadPartyNames = () => {
  if (!partyNamesPromise) {
    partyNamesPromise = gstApi<Record<string, string>>('/party-names').catch(() => {
      partyNamesPromise = null; // retry on next use
      return {};
    });
  }
  return partyNamesPromise;
};
