import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import constants from '../../constants';
import Autocomplete from '../../components/ui/autocomplete/Autocomplete';
import useAuth from '../../hooks/useAuth';
import useActivityTracker from '../../hooks/useActivityTracker';

interface Suggestion {
  code: string;
  name: string;
  score: number;
  reason: string;
}

interface PendingTransaction {
  id: number;
  txnNo: string;
  date: string;
  narration: string;
  chequeNo: string;
  drAmount: number;
  crAmount: number;
  balance: number;
  channel: string;
  senderName: string;
  senderMobile: string;
  vpa: string;
  voucherType: 'BR' | 'BP' | 'CP' | '';
  ignored: boolean;
  partyCode: string;
  partyName: string;
  matchReason: string;
  confidence: number;
  suggestions: Suggestion[];
}

interface PartyOption {
  value: string;
  label: string;
}

interface Summary {
  accountNumber: string;
  accountName: string;
  periodFrom: string;
  periodTo: string;
  latestBalance: number | null;
  fileName: string;
  downloadedAt: number;
  statementRows: number;
  alreadyEntered: number;
}

interface ReconLine {
  txnNo: string;
  date: string;
  narration: string;
  impact: number;
  vr?: string;
  amount?: number;
  side?: string;
  note?: string;
  bankAmount?: number;
  booksAmount?: number;
}

interface BalanceRecon {
  bankClosing: number;
  bankAsOf: string;
  booksClosing: number;
  difference: number;
  periodFrom: string;
  periodTo: string;
  bankOpening: number;
  booksOpening: number;
  carriedForward: number;
  notInBooks: ReconLine[];
  notInBooksTotal: number;
  notInBank: ReconLine[];
  notInBankTotal: number;
  mismatched: ReconLine[];
  mismatchedTotal: number;
  unexplained: number;
  history?: {
    firstDate: string | null;
    lastDate: string | null;
    days?: number;
    changes: { date: string; bank: number; books: number; difference: number }[];
  };
}

interface DownloadJob {
  status: 'idle' | 'running' | 'done' | 'failed';
  step: string;
  message: string;
  attempt: number;
  startedAt: number | null;
  finishedAt: number | null;
  fromDate?: string;
}

interface SaveResult {
  created: { txnNo: string; vr: string; type: string; amount: number; partyCode: string; partyName: string }[];
  skipped: { txnNo: string; reason: string }[];
}

type NotifyState = Record<string, { whatsapp?: string; sms?: string; mobile?: string } | null>;
type Filter = 'all' | 'receipts' | 'payments' | 'cash' | 'unmatched' | 'ignored';

const API = `${constants.baseURL}/api/reports/pnb-statement`;

const inr = (n: number) =>
  '₹' + (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const timeAgo = (ms: number) => {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return new Date(ms).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const CHANNEL_STYLES: Record<string, string> = {
  NEFT: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  RTGS: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
  UPI: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  IMPS: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200',
  ACH: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  CASH: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  CHEQUE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  CHARGES: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  OTHER: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
};

const VOUCHER_LABEL: Record<string, string> = { BR: 'Bank Receipt', BP: 'Bank Payment', CP: 'Cash Deposit' };

const confidenceStyle = (c: number) =>
  c >= 85
    ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
    : c >= 65
      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200'
      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200';

const notifyLabel = (s?: string) =>
  s === 'sent' ? '✓ sent' : s === 'failed' ? '✗ failed' : s === 'no-mobile' ? 'no mobile' : s === 'pending' ? '… sending' : '–';

const financialYearStart = () => {
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-04-01`;
};

const BalancePanel: React.FC<{
  balance: BalanceRecon;
  downloading: boolean;
  onDownloadFrom: (isoDate: string) => void;
}> = ({ balance, downloading, onDownloadFrom }) => {
  const [open, setOpen] = useState(false);
  const diff = balance.difference;
  const ok = Math.abs(diff) < 0.01;
  const h = balance.history;
  const unchangedSince =
    h && h.changes.length && h.changes.every(c => Math.abs(c.difference - diff) < 0.01) ? h.firstDate : null;
  const fyStart = financialYearStart();

  const line = (label: string, value: number) => (
    <div className="flex justify-between gap-3 py-1 border-b border-gray-100 dark:border-gray-700">
      <span className="text-gray-600 dark:text-gray-300">{label}</span>
      <span className={`font-mono whitespace-nowrap ${Math.abs(value) < 0.01 ? 'text-gray-400' : 'text-gray-900 dark:text-gray-100 font-semibold'}`}>
        {value < 0 ? '−' : ''}{inr(Math.abs(value))}
      </span>
    </div>
  );

  const list = (rows: ReconLine[], kind: 'bank' | 'books' | 'mismatch') =>
    rows.length > 0 && (
      <ul className="ml-3 my-1 text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
        {rows.map((r, i) => (
          <li key={`${r.txnNo}-${r.vr}-${i}`} className="flex justify-between gap-3">
            <span className="truncate" title={r.narration}>
              {r.date} · {kind !== 'bank' && r.vr ? `${r.vr} · ` : ''}{r.txnNo || '—'} · {r.narration}
              {kind === 'mismatch' && ` (bank ${inr(r.bankAmount || 0)} vs books ${inr(r.booksAmount || 0)})`}
              {r.note ? <i> · {r.note}</i> : null}
            </span>
            <span className="font-mono whitespace-nowrap">
              {kind === 'mismatch' ? inr(r.impact) : `${inr(r.amount || 0)} ${r.side}`}
            </span>
          </li>
        ))}
      </ul>
    );

  return (
    <div className={`mx-2 md:mx-0 mb-4 rounded shadow p-4 ${ok ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Bank balance (statement, {balance.bankAsOf})</div>
          <div className="text-lg font-bold text-gray-900 dark:text-white">{inr(balance.bankClosing)} Dr</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Books balance (BB009 in CASH.DBF)</div>
          <div className="text-lg font-bold text-gray-900 dark:text-white">{inr(balance.booksClosing)} Cr</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Difference (books − bank)</div>
          <div className={`text-lg font-bold ${ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {ok ? '✓ Matched' : `${diff > 0 ? '+' : '−'}${inr(Math.abs(diff))}`}
          </div>
        </div>
      </div>

      {!ok && (
        <>
          {unchangedSince && (
            <p className="mt-3 text-sm text-red-800 dark:text-red-200">
              The difference has been <b>{inr(Math.abs(diff))}</b> every day since <b>{unchangedSince}</b> (earliest
              statement saved, {h?.days} days), so it comes from the opening balance or an entry <b>before {unchangedSince}</b>.
              Download a statement from an earlier date to find it.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-3 items-center">
            <button onClick={() => setOpen(v => !v)} className="text-sm text-blue-700 dark:text-blue-300 underline">
              {open ? 'Hide breakdown' : 'Show breakdown'}
            </button>
            {unchangedSince && (
              <button
                onClick={() => onDownloadFrom(fyStart)}
                disabled={downloading}
                className="text-sm px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300"
              >
                Download statement from {fyStart.split('-').reverse().join('-')}
              </button>
            )}
          </div>
        </>
      )}

      {open && !ok && (
        <div className="mt-3 bg-white dark:bg-gray-800 rounded p-3 text-sm">
          {line(
            `Already different before ${balance.periodFrom} (books ${inr(balance.booksOpening)} vs bank ${inr(balance.bankOpening)})`,
            balance.carriedForward
          )}
          {line(`In bank, not in books (${balance.notInBooks.length})`, balance.notInBooksTotal)}
          {list(balance.notInBooks, 'bank')}
          {line(`In books, not in bank (${balance.notInBank.length})`, balance.notInBankTotal)}
          {list(balance.notInBank, 'books')}
          {line(`Amount different (${balance.mismatched.length})`, balance.mismatchedTotal)}
          {list(balance.mismatched, 'mismatch')}
          {Math.abs(balance.unexplained) >= 0.01 && line('Unexplained (statement balance jump)', balance.unexplained)}
          {h && h.changes.length > 2 && (
            <div className="mt-3">
              <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Days the difference changed</div>
              <table className="text-xs w-full">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left">Date</th><th className="text-right">Bank</th>
                    <th className="text-right">Books</th><th className="text-right">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {h.changes.map(c => (
                    <tr key={c.date}>
                      <td>{c.date}</td>
                      <td className="text-right font-mono">{inr(c.bank)}</td>
                      <td className="text-right font-mono">{inr(c.books)}</td>
                      <td className="text-right font-mono">{inr(c.difference)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const PNBStatement: React.FC = () => {
  const { user } = useAuth();
  const { logActivity } = useActivityTracker();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [transactions, setTransactions] = useState<PendingTransaction[]>([]);
  const [partyOptions, setPartyOptions] = useState<PartyOption[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [balance, setBalance] = useState<BalanceRecon | null>(null);  const [downloadFrom, setDownloadFrom] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [job, setJob] = useState<DownloadJob | null>(null);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [notify, setNotify] = useState<NotifyState>({});
  const jobTimer = useRef<number | null>(null);
  const notifyTimer = useRef<number | null>(null);

  const partyLabel = useMemo(() => {
    const m = new Map<string, string>();
    partyOptions.forEach(p => m.set(p.value, p.label));
    return m;
  }, [partyOptions]);

  // ---------------- data ----------------

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await axios.get(`${API}/pending`);
      const txns: PendingTransaction[] = data.pendingTransactions;
      setTransactions(txns);
      setPartyOptions(data.parties);
      setSummary(data.summary);
      setBalance(data.balance || null);
      // pre-select rows that already have a confident party
      setSelected(new Set(txns.filter(t => t.partyCode && !t.ignored && t.confidence >= 85).map(t => t.txnNo)));
    } catch (error: any) {
      console.error('Error fetching pending:', error);
      const msg = error.response?.data?.message || 'Failed to fetch pending transactions';
      setLoadError(msg);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const stopJobPolling = () => {
    if (jobTimer.current) window.clearInterval(jobTimer.current);
    jobTimer.current = null;
  };

  const pollJob = useCallback(() => {
    stopJobPolling();
    jobTimer.current = window.setInterval(async () => {
      try {
        const { data } = await axios.get<DownloadJob>(`${API}/download/status`);
        setJob(data);
        if (data.status === 'done') {
          stopJobPolling();
          toast.success('Statement downloaded');
          fetchPending();
        } else if (data.status === 'failed') {
          stopJobPolling();
          toast.error(`Download failed: ${data.message}`);
        }
      } catch {
        /* transient; keep polling */
      }
    }, 2500);
  }, [fetchPending]);

  const handleDownload = async (fromDate?: string) => {
    try {
      const { data } = await axios.post(`${API}/download`, fromDate ? { fromDate } : {});
      setJob(data.job);
      logActivity({ page: 'PNB Reconciliation', action: 'Downloaded Statement', duration: 0 });
      pollJob();
    } catch (error: any) {
      if (error.response?.status === 409) {
        setJob(error.response.data.job);
        pollJob();
        toast.info('A download is already running');
      } else {
        toast.error('Failed to start download');
      }
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchPending();
    // resume showing progress if a download is already running
    axios.get<DownloadJob>(`${API}/download/status`).then(({ data }) => {
      if (data.status === 'running') {
        setJob(data);
        pollJob();
      }
    }).catch(() => { });
    return () => {
      stopJobPolling();
      if (notifyTimer.current) window.clearInterval(notifyTimer.current);
    };
  }, [user, fetchPending, pollJob]);

  // ---------------- row actions ----------------

  const setParty = (txnNo: string, code: string, reason = 'Manual') => {
    setTransactions(prev => prev.map(t =>
      t.txnNo === txnNo
        ? { ...t, partyCode: code, partyName: code ? (partyLabel.get(code) || '') : '', matchReason: code ? reason : '', confidence: code ? 100 : 0 }
        : t
    ));
    setSelected(prev => {
      const next = new Set(prev);
      if (code) next.add(txnNo); else next.delete(txnNo);
      return next;
    });
  };

  const toggleSelect = (txnNo: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(txnNo)) next.delete(txnNo); else next.add(txnNo);
      return next;
    });
  };

  const setIgnored = async (txnNos: string[], ignore: boolean) => {
    if (!txnNos.length) return;
    try {
      const { data } = await axios.post(`${API}/ignore`, { txnNos, ignore });
      setTransactions(prev => prev.map(t => (txnNos.includes(t.txnNo) ? { ...t, ignored: ignore } : t)));
      setSelected(prev => {
        const next = new Set(prev);
        txnNos.forEach(t => next.delete(t));
        return next;
      });
      toast.success(data.message);
    } catch {
      toast.error('Could not update ignore list');
    }
  };

  // ---------------- save ----------------

  const pollNotify = (txnNos: string[]) => {
    if (notifyTimer.current) window.clearInterval(notifyTimer.current);
    if (!txnNos.length) return;
    const started = Date.now();
    const tick = async () => {
      try {
        const { data } = await axios.get<NotifyState>(`${API}/notify-status`, { params: { txnNos: txnNos.join(',') } });
        setNotify(data);
        const done = txnNos.every(t => {
          const s = data[t];
          return s && s.whatsapp !== 'pending' && s.sms !== 'pending';
        });
        if (done || Date.now() - started > 5 * 60000) {
          if (notifyTimer.current) window.clearInterval(notifyTimer.current);
        }
      } catch { /* ignore */ }
    };
    tick();
    notifyTimer.current = window.setInterval(tick, 4000);
  };

  const toSave = transactions.filter(t => selected.has(t.txnNo) && t.partyCode && !t.ignored);
  const selectedTotal = toSave.reduce((s, t) => s + (t.crAmount || 0) - (t.drAmount || 0), 0);

  const handleSave = async () => {
    if (!toSave.length) {
      toast.error('Select at least one transaction with a party');
      return;
    }
    const receipts = toSave.filter(t => t.voucherType === 'BR').length;
    if (!window.confirm(
      `Post ${toSave.length} voucher(s) to CASH.DBF?` +
      (receipts ? `\n\n${receipts} bank receipt(s) will also send a WhatsApp + SMS confirmation to the party.` : '')
    )) return;

    setSaving(true);
    try {
      const { data } = await axios.post(`${API}/save`, {
        transactions: toSave.map(({ txnNo, date, narration, drAmount, crAmount, partyCode }) =>
          ({ txnNo, date, narration, drAmount, crAmount, partyCode })),
      });
      toast.success(data.message);
      logActivity({ page: 'PNB Reconciliation', action: `Saved ${data.created.length} vouchers`, duration: 0 });
      setSaveResult({ created: data.created, skipped: data.skipped });
      setNotify({});
      pollNotify(data.created.filter((c: any) => c.type === 'BR').map((c: any) => c.txnNo));
      const done = new Set<string>(data.created.map((c: any) => c.txnNo));
      setTransactions(prev => prev.filter(t => !done.has(t.txnNo)));
      setSelected(prev => new Set([...prev].filter(t => !done.has(t))));
      setSummary(prev => (prev ? { ...prev, alreadyEntered: prev.alreadyEntered + done.size } : prev));
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error(error.response?.data?.message || 'Failed to save transactions');
    } finally {
      setSaving(false);
    }
  };

  // ---------------- derived ----------------

  const active = transactions.filter(t => !t.ignored);
  const counts = {
    all: active.length,
    receipts: active.filter(t => t.voucherType === 'BR').length,
    payments: active.filter(t => t.voucherType === 'BP').length,
    cash: active.filter(t => t.voucherType === 'CP').length,
    unmatched: active.filter(t => !t.partyCode).length,
    ignored: transactions.length - active.length,
  };
  const totalIn = active.reduce((s, t) => s + (t.crAmount || 0), 0);
  const totalOut = active.reduce((s, t) => s + (t.drAmount || 0), 0);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter(t => {
      if (filter === 'ignored' ? !t.ignored : t.ignored) return false;
      if (filter === 'receipts' && t.voucherType !== 'BR') return false;
      if (filter === 'payments' && t.voucherType !== 'BP') return false;
      if (filter === 'cash' && t.voucherType !== 'CP') return false;
      if (filter === 'unmatched' && t.partyCode) return false;
      if (!q) return true;
      return [t.txnNo, t.narration, t.partyName, t.senderName, String(t.crAmount || t.drAmount)]
        .some(v => (v || '').toLowerCase().includes(q));
    });
  }, [transactions, filter, search]);

  const selectableVisible = visible.filter(t => t.partyCode && !t.ignored);
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every(t => selected.has(t.txnNo));
  const toggleAllVisible = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) selectableVisible.forEach(t => next.delete(t.txnNo));
      else selectableVisible.forEach(t => next.add(t.txnNo));
      return next;
    });
  };

  // ---------------- access ----------------

  if (user && !user.routeAccess?.includes('Admin')) {
    return <div className="p-4 text-red-500">Access Denied: Admin only area.</div>;
  }

  const downloading = job?.status === 'running';

  // ---------------- render helpers ----------------

  const renderParty = (t: PendingTransaction) => (
    <div className="space-y-1">
      <Autocomplete
        id={`party-${t.txnNo}`}
        label="Select Party"
        options={partyOptions}
        defaultValue={t.partyCode ? (partyLabel.get(t.partyCode) || t.partyName) : ''}
        disabled={t.ignored}
        onChange={code => setParty(t.txnNo, code)}
      />
      <div className="flex flex-wrap items-center gap-1">
        {t.partyCode && t.matchReason && (
          <span className={`text-[11px] px-1.5 py-0.5 rounded ${confidenceStyle(t.confidence)}`}>
            {t.matchReason}{t.matchReason !== 'Manual' ? ` · ${t.confidence}%` : ''}
          </span>
        )}
        {t.suggestions.filter(s => s.code !== t.partyCode).slice(0, 3).map(s => (
          <button
            key={s.code}
            type="button"
            disabled={t.ignored}
            onClick={() => setParty(t.txnNo, s.code, s.reason)}
            title={`${s.reason} · ${s.score}%`}
            className="text-[11px] px-1.5 py-0.5 rounded border border-dashed border-gray-400 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 max-w-[14rem] truncate"
          >
            {s.name} · {s.score}%
          </button>
        ))}
      </div>
    </div>
  );

  const renderAmount = (t: PendingTransaction) =>
    t.crAmount > 0
      ? <span className="font-semibold text-green-700 dark:text-green-400">+{inr(t.crAmount)}</span>
      : <span className="font-semibold text-red-600 dark:text-red-400">−{inr(t.drAmount)}</span>;

  const renderDescription = (t: PendingTransaction) => (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${CHANNEL_STYLES[t.channel] || CHANNEL_STYLES.OTHER}`}>{t.channel}</span>
        {t.senderName && <span className="font-medium text-gray-900 dark:text-gray-100">{t.senderName}</span>}
        {t.senderMobile && <span className="text-xs text-gray-500">📱 {t.senderMobile}</span>}
      </div>
      <div className="text-[11px] text-gray-500 dark:text-gray-400 break-all mt-0.5">{t.narration}</div>
    </div>
  );

  const renderActions = (t: PendingTransaction) => (
    <button
      type="button"
      onClick={() => setIgnored([t.txnNo], !t.ignored)}
      className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 underline"
    >
      {t.ignored ? 'Restore' : 'Ignore'}
    </button>
  );

  // ---------------- render ----------------

  return (
    <div className="container mx-auto px-0 py-2 md:p-4">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4 px-2 md:px-0">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">PNB Bank Statement Reconciliation</h1>
          {summary && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              A/c {summary.accountNumber || '—'} · {summary.periodFrom} to {summary.periodTo} · downloaded {timeAgo(summary.downloadedAt)}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleDownload(downloadFrom || undefined)}
            disabled={downloading}
            title={downloadFrom ? `Download from ${downloadFrom} to today` : 'Download yesterday + today'}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
          >
            {downloading ? 'Downloading…' : downloadFrom ? 'Download from date' : 'Download Statement'}
          </button>
          <input
            type="date"
            value={downloadFrom}
            max={new Date().toISOString().slice(0, 10)}
            onChange={e => setDownloadFrom(e.target.value)}
            title="Optional: download a longer statement starting from this date"
            className="px-2 py-2 text-sm border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <button
            onClick={fetchPending}
            disabled={loading}
            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-60 transition-colors"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Download progress */}
      {job && job.status !== 'idle' && (job.status === 'running' || (job.finishedAt && Date.now() - job.finishedAt < 10 * 60000)) && (
        <div className={`mx-2 md:mx-0 mb-4 rounded p-3 text-sm flex items-center gap-3 ${job.status === 'failed'
          ? 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200'
          : job.status === 'done'
            ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200'
            : 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'}`}>
          {job.status === 'running' && <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
          <span>
            {job.status === 'running' && <>Downloading from PNB{job.fromDate ? ` (from ${job.fromDate})` : ''}: <b>{job.step}</b>{job.attempt > 1 ? ` (attempt ${job.attempt})` : ''}</>}
            {job.status === 'done' && <>Statement downloaded {job.finishedAt ? timeAgo(job.finishedAt) : ''}.</>}
            {job.status === 'failed' && <>Download failed: <b>{job.message}</b>. Try again, or download the CSV from PNB manually.</>}
          </span>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 md:gap-3 mb-4 px-2 md:px-0">
          <div className="bg-white dark:bg-gray-800 rounded shadow p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">Pending</div>
            <div className="text-xl font-bold text-gray-900 dark:text-white">{counts.all}</div>
            <div className="text-[11px] text-gray-500">{counts.unmatched} without party</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded shadow p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">Received (pending)</div>
            <div className="text-lg font-bold text-green-700 dark:text-green-400">{inr(totalIn)}</div>
            <div className="text-[11px] text-gray-500">{counts.receipts + counts.cash} entries</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded shadow p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">Paid (pending)</div>
            <div className="text-lg font-bold text-red-600 dark:text-red-400">{inr(totalOut)}</div>
            <div className="text-[11px] text-gray-500">{counts.payments} entries</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded shadow p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400">Already in books</div>
            <div className="text-xl font-bold text-gray-900 dark:text-white">{summary.alreadyEntered}<span className="text-sm font-normal text-gray-500"> / {summary.statementRows}</span></div>
            <div className="text-[11px] text-gray-500">statement rows</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded shadow p-3 col-span-2 lg:col-span-1">
            <div className="text-xs text-gray-500 dark:text-gray-400">Statement balance</div>
            <div className="text-lg font-bold text-gray-900 dark:text-white">{summary.latestBalance != null ? inr(summary.latestBalance) : '—'}</div>
            <div className="text-[11px] text-gray-500 truncate" title={summary.fileName}>{summary.fileName}</div>
          </div>
        </div>
      )}

      {/* Books vs bank balance */}
      {balance && (
        <BalancePanel
          balance={balance}
          downloading={downloading}
          onDownloadFrom={from => { setDownloadFrom(from); handleDownload(from); }}
        />
      )}

      {/* Save result */}
      {saveResult && (
        <div className="mx-2 md:mx-0 mb-4 bg-white dark:bg-gray-800 rounded shadow p-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">
              Posted {saveResult.created.length} voucher(s){saveResult.skipped.length ? `, skipped ${saveResult.skipped.length}` : ''}
            </h2>
            <button onClick={() => setSaveResult(null)} className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Close</button>
          </div>
          {saveResult.created.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                    <th className="py-1 pr-3">Voucher</th><th className="py-1 pr-3">Party</th><th className="py-1 pr-3 text-right">Amount</th>
                    <th className="py-1 pr-3">WhatsApp</th><th className="py-1">SMS</th>
                  </tr>
                </thead>
                <tbody>
                  {saveResult.created.map(c => {
                    const n = notify[c.txnNo];
                    return (
                      <tr key={c.txnNo} className="border-b last:border-0 dark:border-gray-700 text-gray-800 dark:text-gray-200">
                        <td className="py-1 pr-3 font-mono">{c.vr}</td>
                        <td className="py-1 pr-3">{c.partyName} <span className="text-xs text-gray-500">({c.partyCode})</span></td>
                        <td className="py-1 pr-3 text-right">{inr(c.amount)}</td>
                        <td className="py-1 pr-3 text-xs">{c.type === 'BR' ? notifyLabel(n?.whatsapp) : '–'}</td>
                        <td className="py-1 text-xs">{c.type === 'BR' ? notifyLabel(n?.sms) : '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {saveResult.skipped.length > 0 && (
            <ul className="mt-2 text-xs text-amber-700 dark:text-amber-300 list-disc pl-5">
              {saveResult.skipped.map(s => <li key={s.txnNo}>{s.txnNo}: {s.reason}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Transactions */}
      <div className="bg-white dark:bg-gray-800 md:rounded shadow p-3 md:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap gap-1">
            {([
              ['all', 'All'], ['receipts', 'Receipts'], ['payments', 'Payments'],
              ['cash', 'Cash'], ['unmatched', 'No party'], ['ignored', 'Ignored'],
            ] as [Filter, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${filter === key
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700'}`}
              >
                {label} <span className="opacity-75">{counts[key]}</span>
              </button>
            ))}
          </div>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, txn no, amount…"
            className="w-full sm:w-64 px-3 py-1.5 text-sm border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-600 dark:text-gray-400">Loading transactions…</div>
        ) : loadError ? (
          <div className="text-center py-8 text-red-600 dark:text-red-400">{loadError}</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            ✓ All {summary?.statementRows ?? ''} statement transactions are already in the books.
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No transactions match this filter.</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-700 text-left text-gray-700 dark:text-gray-200">
                    <th className="py-2 px-2 w-8">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} disabled={!selectableVisible.length} title="Select all with a party" />
                    </th>
                    <th className="py-2 px-2">Txn / Date</th>
                    <th className="py-2 px-2">Details</th>
                    <th className="py-2 px-2 text-right">Amount</th>
                    <th className="py-2 px-2">Entry</th>
                    <th className="py-2 px-2 w-80">Party</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(t => (
                    <tr
                      key={t.txnNo}
                      className={`border-b dark:border-gray-700 align-top ${t.ignored ? 'opacity-60' : ''} ${selected.has(t.txnNo) ? 'bg-blue-50/60 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                    >
                      <td className="py-2 px-2">
                        <input
                          type="checkbox"
                          checked={selected.has(t.txnNo)}
                          disabled={!t.partyCode || t.ignored}
                          onChange={() => toggleSelect(t.txnNo)}
                          title={t.partyCode ? '' : 'Choose a party first'}
                        />
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        <div className="font-mono text-gray-900 dark:text-gray-100">{t.txnNo}</div>
                        <div className="text-xs text-gray-500">{t.date}</div>
                      </td>
                      <td className="py-2 px-2 max-w-md">{renderDescription(t)}</td>
                      <td className="py-2 px-2 text-right whitespace-nowrap">{renderAmount(t)}</td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200" title={VOUCHER_LABEL[t.voucherType]}>
                          {t.voucherType}
                        </span>
                      </td>
                      <td className="py-2 px-2">{renderParty(t)}</td>
                      <td className="py-2 px-2">{renderActions(t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} disabled={!selectableVisible.length} />
                Select all with a party
              </label>
              {visible.map(t => (
                <div
                  key={t.txnNo}
                  className={`rounded border p-3 ${t.ignored ? 'opacity-60' : ''} ${selected.has(t.txnNo) ? 'border-blue-400 bg-blue-50/60 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.has(t.txnNo)}
                      disabled={!t.partyCode || t.ignored}
                      onChange={() => toggleSelect(t.txnNo)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between gap-2">
                        <div className="text-xs text-gray-500"><span className="font-mono">{t.txnNo}</span> · {t.date} · {t.voucherType}</div>
                        <div className="text-sm whitespace-nowrap">{renderAmount(t)}</div>
                      </div>
                      <div className="mt-1">{renderDescription(t)}</div>
                    </div>
                  </div>
                  <div className="mt-2">{renderParty(t)}</div>
                  <div className="mt-2 text-right">{renderActions(t)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Sticky action bar */}
      {transactions.length > 0 && (
        <div className="sticky bottom-20 lg:bottom-4 z-30 mt-3">
          <div className="px-2 md:px-0">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-gray-700 dark:text-gray-200">
                <b>{toSave.length}</b> selected · net <b className={selectedTotal >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{inr(Math.abs(selectedTotal))}</b>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIgnored(transactions.filter(t => selected.has(t.txnNo) && !t.ignored).map(t => t.txnNo), true)}
                  disabled={!selected.size || saving}
                  className="px-3 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700 text-sm"
                >
                  Ignore selected
                </button>
                <button
                  onClick={handleSave}
                  disabled={!toSave.length || saving}
                  className="bg-green-600 text-white px-5 py-2 rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium shadow-sm text-sm"
                >
                  {saving ? 'Saving…' : `Save ${toSave.length} to books`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PNBStatement;
