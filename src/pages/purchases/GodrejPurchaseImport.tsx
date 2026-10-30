import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageBreadcrumb from '../../components/common/PageBreadCrumb';
import PageMeta from '../../components/common/PageMeta';
import constants from '../../constants';

// Web version of the FoxPro GOD.PRG program:
// GODPUR.CSV (Bizom report 11721) + GPRICE.CSV (Bizom report 5497) -> purchases from Godrej (CT229)

interface Line {
  skuCode: string;
  product: string;
  hsn: string;
  mrp: number;
  multF: number;
  qty: number;
  taxable: number;
  tax: number;
  gst: number;
  rate: number;
  trade1: number;
  grnStatus: string;
  itemCode: string;
  unit: string;
  isNew: boolean;
}

interface Invoice {
  invoice: string;
  saleDate: string;
  grnDate: string;
  plant: string;
  lines: Line[];
  taxable: number;
  tax: number;
  total: number;
  cases: number;
  newItems: number;
}

interface AlreadyImported { invoice: string; bill: string; existingIn: 'database' | 'pending' }

interface FileInfo { file: string; exists: boolean; size?: number; modified?: string }

interface DownloadStatus {
  running: boolean;
  ok: boolean | null;
  error: string | null;
  log: string[];
  startedAt: string | null;
  finishedAt: string | null;
}

const API = `${constants.baseURL}/api/godrej-import`;

const authHeaders = (json = false): Record<string, string> => {
  const token = localStorage.getItem('token');
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTime = (s?: string) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const isoToDDMMYYYY = (s: string) => s.split('-').reverse().join('-');

const GodrejPurchaseImport: React.FC = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState<{ dir: string; godpur: FileInfo; gprice: FileInfo } | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [priceLoaded, setPriceLoaded] = useState(true);
  const [alreadyImported, setAlreadyImported] = useState<AlreadyImported[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saleRates, setSaleRates] = useState<Record<string, string>>({});
  const [entryDate, setEntryDate] = useState(todayISO());
  const [godown, setGodown] = useState('02');
  const [godowns, setGodowns] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any>(null);
  const [dl, setDl] = useState<DownloadStatus | null>(null);
  const pollRef = useRef<number | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const loadFiles = useCallback(async () => {
    const r = await fetch(`${API}/files`, { headers: authHeaders() });
    if (r.ok) setFiles(await r.json());
  }, []);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`${API}/preview`, { headers: authHeaders() });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || 'Failed to read GODPUR.CSV');
      const list: Invoice[] = data.invoices || [];
      setInvoices(list);
      setPriceLoaded(!!data.priceLoaded);
      setAlreadyImported(data.alreadyImported || []);
      setSelected(new Set(list.map((iv) => iv.invoice)));
    } catch (e) {
      setInvoices([]);
      setAlreadyImported([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
    loadPreview();
    fetch(`${constants.baseURL}/api/godowns`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((arr) => {
        if (!Array.isArray(arr)) return;
        setGodowns(
          arr
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .filter((g: any) => String(g.ACTIVE || 'Y') === 'Y')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((g: any) => {
              const code = String(g.GDN_CODE || '').padStart(2, '0').slice(0, 2);
              return { value: code, label: `${String(g.GDN_NAME || '')} (${code})` };
            }),
        );
      })
      .catch(() => {});
    // resume showing a download that is already running
    fetch(`${API}/download/status`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((s: DownloadStatus) => {
        if (s.startedAt) setDl(s);
        if (s.running) startPolling();
      })
      .catch(() => {});
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [dl?.log.length]);

  const startPolling = () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const s: DownloadStatus = await (await fetch(`${API}/download/status`, { headers: authHeaders() })).json();
        setDl(s);
        if (!s.running) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          loadFiles();
          if (s.ok) loadPreview();
        }
      } catch {
        /* keep polling */
      }
    }, 2000);
  };

  const startDownload = async (reports: string[]) => {
    setError('');
    const r = await fetch(`${API}/download`, { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ reports }) });
    const data = await r.json();
    if (data.status) setDl(data.status);
    if (!r.ok && r.status !== 409) {
      setError(data.message || 'Could not start download');
      return;
    }
    startPolling();
  };

  const uploadCsv = async (type: 'godpur' | 'gprice', file: File) => {
    setError('');
    const content = await file.text();
    const r = await fetch(`${API}/upload`, { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ type, content }) });
    const data = await r.json();
    if (!r.ok) {
      setError(data.message || 'Upload failed');
      return;
    }
    await loadFiles();
    await loadPreview();
  };

  const newItems = useMemo(() => {
    const map = new Map<string, Line>();
    invoices.filter((iv) => selected.has(iv.invoice)).forEach((iv) => iv.lines.forEach((l) => l.isNew && !map.has(l.skuCode) && map.set(l.skuCode, l)));
    return [...map.values()];
  }, [invoices, selected]);

  const selectedTotals = useMemo(() => {
    const sel = invoices.filter((iv) => selected.has(iv.invoice));
    return {
      count: sel.length,
      cases: sel.reduce((s, iv) => s + iv.cases, 0),
      total: sel.reduce((s, iv) => s + iv.total, 0),
    };
  }, [invoices, selected]);

  const toggle = (inv: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(inv)) next.delete(inv);
      else next.add(inv);
      return next;
    });

  const doImport = async () => {
    if (selected.size === 0) return;
    const missingRate = newItems.filter((l) => !(parseFloat(saleRates[l.skuCode] ?? '') > 0) && !(l.trade1 > 0));
    if (missingRate.length && !window.confirm(`${missingRate.length} new item(s) have no sale rate. Import anyway with rate 0?`)) return;
    if (!window.confirm(`Import ${selected.size} invoice(s) as purchases from Godrej?`)) return;
    setImporting(true);
    setError('');
    setResult(null);
    try {
      const r = await fetch(`${API}/import`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ invoices: [...selected], entryDate: isoToDDMMYYYY(entryDate), godown, saleRates }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || 'Import failed');
      setResult(data);
      await loadPreview();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const fileCard = (label: string, type: 'godpur' | 'gprice', info?: FileInfo) => (
    <div className="flex-1 min-w-[260px] rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-center justify-between">
        <div className="font-medium text-gray-800 dark:text-white">{label}</div>
        <label className="cursor-pointer text-xs text-brand-500 hover:underline">
          Upload CSV
          <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && uploadCsv(type, e.target.files[0])} />
        </label>
      </div>
      <div className={`text-sm mt-1 ${info?.exists ? 'text-gray-600 dark:text-gray-300' : 'text-red-500'}`}>
        {info?.exists ? `Updated ${fmtTime(info.modified)} · ${((info.size || 0) / 1024).toFixed(0)} KB` : 'File not found'}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <PageMeta title="Godrej Purchase Import" description="Import Godrej purchase invoices from Bizom" />
      <PageBreadcrumb pageTitle="Godrej Purchase Import" />

      {/* Step 1: files */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold text-gray-800 dark:text-white">1. Bizom files</h3>
          <div className="flex gap-2">
            <button
              onClick={() => startDownload(['purchase', 'price'])}
              disabled={!!dl?.running}
              className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm hover:bg-brand-600 disabled:opacity-50"
            >
              {dl?.running ? 'Downloading…' : 'Download from Bizom'}
            </button>
            <button
              onClick={() => startDownload(['purchase'])}
              disabled={!!dl?.running}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200 disabled:opacity-50"
              title="Only report 11721 (skip the price check report)"
            >
              Purchases only
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {fileCard('GODPUR.CSV — Primary Sale & GRN (11721)', 'godpur', files?.godpur)}
          {fileCard('GPRICE.CSV — Price Check (5497)', 'gprice', files?.gprice)}
        </div>
        {files?.dir && <div className="text-xs text-gray-400 mt-2">Folder: {files.dir}</div>}
        {dl && (
          <div className="mt-3">
            <div className={`text-sm font-medium ${dl.running ? 'text-blue-600' : dl.ok ? 'text-green-600' : 'text-red-600'}`}>
              {dl.running ? 'Bizom download in progress…' : dl.ok ? `Download finished ${fmtTime(dl.finishedAt || undefined)}` : `Download failed: ${dl.error}`}
            </div>
            <pre ref={logRef} className="mt-1 max-h-40 overflow-auto rounded bg-gray-900 text-gray-100 text-xs p-2 whitespace-pre-wrap">
              {dl.log.join('\n')}
            </pre>
          </div>
        )}
      </div>

      {/* Step 2: invoices */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <h3 className="font-semibold text-gray-800 dark:text-white">2. Invoices in GODPUR.CSV</h3>
          <button onClick={loadPreview} disabled={loading} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-200">
            {loading ? 'Reading…' : 'Reload'}
          </button>
        </div>
        {!priceLoaded && <div className="text-sm text-amber-600 mb-2">GPRICE.CSV not found — sale rates of new items must be typed below.</div>}
        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
        {alreadyImported.length > 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            Skipped {alreadyImported.length} invoice(s) already imported:{' '}
            {alreadyImported.map((a) => `${a.invoice} (${a.bill}${a.existingIn === 'pending' ? ', pending approval' : ''})`).join(', ')}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="py-2 pr-2">
                  <input
                    type="checkbox"
                    checked={invoices.length > 0 && invoices.every((iv) => selected.has(iv.invoice))}
                    onChange={(e) => setSelected(new Set(e.target.checked ? invoices.map((iv) => iv.invoice) : []))}
                  />
                </th>
                <th className="py-2 pr-4">Invoice</th>
                <th className="py-2 pr-4">Sale Date</th>
                <th className="py-2 pr-4 text-right">Items</th>
                <th className="py-2 pr-4 text-right">Cases</th>
                <th className="py-2 pr-4 text-right">Taxable</th>
                <th className="py-2 pr-4 text-right">GST</th>
                <th className="py-2 pr-4 text-right">Total</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((iv) => (
                <React.Fragment key={iv.invoice}>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200">
                    <td className="py-2 pr-2">
                      <input type="checkbox" checked={selected.has(iv.invoice)} onChange={() => toggle(iv.invoice)} />
                    </td>
                    <td className="py-2 pr-4">
                      <button className="text-brand-500 hover:underline font-mono" onClick={() => setExpanded(expanded === iv.invoice ? null : iv.invoice)}>
                        {iv.invoice}
                      </button>
                    </td>
                    <td className="py-2 pr-4">{iv.saleDate}</td>
                    <td className="py-2 pr-4 text-right">{iv.lines.length}</td>
                    <td className="py-2 pr-4 text-right">{iv.cases}</td>
                    <td className="py-2 pr-4 text-right">{fmt(iv.taxable)}</td>
                    <td className="py-2 pr-4 text-right">{fmt(iv.tax)}</td>
                    <td className="py-2 pr-4 text-right font-medium">{fmt(iv.total)}</td>
                    <td className="py-2 pr-4">
                      <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                        New{iv.newItems ? ` · ${iv.newItems} new item(s)` : ''}
                      </span>
                    </td>
                  </tr>
                  {expanded === iv.invoice && (
                    <tr>
                      <td colSpan={9} className="bg-gray-50 dark:bg-gray-900/40 p-2">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="text-left text-gray-500">
                              <th className="pr-3">Code</th>
                              <th className="pr-3">Product</th>
                              <th className="pr-3 text-right">Pcs/Box</th>
                              <th className="pr-3 text-right">Cases</th>
                              <th className="pr-3 text-right">Rate/Box</th>
                              <th className="pr-3 text-right">GST%</th>
                              <th className="pr-3 text-right">MRP</th>
                              <th className="pr-3 text-right">Sale Rate</th>
                              <th className="pr-3 text-right">Taxable</th>
                              <th className="pr-3">GRN</th>
                            </tr>
                          </thead>
                          <tbody>
                            {iv.lines.map((l, i) => (
                              <tr key={i} className="text-gray-700 dark:text-gray-300">
                                <td className="pr-3 font-mono">{l.itemCode || <span className="text-amber-600">NEW</span>}</td>
                                <td className="pr-3">{l.product}</td>
                                <td className="pr-3 text-right">{l.multF}</td>
                                <td className="pr-3 text-right">{l.qty}</td>
                                <td className="pr-3 text-right">{fmt(l.rate)}</td>
                                <td className="pr-3 text-right">{l.gst}</td>
                                <td className="pr-3 text-right">{l.mrp}</td>
                                <td className="pr-3 text-right">{l.trade1 ? fmt(l.trade1) : '—'}</td>
                                <td className="pr-3 text-right">{fmt(l.taxable)}</td>
                                <td className="pr-3">{l.grnStatus}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {!loading && invoices.length === 0 && !error && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-gray-500">{alreadyImported.length ? 'All invoices in GODPUR.CSV are already imported' : 'No invoices found'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Step 3: new items */}
      {newItems.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] mb-4">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-1">3. New items to be created (G1 series)</h3>
          <div className="text-xs text-gray-500 mb-2">Sale rate comes from GPRICE.CSV; type it where it is missing or wrong.</div>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                <th className="py-1 pr-3">Sku Code</th>
                <th className="py-1 pr-3">Product</th>
                <th className="py-1 pr-3 text-right">Pcs/Box</th>
                <th className="py-1 pr-3 text-right">GST%</th>
                <th className="py-1 pr-3 text-right">MRP</th>
                <th className="py-1 pr-3 text-right">Sale Rate</th>
              </tr>
            </thead>
            <tbody>
              {newItems.map((l) => (
                <tr key={l.skuCode} className="text-gray-800 dark:text-gray-200">
                  <td className="py-1 pr-3 font-mono">{l.skuCode}</td>
                  <td className="py-1 pr-3">{l.product}</td>
                  <td className="py-1 pr-3 text-right">{l.multF}</td>
                  <td className="py-1 pr-3 text-right">{l.gst}</td>
                  <td className="py-1 pr-3 text-right">{l.mrp}</td>
                  <td className="py-1 pr-3 text-right">
                    <input
                      type="number"
                      step="0.01"
                      className={`w-24 text-right rounded border px-2 py-0.5 dark:bg-gray-900 ${
                        l.trade1 > 0 || parseFloat(saleRates[l.skuCode] ?? '') > 0 ? 'border-gray-300 dark:border-gray-600' : 'border-red-400'
                      }`}
                      value={saleRates[l.skuCode] ?? (l.trade1 ? String(l.trade1) : '')}
                      onChange={(e) => setSaleRates((p) => ({ ...p, [l.skuCode]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Step 4: import */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <h3 className="font-semibold text-gray-800 dark:text-white mb-3">{newItems.length > 0 ? '4' : '3'}. Import</h3>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Entry date
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="block mt-1 rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 dark:bg-gray-900" />
          </label>
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Godown
            <select value={godown} onChange={(e) => setGodown(e.target.value)} className="block mt-1 rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 dark:bg-gray-900">
              {godowns.length === 0 && <option value="02">02</option>}
              {godowns.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </label>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            {selectedTotals.count} invoice(s) · {selectedTotals.cases} cases · ₹{fmt(selectedTotals.total)}
            <div className="text-xs text-gray-400">Unloading charges ₹1.50/case are posted when the purchase is approved.</div>
          </div>
          <button
            onClick={doImport}
            disabled={importing || selected.size === 0}
            className="ml-auto px-5 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {importing ? 'Importing…' : 'Import selected'}
          </button>
        </div>

        {result && (
          <div className="mt-4 rounded-lg bg-green-50 dark:bg-green-900/20 p-3 text-sm text-green-800 dark:text-green-200">
            <div className="font-medium">{result.message}</div>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.created?.map((c: any) => (
              <div key={c.invoice}>{c.invoice} → {c.bill} · {c.cases} cases · ₹{fmt(c.total)}</div>
            ))}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {result.newItems?.map((n: any) => (
              <div key={n.code}>New item {n.code}: {n.product} (sale rate {n.trade1})</div>
            ))}
            <button onClick={() => navigate('/db/purchases')} className="mt-2 text-brand-500 hover:underline">
              Open Database › Purchases to review and approve →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GodrejPurchaseImport;
