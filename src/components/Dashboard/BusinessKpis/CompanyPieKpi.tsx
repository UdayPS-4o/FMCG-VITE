import React, { useEffect, useMemo, useState } from 'react';
import Chart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { fetchWithAuth } from '@/lib/api';
import {
  CHART_ANIMATIONS,
  CountUp,
  EmptyState,
  KpiCard,
  DaysInput,
  RANGE_KEYS,
  RangeData,
  RangeKey,
  SearchBox,
  Segmented,
  inr,
  inrCompact,
  qtyFmt,
  rangeLabel,
  useKpiData,
  useRangeDays,
} from './shared';

const PALETTE = [
  '#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#f97316',
  '#06b6d4', '#ec4899', '#84cc16', '#6366f1', '#14b8a6', '#f43f5e',
];

interface CompanyRow {
  code: string;
  company: string;
  amount: number;
}

interface Props {
  id: 'company-sales' | 'company-purchase';
  title: string;
  color: string;
  icon: React.ReactNode;
}

const CompanyPieKpi: React.FC<Props> = ({ id, title, color, icon }) => {
  const [days, setDays] = useRangeDays(id);
  const { data, loading, error } = useKpiData<RangeData<CompanyRow>>(id, days);
  const [range, setRange] = useState<RangeKey>('today');
  const [selected, setSelected] = useState<{ row: CompanyRow; color: string } | null>(null);

  const bucket = data?.[range];
  const rows = useMemo(() => (bucket?.rows ?? []).filter((r) => r.amount > 0), [bucket]);
  const total = bucket?.total ?? 0;
  // Stable reference so the donut isn't redrawn (closing its tooltip) on unrelated re-renders
  const series = useMemo(() => rows.map((r) => r.amount), [rows]);

  const options: ApexOptions = useMemo(
    () => ({
      chart: { type: 'donut', fontFamily: 'Outfit, sans-serif', animations: CHART_ANIMATIONS },
      labels: rows.map((r) => r.company),
      colors: rows.map((_, i) => PALETTE[i % PALETTE.length]),
      legend: { show: false },
      dataLabels: { enabled: false },
      stroke: { width: 2, colors: ['transparent'] },
      tooltip: { y: { formatter: (v: number) => inr(v) } },
      plotOptions: {
        pie: {
          expandOnClick: false,
          donut: {
            size: '68%',
            labels: {
              show: true,
              name: {
                show: true,
                fontSize: '12px',
                color: '#94a3b8',
                offsetY: 18,
                formatter: (n: string) => (n.length > 16 ? `${n.slice(0, 15)}…` : n),
              },
              value: {
                show: true,
                fontSize: '18px',
                fontWeight: 700,
                color: '#64748b',
                offsetY: -12,
                formatter: (v: string) => inrCompact(Number(v)),
              },
              total: {
                show: true,
                label: 'Total',
                fontSize: '12px',
                color: '#94a3b8',
                formatter: () => inrCompact(total),
              },
            },
          },
        },
      },
      states: { hover: { filter: { type: 'darken' } } },
    }),
    [rows, total]
  );

  return (
    <KpiCard
      title={title}
      color={color}
      icon={icon}
      loading={loading}
      error={error}
      hasData={!!data}
      subtitle="Click a company for item-wise details"
    >
      <Segmented
        value={range}
        onChange={setRange}
        color={color}
        options={RANGE_KEYS.map((k) => ({
          key: k,
          label: k === 'lastN' ? <DaysInput days={days} onChange={setDays} onFocus={() => setRange('lastN')} /> : rangeLabel(k, days),
        }))}
      />

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-4 grid flex-1 grid-cols-1 items-center gap-4 sm:grid-cols-[minmax(0,220px)_1fr]">
          <div className="mx-auto w-full max-w-[220px]">
            <Chart
              key={range}
              options={options}
              series={series}
              type="donut"
              height={220}
            />
          </div>
          <div className="max-h-72 space-y-1 overflow-auto pr-1">
            {rows.map((r, i) => {
              const c = PALETTE[i % PALETTE.length];
              const pct = total > 0 ? (r.amount / total) * 100 : 0;
              return (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => setSelected({ row: r, color: c })}
                  className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                >
                  <span className="h-3 w-3 shrink-0 rounded" style={{ background: c }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-700 group-hover:underline dark:text-gray-200">
                      {r.company}
                    </span>
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <span className="kpi-bar-grow block h-full rounded-full" style={{ width: `${pct}%`, background: c, animationDelay: `${i * 60}ms` }} />
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-semibold text-gray-800 dark:text-white/90"><CountUp value={r.amount} format={inr} /></span>
                    <span className="block text-[11px] text-gray-400"><CountUp value={pct} format={(n) => `${n.toFixed(1)}%`} /></span>
                  </span>
                </button>
              );
            })}
            <div className="flex justify-between border-t border-gray-100 px-2 pt-2 text-sm font-semibold dark:border-gray-800">
              <span className="text-gray-500">Total</span>
              <span className="text-gray-800 dark:text-white/90"><CountUp value={total} format={(n) => inr(n, true)} /></span>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <CompanyDetailModal
          type={id === 'company-sales' ? 'sales' : 'purchase'}
          company={selected.row}
          color={selected.color}
          range={range}
          days={days}
          onClose={() => setSelected(null)}
        />
      )}
    </KpiCard>
  );
};

// ---------- Drill-down modal ----------
interface DetailLine {
  code: string;
  product: string;
  party: string;
  unit: string;
  qty: number;
  amount: number;
}
interface DetailResponse {
  detail: DetailLine[];
  summary: DetailLine[];
  total: number;
}

const CompanyDetailModal: React.FC<{
  type: 'sales' | 'purchase';
  company: CompanyRow;
  color: string;
  range: RangeKey;
  days: number;
  onClose: () => void;
}> = ({ type, company, color, range, days, onClose }) => {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'summary' | 'detail'>('summary');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ type, code: company.code, range, days: String(days) });
    fetchWithAuth(`/api/dashboard/kpis/company-detail?${params}`)
      .then(async (r) => {
        if (r.ok) return r.json();
        const body = await r.json().catch(() => null);
        throw new Error(body?.message || `Server error (HTTP ${r.status})`);
      })
      .then((json) => !cancelled && setData(json))
      .catch((e: Error) => {
        if (cancelled) return;
        // fetch() rejects with a TypeError when the server can't be reached at all
        setError(e instanceof TypeError ? 'Cannot reach the server. Check that it is running and try again.' : `Failed to load details: ${e.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [type, company.code, range, days]);

  const lines = useMemo(() => {
    const list = (view === 'summary' ? data?.summary : data?.detail) ?? [];
    const q = query.trim().toLowerCase();
    return q ? list.filter((l) => `${l.code} ${l.product} ${l.party}`.toLowerCase().includes(q)) : list;
  }, [data, view, query]);

  return (
    <Modal isOpen onClose={onClose} className="m-4 w-full max-w-4xl overflow-hidden p-0">
      <div className="px-6 pt-6 pb-4" style={{ background: `linear-gradient(135deg, ${color}22, transparent)` }}>
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 rounded" style={{ background: color }} />
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{company.company}</h3>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {type === 'sales' ? 'Sales' : 'Purchase'} · {rangeLabel(range, days)} · {inr(company.amount)}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="w-72">
            <Segmented
              value={view}
              onChange={setView}
              color={color}
              options={[
                { key: 'summary', label: 'Item Summary', badge: data?.summary.length },
                { key: 'detail', label: 'Bill Lines', badge: data?.detail.length },
              ]}
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <SearchBox value={query} onChange={setQuery} placeholder="Search item or party…" />
          </div>
        </div>
      </div>
      <div className="max-h-[60vh] overflow-auto px-6 pb-6">
        {error ? (
          <div className="py-10 text-center text-sm text-red-500">{error}</div>
        ) : !data ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : lines.length === 0 ? (
          <EmptyState text="No items" />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-[11px] tracking-wide text-gray-500 uppercase dark:bg-gray-900">
              <tr>
                <th className="py-2 pr-3 text-left font-medium">Code</th>
                <th className="py-2 pr-3 text-left font-medium">Item</th>
                {view === 'detail' && <th className="py-2 pr-3 text-left font-medium">Party</th>}
                <th className="py-2 pr-3 text-right font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {lines.map((l, i) => (
                <tr key={`${l.code}-${l.unit}-${i}`} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                  <td className="py-2 pr-3 text-gray-500">{l.code}</td>
                  <td className="py-2 pr-3 text-gray-700 dark:text-gray-200">{l.product}</td>
                  {view === 'detail' && <td className="py-2 pr-3 text-gray-600 dark:text-gray-300">{l.party}</td>}
                  <td className="py-2 pr-3 text-right whitespace-nowrap text-gray-600 dark:text-gray-300">
                    {qtyFmt(l.qty)} <span className="text-[10px] text-gray-400">{l.unit}</span>
                  </td>
                  <td className="py-2 text-right font-semibold whitespace-nowrap text-gray-800 dark:text-white/90">
                    {inr(l.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-semibold dark:border-gray-700">
                <td colSpan={view === 'detail' ? 4 : 3} className="py-2 pr-3 text-right text-gray-500">
                  Total
                </td>
                <td className="py-2 text-right text-gray-800 dark:text-white/90">
                  {inr(lines.reduce((s, l) => s + l.amount, 0), true)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </Modal>
  );
};

export default CompanyPieKpi;
