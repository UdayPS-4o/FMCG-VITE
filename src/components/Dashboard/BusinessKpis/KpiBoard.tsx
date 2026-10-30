import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Boxes,
  CalendarClock,
  Check,
  EyeOff,
  GripVertical,
  HandCoins,
  Landmark,
  LayoutDashboard,
  Maximize2,
  Minimize2,
  Percent,
  PieChart,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  TrendingUp,
  Truck,
  UserX,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import BalanceUddhari from '../BalanceUddhari';
import TodaysSales from '../TodaysSales';
import TodaysCollections from '../TodaysCollections';
import UnbilledCustomersKPI from '../UnbilledCustomers';
import TransactionsKpi from './TransactionsKpi';
import CompanyPieKpi from './CompanyPieKpi';
import TrendKpi from './TrendKpi';
import SalesRecoveryKpi from './SalesRecoveryKpi';
import StockKpi from './StockKpi';
import { BoardContext, KpiItemContext, KpiItemControls } from './shared';

const AUTO_REFRESH_SECONDS = 5 * 60;
const STORAGE_PREFIX = 'dashboard-layout-v1';

type Width = 'half' | 'full';

interface KpiDef {
  id: string;
  label: string;
  color: string;
  defaultWidth: Width;
  Icon: LucideIcon;
  // Existing widgets render their own card, so the board adds a floating control pill for them
  legacy?: boolean;
  // Receives the card icon built from `Icon`; legacy widgets draw their own
  render: (icon: React.ReactNode) => React.ReactNode;
}

const KPIS: KpiDef[] = [
  { id: 'balance-uddhari', label: 'Balance Uddhari', color: '#ea580c', defaultWidth: 'full', Icon: Wallet, legacy: true, render: () => <BalanceUddhari /> },
  {
    id: 'sales', label: 'Sales', color: '#3498db', defaultWidth: 'half', Icon: ShoppingCart,
    render: (icon) => <TransactionsKpi id="sales" title="Sales" color="#3498db" icon={icon} />,
  },
  {
    id: 'cash', label: 'Cash Receipts', color: '#27ae60', defaultWidth: 'half', Icon: Banknote,
    render: (icon) => <TransactionsKpi id="cash" title="Cash Receipts" color="#27ae60" icon={icon} />,
  },
  {
    id: 'cheque', label: 'Cheque Receipts', color: '#f39c12', defaultWidth: 'half', Icon: Landmark,
    render: (icon) => <TransactionsKpi id="cheque" title="Cheque / Bank Receipts" color="#f39c12" icon={icon} />,
  },
  {
    id: 'due', label: 'Today Due', color: '#e74c3c', defaultWidth: 'half', Icon: CalendarClock,
    render: (icon) => <TransactionsKpi id="due" title="Bills Due" color="#e74c3c" icon={icon} />,
  },
  {
    id: 'company-sales', label: 'Company Sales', color: '#8e44ad', defaultWidth: 'half', Icon: PieChart,
    render: (icon) => <CompanyPieKpi id="company-sales" title="Company-wise Sales" color="#8e44ad" icon={icon} />,
  },
  {
    id: 'company-purchase', label: 'Company Purchase', color: '#16a085', defaultWidth: 'half', Icon: Truck,
    render: (icon) => <CompanyPieKpi id="company-purchase" title="Company-wise Purchase" color="#16a085" icon={icon} />,
  },
  {
    id: 'trend', label: 'Sales Trend', color: '#3b5bdb', defaultWidth: 'full', Icon: TrendingUp,
    render: (icon) => <TrendKpi title="Sales Trend" color="#3b5bdb" icon={icon} />,
  },
  {
    id: 'sales-recovery', label: 'Sales Recovery %', color: '#c0392b', defaultWidth: 'full', Icon: Percent,
    render: (icon) => <SalesRecoveryKpi title="Sales Recovery %" color="#c0392b" icon={icon} />,
  },
  {
    id: 'stock', label: 'Stock Analysis', color: '#2c3e50', defaultWidth: 'full', Icon: Boxes,
    render: (icon) => <StockKpi title="Stock Analysis" color="#2c3e50" icon={icon} />,
  },
  { id: 'todays-sales', label: "Today's Sales (summary)", color: '#22c55e', defaultWidth: 'half', Icon: ShoppingBag, legacy: true, render: () => <TodaysSales /> },
  { id: 'todays-collections', label: "Today's Collections (summary)", color: '#2563eb', defaultWidth: 'half', Icon: HandCoins, legacy: true, render: () => <TodaysCollections /> },
  { id: 'unbilled', label: 'Unbilled Customers', color: '#64748b', defaultWidth: 'full', Icon: UserX, legacy: true, render: () => <UnbilledCustomersKPI /> },
];
const KPI_MAP = new Map(KPIS.map((k) => [k.id, k]));

interface Layout {
  order: string[];
  hidden: string[];
  widths: Record<string, Width>;
}

const defaultLayout = (): Layout => ({
  order: KPIS.map((k) => k.id),
  hidden: [],
  widths: Object.fromEntries(KPIS.map((k) => [k.id, k.defaultWidth])),
});

// Merge a saved layout with the current KPI list (drops removed KPIs, appends new ones)
const normalizeLayout = (saved: Partial<Layout> | null): Layout => {
  const base = defaultLayout();
  if (!saved) return base;
  const known = (saved.order ?? []).filter((id) => KPI_MAP.has(id));
  const missing = base.order.filter((id) => !known.includes(id));
  return {
    order: [...known, ...missing],
    hidden: (saved.hidden ?? []).filter((id) => KPI_MAP.has(id)),
    widths: { ...base.widths, ...(saved.widths ?? {}) },
  };
};

const useIsLarge = () => {
  const query = '(min-width: 1024px)';
  const [isLarge, setIsLarge] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setIsLarge(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isLarge;
};

const formatCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Owns the per-second tick so only this text re-renders each second, not the whole board.
// (Re-rendering the cards every second redraws the charts and dismisses open chart tooltips.)
const AutoRefreshCountdown: React.FC<{ resetKey: number; onExpire: () => void }> = ({ resetKey, onExpire }) => {
  const [seconds, setSeconds] = useState(AUTO_REFRESH_SECONDS);

  useEffect(() => {
    setSeconds(AUTO_REFRESH_SECONDS);
    const t = setInterval(() => setSeconds((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [resetKey]);

  useEffect(() => {
    if (seconds === 0) onExpire();
  }, [seconds, onExpire]);

  return <span className="font-mono font-semibold text-yellow-200">{formatCountdown(seconds)}</span>;
};

const KpiBoard: React.FC = () => {
  const { user } = useAuth();
  const storageKey = `${STORAGE_PREFIX}:${(user as { name?: string } | null)?.name ?? 'default'}`;

  const [layout, setLayout] = useState<Layout>(() => {
    try {
      return normalizeLayout(JSON.parse(localStorage.getItem(storageKey) || 'null'));
    } catch {
      return defaultLayout();
    }
  });
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(layout));
  }, [layout, storageKey]);

  // ----- Refresh -----
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());

  const refreshNow = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setLastRefreshed(new Date());
  }, []);

  // ----- Visibility / width / order -----
  const hiddenSet = useMemo(() => new Set(layout.hidden), [layout.hidden]);
  const visibleIds = layout.order.filter((id) => !hiddenSet.has(id));

  const setVisible = (id: string, visible: boolean) =>
    setLayout((l) => ({ ...l, hidden: visible ? l.hidden.filter((h) => h !== id) : [...l.hidden, id] }));
  const setAllVisible = (visible: boolean) => setLayout((l) => ({ ...l, hidden: visible ? [] : [...l.order] }));
  const toggleWidth = (id: string) =>
    setLayout((l) => ({ ...l, widths: { ...l.widths, [id]: l.widths[id] === 'full' ? 'half' : 'full' } }));

  const moveTo = (dragId: string, targetId: string, pos: 'before' | 'after') =>
    setLayout((l) => {
      if (dragId === targetId) return l;
      const order = l.order.filter((id) => id !== dragId);
      const idx = order.indexOf(targetId) + (pos === 'after' ? 1 : 0);
      order.splice(idx, 0, dragId);
      return { ...l, order };
    });

  const moveBy = (id: string, delta: number) => {
    const i = visibleIds.indexOf(id);
    const target = visibleIds[i + delta];
    if (target) moveTo(id, target, delta > 0 ? 'after' : 'before');
  };

  // ----- Drag & drop (HTML5, started only from the grip handle) -----
  const isLarge = useIsLarge();
  const [armedId, setArmedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: 'before' | 'after'; horizontal: boolean } | null>(null);

  useEffect(() => {
    const disarm = () => setArmedId(null);
    window.addEventListener('mouseup', disarm);
    return () => window.removeEventListener('mouseup', disarm);
  }, []);

  const endDrag = () => {
    setDragId(null);
    setArmedId(null);
    setDropTarget(null);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id === dragId) {
      if (dropTarget) setDropTarget(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const horizontal = isLarge && layout.widths[id] === 'half';
    const pos = horizontal
      ? e.clientX < rect.left + rect.width / 2 ? 'before' : 'after'
      : e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    if (!dropTarget || dropTarget.id !== id || dropTarget.pos !== pos) setDropTarget({ id, pos, horizontal });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (dragId && dropTarget) moveTo(dragId, dropTarget.id, dropTarget.pos);
    endDrag();
  };

  const now = new Date();

  return (
    <BoardContext.Provider value={{ refreshKey }}>
      {/* Header / control bar */}
      <div className="mb-5 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 px-5 py-4 text-white">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <LayoutDashboard className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold tracking-wide sm:text-xl">Business Dashboard</h2>
            <p className="text-xs text-white/80 sm:text-sm">
              {now.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <div className="text-right text-xs leading-5 text-white/85">
            <div>
              Refreshed <span className="font-semibold text-white">{lastRefreshed.toLocaleTimeString('en-IN')}</span>
            </div>
            <div>
              Auto-refresh in <AutoRefreshCountdown resetKey={refreshKey} onExpire={refreshNow} />
            </div>
          </div>
          <button
            type="button"
            onClick={refreshNow}
            className="flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur transition hover:bg-white/25"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-gray-400" />
            <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">Select KPIs</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {visibleIds.length}/{layout.order.length}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setAllVisible(true)}
                className="rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setAllVisible(false)}
                className="rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                None
              </button>
              <button
                type="button"
                onClick={() => setLayout(defaultLayout())}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Restore default order, sizes and visibility"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset layout
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {layout.order.map((id) => {
              const k = KPI_MAP.get(id)!;
              const on = !hiddenSet.has(id);
              return (
                <label
                  key={id}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-all duration-200 select-none hover:-translate-y-0.5 hover:shadow-md ${
                    on ? 'shadow-sm' : 'border-gray-200 opacity-60 hover:opacity-100 dark:border-gray-700'
                  }`}
                  style={on ? { background: `${k.color}14`, borderColor: `${k.color}66` } : undefined}
                >
                  <input type="checkbox" checked={on} onChange={(e) => setVisible(id, e.target.checked)} className="sr-only" />
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      on ? 'text-white' : 'bg-gray-100 text-gray-400 dark:bg-gray-800'
                    }`}
                    style={on ? { background: `linear-gradient(135deg, ${k.color}, ${k.color}cc)` } : undefined}
                  >
                    <k.Icon className="h-4 w-4" />
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-xs font-medium ${on ? 'text-gray-800 dark:text-white/90' : 'text-gray-500'}`}
                    title={k.label}
                  >
                    {k.label}
                  </span>
                  {/* Keyed on state so the pop animation replays on each tick */}
                  <span
                    key={String(on)}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      on ? 'kpi-pop border-transparent text-white' : 'border-gray-300 dark:border-gray-600'
                    }`}
                    style={on ? { background: k.color } : undefined}
                  >
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="hidden border-t border-gray-100 px-5 py-2 text-[11px] text-gray-400 sm:block dark:border-gray-800">
          Tip: drag a card by its <GripVertical className="inline h-3 w-3" /> handle to rearrange. Layout is saved on this device.
        </div>
      </div>

      {visibleIds.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-500 dark:border-gray-700">
          All KPIs are hidden. Tick one above to show it.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {visibleIds.map((id, index) => {
            const k = KPI_MAP.get(id)!;
            const isFull = layout.widths[id] === 'full';
            const controls: KpiItemControls = {
              handleProps: {
                onMouseDown: () => setArmedId(id),
              },
              isFull,
              toggleWidth: () => toggleWidth(id),
              hide: () => setVisible(id, false),
              moveBy: (d) => moveBy(id, d),
            };
            const indicator = dropTarget?.id === id ? dropTarget : null;

            return (
              <div
                key={id}
                draggable={armedId === id}
                onDragStart={(e) => {
                  setDragId(id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', id);
                }}
                onDragOver={(e) => handleDragOver(e, id)}
                onDrop={handleDrop}
                onDragEnd={endDrag}
                style={{ animationDelay: `${index * 70}ms` }}
                className={`kpi-enter group/item relative min-w-0 transition-all duration-200 ${isFull ? 'lg:col-span-2' : ''} ${
                  dragId === id ? 'scale-[0.98] opacity-40' : ''
                }`}
              >
                {indicator && (
                  <div
                    className={`pointer-events-none absolute z-20 rounded-full bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.2)] ${
                      indicator.horizontal
                        ? `top-0 bottom-0 w-1 ${indicator.pos === 'before' ? '-left-3' : '-right-3'}`
                        : `right-0 left-0 h-1 ${indicator.pos === 'before' ? '-top-3' : '-bottom-3'}`
                    }`}
                  />
                )}

                {k.legacy && (
                  <div className="absolute top-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-gray-200 bg-white/95 px-1 py-0.5 opacity-60 shadow-sm transition-opacity group-hover/item:opacity-100 dark:border-gray-700 dark:bg-gray-900/95">
                    <button
                      type="button"
                      {...controls.handleProps}
                      className="hidden cursor-grab rounded-full p-1 text-gray-400 hover:text-gray-700 active:cursor-grabbing sm:block"
                      title="Drag to reposition"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={controls.toggleWidth}
                      className="hidden rounded-full p-1 text-gray-400 hover:text-gray-700 lg:block"
                      title={isFull ? 'Half width' : 'Full width'}
                    >
                      {isFull ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={controls.hide}
                      className="rounded-full p-1 text-gray-400 hover:text-gray-700"
                      title="Hide"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <KpiItemContext.Provider value={controls}>
                  {/* Existing widgets don't listen to refreshKey, so remount them on refresh */}
                  <div key={k.legacy ? refreshKey : undefined} className="h-full">
                    {k.render(<k.Icon className="h-5 w-5" />)}
                  </div>
                </KpiItemContext.Provider>
              </div>
            );
          })}
        </div>
      )}
    </BoardContext.Provider>
  );
};

export default KpiBoard;
