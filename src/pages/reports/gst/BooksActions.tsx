import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { errMsg, fmtNum, gstApi, notifyError, notifySuccess } from './gstApi';

// ---------------------------------------------------------------- types
export interface Party { code: string; name: string; add1: string; place: string; state: string; group: string }
interface Account { code: string; name: string }
interface TaxAccount extends Account { rate: number; kind: string }
export interface LedgerAccount { code: string; name: string; group: string; groupName: string; place: string; gstin: string }
export interface BooksMasters {
  ownState: string;
  accounts: LedgerAccount[];
  expense: Account[];
  tax: TaxAccount[];
  parties: Record<string, Party>;
  tradeNames: Record<string, string>;
  suggestions: Record<string, { expenseCode: string; taxCode: string; partyCode: string }>;
}
// a GSTR-2A invoice that is missing in the books
export interface MissingInvoice {
  invoiceNumber: string;
  invoiceDate: string; // dd-mm-yyyy
  partyGST: string;
  invoiceValue: number;
  items: { rt: number; txval: number; iamt: number; camt: number; samt: number; csamt: number }[];
}
// one row of a journal voucher (debit or credit)
export interface JLine { id: string; side: 'DR' | 'CR'; code: string; amount: number; rate?: number; party?: boolean }
interface Draft {
  key: string;
  inv: MissingInvoice;
  entryDate: string;
  narration: string;
  lines: JLine[];
}
export interface Journal {
  id: string;
  status: 'draft' | 'posted';
  vr?: string;
  createdAt: string;
  postedAt?: string;
  supplier: { code: string; name: string; gstin: string };
  invoice: { number: string; date: string };
  entryDate: string;
  expenseCode: string;
  narration?: string;
  lines: Omit<JLine, 'id'>[];
  taxable: number;
  tax: number;
  total: number;
  gstr2aMonth: string;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const inputCls = 'rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100';

// ---------------------------------------------------------------- account picker
// Searchable list of all ledger accounts (code + name); search by code, name, place or GSTIN, optional group filter.
export const AccountPicker: React.FC<{
  accounts: LedgerAccount[];
  value: string;
  onChange: (code: string) => void;
  preferGroup?: string; // group shown first, e.g. CT for parties, EE for expenses
  placeholder?: string;
}> = ({ accounts, value, onChange, preferGroup, placeholder }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState(preferGroup || '');
  const ref = React.useRef<HTMLDivElement>(null);
  const selected = accounts.find((a) => a.code === value);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const groups = useMemo(() => {
    const m = new Map<string, string>();
    accounts.forEach((a) => { if (a.group && !m.has(a.group)) m.set(a.group, a.groupName || a.group); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [accounts]);

  const matches = useMemo(() => {
    const t = q.trim().toUpperCase();
    return accounts
      .filter((a) => (!group || a.group === group) && (!t || a.code.toUpperCase().includes(t) || a.name.toUpperCase().includes(t) || a.place.toUpperCase().includes(t) || a.gstin.includes(t)))
      .slice(0, 80);
  }, [accounts, q, group]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setQ(''); }}
        className="w-full truncate rounded border border-gray-300 bg-white px-2 py-1 text-left text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
        title={selected ? `${selected.code} · ${selected.name}${selected.place ? ', ' + selected.place : ''}` : undefined}
      >
        {selected ? <><span className="font-mono font-semibold">{selected.code}</span> · {selected.name}{selected.place ? <span className="text-gray-500">, {selected.place}</span> : null}</>
          : <span className="text-gray-400">{value ? `${value} (not found)` : placeholder || '— choose account —'}</span>}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-[34rem] max-w-[90vw] rounded-md border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-600 dark:bg-gray-800">
          <div className="mb-2 flex gap-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search code, name, place or GSTIN…"
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <select value={group} onChange={(e) => setGroup(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              <option value="">All groups</option>
              {groups.map(([g, n]) => <option key={g} value={g}>{g} · {n}</option>)}
            </select>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {matches.map((a) => (
              <button
                key={a.code}
                type="button"
                onClick={() => { onChange(a.code); setOpen(false); }}
                className={`flex w-full items-baseline gap-2 rounded px-2 py-1 text-left text-sm hover:bg-blue-50 dark:hover:bg-gray-700 ${a.code === value ? 'bg-blue-100 dark:bg-blue-900/40' : ''}`}
              >
                <span className="w-16 shrink-0 font-mono font-semibold text-gray-800 dark:text-gray-100">{a.code}</span>
                <span className="flex-1 truncate text-gray-800 dark:text-gray-100">{a.name}</span>
                <span className="shrink-0 truncate text-xs text-gray-500">{[a.place, a.gstin].filter(Boolean).join(' · ')}</span>
              </button>
            ))}
            {!matches.length && <div className="px-2 py-3 text-sm text-gray-500">No accounts match</div>}
            {matches.length === 80 && <div className="px-2 pt-1 text-xs text-gray-400">Showing first 80 — refine the search.</div>}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- masters
export function useBooksMasters(month: string, enabled: boolean) {
  const [masters, setMasters] = useState<BooksMasters | null>(null);
  const [error, setError] = useState(''); // shown as a toast by the page
  const reload = useCallback(async () => {
    try {
      setMasters(await gstApi<BooksMasters>(`/books/masters?fp=${encodeURIComponent(month)}`));
      setError('');
    } catch (e) {
      setError(errMsg(e));
    }
  }, [month]);
  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);
  return { masters, error, reload };
}

// default tax account for a rate: the supplier's last used one if it fits, else the first account of the right kind
function defaultTaxCode(m: BooksMasters, gstin: string, rate: number) {
  const kind = gstin.slice(0, 2) === m.ownState ? 'VG' : 'VI';
  const sugg = m.suggestions[gstin]?.taxCode;
  const fits = (t: TaxAccount) => t.kind === kind && Math.abs(t.rate - rate) < 0.01;
  if (sugg && m.tax.some((t) => t.code === sugg && fits(t))) return sugg;
  // prefer generic accounts ("IGST 18.00%") over brand-specific ones ("IGST 18.00% HUL")
  const cands = m.tax.filter(fits).sort((a, b) => a.name.length - b.name.length);
  return cands[0]?.code || '';
}
function defaultCessCode(m: BooksMasters, rate: number) {
  return m.tax.filter((t) => t.kind === 'VC' && Math.abs(t.rate - rate) < 0.01).sort((a, b) => a.name.length - b.name.length)[0]?.code || '';
}

let lineSeq = 0;
const newLine = (p: Omit<JLine, 'id'>): JLine => ({ id: `l${(lineSeq += 1)}`, ...p });
export const sideTotal = (lines: { side: string; amount: number }[], side: 'DR' | 'CR') =>
  r2(lines.filter((l) => l.side === side).reduce((a, l) => a + (Number(l.amount) || 0), 0));
const lineProblems = (lines: JLine[]) => {
  const p: string[] = [];
  if (!lines.some((l) => l.side === 'DR') || !lines.some((l) => l.side === 'CR')) p.push('needs a debit and a credit row');
  if (lines.some((l) => !l.code)) p.push('choose an account in every row');
  if (lines.some((l) => !(l.amount > 0))) p.push('every amount must be more than 0');
  const dr = sideTotal(lines, 'DR');
  const cr = sideTotal(lines, 'CR');
  if (Math.abs(dr - cr) >= 0.005) p.push(`debit ₹${fmtNum(dr)} ≠ credit ₹${fmtNum(cr)}`);
  const both = lines.filter((l) => l.side === 'DR' && l.code && lines.some((x) => x.side === 'CR' && x.code === l.code));
  if (both.length) p.push(`${both[0].code} is on both sides`);
  return p;
};

// GSTR-2A invoice -> journal: Cr party (invoice value) / Dr expense (taxable) + Dr tax per rate + Dr cess + round off
function buildDraft(inv: MissingInvoice, m: BooksMasters): Draft {
  const intra = inv.partyGST.slice(0, 2) === m.ownState;
  const byRate = new Map<number, { taxable: number; tax: number; cess: number }>();
  for (const it of inv.items) {
    const rate = Number(it.rt) || 0;
    const g = byRate.get(rate) || { taxable: 0, tax: 0, cess: 0 };
    g.taxable = r2(g.taxable + (it.txval || 0));
    g.tax = r2(g.tax + (intra ? (it.camt || 0) + (it.samt || 0) : it.iamt || 0));
    g.cess = r2(g.cess + (it.csamt || 0));
    byRate.set(rate, g);
  }
  const sugg = m.suggestions[inv.partyGST];
  const lines: JLine[] = [
    newLine({ side: 'CR', code: m.parties[inv.partyGST]?.code || sugg?.partyCode || '', amount: r2(inv.invoiceValue), party: true }),
    newLine({ side: 'DR', code: sugg?.expenseCode || '', amount: r2([...byRate.values()].reduce((a, g) => a + g.taxable, 0)) }),
  ];
  for (const [rate, g] of byRate) {
    if (g.tax > 0) lines.push(newLine({ side: 'DR', code: defaultTaxCode(m, inv.partyGST, rate), amount: g.tax, rate }));
    if (g.cess > 0) lines.push(newLine({ side: 'DR', code: defaultCessCode(m, rate), amount: g.cess, rate }));
  }
  const diff = r2(sideTotal(lines, 'CR') - sideTotal(lines, 'DR'));
  if (Math.abs(diff) >= 0.01) lines.push(newLine({ side: diff > 0 ? 'DR' : 'CR', code: 'EE001', amount: Math.abs(diff) }));
  const name = m.parties[inv.partyGST]?.name || m.tradeNames[inv.partyGST] || '';
  return { key: `${inv.invoiceNumber}_${inv.partyGST}`, inv, entryDate: inv.invoiceDate, narration: name.slice(0, 25), lines };
}

// ---------------------------------------------------------------- create party
export const CreatePartyDialog: React.FC<{
  gstin: string;
  masters: BooksMasters;
  onClose: () => void;
  onCreated: (p: { code: string; name: string }) => void;
}> = ({ gstin, masters, onClose, onCreated }) => {
  const [name, setName] = useState(masters.tradeNames[gstin] || '');
  const [add1, setAdd1] = useState('');
  const [place, setPlace] = useState('');
  const [mobile, setMobile] = useState('');
  const [busy, setBusy] = useState(false);
  const setError = (m: string) => notifyError(m);
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await gstApi<{ party: { code: string; name: string } }>('/books/parties', { gstin, name, add1, place, mobile });
      onCreated(res.party);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800">
        <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white">Create supplier (Sundry Creditors)</h3>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          GSTIN {gstin} · state {gstin.slice(0, 2)} · PAN {gstin.slice(2, 12)}. A new CT… account is added to CMPL.DBF.
        </p>
        <div className="space-y-2">
          {([['Party name *', name, setName], ['Address', add1, setAdd1], ['Place', place, setPlace], ['Mobile', mobile, setMobile]] as [string, string, (v: string) => void][]).map(([l, v, set]) => (
            <label key={l} className="block text-sm text-gray-700 dark:text-gray-300">
              {l}
              <input value={v} onChange={(e) => set(e.target.value)} className={`${inputCls} mt-1 w-full`} />
            </label>
          ))}
          {!masters.tradeNames[gstin] && <p className="text-xs text-amber-600">Trade name not found in downloaded GSTR-2B files — type it from the invoice.</p>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-gray-300 px-4 py-2 text-sm dark:border-gray-600 dark:text-gray-200">Cancel</button>
          <button onClick={save} disabled={busy || !name.trim()} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
            {busy ? 'Creating…' : 'Create party'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- journal lines editor (any number of debit / credit rows)
export const LinesEditor: React.FC<{
  lines: JLine[];
  onChange: (lines: JLine[]) => void;
  masters: BooksMasters;
  gstin: string;
  reference?: { taxable: number; tax: number; total: number }; // GSTR-2A figures
}> = ({ lines, onChange, masters, gstin, reference }) => {
  const intra = gstin.slice(0, 2) === masters.ownState;
  const dr = sideTotal(lines, 'DR');
  const cr = sideTotal(lines, 'CR');
  const diff = r2(dr - cr);
  const taxBooked = r2(lines.filter((l) => /^V[GIC]/.test(l.code)).reduce((a, l) => a + (l.side === 'DR' ? l.amount : -l.amount), 0));
  const set = (id: string, p: Partial<JLine>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const setParty = (id: string) => onChange(lines.map((l) => ({ ...l, party: l.id === id })));
  const remove = (id: string) => {
    const next = lines.filter((l) => l.id !== id);
    // keep one credit row as the supplier (GSTIN) row
    const firstCr = next.some((l) => l.party) ? null : next.find((l) => l.side === 'CR');
    onChange(firstCr ? next.map((l) => (l.id === firstCr.id ? { ...l, party: true } : l)) : next);
  };
  const add = (side: 'DR' | 'CR') => onChange([...lines, newLine({ side, code: '', amount: 0, party: side === 'CR' && !lines.some((l) => l.side === 'CR') })]);
  // put the difference on the round-off account so the voucher balances
  const balance = () => {
    const rest = lines.filter((l) => l.code !== 'EE001');
    const d = r2(sideTotal(rest, 'CR') - sideTotal(rest, 'DR'));
    onChange(Math.abs(d) < 0.005 ? rest : [...rest, newLine({ side: d > 0 ? 'DR' : 'CR', code: 'EE001', amount: Math.abs(d) })]);
  };

  const side = (s: 'DR' | 'CR') => (
    <div className="rounded border border-gray-200 p-2 dark:border-gray-700">
      <div className="mb-1 flex items-center justify-between">
        <span className={`text-sm font-semibold ${s === 'DR' ? 'text-blue-800 dark:text-blue-300' : 'text-green-800 dark:text-green-300'}`}>
          {s === 'DR' ? 'Debit (Dr)' : 'Credit (Cr)'}
        </span>
        <button type="button" onClick={() => add(s)} className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
          + Add {s === 'DR' ? 'debit' : 'credit'} row
        </button>
      </div>
      <div className="space-y-1">
        {lines.filter((l) => l.side === s).map((l) => {
          const tax = masters.tax.find((t) => t.code === l.code);
          const wrongKind = s === 'DR' && /^V[GI]/.test(l.code) && l.code.slice(0, 2) !== (intra ? 'VG' : 'VI');
          return (
            <div key={l.id} className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <AccountPicker accounts={masters.accounts} value={l.code} onChange={(c) => set(l.id, { code: c, rate: masters.tax.find((t) => t.code === c)?.rate ?? l.rate })} preferGroup={s === 'CR' ? 'CT' : 'EE'} />
                <div className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-gray-500">
                  {tax && <span>GST {tax.rate}%</span>}
                  {wrongKind && <span className="text-red-600">use {intra ? 'SGST/CGST (VG…)' : 'IGST (VI…)'} for this supplier</span>}
                  {s === 'CR' && (
                    <label className="flex items-center gap-1" title="This credit row carries the supplier GSTIN, used for GSTR-2A / 2B matching">
                      <input type="radio" checked={!!l.party} onChange={() => setParty(l.id)} /> supplier (GSTIN) row
                    </label>
                  )}
                </div>
              </div>
              <input
                type="number"
                step="0.01"
                value={l.amount || ''}
                onFocus={(e) => e.target.select()}
                onChange={(e) => set(l.id, { amount: parseFloat(e.target.value) || 0 })}
                className={`${inputCls} w-28 text-right tabular-nums`}
              />
              <button type="button" onClick={() => remove(l.id)} title="Remove row" className="px-1 text-lg leading-6 text-red-500 hover:text-red-700">×</button>
            </div>
          );
        })}
        {!lines.some((l) => l.side === s) && <div className="py-1 text-xs text-gray-400">No {s === 'DR' ? 'debit' : 'credit'} rows</div>}
      </div>
      <div className="mt-2 border-t border-gray-200 pt-1 text-right text-sm font-semibold tabular-nums text-gray-800 dark:border-gray-700 dark:text-gray-100">
        Total {s === 'DR' ? 'Dr' : 'Cr'} ₹{fmtNum(s === 'DR' ? dr : cr)}
      </div>
    </div>
  );

  return (
    <div>
      <div className="grid gap-2 md:grid-cols-2">
        {side('DR')}
        {side('CR')}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
        {Math.abs(diff) < 0.005 ? (
          <span className="font-semibold text-green-700 dark:text-green-400">✓ Balanced — Dr ₹{fmtNum(dr)} = Cr ₹{fmtNum(cr)}</span>
        ) : (
          <>
            <span className="font-semibold text-red-600">Not balanced: Dr ₹{fmtNum(dr)} − Cr ₹{fmtNum(cr)} = ₹{fmtNum(diff)}</span>
            <button type="button" onClick={balance} className="rounded bg-gray-600 px-2 py-0.5 text-xs text-white hover:bg-gray-700">
              Put difference in round off (EE001)
            </button>
          </>
        )}
        {reference && (
          <span className="ml-auto text-xs text-gray-500">
            GSTR-2A: taxable ₹{fmtNum(reference.taxable)} · tax ₹{fmtNum(reference.tax)} · invoice ₹{fmtNum(reference.total)}
            {Math.abs(taxBooked - reference.tax) > 1 && <span className="ml-1 font-semibold text-amber-600">(tax rows ₹{fmtNum(taxBooked)} differ)</span>}
          </span>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- expense journal form (one or many invoices)
export const ExpenseJournalDialog: React.FC<{
  invoices: MissingInvoice[];
  month: string;
  masters: BooksMasters;
  onClose: () => void;
  onSaved: (count: number) => void;
  onCreateParty: (gstin: string) => void;
}> = ({ invoices, month, masters, onClose, onSaved, onCreateParty }) => {
  const [drafts, setDrafts] = useState<Draft[]>(() => invoices.map((i) => buildDraft(i, masters)));
  const [busy, setBusy] = useState(false);
  const setError = (m: string) => notifyError(m);

  // after "Create party", put the new account on the supplier credit row if it is still empty
  useEffect(() => {
    setDrafts((ds) => ds.map((d) => {
      const code = masters.parties[d.inv.partyGST]?.code;
      return code ? { ...d, lines: d.lines.map((l) => (l.party && !l.code ? { ...l, code } : l)) } : d;
    }));
  }, [masters]);

  const patch = (key: string, p: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));
  const problems = drafts.map((d) => {
    const p = lineProblems(d.lines);
    if (!/^\d{2}-\d{2}-\d{4}$/.test(d.entryDate)) p.push('entry date must be dd-mm-yyyy');
    return p;
  });
  const bad = problems.filter((p) => p.length).length;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const entries = drafts.map((d) => ({
        gstr2aMonth: month,
        supplier: { gstin: d.inv.partyGST },
        invoice: { number: d.inv.invoiceNumber, date: d.inv.invoiceDate },
        entryDate: d.entryDate,
        narration: d.narration,
        lines: d.lines.map(({ side, code, amount, rate, party }) => ({ side, code, amount, rate, party })),
      }));
      await gstApi('/books/journals', { entries });
      onSaved(entries.length);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800">
        <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white">
          Add {drafts.length === 1 ? 'invoice' : `${drafts.length} invoices`} as journal (JB)
        </h3>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          Pre-filled from GSTR-2A. Add, remove or change debit and credit rows on any account — the voucher must balance (total debit = total credit).
          Entries are saved as drafts and posted from “Expense journal drafts”. The narration is written as “INV#&lt;invoice&gt; …” so the next match finds it.
        </p>
        <div className="space-y-4">
          {drafts.map((d, i) => {
            const party = masters.parties[d.inv.partyGST];
            const ref = {
              taxable: r2(d.inv.items.reduce((a, it) => a + (it.txval || 0), 0)),
              tax: r2(d.inv.items.reduce((a, it) => a + (it.iamt || 0) + (it.camt || 0) + (it.samt || 0) + (it.csamt || 0), 0)),
              total: d.inv.invoiceValue,
            };
            return (
              <div key={d.key} className={`rounded border p-3 ${problems[i].length ? 'border-amber-300 dark:border-amber-700' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-semibold text-gray-800 dark:text-gray-100">{d.inv.invoiceNumber}</span>
                  <span className="text-gray-600 dark:text-gray-300">{d.inv.invoiceDate}</span>
                  <span className="text-gray-600 dark:text-gray-300">{d.inv.partyGST}</span>
                  {party ? (
                    <span className="text-green-700 dark:text-green-400">GSTIN belongs to {party.code} · {party.name}</span>
                  ) : (
                    <button onClick={() => onCreateParty(d.inv.partyGST)} className="rounded bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white hover:bg-amber-600">
                      GSTIN not in party master — Create party{masters.tradeNames[d.inv.partyGST] ? ` (${masters.tradeNames[d.inv.partyGST]})` : ''}
                    </button>
                  )}
                  <label className="ml-auto flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                    Entry date
                    <input value={d.entryDate} onChange={(e) => patch(d.key, { entryDate: e.target.value })} className={`${inputCls} w-28`} />
                  </label>
                  <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                    Narration
                    <input value={d.narration} maxLength={25} onChange={(e) => patch(d.key, { narration: e.target.value })} className={`${inputCls} w-48`} />
                  </label>
                </div>
                <LinesEditor lines={d.lines} onChange={(lines) => patch(d.key, { lines })} masters={masters} gstin={d.inv.partyGST} reference={ref} />
                {problems[i].length > 0 && <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">{problems[i].join(' · ')}</div>}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {bad > 0 && <span className="mr-auto text-xs text-amber-600">{bad} voucher(s) need attention before saving.</span>}
          <button onClick={onClose} className="rounded border border-gray-300 px-4 py-2 text-sm dark:border-gray-600 dark:text-gray-200">Cancel</button>
          <button onClick={save} disabled={busy || bad > 0} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
            {busy ? 'Saving…' : `Save ${drafts.length} draft${drafts.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- edit a saved draft
const EditJournalDialog: React.FC<{ journal: Journal; masters: BooksMasters; onClose: () => void; onSaved: () => void }> = ({ journal, masters, onClose, onSaved }) => {
  const [lines, setLines] = useState<JLine[]>(() => journal.lines.map((l) => newLine({ ...l })));
  const [entryDate, setEntryDate] = useState(journal.entryDate);
  const [narration, setNarration] = useState(journal.narration || '');
  const [busy, setBusy] = useState(false);
  const setError = (m: string) => notifyError(m);
  const problems = lineProblems(lines);
  if (!/^\d{2}-\d{2}-\d{4}$/.test(entryDate)) problems.push('entry date must be dd-mm-yyyy');
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await gstApi(`/books/journals/${journal.id}`, { entryDate, narration, lines: lines.map(({ side, code, amount, rate, party }) => ({ side, code, amount, rate, party })) }, 'PATCH');
      onSaved();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-auto rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800">
        <h3 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white">
          Edit draft — invoice {journal.invoice.number} ({journal.invoice.date}) · GSTIN {journal.supplier.gstin}
        </h3>
        <div className="mb-2 flex flex-wrap gap-4">
          <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
            Entry date <input value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className={`${inputCls} w-28`} />
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
            Narration <input value={narration} maxLength={25} onChange={(e) => setNarration(e.target.value)} className={`${inputCls} w-48`} />
          </label>
        </div>
        <LinesEditor lines={lines} onChange={setLines} masters={masters} gstin={journal.supplier.gstin} />
        {problems.length > 0 && <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">{problems.join(' · ')}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-gray-300 px-4 py-2 text-sm dark:border-gray-600 dark:text-gray-200">Cancel</button>
          <button onClick={save} disabled={busy || problems.length > 0} className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- drafts / posted list
export const JournalDraftsPanel: React.FC<{ refreshKey: number; masters: BooksMasters | null; onPosted: () => void }> = ({ refreshKey, masters, onPosted }) => {
  const [journals, setJournals] = useState<Journal[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const setMsg = (m: { ok: boolean; text: string } | null) => { if (m) (m.ok ? notifySuccess : notifyError)(m.text); };
  const [showPosted, setShowPosted] = useState(false);
  const [editing, setEditing] = useState<Journal | null>(null);

  const load = useCallback(async () => {
    try {
      setJournals((await gstApi<{ journals: Journal[] }>('/books/journals')).journals);
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const drafts = journals.filter((j) => j.status === 'draft');
  const posted = journals.filter((j) => j.status === 'posted').slice(-30).reverse();
  const accName = (code: string) => masters?.accounts.find((a) => a.code === code)?.name || '';
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const post = async () => {
    const ids = drafts.filter((d) => selected.has(d.id)).map((d) => d.id);
    if (!ids.length) return;
    if (!window.confirm(`Post ${ids.length} journal(s) to the books? JB vouchers are written to CASH.DBF.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await gstApi<{ posted: { vr: string; invoice: string }[] }>('/books/journals/post', { ids });
      setMsg({ ok: true, text: `Posted: ${res.posted.map((p) => `${p.invoice} → ${p.vr}`).join(', ')}` });
      setSelected(new Set());
      await load();
      onPosted();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    if (!window.confirm('Delete this draft?')) return;
    try {
      await gstApi(`/books/journals/${id}`, undefined, 'DELETE');
      await load();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    }
  };

  if (!drafts.length && !posted.length) return null;
  const rows = showPosted ? [...drafts, ...posted] : drafts;
  const sideText = (j: Journal, side: 'DR' | 'CR') => j.lines.filter((l) => l.side === side).map((l) => `${l.code} ${fmtNum(l.amount)}`).join(' + ');
  return (
    <div className="mt-6 rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-800 dark:bg-indigo-900/20">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h3 className="font-semibold text-gray-800 dark:text-white">Expense journal drafts ({drafts.length})</h3>
        <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={showPosted} onChange={(e) => setShowPosted(e.target.checked)} /> show recently posted
        </label>
        <button onClick={post} disabled={busy || !drafts.some((d) => selected.has(d.id))} className="ml-auto rounded bg-indigo-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50">
          {busy ? 'Posting…' : `Post selected to books (${drafts.filter((d) => selected.has(d.id)).length})`}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 dark:bg-gray-700">
            <tr>
              <th className="px-2 py-1">
                <input
                  type="checkbox"
                  checked={drafts.length > 0 && drafts.every((d) => selected.has(d.id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(drafts.map((d) => d.id)) : new Set())}
                />
              </th>
              {['Invoice', 'Date', 'Supplier (GSTIN row)', 'Debit rows', 'Credit rows', 'Entry date', 'Dr = Cr', 'Status', ''].map((h) => (
                <th key={h} className="px-2 py-1 text-left text-xs font-semibold text-gray-700 dark:text-gray-200">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="dark:text-gray-100">
            {rows.map((j) => {
              const dr = sideTotal(j.lines, 'DR');
              const cr = sideTotal(j.lines, 'CR');
              return (
                <tr key={j.id} className="border-t border-gray-100 align-top dark:border-gray-700">
                  <td className="px-2 py-1">{j.status === 'draft' && <input type="checkbox" checked={selected.has(j.id)} onChange={() => toggle(j.id)} />}</td>
                  <td className="px-2 py-1">{j.invoice.number}</td>
                  <td className="px-2 py-1">{j.invoice.date}</td>
                  <td className="px-2 py-1" title={j.supplier.gstin}>{j.supplier.code} · {j.supplier.name || accName(j.supplier.code)}</td>
                  <td className="px-2 py-1 text-xs">{sideText(j, 'DR')}</td>
                  <td className="px-2 py-1 text-xs">{sideText(j, 'CR')}</td>
                  <td className="px-2 py-1">{j.entryDate}</td>
                  <td className={`px-2 py-1 text-right tabular-nums ${Math.abs(dr - cr) >= 0.005 ? 'font-semibold text-red-600' : ''}`}>{fmtNum(dr)}</td>
                  <td className="px-2 py-1">
                    {j.status === 'posted'
                      ? <span className="rounded-full bg-green-100 px-2 text-xs font-semibold text-green-800">Posted {j.vr}</span>
                      : <span className="rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-800">Draft</span>}
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    {j.status === 'draft' && (
                      <>
                        <button onClick={() => setEditing(j)} disabled={!masters} className="mr-2 text-xs text-blue-600 hover:underline disabled:opacity-50">Edit</button>
                        <button onClick={() => remove(j.id)} className="text-xs text-red-600 hover:underline">Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && masters && (
        <EditJournalDialog
          journal={editing}
          masters={masters}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); setMsg({ ok: true, text: 'Draft updated.' }); await load(); }}
        />
      )}
    </div>
  );
};

// count helper for the toolbar
export const useMissingSelection = () => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const api = useMemo(() => ({
    has: (k: string) => selected.has(k),
    toggle: (k: string) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; }),
    set: (ks: string[]) => setSelected(new Set(ks)),
    clear: () => setSelected(new Set()),
  }), [selected]);
  return { selected, ...api };
};
