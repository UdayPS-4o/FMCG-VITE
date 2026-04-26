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
}

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
    const [stats, setStats] = useState({ total_products: 0, matched_products: 0 });

    // Filter state
    const [schemeDescFilter, setSchemeDescFilter] = useState<Set<string>>(new Set());
    const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
    const [dropdownSearch, setDropdownSearch] = useState('');
    const filterDropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

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

    const toggleSelectAll = () => {
        if (allSelected) {
            setSchemeDescFilter(new Set());
        } else {
            setSchemeDescFilter(new Set(uniqueSchemeDescs));
        }
    };

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

            const response = await fetch(`${constants.baseURL}/api/godrej-schemes/import`, {
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
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleLoadPreview}
                            disabled={loadingPreview || loadingImport}
                            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            {loadingPreview ? 'Loading Preview...' : 'Load Preview'}
                        </button>
                        <button
                            onClick={handleConfirmImport}
                            disabled={schemes.length === 0 || loadingImport || loadingPreview}
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
                                                onClick={() => setFilterDropdownOpen(prev => !prev)}
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
                                                            onChange={e => setDropdownSearch(e.target.value)}
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
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            padding: '6px 10px',
                                                            borderBottom: '1px solid #e5e7eb',
                                                            gap: '8px',
                                                            background: '#f9fafb',
                                                            flexShrink: 0
                                                        }}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={allSelected}
                                                            onChange={toggleSelectAll}
                                                            style={{ cursor: 'pointer', width: '14px', height: '14px', flexShrink: 0 }}
                                                        />
                                                        <span style={{ fontWeight: 600, flex: 1 }}>Select All</span>
                                                    </div>

                                                    {/* Scrollable list */}
                                                    <div style={{ overflowY: 'auto', flex: 1 }}>

                                                    {/* Individual scheme desc rows */}
                                                     {filteredDropdownDescs.length === 0 && (
                                                        <div style={{ padding: '10px', color: '#9ca3af', textAlign: 'center' }}>No results</div>
                                                    )}
                                                     {filteredDropdownDescs.map(desc => (
                                                        <div
                                                            key={desc}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                padding: '5px 10px',
                                                                gap: '8px',
                                                                borderBottom: '1px solid #f3f4f6'
                                                            }}
                                                        >
                                                            {/* Delete (−) button */}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteSchemeDesc(desc);
                                                                }}
                                                                title={`Delete all rows for: ${desc}`}
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
        </div>
    );
};

export default GodrejSchemeUpdate;
