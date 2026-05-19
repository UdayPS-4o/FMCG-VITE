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

    // Cookie update state
    const [showCookiePanel, setShowCookiePanel] = useState(false);
    const [cookieValue, setCookieValue] = useState('');
    const [hulidValue, setHulidValue] = useState('');
    const [loadingCookieUpdate, setLoadingCookieUpdate] = useState(false);

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
                setSchemes(data.schemes);
                setStats({ total_products: data.total_products, matched_products: data.matched_products });
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
        toast.info('Starting scheme download. This may take a few seconds...', { autoClose: 4000 });
        try {
            const response = await fetch(`${constants.baseURL}/api/schemes/scrape`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();
            if (data.success) {
                toast.success('Schemes downloaded successfully! Automatically loading preview...');
                logActivity({
                    page: 'Shikhar Scheme Update',
                    action: 'Scraped Schemes via Puppeteer',
                    duration: 0
                });
                // Auto-load preview
                handleLoadPreview();
            } else {
                toast.error(data.message || 'Failed to download schemes');
            }
        } catch (error) {
            console.error('Error downloading schemes:', error);
            toast.error('Error downloading schemes. Please try again.');
        } finally {
            setLoadingScrape(false);
        }
    };

    const handleUpdateCookies = async () => {
        if (!cookieValue.trim()) {
            toast.warning('Please paste the cookie value first.');
            return;
        }
        setLoadingCookieUpdate(true);
        try {
            const response = await fetch(`${constants.baseURL}/api/schemes/update-cookies`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ cookieValue: cookieValue.trim(), hulid: hulidValue.trim() || undefined })
            });
            const data = await response.json();
            if (data.success) {
                toast.success(data.message);
                setCookieValue('');
                setHulidValue('');
                setShowCookiePanel(false);
            } else {
                toast.error(data.message || 'Failed to update cookies');
            }
        } catch (error) {
            console.error('Error updating cookies:', error);
            toast.error('Error updating cookies. Please try again.');
        } finally {
            setLoadingCookieUpdate(false);
        }
    };

    const handleConfirmImport = async () => {
        if (!series || !billNo || !date || !validFrom || !validTo) {
            toast.warning('Please fill in all Master Header Information fields.');
            return;
        }

        if (schemes.length === 0) {
            toast.warning('No schemes to import. Please load preview first.');
            return;
        }

        if (!window.confirm(`Are you sure you want to append ${schemes.length} schemes to SCHDTL.dbf?`)) {
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
                        <span className="font-medium text-gray-800 dark:text-white text-sm">Update Shikhar Session Cookie</span>
                        <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full">Update when scrape fails</span>
                    </div>
                    <svg className={`w-4 h-4 text-gray-500 transition-transform ${showCookiePanel ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>

                {showCookiePanel && (
                    <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-700 space-y-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Open <strong>shikhar.hulcd.com</strong> in browser → DevTools → Application → Cookies → copy the <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">data</code> cookie value and paste below.
                        </p>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">"data" Cookie Value <span className="text-red-500">*</span></label>
                            <textarea
                                rows={3}
                                value={cookieValue}
                                onChange={(e) => setCookieValue(e.target.value)}
                                placeholder="eyJtZXNzYWdlY29kZSI6MjAwLCJtZXNzYWdlIjoiT1RQ..."
                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-xs font-mono resize-y"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">HUL ID (Optional — updates hulid header)</label>
                            <input
                                type="text"
                                value={hulidValue}
                                onChange={(e) => setHulidValue(e.target.value)}
                                placeholder="HUL-102938P359"
                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            />
                        </div>
                        <button
                            onClick={handleUpdateCookies}
                            disabled={loadingCookieUpdate || !cookieValue.trim()}
                            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded font-medium text-sm disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {loadingCookieUpdate ? (
                                <><svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Updating...</>
                            ) : (
                                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Save Cookie &amp; Clear Cache</>
                            )}
                        </button>
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
        </div>
    );
};

export default ShikharSchemeUpdate;
