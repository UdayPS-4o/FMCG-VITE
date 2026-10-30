import React, { useState, useEffect, useRef } from 'react';
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
    activitycode: string;
    scheme_desc: string;
    slab_start: number;
    slab_end: number;
    segment: Segment;
    scheme_group: string;
}

type Segment = 'RT' | 'WS' | 'BOTH';

// Bizom schemes SCHDTL can't hold (invoice value / QPS / free goods); shown so they aren't missed
interface NotImportedScheme {
    activitycode: string;
    scheme_desc: string;
    segment: Segment;
    reason: string;
    min_amount: number;
    discount: number;
    save_rupees: number;
    matched_products: number;
}

const SEGMENT_LABEL: Record<Segment, string> = { RT: 'Retail', WS: 'Wholesale', BOTH: 'Both' };
const SEGMENT_STYLE: Record<Segment, string> = {
    RT: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
    WS: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    BOTH: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
};

const SegmentBadge: React.FC<{ segment: Segment }> = ({ segment }) => (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SEGMENT_STYLE[segment] || SEGMENT_STYLE.BOTH}`}>
        {SEGMENT_LABEL[segment] || segment}
    </span>
);

const GodrejSchemeUpdate: React.FC = () => {
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
    const [downloading, setDownloading] = useState(false);
    const [dataAsOf, setDataAsOf] = useState<string | null>(null);
    const [notImported, setNotImported] = useState<NotImportedScheme[]>([]);
    const [stats, setStats] = useState({ total_products: 0, matched_products: 0 });

    // Filter state
    const [schemeDescFilter, setSchemeDescFilter] = useState<Set<string>>(new Set());
    const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
    const [dropdownSearch, setDropdownSearch] = useState('');
    const filterDropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const filterButtonRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    // Keyboard highlight: 0 = "Select All", 1..n = filteredDropdownDescs, -1 = none (typing in search)
    const [activeIndex, setActiveIndex] = useState(-1);

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
                const response = await fetch(`${constants.baseURL}/api/godrej-schemes/next-bill-no`, {
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

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
                setFilterDropdownOpen(false);
                setDropdownSearch('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Auto-focus search input when dropdown opens
    useEffect(() => {
        if (filterDropdownOpen) {
            setTimeout(() => searchInputRef.current?.focus(), 50);
        } else {
            setDropdownSearch('');
        }
        setActiveIndex(-1);
    }, [filterDropdownOpen]);

    // When schemes change, reset filter to show all
    useEffect(() => {
        const allDescs = new Set(schemes.map(s => s.scheme_desc));
        setSchemeDescFilter(allDescs);
    }, [schemes]);

    const uniqueSchemeDescs = Array.from(new Set(schemes.map(s => s.scheme_desc))).sort();
    const filteredDropdownDescs = dropdownSearch.trim()
        ? uniqueSchemeDescs.filter(d => d.toLowerCase().includes(dropdownSearch.toLowerCase()))
        : uniqueSchemeDescs;

    const allSelected = uniqueSchemeDescs.length > 0 && uniqueSchemeDescs.every(d => schemeDescFilter.has(d));
    const noneSelected = uniqueSchemeDescs.every(d => !schemeDescFilter.has(d));

    // While searching, "Select All" acts on the search results only (like Excel)
    const isSearching = dropdownSearch.trim() !== '';
    const allVisibleSelected = filteredDropdownDescs.length > 0 && filteredDropdownDescs.every(d => schemeDescFilter.has(d));

    const toggleSelectAll = () => {
        if (!isSearching) {
            setSchemeDescFilter(allSelected ? new Set() : new Set(uniqueSchemeDescs));
            return;
        }
        setSchemeDescFilter(prev => {
            const next = new Set(prev);
            filteredDropdownDescs.forEach(d => (allVisibleSelected ? next.delete(d) : next.add(d)));
            return next;
        });
    };

    const closeFilterDropdown = () => {
        setFilterDropdownOpen(false);
        filterButtonRef.current?.focus();
    };

    // Keep the highlighted row visible while moving with arrow keys
    useEffect(() => {
        if (activeIndex < 0) return;
        listRef.current?.parentElement?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    const toggleSchemeDesc = (desc: string) => {
        setSchemeDescFilter(prev => {
            const next = new Set(prev);
            if (next.has(desc)) {
                next.delete(desc);
            } else {
                next.add(desc);
            }
            return next;
        });
    };

    const handleDeleteSchemeDesc = (desc: string) => {
        if (!window.confirm(`Delete all rows with scheme description:\n"${desc}"?`)) return;
        setSchemes(prev => prev.filter(s => s.scheme_desc !== desc));
        toast.info(`Deleted all rows for: ${desc}`);
    };

    const handleFilterKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const lastIndex = filteredDropdownDescs.length; // rows: Select All + results
        const activeDesc = activeIndex >= 1 ? filteredDropdownDescs[activeIndex - 1] : undefined;
        const toggleActive = () => {
            if (activeIndex === 0) toggleSelectAll();
            else if (activeDesc) toggleSchemeDesc(activeDesc);
        };

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setActiveIndex(i => Math.min(i + 1, lastIndex));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setActiveIndex(i => Math.max(i - 1, 0));
                break;
            case 'PageDown':
                e.preventDefault();
                setActiveIndex(i => Math.min(i + 10, lastIndex));
                break;
            case 'PageUp':
                e.preventDefault();
                setActiveIndex(i => Math.max(i - 10, 0));
                break;
            case 'Home':
            case 'End':
                // Only take over Home/End while moving through the list; otherwise they move the text cursor
                if (activeIndex < 0) break;
                e.preventDefault();
                setActiveIndex(e.key === 'Home' ? 0 : lastIndex);
                break;
            case ' ':
                // Space types into the search box until the user starts arrowing through the list
                if (activeIndex < 0) break;
                e.preventDefault();
                toggleActive();
                break;
            case 'Enter':
                e.preventDefault();
                if (activeIndex >= 0) toggleActive();
                else closeFilterDropdown();
                break;
            case 'Delete':
                if (!activeDesc) break;
                e.preventDefault();
                handleDeleteSchemeDesc(activeDesc);
                setActiveIndex(i => Math.min(i, lastIndex - 1));
                break;
            case 'Escape':
                e.preventDefault();
                closeFilterDropdown();
                break;
            case 'Tab':
                setFilterDropdownOpen(false);
                break;
        }
    };

    const filteredSchemes = schemes.filter(s => schemeDescFilter.has(s.scheme_desc));

    const handleLoadPreview = async () => {
        setLoadingPreview(true);
        setSchemes([]);
        try {
            const response = await fetch(`${constants.baseURL}/api/godrej-schemes/preview`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            const data = await response.json().catch(() => null);
            if (!response.ok || !data) {
                toast.error(data?.message || `Failed to load preview (HTTP ${response.status})`);
                return;
            }

            if (data.success) {
                setSchemes(data.schemes);
                setStats({ total_products: data.total_products, matched_products: data.matched_products });
                setDataAsOf(data.data_as_of || null);
                setNotImported(data.not_imported || []);
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

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const response = await fetch(`${constants.baseURL}/api/godrej-schemes/download`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data?.success) {
                toast.error(data?.message || `Bizom download failed (HTTP ${response.status})`);
                return;
            }
            toast.success(data.message);
            await handleLoadPreview();
        } catch (error) {
            console.error('Error downloading schemes from Bizom:', error);
            toast.error('Error downloading schemes from Bizom. Please try again.');
        } finally {
            setDownloading(false);
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

        // Only the rows ticked in the Scheme Desc filter are imported
        if (filteredSchemes.length === 0) {
            toast.warning('All schemes are unticked in the Scheme Desc filter. Nothing to import.');
            return;
        }

        const bySegment = (seg: Segment) => filteredSchemes.filter(s => s.segment === seg).length;
        const skipped = schemes.length - filteredSchemes.length;
        if (!window.confirm(
            `Append ${filteredSchemes.length} scheme rows to SCHDTL.dbf?\n\n` +
            `Retail only (CUST_CAT R): ${bySegment('RT')}\n` +
            `Wholesale only (CUST_CAT W): ${bySegment('WS')}\n` +
            `Both (CUST_CAT blank): ${bySegment('BOTH')}` +
            (skipped > 0 ? `\n\n${skipped} unticked rows will NOT be imported.` : '')
        )) {
            return;
        }

        setLoadingImport(true);
        try {
            const payload = {
                schemes: filteredSchemes,
                series,
                billNo,
                date,
                validFrom,
                validTo
            };

            const response = await fetch(`${constants.baseURL}/api/godrej-schemes/import`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json().catch(() => null);
            if (!response.ok || !data) {
                toast.error(data?.message || `Failed to import schemes (HTTP ${response.status})`);
                return;
            }

            if (data.success) {
                toast.success(data.message);
                logActivity({
                    page: 'Godrej Scheme Update',
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
            <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Godrej Scheme Update Utility</h1>

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
                        {schemes.length > 0 && <span>Previewed Schemes: {stats.total_products} | Matched DBF Records: {stats.matched_products}</span>}
                        {dataAsOf && <span className="ml-2">| Bizom data as of {new Date(dataAsOf).toLocaleString('en-IN')}</span>}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleDownload}
                            disabled={downloading || loadingPreview || loadingImport}
                            className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            {downloading ? 'Downloading from Bizom...' : 'Download from Bizom'}
                        </button>
                        <button
                            onClick={handleLoadPreview}
                            disabled={downloading || loadingPreview || loadingImport}
                            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            {loadingPreview ? 'Loading Preview...' : 'Load Preview'}
                        </button>
                        <button
                            onClick={handleConfirmImport}
                            disabled={schemes.length === 0 || downloading || loadingImport || loadingPreview}
                            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
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
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white">SKU Code (Bizom)</th>
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white">CODE (PMPL)</th>
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white">Product Description</th>

                                    {/* Scheme Desc header with filter dropdown */}
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white">
                                        <div className="relative flex items-center gap-1" ref={filterDropdownRef}>
                                            <span>Scheme Desc</span>
                                            <button
                                                ref={filterButtonRef}
                                                onClick={() => setFilterDropdownOpen(prev => !prev)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'ArrowDown' && !filterDropdownOpen) {
                                                        e.preventDefault();
                                                        setFilterDropdownOpen(true);
                                                    }
                                                }}
                                                aria-haspopup="listbox"
                                                aria-expanded={filterDropdownOpen}
                                                title="Filter by Scheme Description"
                                                style={{
                                                    background: noneSelected ? '#ef4444' : (!allSelected ? '#f59e0b' : 'transparent'),
                                                    border: '1px solid #9ca3af',
                                                    borderRadius: '4px',
                                                    padding: '1px 5px',
                                                    cursor: 'pointer',
                                                    fontSize: '11px',
                                                    color: (!allSelected) ? '#fff' : 'inherit',
                                                    lineHeight: '1.4',
                                                    flexShrink: 0
                                                }}
                                            >
                                                ▾
                                            </button>

                                            {filterDropdownOpen && (
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        top: '100%',
                                                        left: 0,
                                                        zIndex: 9999,
                                                        background: 'white',
                                                        border: '1px solid #d1d5db',
                                                        borderRadius: '6px',
                                                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                                                        minWidth: '300px',
                                                        maxHeight: '360px',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        color: '#111827',
                                                        fontWeight: 'normal',
                                                        fontSize: '13px'
                                                    }}
                                                >
                                                    {/* Search bar */}
                                                    <div style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
                                                        <input
                                                            ref={searchInputRef}
                                                            type="text"
                                                            placeholder="Search scheme..."
                                                            value={dropdownSearch}
                                                            onChange={e => {
                                                                setDropdownSearch(e.target.value);
                                                                setActiveIndex(-1);
                                                            }}
                                                            onKeyDown={handleFilterKeyDown}
                                                            onClick={e => e.stopPropagation()}
                                                            style={{
                                                                width: '100%',
                                                                padding: '5px 8px',
                                                                border: '1px solid #d1d5db',
                                                                borderRadius: '4px',
                                                                fontSize: '12px',
                                                                outline: 'none',
                                                                boxSizing: 'border-box'
                                                            }}
                                                        />
                                                    </div>

                                                    {/* Select All row */}
                                                    <div
                                                        data-index={0}
                                                        onMouseEnter={() => setActiveIndex(0)}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            padding: '6px 10px',
                                                            borderBottom: '1px solid #e5e7eb',
                                                            gap: '8px',
                                                            background: activeIndex === 0 ? '#e0e7ff' : '#f9fafb',
                                                            flexShrink: 0
                                                        }}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            tabIndex={-1}
                                                            checked={isSearching ? allVisibleSelected : allSelected}
                                                            onChange={toggleSelectAll}
                                                            style={{ cursor: 'pointer', width: '14px', height: '14px', flexShrink: 0 }}
                                                        />
                                                        <span onClick={toggleSelectAll} style={{ fontWeight: 600, flex: 1, cursor: 'pointer' }}>
                                                            {isSearching ? 'Select All Search Results' : 'Select All'}
                                                        </span>
                                                    </div>

                                                    {/* Scrollable list */}
                                                    <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>

                                                    {/* Individual scheme desc rows */}
                                                     {filteredDropdownDescs.length === 0 && (
                                                        <div style={{ padding: '10px', color: '#9ca3af', textAlign: 'center' }}>No results</div>
                                                    )}
                                                     {filteredDropdownDescs.map((desc, i) => (
                                                        <div
                                                            key={desc}
                                                            data-index={i + 1}
                                                            onMouseEnter={() => setActiveIndex(i + 1)}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                padding: '5px 10px',
                                                                gap: '8px',
                                                                borderBottom: '1px solid #f3f4f6',
                                                                background: activeIndex === i + 1 ? '#e0e7ff' : undefined
                                                            }}
                                                        >
                                                            {/* Delete (−) button */}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteSchemeDesc(desc);
                                                                }}
                                                                tabIndex={-1}
                                                                title={`Delete all rows for: ${desc} (Delete key)`}
                                                                style={{
                                                                    background: '#ef4444',
                                                                    color: '#fff',
                                                                    border: 'none',
                                                                    borderRadius: '3px',
                                                                    width: '18px',
                                                                    height: '18px',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontSize: '14px',
                                                                    fontWeight: 'bold',
                                                                    lineHeight: '1',
                                                                    flexShrink: 0,
                                                                    padding: 0
                                                                }}
                                                            >
                                                                −
                                                            </button>

                                                            {/* Checkbox */}
                                                            <input
                                                                type="checkbox"
                                                                tabIndex={-1}
                                                                checked={schemeDescFilter.has(desc)}
                                                                onChange={() => toggleSchemeDesc(desc)}
                                                                style={{ cursor: 'pointer', width: '14px', height: '14px', flexShrink: 0 }}
                                                            />

                                                            {/* Label */}
                                                            <span
                                                                onClick={() => toggleSchemeDesc(desc)}
                                                                style={{ cursor: 'pointer', flex: 1, lineHeight: '1.3' }}
                                                            >
                                                                {desc}
                                                            </span>
                                                        </div>
                                                    ))}
                                                    </div>{/* end scrollable list */}
                                                </div>
                                            )}
                                        </div>
                                    </th>

                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left text-gray-900 dark:text-white" title="Retail = CUST_CAT R, Wholesale = CUST_CAT W, Both = blank">Segment</th>
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">Discount %</th>
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">Slab Start</th>
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right text-gray-900 dark:text-white">Slab End</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredSchemes.map((scheme, idx) => (
                                    <tr key={`${scheme.id}-${idx}`} className="hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                                        <td className="py-2 px-3 text-gray-900 dark:text-white">{scheme.basepack_code}</td>
                                        <td className="py-2 px-3 text-gray-900 dark:text-white font-medium">{scheme.pmpl_code}</td>
                                        <td className="py-2 px-3 text-gray-900 dark:text-white">{scheme.product_desc}</td>
                                        <td className="py-2 px-3 text-gray-900 dark:text-white text-sm">{scheme.scheme_desc}</td>
                                        <td className="py-2 px-3"><SegmentBadge segment={scheme.segment} /></td>
                                        <td className="py-2 px-3 text-gray-900 dark:text-white text-right">{scheme.discount}</td>
                                        <td className="py-2 px-3 text-gray-900 dark:text-white text-right">{scheme.slab_start}</td>
                                        <td className="py-2 px-3 text-gray-900 dark:text-white text-right">
                                            {scheme.slab_end >= 999999 ? 'No Limit' : scheme.slab_end}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {notImported.length > 0 && (
                <div className="bg-white dark:bg-gray-800 shadow rounded overflow-hidden mt-6">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-600">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Not imported: {notImported.length} invoice-value / QPS / free-goods schemes
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            SCHDTL only holds quantity slabs with a % discount, so these must be given manually at billing.
                        </p>
                    </div>
                    <div className="overflow-x-auto max-h-[400px]">
                        <table className="min-w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-sm">
                            <thead className="sticky top-0">
                                <tr className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left">Scheme Desc</th>
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left">Segment</th>
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-left">Type</th>
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right">Min Value ₹</th>
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right">Benefit</th>
                                    <th className="py-2 px-3 border border-gray-300 dark:border-gray-600 text-right">Our Products</th>
                                </tr>
                            </thead>
                            <tbody>
                                {notImported.map((s, idx) => (
                                    <tr key={`${s.activitycode}-${idx}`} className="border-b border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white">
                                        <td className="py-2 px-3">{s.scheme_desc}</td>
                                        <td className="py-2 px-3"><SegmentBadge segment={s.segment} /></td>
                                        <td className="py-2 px-3">{s.reason}</td>
                                        <td className="py-2 px-3 text-right">{s.min_amount > 0 ? s.min_amount.toLocaleString('en-IN') : '-'}</td>
                                        <td className="py-2 px-3 text-right">
                                            {s.discount > 0 ? `${s.discount}%` : s.save_rupees > 0 ? `₹${s.save_rupees} off` : '-'}
                                        </td>
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

export default GodrejSchemeUpdate;
