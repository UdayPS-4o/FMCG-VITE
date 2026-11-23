import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DateFilterCalendar, { toDateKey } from './DateFilterCalendar';
import SalesmanFilterChips, { SalesmanOption, SalesmanStats } from './SalesmanFilterChips';

// Card-based view of DatabaseTable used on phones (below the md breakpoint).
// The desktop table is untouched; DatabaseTable picks one or the other.

const UNDO_MS = 5000;
const PAGE_STEP = 50;
// Above the app's BottomNav (z-index 99999)
const Z_BAR = 100000;
const Z_SHEET = 100010;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

const inr = (v: number, decimals = 0) =>
  `₹${v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

const formatDateKey = (key: string) => {
  const [y, m, d] = key.split('-');
  return `${Number(d)} ${MONTHS_SHORT[Number(m) - 1]} ${y}`;
};

const formatAnyDate = (v: unknown) => {
  const key = toDateKey(v);
  return key ? formatDateKey(key) : String(v ?? '');
};

const humanize = (key: string) =>
  key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');

// ---- icons (lucide paths, same style as the rest of the table) ----
const Icon: React.FC<{ d: React.ReactNode; size?: number; className?: string }> = ({ d, size = 16, className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{d}</svg>
);
const IconSearch = () => <Icon d={<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>} />;
const IconCalendar = () => <Icon d={<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>} />;
const IconUser = () => <Icon d={<><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>} />;
const IconPrint = () => <Icon d={<><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>} />;
const IconEdit = ({ size = 16 }: { size?: number }) => <Icon size={size} d={<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>} />;
const IconTrash = ({ size = 16 }: { size?: number }) => <Icon size={size} d={<><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>} />;
const IconList = () => <Icon d={<><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>} />;
const IconCheck = () => <Icon d={<polyline points="20 6 9 17 4 12" />} />;
const IconX = () => <Icon d={<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>} />;
const IconChevron = ({ open }: { open: boolean }) => (
  <Icon size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} d={<polyline points="6 9 12 15 18 9" />} />
);

// ---- per-endpoint card fields ----
export interface CardInfo {
  title: string;
  ref: string;
  amount: number | null;
  meta: string[];
  items: any[] | null;
  shownKeys: string[]; // fields already on the card face, left out of the expanded details
}

const smLabel = (row: any) => {
  const name = String(row.smName || row.SmName || row.smname || '').split('|')[0].trim();
  return name || row.sm || row.SM || '';
};

export const getRowAmount = (endpoint: string, row: any): number => {
  if (endpoint === 'purchases' && row.totals && typeof row.totals === 'object') {
    return num(row.totals.total ?? row.totals.grandTotal);
  }
  return num(row.total ?? row.Total ?? row.amount ?? row.Amount);
};

const getCardInfo = (endpoint: string, row: any, partyMap: Record<string, string>): CardInfo => {
  const partyName = (code: string, name?: string) => name || partyMap[code] || code || '';
  const items = Array.isArray(row.items) ? row.items : null;
  const itemsLabel = items ? `${items.length} item${items.length === 1 ? '' : 's'}` : '';
  const sm = smLabel(row);
  const common = ['date', 'series', 'sm', 'smName', 'items', 'id', '_id', 'createdBy'];

  switch (endpoint) {
    case 'invoicing':
      return {
        title: partyName(row.party, row.partyName),
        ref: [row.series, row.billNo].filter(Boolean).join('-'),
        amount: getRowAmount(endpoint, row),
        meta: [sm, itemsLabel, row.cash === 'Y' ? 'Cash' : ''].filter(Boolean),
        items,
        shownKeys: [...common, 'billNo', 'party', 'partyName', 'total', 'cash'],
      };
    case 'cash-receipts':
    case 'cash-payments': {
      const no = endpoint === 'cash-receipts' ? row.receiptNo : row.voucherNo;
      return {
        title: partyName(row.party, row.partyName),
        ref: [row.series, no].filter(Boolean).join('-'),
        amount: getRowAmount(endpoint, row),
        meta: [sm, num(row.discount) ? `Disc ${inr(num(row.discount))}` : ''].filter(Boolean),
        items: null,
        shownKeys: [...common, 'receiptNo', 'voucherNo', 'party', 'partyName', 'amount'],
      };
    }
    case 'godown':
    case 'godown-transfer':
      return {
        title: `${row.fromGodown || '?'} → ${row.toGodown || '?'}`,
        ref: [row.series, row.id].filter(Boolean).join('-'),
        amount: null,
        meta: [itemsLabel].filter(Boolean),
        items,
        shownKeys: [...common, 'fromGodown', 'toGodown'],
      };
    case 'purchases': {
      const inv = row.invoice || {};
      const code = row.supplierCode || row.party || row.C_CODE || '';
      return {
        title: partyName(code, row.supplierName || row.partyName),
        ref: String(inv.number || inv.billNo || row.billNo || row.bill || ''),
        amount: getRowAmount(endpoint, row),
        meta: [inv.date ? `Inv ${inv.date}` : '', itemsLabel].filter(Boolean),
        items,
        shownKeys: [...common, 'invoice', 'totals', 'supplierCode', 'party', 'partyName', 'supplierName'],
      };
    }
    case 'account-master':
      return {
        title: row.achead || row.Achead || row.subgroup || '',
        ref: row.subgroup || '',
        amount: null,
        meta: [row.place || row.city || '', row.mobile || row.phone || ''].filter(Boolean),
        items: null,
        shownKeys: [...common, 'achead', 'Achead', 'subgroup'],
      };
    default: {
      const title = row.name || row.partyName || row.username || row.title || '';
      return {
        title: String(title),
        ref: String(row.id ?? row._id ?? ''),
        amount: row.amount !== undefined || row.total !== undefined ? getRowAmount(endpoint, row) : null,
        meta: [row.username && row.username !== title ? row.username : '', sm].filter(Boolean),
        items,
        shownKeys: [...common, 'name', 'username', 'title', 'amount', 'total'],
      };
    }
  }
};

// ---- swipe row ----
const ACTION_W = 76;
const FULL_SWIPE = 0.6; // fraction of the card width that triggers delete straight away

interface SwipeRowProps {
  actions: { key: string; label: string; icon: React.ReactNode; className: string; onClick: () => void }[];
  fullSwipeAction?: () => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onTap: () => void;
  children: React.ReactNode;
}

const SwipeRow: React.FC<SwipeRowProps> = ({ actions, fullSwipeAction, isOpen, onOpenChange, onTap, children }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const state = useRef({ startX: 0, startY: 0, base: 0, dx: 0, lock: null as null | 'x' | 'y', active: false });
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const revealW = actions.length * ACTION_W;

  useEffect(() => {
    if (!dragging) setDx(isOpen ? -revealW : 0);
  }, [isOpen, revealW, dragging]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (actions.length === 0) return;
    if ((e.target as HTMLElement).closest('button, input, a, label')) return;
    state.current = { startX: e.clientX, startY: e.clientY, base: isOpen ? -revealW : 0, dx: isOpen ? -revealW : 0, lock: null, active: true };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = state.current;
    if (!s.active) return;
    const mx = e.clientX - s.startX;
    const my = e.clientY - s.startY;
    if (s.lock === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      s.lock = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      if (s.lock === 'x') {
        setDragging(true);
        cardRef.current?.setPointerCapture(e.pointerId);
      }
    }
    if (s.lock !== 'x') return;
    s.dx = Math.min(0, s.base + mx);
    setDx(s.dx);
  };

  const onPointerUp = () => {
    const s = state.current;
    if (!s.active) return;
    s.active = false;
    if (s.lock !== 'x') return; // a tap or a vertical scroll
    setDragging(false);
    const width = cardRef.current?.offsetWidth || 320;
    if (fullSwipeAction && s.dx < -width * FULL_SWIPE) {
      onOpenChange(true);
      setDx(-revealW);
      fullSwipeAction();
    } else if (s.dx < -40) {
      onOpenChange(true);
      setDx(-revealW);
    } else {
      onOpenChange(false);
      setDx(0);
    }
  };

  const onClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, a, label')) return;
    if (state.current.lock === 'x') { state.current.lock = null; return; }
    if (isOpen) { onOpenChange(false); return; }
    onTap();
  };

  const width = cardRef.current?.offsetWidth || 320;
  const fullSwipeArmed = !!fullSwipeAction && dragging && dx < -width * FULL_SWIPE;

  return (
    <div className="relative overflow-hidden border-b border-gray-200 dark:border-gray-700">
      {actions.length > 0 && dx < 0 && (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: Math.max(revealW, -dx) }}>
          {actions.map((a, i) => (
            <button
              key={a.key}
              type="button"
              onClick={a.onClick}
              className={`flex h-full flex-col items-center justify-center gap-1 text-xs font-medium transition-[width] ${a.className}`}
              style={{ width: fullSwipeArmed && i === actions.length - 1 ? '100%' : fullSwipeArmed ? 0 : `${100 / actions.length}%`, overflow: 'hidden' }}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}
      <div
        ref={cardRef}
        className="relative select-none bg-white dark:bg-gray-800"
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? 'none' : 'transform 200ms ease-out', touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
      >
        {children}
      </div>
    </div>
  );
};

// ---- bottom sheet ----
const Sheet: React.FC<{ onClose: () => void; children: React.ReactNode; maxHeight?: string }> = ({ onClose, children, maxHeight = '88vh' }) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 flex flex-col justify-end bg-black/45" style={{ zIndex: Z_SHEET }} onClick={onClose}>
      <div
        className="flex flex-col rounded-t-2xl bg-white shadow-xl dark:bg-gray-800"
        style={{ maxHeight, paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pb-1 pt-2">
          <div className="h-1 w-9 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
};

// ---- main list ----
export interface MobileRecordListProps {
  endpoint: string;
  isApproved: boolean;
  rows: any[];                     // filtered + sorted rows
  detailHeaders: string[];         // visible columns, used for the expanded details
  getRowId: (row: any) => string;
  selectedItems: string[];
  onSelectedItemsChange: (ids: string[]) => void;
  search: string;
  onSearchChange: (value: string) => void;
  dateFilter: string[];
  availableDateKeys: Set<string>;
  onDateFilterChange: (dates: string[]) => void;
  smOptions: SalesmanOption[];
  smStats: Record<string, SalesmanStats>;
  smFilters: string[];
  onSmFilterChange: (selected: string[]) => void;
  partyMap: Record<string, string>;
  productNameByCode: Record<string, string>;
  canPrint: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canRenumber: boolean;
  onPrint: (row: any) => void;
  onBulkPrint?: (rows: any[]) => void;
  onEdit: (row: any) => void;
  onDelete: (id: string, renumber: boolean) => void;
  onApprove: () => void;
}

const MobileRecordList: React.FC<MobileRecordListProps> = (props) => {
  const {
    endpoint, isApproved, rows, detailHeaders, getRowId, selectedItems, onSelectedItemsChange,
    search, onSearchChange, dateFilter, availableDateKeys, onDateFilterChange,
    smOptions, smStats, smFilters, onSmFilterChange, partyMap, productNameByCode,
    canPrint, canEdit, canDelete, canApprove, canRenumber,
    onPrint, onBulkPrint, onEdit, onDelete, onApprove,
  } = props;

  const [limit, setLimit] = useState(PAGE_STEP);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null);
  const [itemsRow, setItemsRow] = useState<any | null>(null);
  const [confirmRow, setConfirmRow] = useState<any | null>(null);
  const [showSmSheet, setShowSmSheet] = useState(false);
  const [dateAnchor, setDateAnchor] = useState<HTMLElement | null>(null);

  // Deletes wait UNDO_MS before reaching the server so they can be undone
  const [pendingDeletes, setPendingDeletes] = useState<Record<string, { label: string; renumber: boolean }>>({});
  const [undoToast, setUndoToast] = useState<{ id: string; label: string; endsAt: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingRef = useRef(pendingDeletes);
  pendingRef.current = pendingDeletes;
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  useEffect(() => {
    const t = timers.current;
    return () => {
      // Leaving the page commits any delete that wasn't undone
      Object.keys(t).forEach(id => {
        clearTimeout(t[id]);
        const p = pendingRef.current[id];
        if (p) onDeleteRef.current(id, p.renumber);
      });
    };
  }, []);

  useEffect(() => {
    if (!undoToast) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [undoToast]);

  // Reset paging when the filters change
  useEffect(() => { setLimit(PAGE_STEP); }, [search, dateFilter, smFilters]);

  const visibleRows = useMemo(
    () => rows.filter(r => !pendingDeletes[getRowId(r)]),
    [rows, pendingDeletes, getRowId]
  );
  const shownRows = visibleRows.slice(0, limit);

  const groups = useMemo(() => {
    const out: { key: string; label: string; rows: any[] }[] = [];
    const byKey: Record<string, number> = {};
    shownRows.forEach(row => {
      const key = toDateKey(row.date ?? row.Date) || 'none';
      if (byKey[key] === undefined) {
        byKey[key] = out.length;
        out.push({ key, label: key === 'none' ? 'No date' : formatDateKey(key), rows: [] });
      }
      out[byKey[key]].rows.push(row);
    });
    return out;
  }, [shownRows]);

  const selectedSet = useMemo(() => new Set(selectedItems), [selectedItems]);
  const selectedRows = visibleRows.filter(r => selectedSet.has(getRowId(r)));
  const selectedTotal = selectedRows.reduce((s, r) => s + getRowAmount(endpoint, r), 0);
  const selectedItemsCount = selectedRows.reduce((s, r) => s + (Array.isArray(r.items) ? r.items.length : 0), 0);
  const visibleTotal = visibleRows.reduce((s, r) => s + getRowAmount(endpoint, r), 0);
  const hasAmounts = visibleRows.some(r => getRowAmount(endpoint, r) !== 0);

  const allSelected = visibleRows.length > 0 && selectedRows.length === visibleRows.length;
  const someSelected = selectedRows.length > 0 && !allSelected;

  const setSelection = (ids: string[], on: boolean) => {
    const next = new Set(selectedItems);
    ids.forEach(id => (on ? next.add(id) : next.delete(id)));
    onSelectedItemsChange(Array.from(next));
  };

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const scheduleDelete = (row: any, renumber: boolean) => {
    const id = getRowId(row);
    const info = getCardInfo(endpoint, row, partyMap);
    const label = info.ref || info.title || 'Entry';
    setConfirmRow(null);
    setSwipeOpenId(null);
    setPendingDeletes(prev => ({ ...prev, [id]: { label, renumber } }));
    setSelection([id], false);
    setUndoToast({ id, label, endsAt: Date.now() + UNDO_MS });
    timers.current[id] = setTimeout(() => {
      delete timers.current[id];
      onDeleteRef.current(id, renumber);
      setPendingDeletes(prev => { const n = { ...prev }; delete n[id]; return n; });
      setUndoToast(t => (t && t.id === id ? null : t));
    }, UNDO_MS);
  };

  const undoDelete = (id: string) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setPendingDeletes(prev => { const n = { ...prev }; delete n[id]; return n; });
    setUndoToast(null);
  };

  const openDateCalendar = (e: React.MouseEvent<HTMLButtonElement>) => {
    const anchor = e.currentTarget;
    setDateAnchor(prev => (prev ? null : anchor));
  };
  const closeDateCalendar = React.useCallback(() => setDateAnchor(null), []);

  const dateLabel = dateFilter.length === 0
    ? 'Date'
    : dateFilter.length === 1 ? formatDateKey(dateFilter[0]).replace(/ \d{4}$/, '') : `${dateFilter.length} days`;
  const smLabelText = smFilters.length === 0
    ? 'Salesman'
    : smFilters.length === 1
      ? (smOptions.find(o => o.value === smFilters[0])?.name || smFilters[0])
      : `${smFilters.length} salesmen`;

  const filterBtn = (active: boolean) =>
    `flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm ${
      active
        ? 'border-green-600 bg-green-50 text-green-800 dark:border-green-500 dark:bg-green-900/40 dark:text-green-200'
        : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'
    }`;

  const checkboxCls = 'h-5 w-5 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700';
  const hasSelection = selectedRows.length > 0;

  const detailFields = (row: any, info: CardInfo) =>
    detailHeaders
      .filter(h => !info.shownKeys.includes(h) && h !== 'createdAt' && h !== 'PBillNo')
      .map(h => {
        const v = row[h];
        if (v === null || v === undefined || v === '' || typeof v === 'object') return null;
        let text = String(v);
        if (h === 'date' || h.endsWith('Date') || h.endsWith('_date')) text = formatAnyDate(v);
        if ((h === 'party' || h === 'partycode') && partyMap[text]) text = `${partyMap[text]} (${text})`;
        return { key: h, label: humanize(h), text };
      })
      .filter(Boolean) as { key: string; label: string; text: string }[];

  return (
    <div className={`bg-white dark:bg-gray-800 ${hasSelection ? 'pb-36' : 'pb-4'}`}>
      {dateAnchor && (
        <DateFilterCalendar
          anchorEl={dateAnchor}
          availableDates={availableDateKeys}
          selectedDates={dateFilter}
          onChange={onDateFilterChange}
          onClose={closeDateCalendar}
        />
      )}

      {/* Search + filters */}
      <div className="space-y-2 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><IconSearch /></span>
          <input
            type="text"
            inputMode="search"
            placeholder="Search party, bill no, salesman"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-9 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
          {search && (
            <button type="button" aria-label="Clear search" onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400"><IconX /></button>
          )}
        </div>
        <div className="flex gap-2">
          {availableDateKeys.size > 0 && (
            <button type="button" className={filterBtn(dateFilter.length > 0)} onClick={openDateCalendar}>
              <IconCalendar />{dateLabel}
            </button>
          )}
          {smOptions.length > 1 && (
            <button type="button" className={`${filterBtn(smFilters.length > 0)} min-w-0`} onClick={() => setShowSmSheet(true)}>
              <IconUser /><span className="truncate">{smLabelText}</span>
            </button>
          )}
          {(dateFilter.length > 0 || smFilters.length > 0) && (
            <button type="button" className="ml-auto shrink-0 px-1 text-sm text-gray-500 dark:text-gray-400"
              onClick={() => { onDateFilterChange([]); onSmFilterChange([]); }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Select all + total */}
      <div className="flex items-center gap-3 border-b border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
        <input
          type="checkbox"
          aria-label="Select all"
          className={checkboxCls}
          checked={allSelected}
          ref={el => { if (el) el.indeterminate = someSelected; }}
          onChange={(e) => setSelection(visibleRows.map(getRowId), e.target.checked)}
          disabled={visibleRows.length === 0}
        />
        <span className="text-gray-800 dark:text-gray-200">Select all {visibleRows.length}</span>
        {hasAmounts && (
          <span className="ml-auto text-gray-500 dark:text-gray-400">Total <span className="font-medium text-gray-800 dark:text-gray-100">{inr(visibleTotal)}</span></span>
        )}
      </div>

      {/* Cards grouped by date */}
      {groups.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          {search || dateFilter.length || smFilters.length ? 'No entries match these filters.' : 'No data available'}
        </p>
      ) : groups.map(group => {
        const ids = group.rows.map(getRowId);
        const groupSel = ids.filter(id => selectedSet.has(id)).length;
        const groupTotal = group.rows.reduce((s, r) => s + getRowAmount(endpoint, r), 0);
        return (
          <div key={group.key}>
            <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
              <input
                type="checkbox"
                aria-label={`Select all on ${group.label}`}
                className="h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 dark:border-gray-600 dark:bg-gray-700"
                checked={groupSel === ids.length}
                ref={el => { if (el) el.indeterminate = groupSel > 0 && groupSel < ids.length; }}
                onChange={(e) => setSelection(ids, e.target.checked)}
              />
              <span>{group.label} · {group.rows.length}</span>
              {hasAmounts && <span className="ml-auto">{inr(groupTotal)}</span>}
            </div>

            {group.rows.map(row => {
              const id = getRowId(row);
              const info = getCardInfo(endpoint, row, partyMap);
              const isSel = selectedSet.has(id);
              const isOpen = expanded.has(id);
              const details = isOpen ? detailFields(row, info) : [];
              const actions = [
                ...(canEdit ? [{ key: 'edit', label: 'Edit', icon: <IconEdit size={18} />, className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200', onClick: () => { setSwipeOpenId(null); onEdit(row); } }] : []),
                ...(canDelete ? [{ key: 'delete', label: 'Delete', icon: <IconTrash size={18} />, className: 'bg-red-600 text-white', onClick: () => setConfirmRow(row) }] : []),
              ];
              return (
                <SwipeRow
                  key={id}
                  actions={actions}
                  fullSwipeAction={canDelete ? () => setConfirmRow(row) : undefined}
                  isOpen={swipeOpenId === id}
                  onOpenChange={(o) => setSwipeOpenId(o ? id : (swipeOpenId === id ? null : swipeOpenId))}
                  onTap={() => toggleExpanded(id)}
                >
                  <div className={`flex gap-3 px-3 py-3 ${isSel ? 'bg-brand-50 dark:bg-brand-500/10' : ''}`}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${info.ref || info.title}`}
                      className={`${checkboxCls} mt-0.5`}
                      checked={isSel}
                      onChange={(e) => setSelection([id], e.target.checked)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{info.title || '—'}</span>
                        {info.amount !== null && (
                          <span className="shrink-0 text-sm font-semibold text-gray-900 dark:text-gray-100">{inr(info.amount)}</span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                        {info.ref && <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">{info.ref}</span>}
                        <span className="truncate">{info.meta.join(' · ')}</span>
                        {isApproved && (
                          <span className="ml-auto shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[11px] text-green-700 dark:bg-green-900/40 dark:text-green-300">Approved</span>
                        )}
                        <span className={`${isApproved ? '' : 'ml-auto'} shrink-0 text-gray-400`}><IconChevron open={isOpen} /></span>
                      </div>

                      {isOpen && (
                        <div className="mt-2 border-t border-dashed border-gray-200 pt-2 dark:border-gray-700">
                          {details.length > 0 && (
                            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                              {details.map(f => (
                                <React.Fragment key={f.key}>
                                  <dt className="text-gray-400 dark:text-gray-500">{f.label}</dt>
                                  <dd className="break-words text-gray-700 dark:text-gray-300">{f.text}</dd>
                                </React.Fragment>
                              ))}
                            </dl>
                          )}
                          <div className="mt-2 flex gap-2">
                            {info.items && (
                              <button type="button" onClick={() => setItemsRow(row)}
                                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 text-xs text-gray-700 dark:border-gray-600 dark:text-gray-200">
                                <IconList />Items ({info.items.length})
                              </button>
                            )}
                            {canPrint && (
                              <button type="button" onClick={() => onPrint(row)}
                                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 text-xs text-gray-700 dark:border-gray-600 dark:text-gray-200">
                                <IconPrint />Print
                              </button>
                            )}
                            {canEdit && (
                              <button type="button" onClick={() => onEdit(row)}
                                className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 text-xs text-gray-700 dark:border-gray-600 dark:text-gray-200">
                                <IconEdit />Edit
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </SwipeRow>
              );
            })}
          </div>
        );
      })}

      {visibleRows.length > limit && (
        <div className="p-3">
          <button type="button" onClick={() => setLimit(l => l + PAGE_STEP)}
            className="h-10 w-full rounded-lg border border-gray-300 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-200">
            Show more ({visibleRows.length - limit} left)
          </button>
        </div>
      )}

      {canDelete && visibleRows.length > 0 && (
        <p className="px-3 pt-2 text-center text-[11px] text-gray-400 dark:text-gray-500">Swipe an entry left to edit or delete it</p>
      )}

      {/* Selection bar — covers the bottom nav while entries are selected */}
      {hasSelection && createPortal(
        <div
          className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white px-3 pt-2 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] dark:border-gray-700 dark:bg-gray-900"
          style={{ zIndex: Z_BAR, paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {selectedRows.length} selected{selectedItemsCount > 0 ? ` · ${selectedItemsCount} items` : ''}
            </span>
            {hasAmounts && <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">{inr(selectedTotal)}</span>}
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setSelection(selectedRows.map(getRowId), false)}
              className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-200">
              Clear
            </button>
            {onBulkPrint && (
              <button type="button" onClick={() => onBulkPrint(selectedRows)}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-200">
                <IconPrint />Print {selectedRows.length}
              </button>
            )}
            {canApprove && (
              <button type="button" onClick={onApprove}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 text-sm font-medium text-white">
                <IconCheck />Approve {selectedRows.length}
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Undo toast */}
      {undoToast && createPortal(
        <div
          className="fixed inset-x-3 flex items-center justify-between rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-gray-100 dark:text-gray-900"
          style={{ zIndex: Z_SHEET, bottom: hasSelection ? 'calc(7.5rem + env(safe-area-inset-bottom))' : 'calc(5.5rem + env(safe-area-inset-bottom))' }}
        >
          <span className="truncate">{undoToast.label} deleted</span>
          <button type="button" onClick={() => undoDelete(undoToast.id)}
            className="ml-3 shrink-0 rounded-lg border border-white/60 px-3 py-1 text-xs font-medium dark:border-gray-900/40">
            Undo {Math.max(0, Math.ceil((undoToast.endsAt - now) / 1000))}s
          </button>
        </div>,
        document.body
      )}

      {/* Salesman filter sheet */}
      {showSmSheet && (
        <Sheet onClose={() => setShowSmSheet(false)} maxHeight="75vh">
          <div className="flex items-center justify-between px-4 pb-2">
            <span className="text-base font-semibold text-gray-900 dark:text-gray-100">Salesman</span>
            <button type="button" onClick={() => setShowSmSheet(false)}
              className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white">Done</button>
          </div>
          <div className="overflow-y-auto px-4 pb-4">
            <SalesmanFilterChips options={smOptions} stats={smStats} selected={smFilters} onChange={onSmFilterChange} />
          </div>
        </Sheet>
      )}

      {/* Items sheet */}
      {itemsRow && (
        <ItemsSheet
          endpoint={endpoint}
          row={itemsRow}
          info={getCardInfo(endpoint, itemsRow, partyMap)}
          productNameByCode={productNameByCode}
          canPrint={canPrint}
          canEdit={canEdit}
          onPrint={() => onPrint(itemsRow)}
          onEdit={() => onEdit(itemsRow)}
          onClose={() => setItemsRow(null)}
        />
      )}

      {/* Delete confirmation */}
      {confirmRow && (() => {
        const info = getCardInfo(endpoint, confirmRow, partyMap);
        const close = () => { setConfirmRow(null); setSwipeOpenId(null); };
        return (
          <Sheet onClose={close}>
            <div className="px-4 pb-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300">
                  <IconTrash size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Delete {info.ref || 'this entry'}?</p>
                  <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">
                    {[info.title, info.amount !== null ? inr(info.amount) : '', info.items ? `${info.items.length} items` : ''].filter(Boolean).join(' · ')}
                  </p>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    You can undo for {UNDO_MS / 1000} seconds after deleting.
                    {canRenumber && ' "Delete and rearrange" also moves the later bill numbers of this series up to fill the gap.'}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" onClick={() => scheduleDelete(confirmRow, false)}
                  className="h-11 rounded-lg bg-red-600 text-sm font-medium text-white">
                  {canRenumber ? 'Delete only' : 'Delete'}
                </button>
                {canRenumber && (
                  <button type="button" onClick={() => scheduleDelete(confirmRow, true)}
                    className="h-11 rounded-lg border border-red-300 text-sm font-medium text-red-600 dark:border-red-800 dark:text-red-300">
                    Delete and rearrange
                  </button>
                )}
                <button type="button" onClick={close}
                  className="h-11 rounded-lg border border-gray-300 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-200">
                  Cancel
                </button>
              </div>
            </div>
          </Sheet>
        );
      })()}
    </div>
  );
};

// ---- items sheet ----
interface ItemsSheetProps {
  endpoint: string;
  row: any;
  info: CardInfo;
  productNameByCode: Record<string, string>;
  canPrint: boolean;
  canEdit: boolean;
  onPrint: () => void;
  onEdit: () => void;
  onClose: () => void;
}

const ItemsSheet: React.FC<ItemsSheetProps> = ({ endpoint, row, info, productNameByCode, canPrint, canEdit, onPrint, onEdit, onClose }) => {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const items = info.items || [];
  const isTransfer = endpoint === 'godown' || endpoint === 'godown-transfer';
  const billGodown = useMemo(() => {
    // The most common godown on the bill; only items from a different one get a tag
    const counts: Record<string, number> = {};
    items.forEach((it: any) => { if (it.godown) counts[it.godown] = (counts[it.godown] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }, [items]);

  const totalQty = items.reduce((s: number, it: any) => s + num(it.qty ?? it.quantity), 0);
  const itemsTotal = items.reduce((s: number, it: any) => s + num(it.netAmount ?? it.amount), 0);
  const billTotal = info.amount;

  const subtitle = [
    formatAnyDate(row.date),
    smLabel(row),
    row.cash === 'Y' ? 'Cash' : endpoint === 'invoicing' ? 'Credit' : '',
    billGodown && !isTransfer ? `Godown ${billGodown}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <Sheet onClose={onClose}>
      <div className="border-b border-gray-200 px-4 pb-3 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold text-gray-900 dark:text-gray-100">{info.ref || 'Items'}</span>
          <button type="button" aria-label="Close" onClick={onClose}
            className="rounded-lg border border-gray-300 p-1.5 text-gray-600 dark:border-gray-600 dark:text-gray-300"><IconX /></button>
        </div>
        <p className="mt-0.5 text-sm font-medium text-gray-800 dark:text-gray-200">{info.title}</p>
        {subtitle && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>

      <div className="flex justify-between bg-gray-50 px-4 py-1.5 text-[11px] text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
        <span>{items.length} items · {totalQty.toLocaleString('en-IN')} qty</span>
        {!isTransfer && <span>Amount</span>}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        {items.map((it: any, idx: number) => {
          const code = it.code || it.itemCode || it.item || '';
          const name = it.itemName || it.particular || it.name || it.description || (code && productNameByCode[code]) || code || 'Unknown item';
          const qty = it.qty ?? it.quantity ?? '';
          const unit = it.unit || '';
          const rate = num(it.rate);
          const amount = num(it.netAmount ?? it.amount);
          const sch = num(it.sch) || num(it.schRs);
          const cd = num(it.cd);
          const isOpen = openIdx === idx;
          const extra = [
            ['Code', code],
            ['Godown', it.godown],
            ['Gross', it.amount && it.netAmount && num(it.amount) !== num(it.netAmount) ? inr(num(it.amount), 2) : ''],
            ['Scheme', it.sch && num(it.sch) ? `${it.sch}%` : ''],
            ['Scheme ₹', it.schRs && num(it.schRs) ? inr(num(it.schRs), 2) : ''],
            ['Cash disc', it.cd && num(it.cd) ? `${it.cd}%` : ''],
            ['Cess', it.cess && num(it.cess) ? String(it.cess) : ''],
          ].filter(([, v]) => v) as [string, string][];

          return (
            <button
              type="button"
              key={idx}
              onClick={() => setOpenIdx(isOpen ? null : idx)}
              className={`block w-full border-b border-gray-100 px-4 py-2.5 text-left dark:border-gray-700 ${isOpen ? 'bg-gray-50 dark:bg-gray-900/40' : ''}`}
            >
              <div className="flex justify-between gap-3">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{name}</span>
                {!isTransfer && <span className="shrink-0 text-sm font-medium text-gray-900 dark:text-gray-100">{inr(amount, 2)}</span>}
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span>
                  {qty} {unit}
                  {!isTransfer && rate ? ` × ${inr(rate, rate % 1 ? 2 : 0)}` : ''}
                  {sch ? <span className="text-amber-600 dark:text-amber-400"> · sch {it.sch && num(it.sch) ? `${it.sch}%` : inr(sch)}</span> : null}
                  {cd ? <span className="text-amber-600 dark:text-amber-400"> · cd {cd}%</span> : null}
                </span>
                {isTransfer ? (
                  <span>{row.fromGodown} → {row.toGodown}</span>
                ) : it.godown && it.godown !== billGodown ? (
                  <span className="rounded bg-amber-100 px-1.5 text-[11px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Godown {it.godown}</span>
                ) : null}
              </div>
              {isOpen && extra.length > 0 && (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-t border-dashed border-gray-200 pt-2 text-xs dark:border-gray-700">
                  {extra.map(([k, v]) => (
                    <React.Fragment key={k}>
                      <dt className="text-gray-400 dark:text-gray-500">{k}</dt>
                      <dd className="text-gray-700 dark:text-gray-300">{v}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              )}
            </button>
          );
        })}
      </div>

      <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
        {!isTransfer && (
          <>
            {billTotal !== null && Math.abs(itemsTotal - billTotal) >= 0.01 && (
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Items total</span><span>{inr(itemsTotal, 2)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between text-base font-semibold text-gray-900 dark:text-gray-100">
              <span>Bill total</span><span>{inr(billTotal ?? itemsTotal, 2)}</span>
            </div>
          </>
        )}
        {(canPrint || canEdit) && (
          <div className="mt-3 flex gap-2">
            {canPrint && (
              <button type="button" onClick={onPrint}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                <IconPrint />Print
              </button>
            )}
            {canEdit && (
              <button type="button" onClick={onEdit}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
                <IconEdit />Edit
              </button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
};

export default MobileRecordList;
