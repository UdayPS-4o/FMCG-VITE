import React, { useMemo, useState } from 'react';
import GstDataGrid, { GridColumn } from './GstDataGrid';
import PeriodPicker, { periodLabel } from './PeriodPicker';
import { errMsg, gstApi, notifyError, notifyInfo, notifySuccess, previousPeriod } from './gstApi';

type Rows = Record<string, Record<string, any>[]>;
interface Warning { period: string; section: string; message: string }

export interface ViewerTab {
  key: string;
  label: string;
  columns: GridColumn[];
}

const n = (key: string, total = true): GridColumn => ({ key, numeric: true, total });
const f = (key: string, label?: string): GridColumn => ({ key, label, filter: true });
const t = (key: string): GridColumn => ({ key });
const MIS: GridColumn[] = [f('MISMATCH'), { key: 'REASON', wide: true }];

const INVOICE_COLS = (numKey: 'INUM' | 'NT_NUM'): GridColumn[] => [
  f('RET_PER', 'Period'), f('CTIN'), t('CFS'),
  ...(numKey === 'NT_NUM' ? [f('NTTY'), f('NT_NUM', 'NT_NUM'), f('NT_DT', 'NT_DT')] : [f('INUM'), f('IDT')]),
  n('VAL', false), f('POS'), t('RCHRG'), ...(numKey === 'INUM' ? [t('ETIN')] : []), f('INV_TYP'), ...(numKey === 'INUM' ? [t('CFLAG'), n('DIFF_PCT', false)] : []),
  f('SRCTYP'), t('IRN'), t('IRNDATE'), n('ITEM_NUM', false), f('RT'), n('TXVAL'), n('IAMT'), n('CAMT'), n('SAMT'), n('CSAMT'), ...MIS,
];

export const GSTR1_TABS: ViewerTab[] = [
  { key: 'b2b', label: 'B2B Invoices', columns: INVOICE_COLS('INUM') },
  {
    key: 'b2cs',
    label: 'B2CS Invoices',
    columns: [f('RET_PER', 'Period'), t('FLAG'), f('SPLY_TY'), n('DIFF_PCT', false), f('RT'), f('TYP'), t('ETIN'), f('POS'), n('TXVAL'), n('IAMT'), n('CAMT'), n('SAMT'), n('CSAMT'), ...MIS],
  },
  { key: 'cdnr', label: 'Credit / Debit Notes (CDNR)', columns: INVOICE_COLS('NT_NUM') },
  {
    key: 'dociss',
    label: 'Docs Issued',
    columns: [f('RET_PER', 'Period'), f('DOC_NUM'), t('NUM'), t('FROM_DOC'), t('TO_DOC'), n('TOTNUM'), n('CANC'), n('NET_ISS'), ...MIS],
  },
  {
    key: 'hsn',
    label: 'HSN Summary',
    columns: [f('RET_PER', 'Period'), f('TYP'), t('NUM'), f('HSN_SC'), { key: 'DESC', wide: true }, t('UDES'), f('UQC'), n('QTY'), n('TXVAL'), n('IAMT'), n('CAMT'), n('SAMT'), n('CSAMT'), f('RT'), ...MIS],
  },
];

const GSTR2B_B2B: GridColumn[] = [
  f('RET_PER', 'Period'), f('CTIN'), f('INUM'), f('IDT'), n('VAL'), f('POS'), t('RCHRG'), f('INV_TYP'), f('SRCTYP'), t('IRN'), t('IRNDATE'),
  n('TXVAL'), n('IAMT'), n('CAMT'), n('SAMT'), n('CSAMT'), ...MIS,
];
export const GSTR2B_TABS: ViewerTab[] = [
  { key: 'b2b', label: 'B2B Invoices', columns: GSTR2B_B2B },
  {
    key: 'cdnr',
    label: 'Credit / Debit Notes (CDNR)',
    columns: [f('RET_PER', 'Period'), f('CTIN'), f('NTTY'), f('NT_NUM'), f('NT_DT'), n('VAL'), f('POS'), t('RCHRG'), f('INV_TYP'), f('SRCTYP'), t('IRN'), t('IRNDATE'), n('TXVAL'), n('IAMT'), n('CAMT'), n('SAMT'), n('CSAMT'), ...MIS],
  },
];

interface Props {
  kind: 'gstr1' | 'gstr2b';
  title: string;
  tabs: ViewerTab[];
  matchHelp: string;
}

// Port of GSTR1_PORTAL_VIEWER / GSTR2B_PORTAL_VIEWER: pick periods → load saved JSON or download from the portal →
// tabbed grids → "Match records" against system data (red rows + REASON column).
const PortalViewer: React.FC<Props> = ({ kind, title, tabs, matchHelp }) => {
  const [periods, setPeriods] = useState<string[]>([previousPeriod()]);
  const [useLocal, setUseLocal] = useState(true);
  const [rows, setRows] = useState<Rows | null>(null);
  const [loadedPeriods, setLoadedPeriods] = useState<string[]>([]);
  const [visiblePeriods, setVisiblePeriods] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(tabs[0].key);
  const [busy, setBusy] = useState<'' | 'fetch' | 'match'>('');
  const setError = (m: string) => notifyError(m);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const setInfo = (m: string) => notifyInfo(m);
  const setMatched = (done: boolean) => { if (done) notifySuccess('Matching completed — red rows are mismatches, see the REASON column.'); };

  const showResult = (res: { rows: Rows; warnings?: Warning[]; notes?: string[] }, ps: string[]) => {
    setRows(res.rows);
    setWarnings(res.warnings || []);
    setNotes(res.notes || []);
    setLoadedPeriods(ps);
    setVisiblePeriods(new Set(ps));
  };

  const load = async () => {
    setBusy('fetch');
    setError('');
    setInfo('');
    setMatched(false);
    try {
      const res = await gstApi<{ rows: Rows; warnings: Warning[]; fetched: string[]; fromDisk: string[] }>(`/${kind}/fetch`, { periods, useLocal });
      showResult(res, periods);
      const parts = [];
      if (res.fromDisk.length) parts.push(`loaded from saved files: ${res.fromDisk.map(periodLabel).join(', ')}`);
      if (res.fetched.length) parts.push(`downloaded from portal: ${res.fetched.map(periodLabel).join(', ')}`);
      setInfo(parts.join(' · '));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy('');
    }
  };

  const match = async () => {
    setBusy('match');
    setError('');
    try {
      const res = await gstApi<{ rows: Rows; warnings: Warning[]; notes: string[] }>(`/${kind}/match`, { periods: loadedPeriods });
      showResult(res, loadedPeriods);
      setMatched(true);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy('');
    }
  };

  // period checkboxes above the grid filter all tabs (RET_PER), like the VFP form
  const visibleRows = useMemo(() => {
    if (!rows) return null;
    const out: Rows = {};
    for (const tab of tabs) out[tab.key] = (rows[tab.key] || []).filter((r) => !r.RET_PER || visiblePeriods.has(r.RET_PER));
    return out;
  }, [rows, visiblePeriods, tabs]);

  const tab = tabs.find((x) => x.key === active) || tabs[0];

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
        <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-white">{title}</h2>
        <PeriodPicker value={periods} onChange={setPeriods} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={useLocal} onChange={(e) => setUseLocal(e.target.checked)} />
            Use previously downloaded files when available (no OTP needed)
          </label>
          <button onClick={load} disabled={!!busy || !periods.length} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
            {busy === 'fetch' ? 'Loading…' : useLocal ? 'Load Data' : 'Download from Portal'}
          </button>
          {rows && (
            <button onClick={match} disabled={!!busy} className="rounded bg-orange-600 px-4 py-2 text-sm text-white hover:bg-orange-700 disabled:opacity-50">
              {busy === 'match' ? 'Matching…' : 'Match records'}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{matchHelp}</p>
      </div>

      {(warnings.length > 0 || notes.length > 0) && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          {warnings.map((w, i) => (
            <div key={`w${i}`}>
              {periodLabel(w.period)} {w.section}: {w.message}
            </div>
          ))}
          {notes.map((m, i) => (
            <div key={`n${i}`}>{m}</div>
          ))}
        </div>
      )}

      {visibleRows && (
        <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-amber-600">Return Periods:</span>
            {loadedPeriods.map((p) => (
              <label key={p} className="flex items-center gap-1 text-xs text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={visiblePeriods.has(p)}
                  onChange={() => {
                    const next = new Set(visiblePeriods);
                    if (next.has(p)) next.delete(p);
                    else next.add(p);
                    setVisiblePeriods(next);
                  }}
                />
                {periodLabel(p)}
              </label>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-600">
            {tabs.map((x) => (
              <button
                key={x.key}
                onClick={() => setActive(x.key)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                  active === x.key ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                }`}
              >
                {x.label} ({visibleRows[x.key].length})
              </button>
            ))}
          </div>
          <GstDataGrid
            key={`${kind}-${tab.key}`}
            columns={tab.columns}
            rows={visibleRows[tab.key]}
            exportName={`${kind.toUpperCase()}_${tab.key.toUpperCase()}_${loadedPeriods.join('_')}.csv`}
            emptyText="No data for the selected periods"
          />
        </div>
      )}
    </div>
  );
};

export default PortalViewer;
