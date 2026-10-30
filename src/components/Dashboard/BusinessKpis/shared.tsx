import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, EyeOff, GripVertical, Loader2, Maximize2, Minimize2, Search } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

// ---------- Formatting ----------
const inrFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inrFormatter2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const inr = (n: number | null | undefined, decimals = false) =>
  `₹${(decimals ? inrFormatter2 : inrFormatter).format(Number(n) || 0)}`;

export const inrCompact = (n: number | null | undefined) => {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return `₹${(v / 1e3).toFixed(1)} K`;
  return `₹${Math.round(v)}`;
};

// Short labels for chart axes: ₹2.5 Cr, ₹50 L
export const inrAxis = (n: number) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e7) return `₹${+(v / 1e7).toFixed(1)} Cr`;
  if (Math.abs(v) >= 1e5) return `₹${Math.round(v / 1e5)} L`;
  return inrCompact(v);
};

export const qtyFmt =(n: number) => inrFormatter.format(Number(n) || 0);

// 'YYYY-MM-DD' -> 'DD/MM'
export const shortDate = (ymd?: string | null) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : '');
// 'YYYY-MM-DD' -> 'DD/MM/YYYY'
export const longDate = (ymd?: string | null) =>
  ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : '';

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

// ---------- Count-up animation ----------
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

// Rolls from the currently shown value to `target` (from 0 on first mount)
export function useCountUp(target: number, duration = 1200) {
  const reduce = prefersReducedMotion();
  const [value, setValue] = useState(reduce ? target : 0);
  const shown = useRef(value);

  useEffect(() => {
    const to = Number(target) || 0;
    const from = shown.current;
    if (reduce || from === to) {
      shown.current = to;
      setValue(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const v = from + (to - from) * easeOutExpo(t);
      shown.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduce]);

  return value;
}

// Its own component so only this text re-renders per frame, not the card (which would redraw charts)
export const CountUp: React.FC<{ value: number; format?: (n: number) => string; duration?: number }> = ({
  value,
  format = (n) => String(Math.round(n)),
  duration,
}) => <>{format(useCountUp(value, duration))}</>;

// Shared ApexCharts entrance animation
export const CHART_ANIMATIONS = {
  enabled: true,
  speed: 1100,
  animateGradually: { enabled: true, delay: 120 },
  dynamicAnimation: { enabled: true, speed: 600 },
};

// ---------- Types shared by KPI responses ----------
export type RangeKey = 'today' | 'yest' | 'lastN';
export interface RangeBucket<T> {
  rows: T[];
  total: number;
  count: number;
}
export type RangeData<T> = Record<RangeKey, RangeBucket<T>>;

export const RANGE_KEYS: RangeKey[] = ['today', 'yest', 'lastN'];
export const DEFAULT_RANGE_DAYS = 15;
const MAX_RANGE_DAYS = 366;

export const rangeLabel = (k: RangeKey, days: number) =>
  k === 'today' ? 'Today' : k === 'yest' ? 'Yesterday' : `Last ${days} Days`;

// Day count for the third range tab, remembered per KPI card on this device
export function useRangeDays(kpiId: string) {
  const storageKey = `dashboard-range-days:${kpiId}`;
  const [days, setDaysState] = useState(() => {
    const saved = Number(localStorage.getItem(storageKey));
    return saved >= 1 ? Math.min(saved, MAX_RANGE_DAYS) : DEFAULT_RANGE_DAYS;
  });
  const setDays = useCallback(
    (n: number) => {
      const v = Math.min(Math.max(Math.round(n) || DEFAULT_RANGE_DAYS, 1), MAX_RANGE_DAYS);
      localStorage.setItem(storageKey, String(v));
      setDaysState(v);
    },
    [storageKey]
  );
  return [days, setDays] as const;
}

// ---------- Board context: refresh signal + per-card layout controls ----------
export interface BoardContextValue {
  refreshKey: number;
}
export const BoardContext = createContext<BoardContextValue>({ refreshKey: 0 });

export interface KpiItemControls {
  handleProps: React.HTMLAttributes<HTMLElement>;
  isFull: boolean;
  toggleWidth: () => void;
  hide: () => void;
  moveBy: (delta: number) => void;
}
export const KpiItemContext = createContext<KpiItemControls | null>(null);

// ---------- Data hook ----------
export function useKpiData<T>(kpiId: string, days?: number) {
  const { refreshKey } = useContext(BoardContext);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const query = days ? `?days=${days}` : '';
      const res = await fetchWithAuth(`/api/dashboard/kpis/${kpiId}${query}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (id === requestId.current) setData(json.data as T);
    } catch (e) {
      console.error(`Failed to load KPI ${kpiId}`, e);
      if (id === requestId.current) setError('Failed to load data');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [kpiId, days]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return { data, loading, error, reload: load };
}

// ---------- Card shell ----------
interface KpiCardProps {
  title: string;
  color: string;
  icon: React.ReactNode;
  subtitle?: React.ReactNode;
  headerRight?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  hasData?: boolean;
  children: React.ReactNode;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  color,
  icon,
  subtitle,
  headerRight,
  loading,
  error,
  hasData,
  children,
}) => {
  const controls = useContext(KpiItemContext);

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${color}, ${color}55)` }} />
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4 pb-3 sm:px-5">
        {controls && (
          <button
            type="button"
            {...controls.handleProps}
            className="-ml-1 hidden cursor-grab rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing sm:block dark:hover:bg-gray-800"
            title="Drag to reposition"
            aria-label="Drag to reposition"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
          style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 truncate text-base font-semibold text-gray-800 dark:text-white/90">
            {title}
            {loading && hasData && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
          </h3>
          {subtitle && <div className="truncate text-xs text-gray-500 dark:text-gray-400">{subtitle}</div>}
        </div>
        {headerRight && <div className="flex items-center gap-2">{headerRight}</div>}
        {controls && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => controls.moveBy(-1)}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 sm:hidden dark:hover:bg-gray-800"
              title="Move earlier"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => controls.moveBy(1)}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 sm:hidden dark:hover:bg-gray-800"
              title="Move later"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={controls.toggleWidth}
              className="hidden rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:block dark:hover:bg-gray-800"
              title={controls.isFull ? 'Half width' : 'Full width'}
            >
              {controls.isFull ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={controls.hide}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
              title="Hide this KPI"
            >
              <EyeOff className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-5">
        {loading && !hasData ? (
          <div className="flex flex-1 flex-col gap-3 py-2">
            <div className="h-8 w-1/3 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
            <div className="h-4 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
          </div>
        ) : error && !hasData ? (
          <div className="flex flex-1 items-center justify-center py-10 text-sm text-red-500">{error}</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};

// ---------- Small building blocks ----------
interface SegmentedProps<K extends string> {
  value: K;
  onChange: (k: NoInfer<K>) => void;
  options: { key: NoInfer<K>; label: React.ReactNode; badge?: React.ReactNode }[];
  color: string;
}

export function Segmented<K extends string>({ value, onChange, options, color }: SegmentedProps<K>) {
  return (
    <div role="tablist" className="flex w-full rounded-xl bg-gray-100 p-1 dark:bg-gray-900">
      {options.map((o) => {
        const active = o.key === value;
        // A div rather than a <button> so a label may contain an input (e.g. the "Last N Days" tab)
        return (
          <div
            key={o.key}
            role="tab"
            tabIndex={0}
            aria-selected={active}
            onClick={() => onChange(o.key)}
            onKeyDown={(e) => {
              if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onChange(o.key);
              }
            }}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-all select-none sm:text-sm ${
              active
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {o.label}
            {o.badge !== undefined && (
              <span
                className="rounded-full px-1.5 text-[10px] font-semibold leading-4"
                style={active ? { background: `${color}1f`, color } : undefined}
              >
                {o.badge}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// "Last [N] Days" tab label with an editable day count.
// Commits on Enter / blur so typing "30" doesn't fire a request for "3" first.
export const DaysInput: React.FC<{ days: number; onChange: (n: number) => void; onFocus?: () => void }> = ({
  days,
  onChange,
  onFocus,
}) => {
  const [draft, setDraft] = useState(String(days));
  useEffect(() => setDraft(String(days)), [days]);

  const commit = () => {
    const n = parseInt(draft, 10);
    if (n >= 1 && n !== days) onChange(n);
    else setDraft(String(days));
  };

  return (
    <span className="inline-flex items-center gap-1">
      Last
      <input
        type="number"
        min={1}
        max={366}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          e.target.select();
          onFocus?.();
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(String(days));
            e.currentTarget.blur();
          }
        }}
        title="Number of days (press Enter to apply)"
        aria-label="Number of days"
        className="h-6 w-10 [appearance:textfield] rounded-md border border-gray-300 bg-white px-1 text-center text-xs font-semibold text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      Days
    </span>
  );
};

export const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({
  value,
  onChange,
  placeholder = 'Search…',
}) => (
  <div className="relative">
    <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-8 w-full rounded-lg border border-gray-200 bg-transparent pr-2 pl-8 text-xs text-gray-700 outline-none placeholder:text-gray-400 focus:border-gray-400 dark:border-gray-700 dark:text-gray-200"
    />
  </div>
);

export const EmptyState: React.FC<{ text?: string }> = ({ text = 'No data for this period' }) => (
  <div className="flex flex-1 flex-col items-center justify-center py-10 text-sm text-gray-400">{text}</div>
);
