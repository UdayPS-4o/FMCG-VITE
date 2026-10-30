import React, { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { BarChart3, Building2, Check, ChevronDown, LineChart, X } from 'lucide-react';
import {
  CHART_ANIMATIONS,
  CountUp,
  EmptyState,
  KpiCard,
  SearchBox,
  Segmented,
  escapeHtml,
  inr,
  inrAxis,
  inrCompact,
  useKpiData,
} from './shared';

interface CompanyAmount {
  company: string;
  amount: number;
}
interface CompanyInfo {
  code: string;
  company: string;
  curFyTotal: number;
}
interface TrendData {
  months: string[];
  companyList: CompanyInfo[];
  // companySeries[code][fyLabel] = 12 monthly amounts (Apr..Mar)
  companySeries: Record<string, Record<string, number[]>>;
  monthly: {
    fy: string;
    values: number[];
    total: number;
    companies: CompanyAmount[][];
    totalCompanies: CompanyAmount[];
  };
  yearly: { fy: string; values: number[]; total: number; companies: CompanyAmount[][] }[];
}

const YEAR_COLORS = ['#cbd5e1', '#94a3b8', '#8b5cf6'];
const COMPANY_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#f97316',
  '#06b6d4', '#ec4899', '#84cc16', '#6366f1', '#14b8a6', '#f43f5e',
];
const MAX_COMPARE = COMPANY_COLORS.length;
const STORAGE_KEY = 'dashboard-trend-companies';
const yaxis = { labels: { formatter: (v: number) => inrAxis(v), style: { colors: '#94a3b8' } } };

const tooltipHtml = (title: string, companies: CompanyAmount[] | undefined, total: number, color: string, totalLabel = 'TOTAL') => {
  const rows = (companies ?? [])
    .map(
      (c) =>
        `<tr><td style="padding:2px 12px 2px 0;white-space:nowrap">${escapeHtml(c.company)}</td>` +
        `<td style="padding:2px 0;text-align:right;font-weight:600;color:#facc15">${inr(c.amount)}</td></tr>`
    )
    .join('');
  return (
    `<div style="background:rgba(15,23,42,.96);color:#fff;padding:10px 12px;border-radius:10px;font-size:11px;min-width:220px">` +
    `<div style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:12px;margin-bottom:6px">` +
    `<span style="width:8px;height:8px;border-radius:2px;background:${color}"></span>${escapeHtml(title)}</div>` +
    `<table style="width:100%;border-collapse:collapse">${rows}` +
    `<tr style="border-top:1px solid #475569"><td style="padding-top:5px;color:#cbd5e1;font-weight:700">${totalLabel}</td>` +
    `<td style="padding-top:5px;text-align:right;font-weight:700;color:#4ade80">${inr(total)}</td></tr></table></div>`
  );
};

const sumArrays = (arrays: number[][]) => Array.from({ length: 12 }, (_, i) => arrays.reduce((s, a) => s + (a[i] || 0), 0));

// ---------- Company picker (searchable multi-select) ----------
const CompanyPicker: React.FC<{
  companies: CompanyInfo[];
  selected: string[];
  onChange: (codes: string[]) => void;
  colorOf: (code: string) => string;
}> = ({ companies, selected, onChange, colorOf }) => {
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
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code].slice(0, MAX_COMPARE));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition ${
          selected.length
            ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300'
            : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.04]'
        }`}
      >
        <Building2 className="h-3.5 w-3.5" />
        Compare companies
        {selected.length > 0 && (
          <span className="rounded-full bg-blue-600 px-1.5 text-[10px] leading-4 text-white">{selected.length}</span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-900">
          <SearchBox value={query} onChange={setQuery} placeholder="Search company…" />
          <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-gray-400">
            <span>
              {selected.length}/{MAX_COMPARE} selected · sorted by this FY's sales
            </span>
            {selected.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="font-medium text-blue-600 hover:underline">
                Clear
              </button>
            )}
          </div>
          <div className="mt-1 max-h-72 overflow-auto">
            {list.map((c) => {
              const on = selected.includes(c.code);
              const disabled = !on && selected.length >= MAX_COMPARE;
              return (
                <button
                  key={c.code}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(c.code)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-gray-50 disabled:opacity-40 dark:hover:bg-white/[0.04]"
                >
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                    style={on ? { background: colorOf(c.code), borderColor: colorOf(c.code) } : undefined}
                  >
                    {on && <Check className="h-3 w-3 text-white" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-200">{c.company}</span>
                  <span className="text-[11px] text-gray-400">{inrCompact(c.curFyTotal)}</span>
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

const ChartTypeToggle: React.FC<{ value: 'bar' | 'line'; onChange: (v: 'bar' | 'line') => void }> = ({ value, onChange }) => (
  <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-gray-900">
    {(['bar', 'line'] as const).map((t) => (
      <button
        key={t}
        type="button"
        onClick={() => onChange(t)}
        className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
          value === t ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white' : 'text-gray-500'
        }`}
      >
        {t === 'bar' ? <BarChart3 className="h-3.5 w-3.5" /> : <LineChart className="h-3.5 w-3.5" />}
        {t === 'bar' ? 'Bar' : 'Line'}
      </button>
    ))}
  </div>
);

const TrendKpi: React.FC<{ title: string; color: string; icon: React.ReactNode }> = ({ title, color, icon }) => {
  const { data, loading, error } = useKpiData<TrendData>('trend');
  const [tab, setTab] = useState<'monthly' | 'yearly'>('monthly');
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [selected, setSelected] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(saved) ? saved.slice(0, MAX_COMPARE) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(selected)), [selected]);

  // Drop saved companies that no longer exist in the data
  const activeCodes = useMemo(
    () => (data ? selected.filter((c) => data.companySeries?.[c]) : []),
    [data, selected]
  );
  const comparing = activeCodes.length > 0;
  const nameOf = useMemo(() => new Map((data?.companyList ?? []).map((c) => [c.code, c.company])), [data]);
  const colorOf = (code: string) => COMPANY_COLORS[Math.max(activeCodes.indexOf(code), 0) % COMPANY_COLORS.length];
  const curFy = data?.monthly.fy ?? '';

  // Yearly series: all sales, or the combined sales of the selected companies
  const yearlyView = useMemo(() => {
    if (!data) return [];
    if (!comparing) return data.yearly.map((y) => ({ fy: y.fy, values: y.values, total: y.total, companies: y.companies }));
    return data.yearly.map((y, fyIdx) => {
      const values = sumArrays(activeCodes.map((c) => data.companySeries[c][y.fy] ?? []));
      const companies = Array.from({ length: 12 }, (_, m) =>
        activeCodes
          .map((c) => ({ company: nameOf.get(c) ?? c, amount: data.companySeries[c][y.fy]?.[m] ?? 0 }))
          .sort((a, b) => b.amount - a.amount)
      );
      return { fy: data.yearly[fyIdx].fy, values, total: values.reduce((s, v) => s + v, 0), companies };
    });
  }, [data, comparing, activeCodes, nameOf]);

  // ----- Chart options -----
  const xaxis = useMemo(
    () => ({
      categories: data?.months ?? [],
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { colors: '#64748b' } },
    }),
    [data]
  );

  const monthlyOptions: ApexOptions | null = useMemo(() => {
    if (!data) return null;
    if (comparing) {
      return {
        chart: { type: chartType, fontFamily: 'Outfit, sans-serif', toolbar: { show: false }, animations: CHART_ANIMATIONS },
        colors: activeCodes.map(colorOf),
        plotOptions: { bar: { columnWidth: activeCodes.length > 3 ? '80%' : '60%', borderRadius: 3, borderRadiusApplication: 'end' } },
        stroke: chartType === 'line' ? { width: 3, curve: 'smooth' } : { width: 0 },
        markers: { size: chartType === 'line' ? 4 : 0, hover: { size: 6 } },
        dataLabels: { enabled: false },
        legend: { show: false },
        grid: { borderColor: '#e2e8f040', strokeDashArray: 4 },
        xaxis,
        yaxis,
        tooltip: {
          shared: true,
          intersect: false,
          custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
            const rows = activeCodes
              .map((c) => ({ company: nameOf.get(c) ?? c, amount: data.companySeries[c][curFy]?.[dataPointIndex] ?? 0 }))
              .sort((a, b) => b.amount - a.amount);
            return tooltipHtml(
              `${data.months[dataPointIndex]} · FY ${curFy}`,
              rows,
              rows.reduce((s, r) => s + r.amount, 0),
              color,
              'SELECTED'
            );
          },
        },
      };
    }
    return {
      chart: { type: chartType, fontFamily: 'Outfit, sans-serif', toolbar: { show: false }, animations: CHART_ANIMATIONS },
      colors: [color],
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 6, borderRadiusApplication: 'end', dataLabels: { position: 'top' } } },
      stroke: chartType === 'line' ? { width: 3, curve: 'smooth' } : { width: 0 },
      markers: { size: chartType === 'line' ? 4 : 0, hover: { size: 6 } },
      dataLabels: {
        enabled: chartType === 'bar',
        formatter: (v: number) => (v > 0 ? `${(v / 1e5).toFixed(1)}L` : ''),
        offsetY: -18,
        style: { fontSize: '10px', colors: ['#64748b'], fontWeight: 500 },
      },
      grid: { borderColor: '#e2e8f040', strokeDashArray: 4 },
      xaxis,
      yaxis,
      fill:
        chartType === 'bar'
          ? { type: 'gradient', gradient: { shade: 'light', type: 'vertical', opacityFrom: 1, opacityTo: 0.75, stops: [0, 100] } }
          : { type: 'solid' },
      tooltip: {
        custom: ({ dataPointIndex }: { dataPointIndex: number }) =>
          tooltipHtml(
            `${data.months[dataPointIndex]} · FY ${data.monthly.fy}`,
            data.monthly.companies[dataPointIndex],
            data.monthly.values[dataPointIndex],
            color
          ),
      },
    };
    // colorOf derives from activeCodes, which is already a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, color, comparing, activeCodes, chartType, nameOf, curFy, xaxis]);

  const yearlyOptions: ApexOptions | null = useMemo(() => {
    if (!data) return null;
    return {
      chart: { type: chartType, fontFamily: 'Outfit, sans-serif', toolbar: { show: false }, animations: CHART_ANIMATIONS },
      colors: YEAR_COLORS,
      plotOptions: { bar: { columnWidth: '70%', borderRadius: 4, borderRadiusApplication: 'end' } },
      stroke: chartType === 'line' ? { width: 3, curve: 'smooth' } : { width: 0 },
      markers: { size: chartType === 'line' ? 4 : 0, hover: { size: 6 } },
      dataLabels: { enabled: false },
      legend: { position: 'top', horizontalAlign: 'right', fontSize: '12px', labels: { colors: '#64748b' } },
      grid: { borderColor: '#e2e8f040', strokeDashArray: 4 },
      xaxis,
      yaxis,
      tooltip: {
        shared: false,
        intersect: chartType === 'bar',
        custom: ({ seriesIndex, dataPointIndex }: { seriesIndex: number; dataPointIndex: number }) => {
          const y = yearlyView[seriesIndex];
          return tooltipHtml(
            `${data.months[dataPointIndex]} · FY ${y.fy}`,
            y.companies[dataPointIndex],
            y.values[dataPointIndex],
            YEAR_COLORS[seriesIndex],
            comparing ? 'SELECTED' : 'TOTAL'
          );
        },
      },
    };
  }, [data, chartType, yearlyView, comparing, xaxis]);

  // Stable series references: react-apexcharts redraws the chart (closing any open tooltip)
  // whenever it receives a new series array, so only rebuild these when their inputs change.
  const monthlySeries = useMemo(() => {
    if (!data) return [];
    if (!comparing) return [{ name: 'Sales', data: data.monthly.values }];
    return activeCodes.map((c) => ({ name: nameOf.get(c) ?? c, data: data.companySeries[c][curFy] ?? Array(12).fill(0) }));
  }, [data, comparing, activeCodes, nameOf, curFy]);
  const yearlySeries = useMemo(() => yearlyView.map((y) => ({ name: `FY ${y.fy}`, data: y.values })), [yearlyView]);

  // ----- Header figures (follow the company selection) -----
  const cur = yearlyView[yearlyView.length - 1];
  const prev = yearlyView[yearlyView.length - 2];
  // Compare completed months of the current FY against the same months of the previous FY
  const month = new Date().getMonth() + 1;
  const completedMonths = month >= 4 ? month - 4 : month + 8;
  const sumMonths = (values?: number[]) => (values ?? []).slice(0, completedMonths).reduce((s, v) => s + v, 0);
  const curCompleted = sumMonths(cur?.values);
  const prevCompleted = sumMonths(prev?.values);
  const growth = completedMonths > 0 && prevCompleted > 0 ? ((curCompleted - prevCompleted) / prevCompleted) * 100 : null;
  const growthPeriod = completedMonths > 0 && data ? `${data.months[0]}–${data.months[completedMonths - 1]}` : '';
  const headerTotal = comparing ? cur?.total ?? 0 : data?.monthly.total ?? 0;

  return (
    <KpiCard
      title={title}
      color={color}
      icon={icon}
      loading={loading}
      error={error}
      hasData={!!data}
      subtitle={
        data
          ? comparing
            ? `FY ${curFy} · comparing ${activeCodes.length} compan${activeCodes.length === 1 ? 'y' : 'ies'}`
            : `FY ${curFy} · hover bars for company split`
          : 'Monthly and yearly sales'
      }
      headerRight={
        data && (
          <div className="text-right">
            <div className="text-lg font-bold text-gray-800 dark:text-white/90">
              <CountUp value={headerTotal} format={inrCompact} />
            </div>
            {growth !== null && (
              <div className={`text-[11px] font-semibold ${growth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {growth >= 0 ? '▲' : '▼'} <CountUp value={Math.abs(growth)} format={(n) => n.toFixed(1)} />% vs last FY ({growthPeriod})
                {comparing && ' · selected'}
              </div>
            )}
          </div>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[240px] flex-1">
          <Segmented
            value={tab}
            onChange={setTab}
            color={color}
            options={[
              { key: 'monthly', label: 'Monthly Trend (Apr–Mar)' },
              { key: 'yearly', label: 'Yearly Comparison' },
            ]}
          />
        </div>
        {data && (
          <CompanyPicker companies={data.companyList ?? []} selected={activeCodes} onChange={setSelected} colorOf={colorOf} />
        )}
        <ChartTypeToggle value={chartType} onChange={setChartType} />
      </div>

      {comparing && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {activeCodes.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-200"
              style={{ borderColor: `${colorOf(c)}66`, background: `${colorOf(c)}14` }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: colorOf(c) }} />
              {nameOf.get(c) ?? c}
              <button
                type="button"
                onClick={() => setSelected(selected.filter((s) => s !== c))}
                className="rounded-full text-gray-400 hover:text-gray-700"
                title="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button type="button" onClick={() => setSelected([])} className="ml-1 text-xs font-medium text-blue-600 hover:underline">
            Show all sales
          </button>
          {tab === 'yearly' && activeCodes.length > 1 && (
            <span className="text-[11px] text-gray-400">· yearly bars show the selected companies combined</span>
          )}
        </div>
      )}

      {!data ? (
        <EmptyState />
      ) : tab === 'monthly' && monthlyOptions ? (
        <div className="mt-2 -mx-2">
          <Chart
            key={`m-${chartType}-${comparing ? 'co' : 'all'}`}
            options={monthlyOptions}
            series={monthlySeries}
            type={chartType}
            height={320}
          />
        </div>
      ) : yearlyOptions ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {yearlyView.map((y, i) => (
              <div key={y.fy} className="rounded-xl border border-gray-100 px-3 py-2 dark:border-gray-800">
                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className="h-2 w-2 rounded-sm" style={{ background: YEAR_COLORS[i] }} /> FY {y.fy}
                </div>
                <div className="text-sm font-bold text-gray-800 dark:text-white/90">
                  <CountUp value={y.total} format={inrCompact} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 -mx-2">
            <Chart key={`y-${chartType}`} options={yearlyOptions} series={yearlySeries} type={chartType} height={300} />
          </div>
        </>
      ) : null}
    </KpiCard>
  );
};

export default TrendKpi;
