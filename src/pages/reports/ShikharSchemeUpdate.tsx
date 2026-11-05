import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import useAuth from '../../hooks/useAuth';
import useActivityTracker from '../../hooks/useActivityTracker';
import constants from '../../constants';

interface SchemePreview {
    id: string;
    basepack_code: string;
    pmpl_code: string;
    product_desc: string;
    discount: number;
    activitycode: number;
    scheme_desc: string;
    slab_start: number;
    slab_end: number;
    segment: Segment;
}

// Retail / wholesale / both: written to SCHDTL.CUST_CAT so billing applies the row only to that party type
type Segment = 'RT' | 'WS' | 'BOTH';
const SEGMENT_LABEL: Record<Segment, string> = { RT: 'Retail', WS: 'Wholesale', BOTH: 'Both' };
const SEGMENT_STYLE: Record<Segment, string> = {
    RT: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
    WS: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    BOTH: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
};

// Saved Shikhar login per side (the server never sends the cookie back)
type Side = 'retail' | 'wholesale';
interface SessionInfo {
    outlet?: string;
    hulid?: string;
    saved_at: string | null;
    error?: string;
}
const SIDE_INFO: Record<Side, { title: string; hint: string; style: string }> = {
    retail: { title: 'Retail', hint: 'Log in as a retail shop, e.g. Sandeep Kirana Chapara', style: 'border-sky-200 dark:border-sky-800' },
    wholesale: { title: 'Wholesale', hint: 'Log in as a wholesaler, e.g. Hanif Traders, Chabi', style: 'border-amber-200 dark:border-amber-800' }
};

// Shikhar schemes SCHDTL can't hold (rupee-based); shown so they aren't missed
interface NotImportedScheme {
    activitycode: number;
    scheme_desc: string;
    reason: string;
    discount: number;
    matched_products: number;
}

const ShikharSchemeUpdate: React.FC = () => {
    const { user } = useAuth();
    const { logActivity } = useActivityTracker();
    
    const [series, setSeries] = useState('S');
    const [billNo, setBillNo] = useState('');
    
    const [date, setDate] = useState('');
    const [validFrom, setValidFrom] = useState('');
    const [validTo, setValidTo] = useState('');
    
    const [schemes, setSchemes] = useState<SchemePreview[]>([]);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [loadingImport, setLoadingImport] = useState(false);
    const [loadingScrape, setLoadingScrape] = useState(false);
    const [stats, setStats] = useState({ total_products: 0, matched_products: 0 });
    const [notImported, setNotImported] = useState<NotImportedScheme[]>([]);
    const [outlets, setOutlets] = useState<Partial<Record<Side, { name: string; hulid: string }>> | null>(null);
    const [scrapedAt, setScrapedAt] = useState<string | null>(null);

    // Cookie update state: one Shikhar login per side
    const [showCookiePanel, setShowCookiePanel] = useState(false);
    const [cookieValues, setCookieValues] = useState<Record<Side, string>>({ retail: '', wholesale: '' });
    const [savingSide, setSavingSide] = useState<Side | null>(null);
    const [sessions, setSessions] = useState<Record<Side, SessionInfo | null> | null>(null);

    const loadSessions = async () => {
        try {
            const response = await fetch(`${constants.baseURL}/api/schemes/sessions`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const data = await response.json().catch(() => null);
            if (data?.success) setSessions(data.sessions);
        } catch (error) {
            console.error('Error loading Shikhar sessions:', error);
        }
    };

    useEffect(() => {
        loadSessions();
    }, []);

    useEffect(() => {
        const today = new Date();
        const formatDate = (d: Date) => {
            const year = d.getFullYear();
            const month = (d.getMonth() + 1).toString().padStart(2, '0');
            const day = d.getDate().toString().padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        const nextMonth = new Date(today);
        nextMonth.setMonth(today.getMonth() + 1);

        setDate(formatDate(today));
        setValidFrom(formatDate(today));
        setValidTo(formatDate(nextMonth));

        const fetchNextBillNo = async () => {
            try {
                const response = await fetch(`${constants.baseURL}/api/schemes/next-bill-no`, {
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.nextBillNo) {
                        setBillNo(data.nextBillNo.toString());
                    }
                }
            } catch (error) {
                console.error('Error fetching next bill no:', error);
            }
        };

        fetchNextBillNo();
    }, []);

    const handleLoadPreview = async () => {
        setLoadingPreview(true);
        setSchemes([]);
        setNotImported([]);
        try {
            const response = await fetch(`${constants.baseURL}/api/schemes/preview`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();
            if (data.success) {
                setSchemes(data.schemes.map((s: SchemePreview) => ({ ...s, segment: s.segment || 'RT' })));
                setStats({ total_products: data.total_products, matched_products: data.matched_products });
                setNotImported(data.not_imported || []);
                setOutlets(data.outlets || null);
                setScrapedAt(data.scraped_at || null);
                if (data.schemes.length === 0) {
                    toast.info('No schemes found mapping to PMPL products.');
                } else {
                    toast.success(`Loaded ${data.schemes.length} schemes.`);
                }
            } else {
                toast.error(data.message || 'Failed to load preview');
            }
        } catch (error) {
            console.error('Error loading scheme preview:', error);
            toast.error('Error loading scheme preview. Please try again.');
        } finally {
            setLoadingPreview(false);
        }
    };

    const handleDownloadSchemes = async () => {
        setLoadingScrape(true);
        toast.info('Downloading retail and wholesale schemes from Shikhar. This takes about half a minute...', { autoClose: 4000 });
        try {
            const response = await fetch(`${constants.baseURL}/api/schemes/scrape`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            const data = await response.json().catch(() => null);
            if (!response.ok || !data) {
                throw new Error(data?.message || `HTTP error! Status: ${response.status}`);
            }

            if (data.success) {
                toast[data.missing?.length ? 'warning' : 'success'](data.message, { autoClose: 8000 });
                logActivity({
                    page: 'Shikhar Scheme Update',
                    action: 'Downloaded retail + wholesale schemes',
                    duration: 0
                });
                // Auto-load preview
                handleLoadPreview();
            } else {
                toast.error(data.message || 'Failed to download schemes');
            }
        } catch (error) {
            console.error('Error downloading schemes:', error);
            toast.error(error instanceof Error && error.message ? error.message : 'Error downloading schemes. Please try again.', { autoClose: 10000 });
        } finally {
            setLoadingScrape(false);
        }
    };

    const handleUpdateCookies = async (side: Side) => {
        const cookieValue = cookieValues[side].trim();
        if (!cookieValue) {
            toast.warning('Please paste the cookie value first.');
            return;
        }
        setSavingSide(side);
        try {
            const response = await fetch(`${constants.baseURL}/api/schemes/update-cookies`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ side, cookieValue })
            });
            const data = await response.json().catch(() => null);
            if (data?.success) {
                toast.success(data.message);
                setCookieValues(prev => ({ ...prev, [side]: '' }));
                loadSessions();
            } else {
                toast.error(data?.message || 'Failed to save cookie');
            }
        } catch (error) {
            console.error('Error updating cookies:', error);
            toast.error('Error saving cookie. Please try again.');
        } finally {
            setSavingSide(null);
        }
    };

    const setSegment = (id: string, segment: Segment) =>
        setSchemes(prev => prev.map(s => (s.id === id ? { ...s, segment } : s)));
    const setAllSegments = (segment: Segment) =>
        setSchemes(prev => prev.map(s => ({ ...s, segment })));

    const handleConfirmImport = async () => {
        if (!series || !billNo || !date || !validFrom || !validTo) {
            toast.warning('Please fill in all Master Header Information fields.');
            return;
        }

        if (schemes.length === 0) {
            toast.warning('No schemes to import. Please load preview first.');
            return;
        }

        const count = (seg: Segment) => schemes.filter(s => s.segment === seg).length;
        if (!window.confirm(
            `Append ${schemes.length} schemes to SCHDTL.dbf?\n\n` +
            `Retail only: ${count('RT')}\nWholesale only: ${count('WS')}\nBoth: ${count('BOTH')}`
        )) {
            return;
        }

        setLoadingImport(true);
        try {
            const payload = {
                schemes,
                series,
                billNo,
                date,
                validFrom,
                validTo
            };

            const response = await fetch(`${constants.baseURL}/api/schemes/import`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();
            if (data.success) {
                toast.success(data.message);
                logActivity({
                    page: 'Shikhar Scheme Update',
                    action: 'Imported Schemes to DBF',
                    duration: 0
                });
                // Clear state on success
                setSchemes([]);
                setBillNo('');
            } else {
                toast.error(data.message || 'Failed to import schemes');
            }
        } catch (error) {
            console.error('Error importing schemes:', error);
            toast.error('Error importing schemes. Please try again.');
        } finally {
            setLoadingImport(false);
        }
    };

    return (
        <div className="container mx-auto p-4 max-w-7xl">
            <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Shikhar Scheme Update Utility</h1>

            {/* Cookie Update Panel */}
            <div className="bg-white dark:bg-gray-800 rounded shadow mb-4 border border-gray-200 dark:border-gray-700 overflow-hidden">
                <button
                    onClick={() => setShowCookiePanel(!showCookiePanel)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                        <span className="font-medium text-gray-800 dark:text-white text-sm">Shikhar Session Cookies: Retail | Wholesale</span>
                        {sessions && (!sessions.retail?.outlet || !sessions.wholesale?.outlet) ? (
                            <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 rounded-full">
                                {!sessions.retail?.outlet && !sessions.wholesale?.outlet ? 'No cookies saved' : `${!sessions.retail?.outlet ? 'Retail' : 'Wholesale'} cookie missing`}
                            </span>
                        ) : (
                            <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full">Update when download fails</span>
                        )}
                    </div>
                    <svg className={`w-4 h-4 text-gray-500 transition-transform ${showCookiePanel ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>

                {showCookiePanel && (
                    <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-700 space-y-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Open <strong>shikhar.hulcd.com</strong>, log in as the outlet → DevTools → Application → Cookies → copy the <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">data</code> cookie value and paste it under that outlet's side.
                            Download Schemes fetches both outlets and sets each scheme's Party Type from where it is offered.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(Object.keys(SIDE_INFO) as Side[]).map(side => {
                                const info = SIDE_INFO[side];
                                const saved = sessions?.[side];
                                const busy = savingSide === side;
                                return (
                                    <div key={side} className={`border rounded p-3 space-y-2 ${info.style}`}>
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-semibold text-gray-900 dark:text-white">{info.title}</h3>
                                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SEGMENT_STYLE[side === 'retail' ? 'RT' : 'WS']}`}>
                                                {side === 'retail' ? 'CUST_CAT R' : 'CUST_CAT W'}
                                            </span>
                                        </div>
                                        <div className="text-xs text-gray-600 dark:text-gray-300 min-h-[2rem]">
                                            {saved?.outlet ? (
                                                <>Saved: <b>{saved.outlet}</b> ({saved.hulid})
                                                    {saved.saved_at ? `, ${new Date(saved.saved_at).toLocaleString('en-IN')}` : ''}</>
                                            ) : saved?.error ? (
                                                <span className="text-red-600">Saved cookie is invalid: {saved.error}</span>
                                            ) : (
                                                <span className="text-red-600">No cookie saved. {info.hint}.</span>
                                            )}
                                        </div>
                                        <textarea
                                            rows={3}
                                            value={cookieValues[side]}
                                            onChange={(e) => setCookieValues(prev => ({ ...prev, [side]: e.target.value }))}
                                            placeholder={`Paste the ${info.title.toLowerCase()} outlet's "data" cookie (eyJtZXNzYWdlY29kZSI6...)`}
                                            aria-label={`${info.title} data cookie`}
                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-mono resize-y"
                                        />
                                        <button
                                            onClick={() => handleUpdateCookies(side)}
                                            disabled={savingSide !== null || !cookieValues[side].trim()}
                                            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded font-medium text-sm disabled:bg-gray-400 disabled:cursor-not-allowed"
                                        >
                                            {busy ? 'Checking & saving...' : `Save ${info.title} Cookie`}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-white dark:bg-gray-800 p-4 rounded shadow mb-6 space-y-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white border-b pb-2">Master Header Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Series</label>
                        <input
                            type="text"
                            value={series}
                            onChange={(e) => setSeries(e.target.value)}
                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Scheme No (BILL)</label>
                        <input
                            type="number"
                            value={billNo}
                            onChange={(e) => setBillNo(e.target.value)}
                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valid From</label>
                        <input
                            type="date"
                            value={validFrom}
                            onChange={(e) => setValidFrom(e.target.value)}
                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valid To</label>
                        <input
                            type="date"
                            value={validTo}
                            onChange={(e) => setValidTo(e.target.value)}
                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                </div>
                
                <div className="flex justify-between items-center mt-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        {schemes.length > 0 && <span>Previewed Products: {stats.total_products} | Matched Products in PMPL: {stats.matched_products}</span>}
                        {schemes.length > 0 && (
                            <div className="mt-1">
                                {outlets
                                    ? <>Downloaded as Retail: <b>{outlets.retail?.name || 'not set'}</b> | Wholesale: <b>{outlets.wholesale?.name || 'not set'}</b></>
                                    : <>Old single-outlet download (retail only). Click Download Schemes to get both.</>}
                                {scrapedAt ? ` on ${new Date(scrapedAt).toLocaleString('en-IN')}` : ''}.
                            </div>
                        )}
                        {schemes.length > 0 && (
                            <label className="mt-1 flex items-center gap-2">
                                Set Party Type for all rows:
                                <select
                                    value=""
                                    onChange={(e) => e.target.value && setAllSegments(e.target.value as Segment)}
                                    className="p-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    <option value="">Choose…</option>
                                    <option value="RT">Retail</option>
                                    <option value="WS">Wholesale</option>
                                    <option value="BOTH">Both</option>
                                </select>
                            </label>
                        )}
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                        <button
                            onClick={handleDownloadSchemes}
                            disabled={loadingScrape || loadingImport || loadingPreview}
                            className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium flex items-center justify-center min-w-[170px]"
                        >
                            {loadingScrape ? (
                                <span className="flex items-center gap-2">
                                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Downloading...
                                </span>
                            ) : 'Download Schemes'}
                        </button>
                        <button
                            onClick={handleLoadPreview}
                            disabled={loadingPreview || loadingImport || loadingScrape}
                            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed min-w-[130px]"
                        >
                            {loadingPreview ? 'Loading Preview...' : 'Load Preview'}
                        </button>
                        <button
                            onClick={handleConfirmImport}
                            disabled={schemes.length === 0 || loadingImport || loadingPreview || loadingScrape}
                            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium min-w-[140px]"
                        >
                            {loadingImport ? 'Importing...' : 'Confirm Import'}
                        </button>
                    </div>
                </div>
            </div>

            {schemes.length > 0 && (
                <div className="bg-white dark:bg-gray-800 shadow rounded overflow-hidden">
                     <div className="overflow-x-auto max-h-[600px]">
                        <table className="min-w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600">
                            <thead className="sticky top-0 z-10 shadow">
                                <tr className="bg-gray-100 dark:bg-gray-700">
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white">Basepack (all.json)</th>
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white">CODE (PMPL)</th>
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white">Product Description</th>
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white">Scheme Desc</th>
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white">Party Type</th>
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">Discount %</th>
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">Slab Start</th>
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">Slab End</th>
                                </tr>
                            </thead>
                            <tbody>
                                {schemes.map((scheme, idx) => (
                                    <tr key={`${scheme.id}-${idx}`} className="hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                                        <td className="py-2 px-3 text-gray-900 dark:text-white">{scheme.basepack_code}</td>
                                        <td className="py-2 px-3 text-gray-900 dark:text-white font-medium">{scheme.pmpl_code}</td>
                                        <td className="py-2 px-3 text-gray-900 dark:text-white">{scheme.product_desc}</td>
                                        <td className="py-2 px-3 text-gray-900 dark:text-white text-sm">{scheme.scheme_desc}</td>
                                        <td className="py-2 px-3">
                                            <select
                                                value={scheme.segment}
                                                onChange={(e) => setSegment(scheme.id, e.target.value as Segment)}
                                                className={`px-2 py-0.5 rounded text-xs font-medium border-0 cursor-pointer ${SEGMENT_STYLE[scheme.segment]}`}
                                                aria-label="Party type"
                                            >
                                                {(Object.keys(SEGMENT_LABEL) as Segment[]).map(seg => (
                                                    <option key={seg} value={seg}>{SEGMENT_LABEL[seg]}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="py-2 px-3 text-gray-900 dark:text-white text-right">{scheme.discount}</td>
                                        <td className="py-2 px-3 text-gray-900 dark:text-white text-right">{scheme.slab_start}</td>
                                        <td className="py-2 px-3 text-gray-900 dark:text-white text-right">
                                            {scheme.slab_end >= 10000 ? 'No Limit' : scheme.slab_end}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {notImported.length > 0 && (
                <div className="bg-white dark:bg-gray-800 shadow rounded overflow-hidden mt-4">
                    <div className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
                        <b>Not imported ({notImported.length})</b>: rupee-based schemes. SCHDTL only holds "% off for a quantity slab", so apply these by hand.
                    </div>
                    <div className="overflow-x-auto max-h-[300px]">
                        <table className="min-w-full text-sm border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                            <thead className="sticky top-0 bg-gray-100 dark:bg-gray-700">
                                <tr>
                                    <th className="py-2 px-3 text-left">Activity</th>
                                    <th className="py-2 px-3 text-left">Scheme Desc</th>
                                    <th className="py-2 px-3 text-left">Reason</th>
                                    <th className="py-2 px-3 text-right">Matched PMPL Codes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {notImported.map(s => (
                                    <tr key={`${s.activitycode}-${s.scheme_desc}`} className="border-b border-gray-200 dark:border-gray-600">
                                        <td className="py-2 px-3">{s.activitycode}</td>
                                        <td className="py-2 px-3">{s.scheme_desc}</td>
                                        <td className="py-2 px-3">{s.reason}</td>
                                        <td className="py-2 px-3 text-right">{s.matched_products}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ShikharSchemeUpdate;
