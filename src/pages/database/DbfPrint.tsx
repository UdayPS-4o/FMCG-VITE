import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import constants from '../../constants';

const DbfPrint: React.FC = () => {
  const [series, setSeries] = useState('');
  const [billNo, setBillNo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [partyName, setPartyName] = useState<string>('');
  const [bills, setBills] = useState<any[]>([]);
  const [partyMap, setPartyMap] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [selectAll, setSelectAll] = useState<boolean>(false);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [partyOptions, setPartyOptions] = useState<{ value: string; label: string }[]>([]);
  const [billOptions, setBillOptions] = useState<{ value: string; label: string }[]>([]);
  const [selectedBill, setSelectedBill] = useState<string>('');
  const [selectedDateRange, setSelectedDateRange] = useState<string>('thisMonth');
  const dateRangeOptions = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last7days', label: 'Last 7 Days' },
    { value: 'thisMonth', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
    { value: 'currentFY', label: 'Current FY' },
    { value: 'custom', label: 'Custom Range' },
  ];
  const [seriesOptions, setSeriesOptions] = useState<string[]>([]);
  const [minBill, setMinBill] = useState<string>('');
  const [maxBill, setMaxBill] = useState<string>('');
  const debounceRef = useRef<number | null>(null);
  const navigate = useNavigate();

  const handlePrint = async () => {
    const s = series.trim().toUpperCase();
    const b = billNo.trim();
    if (!s || !b || !/^\d+$/.test(b)) {
      setError('Enter a valid Series and numeric Bill Number.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const apiUrl = `${constants.baseURL}/api/generate-pdf/dbf-invoice/${s}/${b}?redirect=false`;
      const response = await fetch(apiUrl, { method: 'GET' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = data?.message || response.statusText || 'Failed to generate PDF.';
        throw new Error(msg);
      }
      const pdfPath: string = data?.pdfPath;
      if (pdfPath) {
        const fullUrl = `${constants.baseURL}${pdfPath}`;
        window.open(fullUrl, '_blank');
      } else {
        const redirectUrl = `${constants.baseURL}/api/generate-pdf/dbf-invoice/${s}/${b}?redirect=true`;
        window.open(redirectUrl, '_blank');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to generate PDF.');
    } finally {
      setLoading(false);
    }
  };

  const formatDDMMYYYY = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const parseAnyDate = (v: any): Date | null => {
    if (!v) return null;
    if (typeof v === 'string') {
      const s = v.trim();
      const dmY = s.match(/^([0-3]?\d)[-/]([0-1]?\d)[-/](\d{4})$/);
      if (dmY) {
        const d = Number(dmY[1]);
        const m = Number(dmY[2]) - 1;
        const y = Number(dmY[3]);
        return new Date(y, m, d);
      }
      const dmY2 = s.match(/^([0-3]?\d)[-/]([0-1]?\d)[-/](\d{2})$/);
      if (dmY2) {
        const d = Number(dmY2[1]);
        const m = Number(dmY2[2]) - 1;
        const yy = Number(dmY2[3]);
        const y = yy + (yy < 70 ? 2000 : 1900);
        return new Date(y, m, d);
      }
      const yMd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (yMd) {
        const y = Number(yMd[1]);
        const m = Number(yMd[2]) - 1;
        const d = Number(yMd[3]);
        return new Date(y, m, d);
      }
      const yMdCompact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (yMdCompact) {
        const y = Number(yMdCompact[1]);
        const m = Number(yMdCompact[2]) - 1;
        const d = Number(yMdCompact[3]);
        return new Date(y, m, d);
      }
      const iso = new Date(s);
      if (!isNaN(iso.getTime())) return iso;
    }
    if (typeof v === 'number') {
      const n = new Date(v);
      return isNaN(n.getTime()) ? null : n;
    }
    if (v instanceof Date) return v;
    return null;
  };

  const loadBills = async () => {
    try {
      setLoadingList(true);
      setListError(null);
      const query = new URLSearchParams();
      if (fromDate) query.set('fromDate', fromDate);
      if (toDate) query.set('toDate', toDate);
      const token = localStorage.getItem('token');
      const billsResp = await fetch(`${constants.baseURL}/api/bills?${query.toString()}` , {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!billsResp.ok) {
        const message = await billsResp.text();
        throw new Error(message || 'Failed to load bills');
      }
      const billsJson = await billsResp.json();
      setBills(Array.isArray(billsJson) ? billsJson : []);
      setSelected({});
      setSelectAll(false);
      const fd = fromDate ? parseAnyDate(fromDate) : null;
      const td = toDate ? parseAnyDate(toDate) : null;
      const within = (d: Date | null) => {
        if (!d) return false;
        const f = fd ? d >= fd : true;
        const t = td ? d <= td : true;
        return f && t;
      };
      const filtered = (Array.isArray(billsJson) ? billsJson : []).filter((b: any) => within(parseAnyDate(b.DATE ?? b.date ?? b.DT_BILL)));
      const seriesSet = new Set<string>();
      (Array.isArray(billsJson) ? billsJson : []).forEach((b: any) => {
        const ser = String(b.SERIES || '').trim();
        if (ser) seriesSet.add(ser);
      });
      setSeriesOptions(Array.from(seriesSet).sort());
      const uniqueParties = new Map<string, { code: string; name: string }>();
      filtered.forEach((b: any) => {
        const code = String(b.C_CODE || '').trim();
        const name = String(b.C_NAME || '').trim();
        if (code) uniqueParties.set(code, { code, name: name || code });
      });
      const partyOpts = Array.from(uniqueParties.values()).map((p) => ({ value: p.code, label: p.name }));
      setPartyOptions(partyOpts);
      const uniqueBills = new Set<string>();
      filtered.forEach((b: any) => {
        const ser = String(b.SERIES || '').trim();
        const num = String(b.BILL ?? '').trim();
        if (ser && num) uniqueBills.add(`${ser}-${num}`);
      });
      const billOpts = Array.from(uniqueBills).map((v) => ({ value: v, label: v }));
      setBillOptions(billOpts);
    } catch (e: any) {
      setListError(e.message || 'Failed to load bills.');
    } finally {
      setLoadingList(false);
    }
  };

  const formatYYYYMMDD = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const last7Days = new Date(today);
    last7Days.setDate(today.getDate() - 7);
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    switch (selectedDateRange) {
      case 'today':
        setFromDate(formatYYYYMMDD(today));
        setToDate(formatYYYYMMDD(today));
        break;
      case 'yesterday':
        setFromDate(formatYYYYMMDD(yesterday));
        setToDate(formatYYYYMMDD(yesterday));
        break;
      case 'last7days':
        setFromDate(formatYYYYMMDD(last7Days));
        setToDate(formatYYYYMMDD(today));
        break;
      case 'thisMonth':
        setFromDate(formatYYYYMMDD(thisMonthStart));
        setToDate(formatYYYYMMDD(today));
        break;
      case 'lastMonth':
        setFromDate(formatYYYYMMDD(lastMonthStart));
        setToDate(formatYYYYMMDD(lastMonthEnd));
        break;
      case 'currentFY': {
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        let fyStartYear: number;
        let fyEndYear: number;
        if (currentMonth >= 3) {
          fyStartYear = currentYear;
          fyEndYear = currentYear + 1;
        } else {
          fyStartYear = currentYear - 1;
          fyEndYear = currentYear;
        }
        const fyStart = new Date(fyStartYear, 3, 1);
        const fyEnd = new Date(fyEndYear, 2, 31);
        setFromDate(formatYYYYMMDD(fyStart));
        setToDate(formatYYYYMMDD(fyEnd));
        break;
      }
      case 'custom':
        break;
    }
  }, [selectedDateRange]);

  const billsForPeriod = useMemo(() => {
    const fd = fromDate ? parseAnyDate(fromDate) : null;
    const td = toDate ? parseAnyDate(toDate) : null;
    const within = (d: Date | null) => {
      if (!d) return false;
      const f = fd ? d >= fd : true;
      const t = td ? d <= td : true;
      return f && t;
    };
    return bills.filter((b: any) => within(parseAnyDate(b.DATE ?? b.date ?? b.DT_BILL)));
  }, [bills, fromDate, toDate]);

  const billOptionsFiltered = useMemo(() => {
    const sel = partyName.trim().toUpperCase();
    const list = billsForPeriod.filter((b: any) => {
      if (!sel) return true;
      const code = String(b.C_CODE || '').trim().toUpperCase();
      const name = String(b.C_NAME || '').trim().toUpperCase();
      return code === sel || name === sel;
    }).map((b: any) => {
      const ser = String(b.SERIES || '').trim();
      const num = String(b.BILL ?? '').trim();
      return ser && num ? `${ser}-${num}` : '';
    }).filter(Boolean);
    const unique = Array.from(new Set(list));
    return unique.map(v => ({ value: v, label: v }));
  }, [billsForPeriod, partyName]);

  useEffect(() => {
    setSelectedBill('');
  }, [partyName, fromDate, toDate]);

  const handleGenerateSelectedBill = async () => {
    const key = selectedBill.trim();
    if (!key) return;
    const parts = key.split('-');
    const s = (parts[0] || '').trim().toUpperCase();
    const b = (parts[1] || '').trim();
    if (!s || !b || !/^(\d+)$/.test(b)) {
      setListError('Select a valid bill.');
      return;
    }
    setLoading(true);
    setListError(null);
    try {
      const apiUrl = `${constants.baseURL}/api/generate-pdf/dbf-invoice/${s}/${b}?redirect=false`;
      const response = await fetch(apiUrl, { method: 'GET' });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.pdfPath) {
        window.open(`${constants.baseURL}${data.pdfPath}`, '_blank');
      } else {
        const fallback = `${constants.baseURL}/api/generate-pdf/dbf-invoice/${s}/${b}?redirect=true`;
        window.open(fallback, '_blank');
      }
    } catch (e: any) {
      setListError(e.message || 'Failed to generate PDF.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBills();
  }, []);

  useEffect(() => {
    const fd = parseAnyDate(fromDate);
    const td = parseAnyDate(toDate);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (fd && td && fd <= td) {
      setListError(null);
      debounceRef.current = window.setTimeout(() => {
        loadBills();
      }, 300);
    } else if (fd && td && fd > td) {
      setListError('Invalid date range');
    }
  }, [fromDate, toDate]);

  const filteredBills = useMemo(() => {
    const s = series.trim().toUpperCase();
    const pn = partyName.trim().toUpperCase();
    const fd = fromDate ? parseAnyDate(fromDate) : null;
    const td = toDate ? parseAnyDate(toDate) : null;
    return bills.filter((b: any) => {
      const bs = String(b.SERIES || '').toUpperCase();
      const bn = String(b.BILL ?? b.bill ?? '').toString();
      const dRaw = b.DATE ?? b.date ?? b.DT_BILL;
      const bd = dRaw ? parseAnyDate(dRaw) : null;
      const code = String(b.C_CODE || '').toUpperCase();
      const name = String(b.C_NAME || '').toUpperCase();
      const matchSeries = s ? bs === s : true;
      const matchParty = pn ? (name === pn || code === pn || name.includes(pn) || code.includes(pn)) : true;
      const matchFrom = fd && bd ? bd >= fd : true;
      const matchTo = td && bd ? bd <= td : true;
      const minOk = minBill ? (Number(bn) >= Number(minBill)) : true;
      const maxOk = maxBill ? (Number(bn) <= Number(maxBill)) : true;
      return matchSeries && matchParty && matchFrom && matchTo && minOk && maxOk;
    }).slice(0, 500);
  }, [bills, series, partyName, fromDate, toDate, minBill, maxBill, partyMap]);

  const toggleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    const next: Record<string, boolean> = {};
    filteredBills.forEach((b: any) => {
      const key = `${b.SERIES}-${b.BILL}`;
      next[key] = checked;
    });
    setSelected(next);
  };

  const toggleOne = (key: string, checked: boolean) => {
    setSelected(prev => ({ ...prev, [key]: checked }));
  };

  const handlePrintSelected = async () => {
    const keys = Object.keys(selected).filter(k => selected[k]);
    if (keys.length === 0) {
      const proceed = window.confirm('Generate invoice for entered Series and Bill Number?');
      if (!proceed) return;
      await handlePrint();
      return;
    }
    const proceedMany = window.confirm(`Generate PDFs for ${keys.length} selected bills?`);
    if (!proceedMany) return;
    setLoading(true);
    setError(null);
    try {
      for (const key of keys) {
        const [s, b] = key.split('-');
        const apiUrl = `${constants.baseURL}/api/generate-pdf/dbf-invoice/${s}/${b}?redirect=false`;
        const response = await fetch(apiUrl);
        const data = await response.json().catch(() => ({}));
        if (response.ok && data?.pdfPath) {
          window.open(`${constants.baseURL}${data.pdfPath}`, '_blank');
        } else {
          const fallback = `${constants.baseURL}/api/generate-pdf/dbf-invoice/${s}/${b}?redirect=true`;
          window.open(fallback, '_blank');
        }
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (e: any) {
      setError(e.message || 'Failed to generate selected PDFs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Print DBF Invoice</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 p-4 rounded shadow space-y-4">
          <label htmlFor="series" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Series</label>
          <input
            type="text"
            id="series"
            value={series}
            onChange={(e) => setSeries(e.target.value)}
            placeholder="Enter Series (e.g., B)"
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          <label htmlFor="billNo" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Bill Number</label>
          <input
            type="text"
            id="billNo"
            value={billNo}
            onChange={(e) => setBillNo(e.target.value)}
            placeholder="Enter Bill Number (e.g., 1)"
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => { const ok = window.confirm('Generate invoice for entered Series and Bill Number?'); if (!ok) return; handlePrint(); }}
              disabled={loading}
              className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? 'Generating…' : 'Print Invoice'}
            </button>
            {error && (<span className="text-red-600 dark:text-red-400 text-sm">{error}</span>)}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded shadow space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date Range</label>
            <select
              value={selectedDateRange}
              onChange={(e) => setSelectedDateRange(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {dateRangeOptions.map(option => (
                <option key={option.value} value={option.value} className="bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              disabled={selectedDateRange !== 'custom'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              disabled={selectedDateRange !== 'custom'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Party Name</label>
            <select
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">All Parties</option>
              {partyOptions.map((opt) => (
                <option key={opt.value} value={opt.label}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bill No.</label>
            <select
              value={selectedBill}
              onChange={(e) => setSelectedBill(e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">Select Bill</option>
              {billOptionsFiltered.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div className="mt-3">
              <button
                onClick={handleGenerateSelectedBill}
                disabled={!selectedBill || loading}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-60"
              >
                {loading ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DbfPrint;