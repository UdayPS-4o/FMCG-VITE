import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CountUp, EmptyState, KpiCard, SearchBox, inr, inrCompact, longDate, useIsNarrow, useKpiData } from './shared';

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
  { key: 'last', label: 'Last Month', short: 'Last Mo', sales: 'lastSales', rec: 'lastRec', head: '#1e40af', tint: '#60a5fa' },
  { key: 'cur', label: 'Current Month', short: 'This Mo', sales: 'curSales', rec: 'curRec', head: '#1d4ed8', tint: '#818cf8' },
  { key: 'fy', label: 'Overall FY', short: 'FY', sales: 'fySales', rec: 'fyRec', head: '#15803d', tint: '#22c55e' },
] as const;

// Phone list layout: party name + 3 fixed-width % columns
const MOBILE_GRID = 'grid grid-cols-[minmax(0,1fr)_repeat(3,2.75rem)] items-center gap-1 px-2';

const PctPill: React.FC<{ sales: number; rec: number; strong?: boolean; compact?: boolean }> = ({ sales, rec, strong, compact }) => {
  if (sales <= 0) return <span className="text-gray-300 dark:text-gray-600">—</span>;
  const p = pct(rec, sales);
  return (
    <span
      className={`inline-block rounded-md py-0.5 text-center font-bold text-white ${
        compact ? 'w-full px-0.5 text-[11px]' : 'min-w-[3.25rem] px-1.5 text-xs'
      } ${strong ? 'text-sm' : ''}`}
      style={{ background: BAND_COLORS[band(p)] }}
    >
      {Math.round(p)}%
    </span>
  );
};

const SalesRecoveryKpi: React.FC<{ title: string; color: string; icon: React.ReactNode }> = ({ title, color, icon }) => {
  const { data, loading, error } = useKpiData<RecData>('sales-recovery');
  const [query, setQuery] = useState('');
  const [openParty, setOpenParty] = useState<string | null>(null);
  const narrow = useIsNarrow();
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
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {PERIODS.map((p) => {
            const s = data.totals[p.sales];
            const r = data.totals[p.rec];
            const v = pct(r, s);
            const c = BAND_COLORS[band(v)];
            return (
              <div key={p.key} className="min-w-0 rounded-xl border border-gray-100 p-2 sm:p-3 dark:border-gray-800">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span className="truncate font-medium">{narrow ? p.short : p.label}</span>
                  <span className="hidden text-[10px] sm:inline">
                    {longDate(data.periods[p.key].from).slice(0, 5)} – {longDate(data.periods[p.key].to).slice(0, 5)}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-bold sm:text-2xl" style={{ color: c }}>
                    {s > 0 ? <CountUp value={v} format={(n) => `${n.toFixed(1)}%`} /> : '—'}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div className="kpi-bar-grow kpi-width-anim h-full rounded-full" style={{ width: `${Math.min(v, 100)}%`, background: c }} />
                </div>
                <div className="mt-1.5 flex flex-col text-[10px] text-gray-500 sm:flex-row sm:justify-between sm:text-[11px] dark:text-gray-400">
                  <span>Sales <CountUp value={s} format={inrCompact} /></span>
                  <span>Rec <CountUp value={r} format={inrCompact} /></span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4">
        <div className="w-full sm:w-auto sm:min-w-[200px] sm:flex-1">
          <SearchBox value={query} onChange={setQuery} placeholder="Search party…" />
        </div>
        {PERIODS.map((p) => (
          <select
            key={p.key}
            value={filters[p.key]}
            onChange={(e) => setFilters((f) => ({ ...f, [p.key]: e.target.value as Band | '' }))}
            className="h-8 min-w-0 flex-1 rounded-lg border border-gray-200 bg-transparent px-1.5 text-xs text-gray-600 sm:flex-none sm:px-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
            title={`Filter ${p.label} recovery`}
          >
            <option value="">{narrow ? p.short : `${p.label}: All`}</option>
            {(Object.keys(BAND_LABELS) as Band[]).map((b) => (
              <option key={b} value={b}>
                {narrow ? `${p.short} ${BAND_LABELS[b]}` : `${p.label}: ${BAND_LABELS[b]}`}
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
        <span className="ml-auto text-xs text-gray-400 sm:ml-0">{rows.length} parties</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState text={isFiltered ? 'No parties match the filters' : 'No data'} />
      ) : (
        <>
        {/* Phones: one compact row per party with the 3 recovery %s; tap a row for the amounts */}
        <div className="mt-3 max-h-[70vh] overflow-auto rounded-xl border border-gray-100 sm:hidden dark:border-gray-800">
          <div className={`sticky top-0 z-[1] ${MOBILE_GRID} bg-slate-800 py-1.5 text-[10px] font-semibold tracking-wide text-white uppercase`}>
            <span>Party</span>
            {PERIODS.map((p) => (
              <span key={p.key} className="text-center">{p.short}</span>
            ))}
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((r) => {
              const open = openParty === r.party;
              return (
                <li key={r.party}>
                  <button
                    type="button"
                    onClick={() => setOpenParty(open ? null : r.party)}
                    aria-expanded={open}
                    className={`${MOBILE_GRID} w-full py-2 text-left text-xs active:bg-blue-50/60 dark:active:bg-white/[0.04]`}
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      <ChevronDown className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                      <span className="line-clamp-2 font-medium break-words text-gray-700 dark:text-gray-200">{r.party}</span>
                    </span>
                    {PERIODS.map((p) => (
                      <span key={p.key} className="text-center">
                        <PctPill sales={r[p.sales]} rec={r[p.rec]} compact />
                      </span>
                    ))}
                  </button>
                  {open && (
                    <div className="grid grid-cols-3 gap-1.5 bg-gray-50 px-2 pt-1 pb-2 text-[11px] dark:bg-white/[0.03]">
                      {PERIODS.map((p) => (
                        <div key={p.key} className="min-w-0 rounded-lg border border-gray-100 bg-white p-1.5 dark:border-gray-800 dark:bg-gray-900">
                          <div className="mb-0.5 text-[10px] font-semibold uppercase" style={{ color: p.tint }}>
                            {p.short}
                          </div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400">Sales</div>
                          <div className="truncate font-medium text-gray-700 dark:text-gray-200">{r[p.sales] > 0 ? inr(r[p.sales]) : '—'}</div>
                          <div className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">Recovery</div>
                          <div className="truncate font-medium text-gray-700 dark:text-gray-200">{r[p.rec] > 0 ? inr(r[p.rec]) : '—'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className={`sticky bottom-0 ${MOBILE_GRID} bg-slate-800 py-2 text-xs font-bold text-white`}>
            <span className="min-w-0">
              TOTAL{isFiltered ? ' (filtered)' : ''}
              <span className="block text-[10px] font-normal text-slate-300">
                FY {inrCompact(totals.fySales)} / {inrCompact(totals.fyRec)}
              </span>
            </span>
            {PERIODS.map((p) => (
              <span key={p.key} className="text-center">
                <PctPill sales={totals[p.sales]} rec={totals[p.rec]} compact />
              </span>
            ))}
          </div>
        </div>

        <div className="mt-3 hidden max-h-[28rem] overflow-auto rounded-xl border border-gray-100 sm:block dark:border-gray-800">
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
        </>
      )}
    </KpiCard>
  );
};

export default SalesRecoveryKpi;
