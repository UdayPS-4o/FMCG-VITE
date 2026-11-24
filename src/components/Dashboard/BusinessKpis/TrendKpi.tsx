import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { BarChart3, Building2, Check, ChevronDown, LineChart, X } from 'lucide-react';
import {
  CHART_ANIMATIONS,
  useIsNarrow,
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
  // "Till day N" figures: each month's sales from the 1st to today's day-of-month.
  // Optional so the card still works against a server without them.
  mtdDay?: number;
  currentMonthIndex?: number; // FY month index of today (0 = Apr)
  companyList: CompanyInfo[];
  // companySeries[code][fyLabel] = 12 monthly amounts (Apr..Mar)
  companySeries: Record<string, Record<string, number[]>>;
  companySeriesMtd?: Record<string, Record<string, number[]>>;
  monthly: {
    fy: string;
    values: number[];
    mtdValues?: number[];
    total: number;
    companies: CompanyAmount[][];
    totalCompanies: CompanyAmount[];
  };
  yearly: { fy: string; values: number[]; mtdValues?: number[]; total: number; companies: CompanyAmount[][] }[];
}

const YEAR_COLORS = ['#cbd5e1', '#94a3b8', '#8b5cf6'];
const COMPANY_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#f97316',
  '#06b6d4', '#ec4899', '#84cc16', '#6366f1', '#14b8a6', '#f43f5e',
];
const MAX_COMPARE = COMPANY_COLORS.length;
const STORAGE_KEY = 'dashboard-trend-companies';
const yaxis = { labels: { formatter: (v: number) => inrAxis(v), style: { colors: '#94a3b8' } } };

const MARKER_COLOR = '#f97316';

// 1 → 1st, 2 → 2nd, 23 → 23rd …
const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] || 'th';
  return `${n}${s}`;
};

interface TooltipExtra {
  label: string;
  value: string;
  color?: string;
}

const tooltipHtml = (
  title: string,
  companies: CompanyAmount[] | undefined,
  total: number,
  color: string,
  totalLabel = 'TOTAL',
  extras: TooltipExtra[] = [],
  maxCompanies?: number // phones: keep the box short enough to fit inside the chart
) => {
  const list = companies ?? [];
  const shown = maxCompanies && list.length > maxCompanies ? list.slice(0, maxCompanies) : list;
  const hidden = list.length - shown.length;
  // Names may wrap and amounts never do, so the box fits a phone screen (width capped below)
  const rows = shown
    .map(
      (c) =>
        `<tr><td style="padding:2px 10px 2px 0;white-space:normal;word-break:break-word">${escapeHtml(c.company)}</td>` +
        `<td style="padding:2px 0;text-align:right;font-weight:600;color:#facc15;white-space:nowrap;vertical-align:top">${inr(c.amount)}</td></tr>`
    )
    .join('') +
    (hidden > 0 ? `<tr><td colspan="2" style="padding:2px 0;color:#94a3b8">+${hidden} more</td></tr>` : '');
  const extraRows = extras
    .map(
      (x, i) =>
        `<tr${i === 0 ? ' style="border-top:1px solid #475569"' : ''}><td style="padding-top:${i === 0 ? 5 : 2}px;padding-right:10px;color:#fdba74">${escapeHtml(x.label)}</td>` +
        `<td style="padding-top:${i === 0 ? 5 : 2}px;text-align:right;font-weight:700;white-space:nowrap;vertical-align:top;color:${x.color || '#fdba74'}">${escapeHtml(x.value)}</td></tr>`
    )
    .join('');
  return (
    `<div style="background:rgba(15,23,42,.96);color:#fff;padding:8px 10px;border-radius:10px;font-size:11px;min-width:min(220px,calc(100vw - 40px));max-width:min(380px,calc(100vw - 40px))">` +
    `<div style="display:flex;align-items:center;gap:6px;font-weight:600;font-size:12px;margin-bottom:6px">` +
    `<span style="width:8px;height:8px;border-radius:2px;background:${color}"></span>${escapeHtml(title)}</div>` +
    `<table style="width:100%;border-collapse:collapse">${rows}` +
    `<tr style="border-top:1px solid #475569"><td style="padding-top:5px;color:#cbd5e1;font-weight:700">${totalLabel}</td>` +
    `<td style="padding-top:5px;text-align:right;font-weight:700;color:#4ade80">${inr(total)}</td></tr>${extraRows}</table></div>`
  );
};

const pctChange = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);
const pctText = (p: number | null) => (p === null ? '—' : `${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(1)}%`);

/**
 * Draws the "till day N" line inside each bar. ApexCharts has no per-bar marker, so after
 * the chart draws we read each bar's drawn box and place the line at mtd/full of its height
 * (bars start at ₹0, so the bar height is proportional to its value). Works for single,
 * grouped and company bars alike. mtd[s][j] = null skips that bar.
 */
function drawTillDayMarkers(root: Element | null | undefined, full: number[][], mtd: (number | null)[][], labels: boolean) {
  if (!root) return;
  root.querySelectorAll('.till-day-markers').forEach((g) => g.remove());
  const NS = 'http://www.w3.org/2000/svg';
  root.querySelectorAll('.apexcharts-bar-series .apexcharts-series').forEach((seriesEl, seriesPos) => {
    const s = Number(seriesEl.getAttribute('data:realIndex') ?? seriesPos);
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'till-day-markers');
    g.setAttribute('pointer-events', 'none');
    seriesEl.querySelectorAll('path.apexcharts-bar-area').forEach((path, pathPos) => {
      const j = Number(path.getAttribute('j') ?? pathPos);
      const v = mtd[s]?.[j];
      const f = full[s]?.[j];
      if (v == null || !f || f <= 0) return;
      const box = (path as SVGGraphicsElement).getBBox();
      if (box.height < 2) return;
      const y = box.y + box.height - Math.min(v / f, 1) * box.height;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(box.x - 2));
      line.setAttribute('x2', String(box.x + box.width + 2));
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
      line.setAttribute('stroke', MARKER_COLOR);
      line.setAttribute('stroke-width', '2.5');
      line.setAttribute('stroke-linecap', 'round');
      g.appendChild(line);
      if (labels && box.y + box.height - y > 26) {
        const text = document.createElementNS(NS, 'text');
        text.setAttribute('x', String(box.x + box.width / 2));
        text.setAttribute('y', String(y + 12));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '10');
        text.setAttribute('font-weight', '600');
        text.setAttribute('fill', '#9a3412');
        text.textContent = `${(v / 1e5).toFixed(1)}L`;
        g.appendChild(text);
      }
    });
    seriesEl.appendChild(g);
  });
}

const sumArrays = (arrays: number[][]) => Array.from({ length: 12 }, (_, i) => arrays.reduce((s, a) => s + (a[i] || 0), 0));

// The running month already *is* "till today", and future months have nothing yet
const isSkippedBar = (fy: string, j: number, curFy: string, cmi: number) => fy === curFy && j >= cmi;
const maskTill = (fy: string, values: number[] | undefined, curFy: string, cmi: number) =>
  (values ?? []).map((v, j) => (isSkippedBar(fy, j, curFy, cmi) ? null : v));

interface MarkerData {
  full: number[][];
  mtd: (number | null)[][];
}

// ---------- Company picker (searchable multi-select) ----------
const CompanyPicker: React.FC<{
  // undefined when the server is still running code from before company comparison was added
  companies: CompanyInfo[] | undefined;
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
  const all = companies ?? [];
  const list = q ? all.filter((c) => c.company.toLowerCase().includes(q)) : all;
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
            {!companies ? (
              <div className="px-3 py-6 text-center text-xs text-amber-600">
                Company data isn&apos;t available yet. The server is running older code; restart it to enable comparison.
              </div>
            ) : (
              list.length === 0 && <div className="py-6 text-center text-xs text-gray-400">No companies</div>
            )}
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

  // ----- "Till day N" comparison -----
  const mtdDay = data?.mtdDay ?? 0;
  const cmi = data?.currentMonthIndex ?? -1;
  const hasMtd = !!(data && mtdDay && cmi >= 0 && data.monthly.mtdValues);
  const dayLabel = mtdDay ? ordinal(mtdDay) : '';

  // Sales till day N for one FY month, following the company selection
  const mtdOf = useCallback(
    (fy: string, j: number) => {
      if (!data) return 0;
      if (comparing) return activeCodes.reduce((s, c) => s + (data.companySeriesMtd?.[c]?.[fy]?.[j] ?? 0), 0);
      return data.yearly.find((y) => y.fy === fy)?.mtdValues?.[j] ?? 0;
    },
    [data, comparing, activeCodes]
  );

  // Tooltip rows: this bar's sales till day N, and how the running month compares with it
  const tillExtras = useCallback(
    (fy: string, j: number): TooltipExtra[] => {
      if (!hasMtd || !data) return [];
      if (fy === curFy && j === cmi) return [{ label: 'Month in progress', value: `till ${dayLabel}` }];
      if (isSkippedBar(fy, j, curFy, cmi)) return [];
      const v = mtdOf(fy, j);
      const p = pctChange(mtdOf(curFy, cmi), v);
      return [
        { label: `Till ${dayLabel}`, value: inr(v) },
        {
          label: `${data.months[cmi]} till ${dayLabel} vs this`,
          value: pctText(p),
          color: p === null ? undefined : p >= 0 ? '#4ade80' : '#f87171',
        },
      ];
    },
    [hasMtd, data, curFy, cmi, dayLabel, mtdOf]
  );

  // Yearly series: all sales, or the combined sales of the selected companies
  const yearlyView = useMemo(() => {
    if (!data) return [];
    if (!comparing) {
      return data.yearly.map((y) => ({
        fy: y.fy,
        values: y.values,
        mtdValues: y.mtdValues ?? [],
        total: y.total,
        companies: y.companies,
      }));
    }
    return data.yearly.map((y, fyIdx) => {
      const values = sumArrays(activeCodes.map((c) => data.companySeries[c][y.fy] ?? []));
      const mtdValues = sumArrays(activeCodes.map((c) => data.companySeriesMtd?.[c]?.[y.fy] ?? []));
      const companies = Array.from({ length: 12 }, (_, m) =>
        activeCodes
          .map((c) => ({ company: nameOf.get(c) ?? c, amount: data.companySeries[c][y.fy]?.[m] ?? 0 }))
          .sort((a, b) => b.amount - a.amount)
      );
      return { fy: data.yearly[fyIdx].fy, values, mtdValues, total: values.reduce((s, v) => s + v, 0), companies };
    });
  }, [data, comparing, activeCodes, nameOf]);

  // Bar values and their "till day N" values, per series, for the markers
  const monthlyMarkers: MarkerData | null = useMemo(() => {
    if (!data || !hasMtd) return null;
    if (!comparing) return { full: [data.monthly.values], mtd: [maskTill(curFy, data.monthly.mtdValues, curFy, cmi)] };
    return {
      full: activeCodes.map((c) => data.companySeries[c][curFy] ?? []),
      mtd: activeCodes.map((c) => maskTill(curFy, data.companySeriesMtd?.[c]?.[curFy], curFy, cmi)),
    };
  }, [data, hasMtd, comparing, activeCodes, curFy, cmi]);
  const yearlyMarkers: MarkerData | null = useMemo(
    () =>
      hasMtd
        ? { full: yearlyView.map((y) => y.values), mtd: yearlyView.map((y) => maskTill(y.fy, y.mtdValues, curFy, cmi)) }
        : null,
    [hasMtd, yearlyView, curFy, cmi]
  );

  // Running month till today vs last month till the same day (and same month last FY)
  const summary = useMemo(() => {
    if (!data || !hasMtd) return null;
    const fys = data.yearly.map((y) => y.fy);
    const ci = fys.indexOf(curFy);
    const prevFy = cmi > 0 ? curFy : fys[ci - 1];
    const prevJ = cmi > 0 ? cmi - 1 : 11;
    const lastFy = fys[ci - 1];
    const cur = mtdOf(curFy, cmi);
    const prev = prevFy ? mtdOf(prevFy, prevJ) : 0;
    const lastYear = lastFy ? mtdOf(lastFy, cmi) : 0;
    return {
      curName: data.months[cmi],
      prevName: data.months[prevJ],
      lastFy,
      cur,
      prev,
      lastYear,
      change: pctChange(cur, prev),
      lastYearChange: pctChange(cur, lastYear),
    };
  }, [data, hasMtd, curFy, cmi, mtdOf]);

  // ----- Chart options -----
  // Phones: slant month labels so all 12 fit, and pin the tooltip to the chart's top-left
  // corner (next to the bar it would run off the screen edge)
  const narrow = useIsNarrow();
  const xaxis = useMemo(
    () => ({
      categories: data?.months ?? [],
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: narrow
        ? { rotate: -45, rotateAlways: true, hideOverlappingLabels: false, style: { colors: '#64748b', fontSize: '10px' } }
        : { style: { colors: '#64748b' } },
    }),
    [data, narrow]
  );
  const tooltipPlacement = useMemo(
    () => ({ fixed: { enabled: narrow, position: 'topLeft', offsetX: 0, offsetY: 0 } }),
    [narrow]
  );

  // Bar mode: draw the "till day N" lines after every draw (the bars animate in, so the
  // final positions are only known at animationEnd; updated covers resizes and data changes)
  const markerEvents = useCallback(
    (m: MarkerData | null, labels: boolean) => {
      if (chartType !== 'bar' || !m) return {};
      const draw = (c: { el?: Element }) => drawTillDayMarkers(c?.el, m.full, m.mtd, labels);
      return { events: { mounted: draw, updated: draw, animationEnd: draw } };
    },
    [chartType]
  );
  // Line mode: each line gets a dashed partner showing its "till day N" values
  const withTillLines = chartType === 'line';
  const lineStroke = (n: number, companions: boolean) =>
    companions
      ? { curve: 'smooth' as const, width: [...Array(n).fill(3), ...Array(n).fill(2)], dashArray: [...Array(n).fill(0), ...Array(n).fill(5)] }
      : { width: 3, curve: 'smooth' as const };

  const monthlyOptions: ApexOptions | null = useMemo(() => {
    if (!data) return null;
    const companions = withTillLines && !!monthlyMarkers;
    if (comparing) {
      const cols = activeCodes.map(colorOf);
      return {
        chart: {
          type: chartType,
          fontFamily: 'Outfit, sans-serif',
          toolbar: { show: false },
          animations: CHART_ANIMATIONS,
          ...markerEvents(monthlyMarkers, false),
        },
        colors: companions ? [...cols, ...cols] : cols,
        plotOptions: { bar: { columnWidth: activeCodes.length > 3 ? '80%' : '60%', borderRadius: 3, borderRadiusApplication: 'end' } },
        stroke: chartType === 'line' ? lineStroke(cols.length, companions) : { width: 0 },
        markers: { size: chartType === 'line' ? 4 : 0, hover: { size: 6 } },
        dataLabels: { enabled: false },
        legend: { show: false },
        grid: { borderColor: '#e2e8f040', strokeDashArray: 4 },
        xaxis,
        yaxis,
        tooltip: {
          ...tooltipPlacement,
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
              'SELECTED',
              tillExtras(curFy, dataPointIndex),
              narrow ? 6 : undefined
            );
          },
        },
      };
    }
    return {
      chart: {
        type: chartType,
        fontFamily: 'Outfit, sans-serif',
        toolbar: { show: false },
        animations: CHART_ANIMATIONS,
        // Value labels inside the bars are too crowded on phones; the tooltip shows them there
        ...markerEvents(monthlyMarkers, !narrow),
      },
      colors: companions ? [color, MARKER_COLOR] : [color],
      plotOptions: { bar: { columnWidth: '55%', borderRadius: 6, borderRadiusApplication: 'end', dataLabels: { position: 'top' } } },
      stroke: chartType === 'line' ? lineStroke(1, companions) : { width: 0 },
      markers: { size: chartType === 'line' ? 4 : 0, hover: { size: 6 } },
      legend: { show: false },
      dataLabels: {
        enabled: chartType === 'bar' && !narrow,
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
        ...tooltipPlacement,
        custom: ({ dataPointIndex }: { dataPointIndex: number }) =>
          tooltipHtml(
            `${data.months[dataPointIndex]} · FY ${data.monthly.fy}`,
            data.monthly.companies[dataPointIndex],
            data.monthly.values[dataPointIndex],
            color,
            'TOTAL',
            tillExtras(curFy, dataPointIndex),
            narrow ? 6 : undefined
          ),
      },
    };
    // colorOf and lineStroke derive from activeCodes / chartType, which are already dependencies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, color, comparing, activeCodes, chartType, nameOf, curFy, xaxis, monthlyMarkers, markerEvents, tillExtras, withTillLines, tooltipPlacement, narrow]);

  const yearlyOptions: ApexOptions | null = useMemo(() => {
    if (!data) return null;
    const n = yearlyView.length;
    const companions = withTillLines && !!yearlyMarkers;
    return {
      chart: {
        type: chartType,
        fontFamily: 'Outfit, sans-serif',
        toolbar: { show: false },
        animations: CHART_ANIMATIONS,
        ...markerEvents(yearlyMarkers, false),
      },
      colors: companions ? [...YEAR_COLORS, ...YEAR_COLORS] : YEAR_COLORS,
      plotOptions: { bar: { columnWidth: '70%', borderRadius: 4, borderRadiusApplication: 'end' } },
      stroke: chartType === 'line' ? lineStroke(n, companions) : { width: 0 },
      markers: { size: chartType === 'line' ? 4 : 0, hover: { size: 6 } },
      dataLabels: { enabled: false },
      legend: { position: 'top', horizontalAlign: 'right', fontSize: '12px', labels: { colors: '#64748b' } },
      grid: { borderColor: '#e2e8f040', strokeDashArray: 4 },
      xaxis,
      yaxis,
      tooltip: {
        ...tooltipPlacement,
        shared: false,
        intersect: chartType === 'bar',
        custom: ({ seriesIndex, dataPointIndex }: { seriesIndex: number; dataPointIndex: number }) => {
          const s = seriesIndex % n; // dashed "till day" lines map back to their FY
          const y = yearlyView[s];
          return tooltipHtml(
            `${data.months[dataPointIndex]} · FY ${y.fy}`,
            y.companies[dataPointIndex],
            y.values[dataPointIndex],
            YEAR_COLORS[s],
            comparing ? 'SELECTED' : 'TOTAL',
            tillExtras(y.fy, dataPointIndex),
            narrow ? 6 : undefined
          );
        },
      },
    };
  }, [data, chartType, yearlyView, comparing, xaxis, yearlyMarkers, markerEvents, tillExtras, withTillLines, tooltipPlacement, narrow]);

  // Stable series references: react-apexcharts redraws the chart (closing any open tooltip)
  // whenever it receives a new series array, so only rebuild these when their inputs change.
  // In line mode, months of the current FY that haven't happened yet are left out (null)
  // instead of being drawn as a drop to ₹0
  const futureAsGap = useCallback(
    (fy: string, values: number[]): (number | null)[] =>
      withTillLines && fy === curFy && cmi >= 0 ? values.map((v, j) => (j > cmi ? null : v)) : values,
    [withTillLines, curFy, cmi]
  );

  const monthlySeries = useMemo(() => {
    if (!data) return [];
    const base = comparing
      ? activeCodes.map((c) => ({ name: nameOf.get(c) ?? c, data: futureAsGap(curFy, data.companySeries[c][curFy] ?? Array(12).fill(0)) }))
      : [{ name: 'Sales', data: futureAsGap(curFy, data.monthly.values) }];
    if (!withTillLines || !monthlyMarkers) return base;
    return [...base, ...base.map((b, i) => ({ name: `${b.name} · till ${dayLabel}`, data: monthlyMarkers.mtd[i] }))];
  }, [data, comparing, activeCodes, nameOf, curFy, withTillLines, monthlyMarkers, dayLabel, futureAsGap]);
  const yearlySeries = useMemo(() => {
    const base = yearlyView.map((y) => ({ name: `FY ${y.fy}`, data: futureAsGap(y.fy, y.values) }));
    if (!withTillLines || !yearlyMarkers) return base;
    return [...base, ...base.map((b, i) => ({ name: `${b.name} · till ${dayLabel}`, data: yearlyMarkers.mtd[i] }))];
  }, [yearlyView, withTillLines, yearlyMarkers, dayLabel, futureAsGap]);

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
          <CompanyPicker companies={data.companyList} selected={activeCodes} onChange={setSelected} colorOf={colorOf} />
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

      {summary && (
        <>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-100 px-3 py-2 dark:border-gray-800">
              <div className="text-[11px] text-gray-500">
                {summary.curName} till {dayLabel} (this month){comparing && ' · selected'}
              </div>
              <div className="text-base font-bold text-gray-800 dark:text-white/90">
                <CountUp value={summary.cur} format={inrCompact} />
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 px-3 py-2 dark:border-gray-800">
              <div className="text-[11px] text-gray-500">
                {summary.prevName} till {dayLabel} (last month)
              </div>
              <div className="text-base font-bold text-gray-800 dark:text-white/90">
                <CountUp value={summary.prev} format={inrCompact} />
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 px-3 py-2 dark:border-gray-800">
              <div className="text-[11px] text-gray-500">
                {summary.curName} vs {summary.prevName}, same days
              </div>
              <div
                className={`text-base font-bold ${
                  summary.change === null ? 'text-gray-400' : summary.change >= 0 ? 'text-green-600' : 'text-red-500'
                }`}
              >
                {pctText(summary.change)}
              </div>
              {summary.lastFy && summary.lastYearChange !== null && (
                <div className="text-[11px] text-gray-500">
                  vs {summary.curName} FY {summary.lastFy} till {dayLabel}:{' '}
                  <span className={summary.lastYearChange >= 0 ? 'text-green-600' : 'text-red-500'}>
                    {pctText(summary.lastYearChange)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500">
            {chartType === 'bar' ? (
              <span className="inline-block h-0 w-4 border-t-[2.5px]" style={{ borderColor: MARKER_COLOR }} />
            ) : (
              <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: MARKER_COLOR }} />
            )}
            {chartType === 'bar' ? 'Line inside each bar' : 'Dashed lines'} = that month&apos;s sales from the 1st to the {dayLabel}
          </div>
        </>
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
