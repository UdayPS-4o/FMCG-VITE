import React, { useMemo, useState } from 'react';
import { EmptyState, KpiCard, SearchBox, Segmented, qtyFmt, useKpiData } from './shared';

interface StockRow {
  code: string;
  product: string;
  avgQty: number;
  stock: number;
  daysLeft: number | null;
}
interface StockData {
  lookbackDays: number;
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

const StockKpi: React.FC<{ title: string; color: string; icon: React.ReactNode }> = ({ title, color, icon }) => {
  const { data, loading, error } = useKpiData<StockData>('stock');
  const [tab, setTab] = useState<Tab>('fast');
  const [query, setQuery] = useState('');
  const [lowOnly, setLowOnly] = useState(false);

  const active = TABS.find((t) => t.key === tab)!;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.[tab] ?? []).filter(
      (r) =>
        (!q || `${r.code} ${r.product}`.toLowerCase().includes(q)) &&
        (!lowOnly || (r.daysLeft !== null && r.daysLeft <= 15))
    );
  }, [data, tab, query, lowOnly]);

  const lowCount = useMemo(
    () => (data ? [...data.fast, ...data.slow].filter((r) => r.daysLeft !== null && r.daysLeft <= 7).length : 0),
    [data]
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
        options={TABS.map((t) => ({ key: t.key, label: t.label, badge: data?.[t.key].length ?? 0 }))}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="min-w-[200px] flex-1">
          <SearchBox value={query} onChange={setQuery} placeholder="Search item code or name…" />
        </div>
        {tab !== 'nonMoving' && (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600 select-none dark:text-gray-300">
            <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} className="rounded" />
            Only ≤ 15 days left
          </label>
        )}
        <span className="text-xs text-gray-400">{active.hint}</span>
      </div>

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
                  <td className="px-3 py-1.5 text-gray-700 dark:text-gray-200">{r.product}</td>
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
