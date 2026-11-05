import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Package, X } from 'lucide-react';
import useProductImages from '@/hooks/useProductImages';
import { EmptyState, KpiCard, SearchBox, Segmented, qtyFmt, useKpiData } from './shared';

interface StockRow {
  code: string;
  co: string; // company code (first two letters of the item code)
  product: string;
  avgQty: number;
  stock: number;
  daysLeft: number | null;
}
interface StockData {
  lookbackDays: number;
  companies?: { code: string; company: string; items: number }[];
  fast: StockRow[];
  slow: StockRow[];
  nonMoving: StockRow[];
}

type Tab = 'fast' | 'slow' | 'nonMoving';
const TABS: { key: Tab; label: string; color: string; hint: string }[] = [
  { key: 'fast', label: 'Fast Moving', color: '#16a34a', hint: 'Daily avg ≥ 2 pcs' },
  { key: 'slow', label: 'Slow Moving', color: '#db2777', hint: 'Daily avg between 0 and 2 pcs' },
  { key: 'nonMoving', label: 'Non Moving', color: '#ea580c', hint: 'In stock, no sales' },
];

const DaysLeft: React.FC<{ days: number | null }> = ({ days }) => {
  if (days === null) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  const cls =
    days <= 7
      ? 'bg-red-100 text-red-700 animate-pulse dark:bg-red-500/15 dark:text-red-400'
      : days <= 15
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
        : 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400';
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{days} days</span>;
};

const COMPANY_FILTER_KEY = 'dashboard-stock-companies';
const OLD_COMPANY_FILTER_KEY = 'dashboard-stock-company'; // single-company filter from before multi-select

const loadSavedCompanies = (): string[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(COMPANY_FILTER_KEY) || 'null');
    if (Array.isArray(saved)) return saved;
  } catch {
    /* fall through to the old single-company value */
  }
  const old = localStorage.getItem(OLD_COMPANY_FILTER_KEY);
  localStorage.removeItem(OLD_COMPANY_FILTER_KEY);
  return old ? [old] : [];
};

type CompanyOption = { code: string; company: string; items: number };

// Searchable multi-select list of companies (nothing selected = all companies)
const CompanyMultiSelect: React.FC<{
  companies: CompanyOption[];
  selected: string[];
  onChange: (codes: string[]) => void;
}> = ({ companies, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const q = query.trim().toLowerCase();
  const list = q ? companies.filter((c) => c.company.toLowerCase().includes(q)) : companies;
  const toggle = (code: string) =>
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  const label =
    selected.length === 0
      ? 'All companies'
      : selected.length === 1
        ? companies.find((c) => c.code === selected[0])?.company ?? selected[0]
        : `${selected.length} companies`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Filter by company"
        className={`flex h-8 max-w-[260px] items-center gap-1.5 rounded-lg border px-2.5 text-xs transition ${
          selected.length
            ? 'border-blue-300 bg-blue-50 font-medium text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300'
            : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.04]'
        }`}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-900">
          <SearchBox value={query} onChange={setQuery} placeholder="Search company…" />
          <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-gray-400">
            <span>{selected.length ? `${selected.length} selected` : 'None selected = all companies'}</span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => onChange(companies.map((c) => c.code))}
                className="font-medium text-blue-600 hover:underline"
              >
                Select all
              </button>
              {selected.length > 0 && (
                <button type="button" onClick={() => onChange([])} className="font-medium text-blue-600 hover:underline">
                  Clear
                </button>
              )}
            </span>
          </div>
          <div className="mt-1 max-h-72 overflow-auto">
            {list.map((c) => {
              const on = selected.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => toggle(c.code)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      on ? 'border-blue-600 bg-blue-600' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {on && <Check className="h-3 w-3 text-white" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-200">{c.company}</span>
                  <span className="text-[11px] text-gray-400">{c.items} items</span>
                </button>
              );
            })}
            {list.length === 0 && <div className="py-6 text-center text-xs text-gray-400">No companies</div>}
          </div>
        </div>
      )}
    </div>
  );
};

// Item photo (same photos as invoicing / customer app); grey box when there is none
const ItemThumb: React.FC<{ url?: string; name: string }> = ({ url, name }) => {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-300 dark:bg-gray-800 dark:text-gray-600">
        <Package className="h-4 w-4" />
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      title={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-9 w-9 shrink-0 rounded-md border border-gray-100 bg-white object-contain dark:border-gray-700"
    />
  );
};

const StockKpi: React.FC<{ title: string; color: string; icon: React.ReactNode }> = ({ title, color, icon }) => {
  const { data, loading, error } = useKpiData<StockData>('stock');
  const [tab, setTab] = useState<Tab>('fast');
  const [query, setQuery] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [selectedCos, setSelectedCos] = useState<string[]>(loadSavedCompanies);
  useEffect(() => localStorage.setItem(COMPANY_FILTER_KEY, JSON.stringify(selectedCos)), [selectedCos]);
  const imageMap = useProductImages();

  // Ignore remembered companies that no longer have any items; nothing selected = all companies
  const activeCos = useMemo(
    () => selectedCos.filter((code) => data?.companies?.some((c) => c.code === code)),
    [selectedCos, data]
  );
  const byCompany = useMemo(() => {
    const set = new Set(activeCos);
    const keep = (rows: StockRow[] = []) => (set.size ? rows.filter((r) => set.has(r.co)) : rows);
    return { fast: keep(data?.fast), slow: keep(data?.slow), nonMoving: keep(data?.nonMoving) };
  }, [data, activeCos]);
  const companyName = (code: string) => data?.companies?.find((c) => c.code === code)?.company ?? code;

  const active = TABS.find((t) => t.key === tab)!;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return byCompany[tab].filter(
      (r) =>
        (!q || `${r.code} ${r.product}`.toLowerCase().includes(q)) &&
        (!lowOnly || (r.daysLeft !== null && r.daysLeft <= 15))
    );
  }, [byCompany, tab, query, lowOnly]);

  const lowCount = useMemo(
    () => [...byCompany.fast, ...byCompany.slow].filter((r) => r.daysLeft !== null && r.daysLeft <= 7).length,
    [byCompany]
  );

  return (
    <KpiCard
      title={title}
      color={color}
      icon={icon}
      loading={loading}
      error={error}
      hasData={!!data}
      subtitle={`Movement based on last ${data?.lookbackDays ?? 90} days of sales (in PCS)`}
      headerRight={
        lowCount > 0 && (
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-400">
            {lowCount} items ≤ 7 days stock
          </span>
        )
      }
    >
      <Segmented
        value={tab}
        onChange={setTab}
        color={active.color}
        options={TABS.map((t) => ({ key: t.key, label: t.label, badge: data ? byCompany[t.key].length : 0 }))}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="min-w-[200px] flex-1">
          <SearchBox value={query} onChange={setQuery} placeholder="Search item code or name…" />
        </div>
        {data?.companies && (
          <CompanyMultiSelect companies={data.companies} selected={activeCos} onChange={setSelectedCos} />
        )}
        {tab !== 'nonMoving' && (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600 select-none dark:text-gray-300">
            <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} className="rounded" />
            Only ≤ 15 days left
          </label>
        )}
        <span className="text-xs text-gray-400">{active.hint}</span>
      </div>

      {activeCos.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {activeCos.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
            >
              {companyName(code)}
              <button
                type="button"
                onClick={() => setSelectedCos(activeCos.filter((c) => c !== code))}
                className="rounded-full text-blue-400 hover:text-blue-700"
                title="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setSelectedCos([])}
            className="ml-1 text-xs font-medium text-blue-600 hover:underline"
          >
            Show all companies
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState text="No items" />
      ) : (
        <div className="mt-3 max-h-[26rem] overflow-auto rounded-xl border border-gray-100 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-[1] text-[11px] tracking-wide text-white uppercase" style={{ background: active.color }}>
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Code</th>
                <th className="px-3 py-2 text-left font-semibold">Item</th>
                <th className="px-3 py-2 text-right font-semibold">Daily Avg</th>
                <th className="px-3 py-2 text-right font-semibold">Stock</th>
                <th className="px-3 py-2 text-center font-semibold">Stock Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((r) => (
                <tr key={r.code} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                  <td className="px-3 py-1.5 text-gray-500">{r.code}</td>
                  <td className="px-3 py-1.5 text-gray-700 dark:text-gray-200">
                    <div className="flex items-center gap-2.5">
                      <ItemThumb key={r.code} url={imageMap[r.code]} name={r.product} />
                      <span>{r.product}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold text-gray-800 dark:text-white/90">{qtyFmt(r.avgQty)}</td>
                  <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-300">{qtyFmt(r.stock)}</td>
                  <td className="px-3 py-1.5 text-center">
                    <DaysLeft days={r.daysLeft} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </KpiCard>
  );
};

export default StockKpi;
