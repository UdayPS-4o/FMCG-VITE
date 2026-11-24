import React, { useMemo, useState } from 'react';

// Phone-only card views for the GSTR2A report. The desktop tables stay as they are;
// these replace them below the md breakpoint so nothing needs sideways swiping.

const PAGE = 50;

const inr = (n?: number) =>
  n === undefined || n === null || Number.isNaN(n)
    ? '-'
    : '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_STYLE: Record<string, string> = {
  Matched: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
  Mismatched: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200',
  'Missing in GSTR2A': 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
  'Missing in Purchase': 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
  'Booked in other month': 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200',
};

const Chevron: React.FC<{ open: boolean }> = ({ open }) => (
  <svg className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const ShowMore: React.FC<{ shown: number; total: number; onMore: () => void }> = ({ shown, total, onMore }) =>
  shown < total ? (
    <button
      onClick={onMore}
      className="w-full py-3 text-sm font-medium text-blue-600 dark:text-blue-400"
    >
      Show more ({total - shown} left)
    </button>
  ) : null;

/** Two values side by side (GSTR2A vs books), red when they differ by more than Rs 2. */
const CompareRow: React.FC<{ label: string; a?: number; b?: number }> = ({ label, a, b }) => {
  const differs = a !== undefined && b !== undefined && Math.abs(a - b) > 2;
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 py-1 text-xs">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-right tabular-nums text-gray-900 dark:text-gray-100">{inr(a)}</span>
      <span className={`text-right tabular-nums ${differs ? 'font-semibold text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>{inr(b)}</span>
    </div>
  );
};

export interface MobileComparison {
  invoiceNumber: string;
  invoiceDate: string;
  partyGST: string;
  invoiceValue: number;
  gstr2aTaxableValue?: number;
  purchaseTaxableValue?: number;
  gstr2aGSTAmount?: number;
  purchaseGSTAmount?: number;
  status: string;
  bookedIn?: string;
  mismatchDetails?: string[];
}

interface ComparisonCardsProps<T extends MobileComparison> {
  rows: T[]; // already filtered by status
  partyName: (gstin: string) => string | undefined;
  rowKey: (r: T) => string;
  isMissing: (r: T) => boolean;
  isSelected: (key: string) => boolean;
  onToggle: (key: string) => void;
  onSelectAll: (keys: string[]) => void;
  renderActions: (r: T) => React.ReactNode;
}

export function ComparisonCards<T extends MobileComparison>({
  rows, partyName, rowKey, isMissing, isSelected, onToggle, onSelectAll, renderActions,
}: ComparisonCardsProps<T>) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.invoiceNumber, r.partyGST, partyName(r.partyGST), r.invoiceDate].some((v) => String(v || '').toLowerCase().includes(q)),
    );
  }, [rows, query, partyName]);

  const missingKeys = visible.filter(isMissing).map(rowKey);
  const allSelected = missingKeys.length > 0 && missingKeys.every(isSelected);
  const totalValue = visible.reduce((s, r) => s + (r.invoiceValue || 0), 0);

  return (
    <div className="md:hidden">
      <div className="relative mb-2">
        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
          placeholder="Search party, GSTIN, invoice no"
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </div>

      <div className="flex items-center justify-between border-y border-gray-200 px-1 py-2 text-sm dark:border-gray-700">
        {missingKeys.length > 0 ? (
          <label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={allSelected}
              onChange={(e) => onSelectAll(e.target.checked ? missingKeys : [])}
            />
            Select missing ({missingKeys.length})
          </label>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">{visible.length} invoices</span>
        )}
        <span className="text-gray-500 dark:text-gray-400">
          Total <span className="font-semibold text-gray-900 dark:text-white">{inr(totalValue)}</span>
        </span>
      </div>

      {visible.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No invoices</p>
      )}

      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
        {visible.slice(0, limit).map((r) => {
          const key = rowKey(r);
          const name = partyName(r.partyGST);
          const expanded = open === key;
          const missing = isMissing(r);
          return (
            <li key={key} className={expanded ? 'bg-gray-50 dark:bg-gray-900/40' : ''}>
              <div className="flex items-start gap-3 px-1 py-3">
                <div className="w-4 pt-0.5">
                  {missing && (
                    <input type="checkbox" className="h-4 w-4" checked={isSelected(key)} onChange={() => onToggle(key)} />
                  )}
                </div>
                <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(expanded ? null : key)}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">{name || r.partyGST}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{inr(r.invoiceValue)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="shrink-0 whitespace-nowrap rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">{r.invoiceNumber}</span>
                    <span className="shrink-0">{r.invoiceDate}</span>
                    <span className={`ml-auto truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[r.status] || STATUS_STYLE['Missing in Purchase']}`}>
                      {r.status === 'Booked in other month' && r.bookedIn ? `Booked ${r.bookedIn}` : r.status}
                    </span>
                    <Chevron open={expanded} />
                  </div>
                </button>
              </div>

              {expanded && (
                <div className="space-y-3 pb-3 pl-8 pr-1">
                  {name && <div className="text-xs text-gray-500 dark:text-gray-400">GSTIN <span className="font-mono text-gray-800 dark:text-gray-200">{r.partyGST}</span></div>}
                  <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      <span />
                      <span className="text-right">GSTR2A</span>
                      <span className="text-right">Books</span>
                    </div>
                    <CompareRow label="Taxable" a={r.gstr2aTaxableValue} b={r.purchaseTaxableValue} />
                    <CompareRow label="GST" a={r.gstr2aGSTAmount} b={r.purchaseGSTAmount} />
                  </div>
                  {r.mismatchDetails && r.mismatchDetails.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-4 text-xs text-gray-700 dark:text-gray-300">
                      {r.mismatchDetails.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  )}
                  {missing && <div className="flex flex-wrap gap-2 [&_button]:px-3 [&_button]:py-1.5">{renderActions(r)}</div>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <ShowMore shown={Math.min(limit, visible.length)} total={visible.length} onMore={() => setLimit((l) => l + PAGE)} />
    </div>
  );
}

interface ReturnItem {
  itm_det: { txval: number; rt: number; iamt: number; camt?: number; samt?: number; csamt: number };
}
export interface MobileReturnRecord {
  ctin: string;
  val: number;
  pos: string;
  rchrg: string;
  inv_typ: string;
  srctyp?: string;
  irngendate?: string;
  itms: ReturnItem[];
  inum?: string;
  idt?: string;
  nt_num?: string;
  nt_dt?: string;
}

/** GSTR2A B2B / CDN records as one card per invoice, with tax-rate lines on tap. */
export const ReturnCards: React.FC<{
  records: MobileReturnRecord[];
  partyName: (gstin: string) => string | undefined;
}> = ({ records, partyName }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const sum = (r: MobileReturnRecord, f: (d: ReturnItem['itm_det']) => number | undefined) =>
    (r.itms || []).reduce((s, i) => s + (f(i.itm_det) || 0), 0);
  const taxOf = (r: MobileReturnRecord) => sum(r, (d) => (d.iamt || 0) + (d.camt || 0) + (d.samt || 0) + (d.csamt || 0));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = records.map((r, idx) => ({ r, idx }));
    if (!q) return list;
    return list.filter(({ r }) =>
      [r.inum, r.nt_num, r.ctin, partyName(r.ctin), r.idt, r.nt_dt].some((v) => String(v || '').toLowerCase().includes(q)),
    );
  }, [records, query, partyName]);

  const totals = visible.reduce(
    (t, { r }) => ({ val: t.val + (r.val || 0), tx: t.tx + sum(r, (d) => d.txval), gst: t.gst + taxOf(r) }),
    { val: 0, tx: 0, gst: 0 },
  );

  return (
    <div className="md:hidden">
      <div className="relative mb-2">
        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
          placeholder="Search party, GSTIN, invoice no"
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </div>

      <div className="grid grid-cols-3 gap-2 border-y border-gray-200 px-1 py-2 text-xs dark:border-gray-700">
        <div><div className="text-gray-500 dark:text-gray-400">Value</div><div className="font-semibold tabular-nums text-gray-900 dark:text-white">{inr(totals.val)}</div></div>
        <div><div className="text-gray-500 dark:text-gray-400">Taxable</div><div className="font-semibold tabular-nums text-gray-900 dark:text-white">{inr(totals.tx)}</div></div>
        <div className="text-right"><div className="text-gray-500 dark:text-gray-400">GST</div><div className="font-semibold tabular-nums text-gray-900 dark:text-white">{inr(totals.gst)}</div></div>
      </div>

      {visible.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No records</p>
      )}

      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
        {visible.slice(0, limit).map(({ r, idx }) => {
          const name = partyName(r.ctin);
          const expanded = open === idx;
          return (
            <li key={idx} className={expanded ? 'bg-gray-50 dark:bg-gray-900/40' : ''}>
              <button className="w-full px-1 py-3 text-left" onClick={() => setOpen(expanded ? null : idx)}>
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">{name || r.ctin}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{inr(r.val)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="shrink-0 whitespace-nowrap rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">{r.inum ?? r.nt_num}</span>
                  <span className="shrink-0">{r.idt ?? r.nt_dt}</span>
                  <span className="ml-auto shrink-0">GST {inr(taxOf(r))}</span>
                  <Chevron open={expanded} />
                </div>
              </button>

              {expanded && (
                <div className="space-y-2 pb-3 px-1">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    {name && <><span className="text-gray-500 dark:text-gray-400">GSTIN</span><span className="text-right font-mono text-gray-900 dark:text-gray-100">{r.ctin}</span></>}
                    <span className="text-gray-500 dark:text-gray-400">Place of supply</span><span className="text-right text-gray-900 dark:text-gray-100">{r.pos}</span>
                    <span className="text-gray-500 dark:text-gray-400">Type / Rev. charge</span><span className="text-right text-gray-900 dark:text-gray-100">{r.inv_typ} / {r.rchrg}</span>
                    {r.srctyp && <><span className="text-gray-500 dark:text-gray-400">Source</span><span className="text-right text-gray-900 dark:text-gray-100">{r.srctyp}</span></>}
                    {r.irngendate && <><span className="text-gray-500 dark:text-gray-400">IRN date</span><span className="text-right text-gray-900 dark:text-gray-100">{r.irngendate}</span></>}
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                    {(r.itms || []).map((it, i) => {
                      const d = it.itm_det || ({} as ReturnItem['itm_det']);
                      const parts = [
                        d.iamt ? `IGST ${inr(d.iamt)}` : null,
                        d.camt ? `CGST ${inr(d.camt)}` : null,
                        d.samt ? `SGST ${inr(d.samt)}` : null,
                        d.csamt ? `Cess ${inr(d.csamt)}` : null,
                      ].filter(Boolean);
                      return (
                        <div key={i} className="border-b border-gray-100 px-3 py-2 text-xs last:border-b-0 dark:border-gray-700">
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-700 dark:text-gray-200">{(d.rt ?? 0).toFixed(2)}% on {inr(d.txval)}</span>
                          </div>
                          <div className="mt-0.5 text-gray-500 dark:text-gray-400">{parts.length ? parts.join(' · ') : 'No tax'}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <ShowMore shown={Math.min(limit, visible.length)} total={visible.length} onMore={() => setLimit((l) => l + PAGE)} />
    </div>
  );
};
