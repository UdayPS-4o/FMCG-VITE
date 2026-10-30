import React, { useMemo, useState } from 'react';
import { CountUp, EmptyState, KpiCard, SearchBox, inr, inrCompact, longDate, useKpiData } from './shared';

interface RecRow {
  party: string;
  lastSales: number;
  lastRec: number;
  curSales: number;
  curRec: number;
  fySales: number;
  fyRec: number;
}
interface RecData {
  periods: Record<'last' | 'cur' | 'fy', { from: string; to: string }>;
  rows: RecRow[];
  totals: Omit<RecRow, 'party'>;
}

type Band = 'green' | 'orange' | 'red' | 'grey';
const BAND_COLORS: Record<Band, string> = { green: '#16a34a', orange: '#f59e0b', red: '#dc2626', grey: '#94a3b8' };
const BAND_LABELS: Record<Band, string> = { green: '≥ 100%', orange: '75–99%', red: '< 75%', grey: 'No sales' };

const pct = (rec: number, sales: number) => (sales > 0 ? (rec / sales) * 100 : 0);
const band = (p: number): Band => (p >= 100 ? 'green' : p >= 75 ? 'orange' : p > 0 ? 'red' : 'grey');

const PERIODS = [
  { key: 'last', label: 'Last Month', sales: 'lastSales', rec: 'lastRec', head: '#1e40af' },
  { key: 'cur', label: 'Current Month', sales: 'curSales', rec: 'curRec', head: '#1d4ed8' },
  { key: 'fy', label: 'Overall FY', sales: 'fySales', rec: 'fyRec', head: '#15803d' },
] as const;

const PctPill: React.FC<{ sales: number; rec: number; strong?: boolean }> = ({ sales, rec, strong }) => {
  if (sales <= 0) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  const p = pct(rec, sales);
  return (
    <span
      className={`inline-block min-w-[3.25rem] rounded-md px-1.5 py-0.5 text-center text-xs font-bold text-white ${strong ? 'text-sm' : ''}`}
      style={{ background: BAND_COLORS[band(p)] }}
    >
      {Math.round(p)}%
    </span>
  );
};

const SalesRecoveryKpi: React.FC<{ title: string; color: string; icon: React.ReactNode }> = ({ title, color, icon }) => {
  const { data, loading, error } = useKpiData<RecData>('sales-recovery');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, Band | ''>>({ last: '', cur: '', fy: '' });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => {
      if (q && !r.party.toLowerCase().includes(q)) return false;
      return PERIODS.every((p) => !filters[p.key] || band(pct(r[p.rec], r[p.sales])) === filters[p.key]);
    });
  }, [data, query, filters]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (t, r) => {
          PERIODS.forEach((p) => {
            t[p.sales] += r[p.sales];
            t[p.rec] += r[p.rec];
          });
          return t;
        },
        { lastSales: 0, lastRec: 0, curSales: 0, curRec: 0, fySales: 0, fyRec: 0 }
      ),
    [rows]
  );

  const isFiltered = !!query || Object.values(filters).some(Boolean);

  return (
    <KpiCard
      title={title}
      color={color}
      icon={icon}
      loading={loading}
      error={error}
      hasData={!!data}
      subtitle="DT-group parties · sales (Dr) vs recovery (Cr)"
    >
      {data && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PERIODS.map((p) => {
            const s = data.totals[p.sales];
            const r = data.totals[p.rec];
            const v = pct(r, s);
            const c = BAND_COLORS[band(v)];
            return (
              <div key={p.key} className="rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="font-medium">{p.label}</span>
                  <span className="text-[10px]">
                    {longDate(data.periods[p.key].from).slice(0, 5)} – {longDate(data.periods[p.key].to).slice(0, 5)}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-bold" style={{ color: c }}>
                    {s > 0 ? <CountUp value={v} format={(n) => `${n.toFixed(1)}%`} /> : '—'}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div className="kpi-bar-grow kpi-width-anim h-full rounded-full" style={{ width: `${Math.min(v, 100)}%`, background: c }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] text-gray-500">
                  <span>Sales <CountUp value={s} format={inrCompact} /></span>
                  <span>Rec <CountUp value={r} format={inrCompact} /></span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="min-w-[200px] flex-1">
          <SearchBox value={query} onChange={setQuery} placeholder="Search party…" />
        </div>
        {PERIODS.map((p) => (
          <select
            key={p.key}
            value={filters[p.key]}
            onChange={(e) => setFilters((f) => ({ ...f, [p.key]: e.target.value as Band | '' }))}
            className="h-8 rounded-lg border border-gray-200 bg-transparent px-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            title={`Filter ${p.label} recovery`}
          >
            <option value="">{p.label}: All</option>
            {(Object.keys(BAND_LABELS) as Band[]).map((b) => (
              <option key={b} value={b}>
                {p.label}: {BAND_LABELS[b]}
              </option>
            ))}
          </select>
        ))}
        {isFiltered && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setFilters({ last: '', cur: '', fy: '' });
            }}
            className="h-8 rounded-lg px-2 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Clear
          </button>
        )}
        <span className="text-xs text-gray-400">{rows.length} parties</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState text={isFiltered ? 'No parties match the filters' : 'No data'} />
      ) : (
        <div className="mt-3 max-h-[28rem] overflow-auto rounded-xl border border-gray-100 dark:border-gray-800">
          <table className="w-full min-w-[820px] text-xs">
            <thead className="sticky top-0 z-[1] text-white">
              <tr>
                <th rowSpan={2} className="bg-slate-800 px-3 py-2 text-left font-semibold">
                  Party
                </th>
                {PERIODS.map((p) => (
                  <th key={p.key} colSpan={3} className="px-3 py-1.5 text-center font-semibold" style={{ background: p.head }}>
                    {p.label.toUpperCase()}
                  </th>
                ))}
              </tr>
              <tr className="text-[10px] tracking-wide uppercase">
                {PERIODS.map((p) => (
                  <React.Fragment key={p.key}>
                    <th className="px-3 py-1 text-right font-medium" style={{ background: `${p.head}e6` }}>Sales</th>
                    <th className="px-3 py-1 text-right font-medium" style={{ background: `${p.head}e6` }}>Recovery</th>
                    <th className="px-3 py-1 text-center font-medium" style={{ background: `${p.head}e6` }}>Rec %</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((r) => (
                <tr key={r.party} className="hover:bg-blue-50/60 dark:hover:bg-white/[0.03]">
                  <td className="max-w-[14rem] truncate px-3 py-1.5 font-medium text-gray-700 dark:text-gray-200" title={r.party}>
                    {r.party}
                  </td>
                  {PERIODS.map((p) => (
                    <React.Fragment key={p.key}>
                      <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-300">{r[p.sales] > 0 ? inr(r[p.sales]) : '—'}</td>
                      <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-300">{r[p.rec] > 0 ? inr(r[p.rec]) : '—'}</td>
                      <td className="px-3 py-1.5 text-center">
                        <PctPill sales={r[p.sales]} rec={r[p.rec]} />
                      </td>
                    </React.Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0">
              <tr className="bg-slate-800 font-bold text-white">
                <td className="px-3 py-2">TOTAL{isFiltered ? ' (filtered)' : ''}</td>
                {PERIODS.map((p) => (
                  <React.Fragment key={p.key}>
                    <td className="px-3 py-2 text-right">{inr(totals[p.sales])}</td>
                    <td className="px-3 py-2 text-right">{inr(totals[p.rec])}</td>
                    <td className="px-3 py-2 text-center">
                      <PctPill sales={totals[p.sales]} rec={totals[p.rec]} strong />
                    </td>
                  </React.Fragment>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </KpiCard>
  );
};

export default SalesRecoveryKpi;
