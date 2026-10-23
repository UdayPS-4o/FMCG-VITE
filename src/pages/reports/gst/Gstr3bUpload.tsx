import React, { useEffect, useMemo, useState } from 'react';
import { errMsg, fmtNum, gstApi, isValidPeriod, notifyError, notifySuccess, notifyWarn, previousPeriod } from './gstApi';
import {
  AVL_ROWS, ECO_ROWS, FULL_KEYS, Full, Gstr3bForm, HEAD_LABEL, INELG_ROWS, INTER_ROWS, InterKey, LOCKED_SUP, LedgerBal, LiabLedger,
  PdCash, PdItc, REV_ROWS, STATES, SUP_ROWS, TAX_KEYS, Tax, advisoryChecks, applyLocked, cashNeed, computeOffset, emptyForm,
  emptyPdCash, emptyPdItc, itcNet, liabilities, liabilityLocked, r2, table32Locked, timeBar, zTax,
} from './gstr3bModel';

interface AutoMeta { r1fildt: string; r2bgendt: string; r3bgendt: string; errors: string[] }
interface Retsum { form: Gstr3bForm; ledgers: LiabLedger[]; paid: { pditc: Record<string, number> | null; pdcash: Record<string, number>[] }; data: unknown }
interface SysFig { sale: Full; itc: Tax; source: string }
interface Track { rtntype: string; status: string; arn: string; dof: string; ret_prd: string }
type TabKey = 'liab' | 'itc' | 'other' | 'recon' | 'pay' | 'summary';

const TABS: [TabKey, string][] = [
  ['liab', '3. Outward & RCM liability'],
  ['itc', '4. Eligible ITC'],
  ['other', '5. Exempt inward / 5.1 Interest & fee'],
  ['recon', 'Reconciliation & checks'],
  ['pay', '6. Payment / Offset'],
  ['summary', 'Saved return (portal)'],
];

const inputCls = 'w-32 rounded border border-gray-300 px-2 py-1 text-right text-sm tabular-nums dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-800';
const cardCls = 'rounded-lg bg-white p-4 shadow dark:bg-gray-800';
const thCls = 'px-2 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-200';
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const Num: React.FC<{ value: number; onChange?: (v: number) => void; disabled?: boolean }> = ({ value, onChange, disabled }) =>
  onChange && !disabled ? (
    <input type="number" step="0.01" value={value} onFocus={(e) => e.target.select()} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} className={inputCls} />
  ) : (
    <span className="inline-block w-32 text-right text-sm tabular-nums text-gray-800 dark:text-gray-100">{fmtNum(value)}</span>
  );

const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: string }> = ({ tone = 'bg-gray-700 hover:bg-gray-800', className = '', ...p }) => (
  <button {...p} className={`rounded px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${tone} ${className}`} />
);

const Lock: React.FC = () => (
  <span title="Auto-populated from GSTR-1/1A/IFF and non-editable (correct through GSTR-1A)" className="ml-1 rounded bg-gray-200 px-1 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
    LOCKED
  </span>
);

// a table of rows x tax heads
function HeadTable<K extends string>({
  rows, get, keys, set, locked, compare,
}: {
  rows: { key: K; label: string; keys?: (keyof Full)[] }[];
  get: (k: K) => Partial<Full>;
  keys: (keyof Full)[];
  set?: (k: K, h: keyof Full, v: number) => void;
  locked?: (k: K) => boolean;
  compare?: (k: K) => Partial<Full> | null; // portal / GSTR-2B values shown under each cell
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100 dark:bg-gray-700">
          <tr>
            <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-200">Nature of supplies</th>
            {keys.map((h) => <th key={h} className={thCls}>{HEAD_LABEL[h]}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const vals = get(r.key);
            const cmp = compare ? compare(r.key) : null;
            const isLocked = locked ? locked(r.key) : false;
            return (
              <tr key={r.key} className="border-t border-gray-100 align-top dark:border-gray-700">
                <td className="max-w-md px-2 py-1 text-gray-800 dark:text-gray-100">
                  {r.label}
                  {isLocked && <Lock />}
                </td>
                {keys.map((h) => {
                  const allowed = !r.keys || r.keys.includes(h);
                  const v = Number(vals[h] || 0);
                  const c = cmp ? Number(cmp[h] || 0) : null;
                  const over = c !== null && v - c > 1;
                  const under = c !== null && c - v > 1;
                  return (
                    <td key={h} className="px-1 py-1 text-right">
                      {allowed ? <Num value={v} disabled={isLocked} onChange={set ? (x) => set(r.key, h, x) : undefined} /> : <span className="text-gray-300">—</span>}
                      {allowed && c !== null && (
                        <div className={`text-[11px] tabular-nums ${over ? 'font-semibold text-red-600' : under ? 'text-amber-600' : 'text-gray-400'}`} title="GSTN auto-populated value">
                          GSTN {fmtNum(c)}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Port + extension of GSTR3B_PORTAL_UPLOAD.PRG:
// full GSTR-3B (3.1, 3.1.1, 3.2, 4, 5, 5.1), GSTN auto-fill with hard-lock, books reconciliation, ledger-aware offset and EVC filing.
const Gstr3bUpload: React.FC = () => {
  const [fp, setFp] = useState(previousPeriod());
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('Ready… Start with “1. Load portal data”.');
  const setError = (m: string) => notifyError(m);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [response, setResponse] = useState<{ title: string; body: unknown } | null>(null);
  const [tab, setTab] = useState<TabKey>('liab');

  const [form, setForm] = useState<Gstr3bForm>(emptyForm());
  const [filled, setFilled] = useState(false);
  const [auto, setAuto] = useState<Gstr3bForm | null>(null);
  const [autoMeta, setAutoMeta] = useState<AutoMeta | null>(null);
  const [interest, setInterest] = useState<Tax | null>(null);
  const [retsum, setRetsum] = useState<Retsum | null>(null);
  const [bal, setBal] = useState<LedgerBal | null>(null);
  const [track, setTrack] = useState<Track[] | null>(null);
  const [sys, setSys] = useState<SysFig | null>(null);
  const [sysSource, setSysSource] = useState<'cash' | 'csv'>('cash');

  const [pditc, setPditc] = useState<PdItc>(emptyPdItc());
  const [pdcash, setPdcash] = useState<PdCash[]>([emptyPdCash(0, 30002, 'Other than reverse charge'), emptyPdCash(0, 30003, 'Reverse charge and supplies u/s 9(5)')]);

  // closing balances of the reclaim (ECRS) and RCM statements - read from the portal (CLOSINGBAL / RCMCLOSINGBAL)
  const [reclaimBal, setReclaimBal] = useState<Tax>(zTax());
  const [rcmBal, setRcmBal] = useState<Tax>(zTax());
  const [balFromPortal, setBalFromPortal] = useState(false);
  const [validation, setValidation] = useState<{ ok: boolean; text: string } | null>(null);
  const [openingDeclared, setOpeningDeclared] = useState<unknown[] | null>(null);
  // Table 6.1 tax liability breakup by period (RETBKP)
  const [breakup, setBreakup] = useState<{ ret_period: string; liability: Tax }[]>([]);

  const [preview, setPreview] = useState<{ changes: { field: string; saved: number; now: number }[]; payload: unknown } | null>(null);
  const [pan, setPan] = useState('');
  const [evcSent, setEvcSent] = useState(false);
  const [evcOtp, setEvcOtp] = useState('');

  const validFp = isValidPeriod(fp);
  const locked = validFp && liabilityLocked(fp);
  const locked32 = validFp && table32Locked(fp);
  const bar = validFp ? timeBar(fp) : null;
  const filed3b = (track || []).find((t) => String(t.rtntype).toUpperCase() === 'GSTR3B' && /filed/i.test(t.status));
  const filed1 = (track || []).find((t) => String(t.rtntype).toUpperCase() === 'GSTR1' && /filed/i.test(t.status));
  const ldgNormal = retsum?.ledgers.find((l) => l.trans_typ === 30002) || null;
  const ldgRc = retsum?.ledgers.find((l) => l.trans_typ === 30003) || null;

  // reset everything when the period changes
  useEffect(() => {
    setForm(emptyForm());
    setFilled(false);
    setAuto(null);
    setAutoMeta(null);
    setInterest(null);
    setRetsum(null);
    setBal(null);
    setTrack(null);
    setSys(null);
    setWarnings([]);
    setReclaimBal(zTax());
    setRcmBal(zTax());
    setBalFromPortal(false);
    setValidation(null);
    setOpeningDeclared(null);
    setBreakup([]);
    setPditc(emptyPdItc());
    setPdcash([emptyPdCash(0, 30002, 'Other than reverse charge'), emptyPdCash(0, 30003, 'Reverse charge and supplies u/s 9(5)')]);
  }, [fp]);

  const run = async (label: string, fn: () => Promise<void>) => {
    if (!validFp) {
      setError('Return period must be MMYYYY, e.g. 092026');
      return;
    }
    setBusy(label);
    setError('');
    setStatus(`${label}…`);
    try {
      await fn();
      notifySuccess(`${label} — done`);
    } catch (e) {
      setError(errMsg(e));
      setStatus(`${label} failed.`);
    } finally {
      setBusy('');
    }
  };

  const setLedgerIds = (ledgers: LiabLedger[]) => {
    const n = ledgers.find((l) => l.trans_typ === 30002);
    const r = ledgers.find((l) => l.trans_typ === 30003);
    setPditc((p) => ({ ...p, liab_ldg_id: n?.liab_ldg_id || p.liab_ldg_id }));
    setPdcash((rows) => rows.map((c) => {
      const l = c.trans_typ === 30003 ? r : n;
      return l ? { ...c, liab_ldg_id: l.liab_ldg_id, label: l.desc } : c;
    }));
  };

  // ---------------------------------------------------------------- loading
  const loadPortal = () =>
    run('Loading portal data (auto-fill, saved return, ledger balance, filing status)', async () => {
      const [a, s, l, t, b] = await Promise.allSettled([
        gstApi('/gstr3b/autofill', { fp, fresh }),
        gstApi('/gstr3b/summary', { fp, fresh }),
        gstApi('/gstr3b/ledger', { fp }),
        gstApi('/returns/track', { fp }),
        gstApi('/gstr3b/balances', { fp }),
      ]);
      const warn: string[] = [];
      if (b.status === 'fulfilled') {
        if (b.value.reclaim) setReclaimBal(b.value.reclaim);
        if (b.value.rcm) setRcmBal(b.value.rcm);
        setBalFromPortal(!!(b.value.reclaim && b.value.rcm));
        setOpeningDeclared(b.value.openingDeclared ?? null);
        if (b.value.reclaimError) warn.push(`Reclaim statement balance (CLOSINGBAL): ${b.value.reclaimError}`);
        if (b.value.rcmError) warn.push(`RCM statement balance (RCMCLOSINGBAL): ${b.value.rcmError}`);
      } else warn.push(`Reclaim / RCM statement balances: ${errMsg(b.reason)}`);
      let newAuto: Gstr3bForm | null = null;
      let newInterest: Tax | null = null;
      let newRetsum: Retsum | null = null;
      if (a.status === 'fulfilled') {
        newAuto = a.value.form;
        newInterest = a.value.interest || null;
        setAuto(a.value.form);
        setAutoMeta(a.value.meta);
        setInterest(newInterest);
        if (a.value.retintError) warn.push(`Interest calculation (RETINT): ${a.value.retintError}`);
      } else warn.push(`Auto-fill (AUTOLIAB): ${errMsg(a.reason)}`);
      if (s.status === 'fulfilled') {
        newRetsum = s.value as Retsum;
        setRetsum(newRetsum);
        setLedgerIds(newRetsum.ledgers || []);
      } else warn.push(`Saved return (RETSUM): ${errMsg(s.reason)}`);
      if (l.status === 'fulfilled') setBal(l.value as LedgerBal);
      else warn.push(`Ledger balance: ${errMsg(l.reason)}`);
      if (t.status === 'fulfilled') setTrack(t.value.list || []);
      else warn.push(`Filing status: ${errMsg(t.reason)}`);
      setWarnings(warn);
      if (warn.length) notifyWarn(`${warn.length} item(s) could not be loaded from the portal — see the warnings on the page.`);

      if (!filled && newAuto) {
        const f = clone(newAuto);
        f.intr = newInterest ? { iamt: r2(newInterest.iamt || 0), camt: r2(newInterest.camt || 0), samt: r2(newInterest.samt || 0), csamt: r2(newInterest.csamt || 0) } : f.intr;
        if (newRetsum) f.ltfee = clone(newRetsum.form.ltfee);
        setForm(f);
        setFilled(true);
      }
      setStatus(a.status === 'fulfilled' ? 'Portal data loaded. The form is filled from the GSTN auto-populated return — review each table.' : 'Some portal data could not be loaded — see warnings.');
    });

  const loadBooks = () =>
    run(`Reading book figures from ${sysSource === 'csv' ? 'GSTR-3.csv' : 'CASH'}`, async () => {
      setSys(await gstApi('/gstr3b/system', { fp, source: sysSource }));
      setTab('recon');
      setStatus('Book figures loaded — compare them with the portal on the Reconciliation tab.');
    });

  const fillFrom = (which: 'auto' | 'saved' | 'books') => {
    let f = clone(form);
    if (which === 'auto' && auto) {
      f = clone(auto);
      f.intr = interest ? { ...zTax(), ...interest } : form.intr;
      f.ltfee = form.ltfee;
    }
    if (which === 'saved' && retsum) f = clone(retsum.form);
    if (which === 'books' && sys) {
      if (!locked) f.sup.osup_det = clone(sys.sale);
      f.itc_avl.OTH = clone(sys.itc);
    }
    if (auto) f = applyLocked(f, auto, fp);
    setForm(f);
    setFilled(true);
    setStatus(
      which === 'auto' ? 'Form filled from the GSTN auto-populated return.'
        : which === 'saved' ? 'Form filled from the return currently saved on the portal.'
          : locked ? '4A(5) filled from books. 3.1(a) is locked for this period and stays at the GSTN value.' : '3.1(a) and 4A(5) filled from books.',
    );
  };

  const nilReturn = () => {
    if (!window.confirm(`Fill GSTR-3B ${fp} as a NIL return? All tables, interest and late fee are set to zero (save and file afterwards).`)) return;
    let f = emptyForm();
    if (auto && locked) f = applyLocked(f, auto, fp);
    setForm(f);
    setFilled(true);
    setStatus(locked && auto ? 'Form set to NIL (locked liability kept at GSTN values — must be zero for a NIL return).' : 'Form set to NIL.');
  };

  // ---------------------------------------------------------------- editing helpers
  const editSup = (k: string, h: keyof Full, v: number) => setForm((f) => ({ ...f, sup: { ...f.sup, [k]: { ...f.sup[k as keyof typeof f.sup], [h]: v } } }));
  const editEco = (k: string, h: keyof Full, v: number) => setForm((f) => ({ ...f, eco: { ...f.eco, [k]: { ...f.eco[k as 'eco_sup'], [h]: v } } }));
  const editTax = (grp: 'itc_avl' | 'itc_rev' | 'itc_inelg', k: string, h: keyof Full, v: number) =>
    setForm((f) => ({ ...f, [grp]: { ...f[grp], [k]: { ...(f[grp] as Record<string, Tax>)[k], [h]: v } } }));
  const editInter = (k: InterKey, i: number, patch: Partial<{ pos: string; txval: number; iamt: number }>) =>
    setForm((f) => ({ ...f, inter: { ...f.inter, [k]: f.inter[k].map((r, j) => (j === i ? { ...r, ...patch } : r)) } }));

  // ---------------------------------------------------------------- save / offset / file
  const blockReason = () => {
    if (filed3b) return `GSTR-3B for ${fp} is already filed (ARN ${filed3b.arn}).`;
    if (bar?.barred) return `GSTR-3B for ${fp} is time-barred: returns cannot be filed more than 3 years after the due date.`;
    return '';
  };

  const startSave = () => {
    const why = blockReason();
    if (why) return setError(why);
    if (locked && !auto) return setError('This period has hard-locked liability. Load portal data first so 3.1 / 3.1.1 / 3.2 can be taken from the GSTN auto-populated values.');
    run('Comparing with the return saved on the portal', async () => {
      const res = await gstApi('/gstr3b/save', { fp, form, dryRun: true });
      setPreview({ changes: res.changes, payload: res.payload });
      setStatus('Review the changes, then confirm to save.');
    });
  };

  const confirmSave = () =>
    run('Saving GSTR-3B (RETSAVE)', async () => {
      setPreview(null);
      const res = await gstApi('/gstr3b/save', { fp, form });
      setResponse({ title: 'Save — portal response', body: res.data });
      const s = await gstApi('/gstr3b/summary', { fp, fresh: true });
      setRetsum(s as Retsum);
      setLedgerIds(s.ledgers || []);
      setStatus('Saved. Next: Payment / Offset tab.');
      setTab('pay');
    });

  // GSTN VALID: checks the form against the auto-calculated, hard-locked values without saving anything
  const validate = () =>
    run('Validating with GSTN (VALID)', async () => {
      try {
        const res = await gstApi('/gstr3b/validate', { fp, form });
        setValidation({ ok: true, text: 'GSTN validation passed — the form agrees with the auto-calculated values.' });
        setResponse({ title: 'GSTN validation response', body: res.data });
        setStatus('Validation passed.');
      } catch (e) {
        setValidation({ ok: false, text: `GSTN validation failed: ${errMsg(e)}` });
        throw e;
      }
    });

  const recomputeInterest = () =>
    run('Asking GSTN to re-compute interest (CMPINT)', async () => {
      await gstApi('/gstr3b/recompute-interest', { fp });
      const a = await gstApi('/gstr3b/autofill', { fp, fresh: true });
      setInterest(a.interest || null);
      setAuto(a.form);
      setAutoMeta(a.meta);
      if (a.interest) setForm((f) => ({ ...f, intr: { ...zTax(), ...a.interest } }));
      setStatus('Interest re-computed by GSTN and copied into 5.1.');
    });

  // tax (not interest / fee) of this return, the total the breakup must add up to
  const taxTotal = (): Tax => {
    const L = liabilities(form);
    return { iamt: r2(L.normal.igst + L.rc.igst), camt: r2(L.normal.cgst + L.rc.cgst), samt: r2(L.normal.sgst + L.rc.sgst), csamt: r2(L.normal.cess + L.rc.cess) };
  };
  const prefillBreakup = () => setBreakup([{ ret_period: fp, liability: taxTotal() }]);
  const saveBreakup = () => {
    const why = blockReason();
    if (why) return setError(why);
    if (!window.confirm(`Save the tax liability breakup for ${fp} on the GST portal? (only after offset; the total must equal the tax paid in 6.1)`)) return;
    run('Saving tax liability breakup (RETBKP)', async () => {
      const res = await gstApi('/gstr3b/breakup', { fp, breakup });
      setResponse({ title: 'Liability breakup — portal response', body: res.data });
      setStatus('Liability breakup saved. Next: File Return (EVC).');
    });
  };

  const autoOffset = () => {
    const r = computeOffset(form, bal, ldgNormal, ldgRc);
    setPditc(r.pditc);
    setPdcash(r.pdcash);
    setStatus('Offset calculated with Rule 88A from ledger balance + this return\'s net ITC. Review before offsetting.');
  };

  const cash = useMemo(() => cashNeed(pdcash, bal), [pdcash, bal]);

  const offset = () => {
    const why = blockReason();
    if (why) return setError(why);
    if (!pditc.liab_ldg_id) return setError('Liability ledger IDs are not known yet — save the return (or load portal data) first.');
    const allZero = [pditc.i_pdi, pditc.i_pdc, pditc.i_pds, pditc.c_pdi, pditc.c_pdc, pditc.s_pdi, pditc.s_pds, pditc.cs_pdcs].every((x) => !x)
      && pdcash.every((c) => !(c.ipd || c.cpd || c.spd || c.cspd));
    if (allZero && !window.confirm('The offset matrix is empty. Send anyway? (use “Auto-calculate” to fill it)')) return;
    if (cash.total > 0 && !window.confirm(`Cash ledger is short by ₹${fmtNum(cash.total)}. Create a challan (PMT-06) and pay it first, otherwise the offset will fail. Continue anyway?`)) return;
    if (!window.confirm(`Offset the GSTR-3B liability for ${fp} on the GST portal? Ledgers are debited and this cannot be undone.`)) return;
    run('Offsetting liability (RETOFFSET)', async () => {
      const res = await gstApi('/gstr3b/offset', { fp, pditc, pdcash: pdcash.map((c) => { const { label, ...rest } = c; void label; return rest; }) });
      setResponse({ title: 'Offset — portal response', body: res.data });
      const [l, s] = await Promise.all([gstApi('/gstr3b/ledger', { fp }), gstApi('/gstr3b/summary', { fp, fresh: true })]);
      setBal(l);
      setRetsum(s as Retsum);
      setStatus('Liability offset. Next: File Return (EVC).');
    });
  };

  const requestEvc = () =>
    run('Requesting EVC OTP', async () => {
      const res = await gstApi('/evc-otp', { pan, form: 'R3B' });
      setEvcSent(true);
      setResponse({ title: 'EVC OTP response', body: res.data });
      setStatus('EVC OTP requested — check mobile / email.');
    });

  const fileReturn = () => {
    const why = blockReason();
    if (why) return setError(why);
    if (!window.confirm(`WARNING: This will FILE your GSTR-3B return for ${fp} via EVC. This cannot be undone. Proceed?`)) return;
    run('Filing GSTR-3B (RETFILE)', async () => {
      const res = await gstApi('/gstr3b/file', { fp, pan, otp: evcOtp });
      setResponse({ title: 'GSTR-3B filed — portal response', body: res.data });
      setEvcSent(false);
      setEvcOtp('');
      const t = await gstApi('/returns/track', { fp }).catch(() => null);
      if (t) setTrack(t.list || []);
      setStatus('Return filed.');
    });
  };

  // ---------------------------------------------------------------- derived
  const net = itcNet(form);
  const liab = liabilities(form);
  const checks = advisoryChecks(form, reclaimBal, rcmBal);
  const over2b = auto ? AVL_ROWS.filter((r) => TAX_KEYS.some((k) => form.itc_avl[r.ty][k] - auto.itc_avl[r.ty][k] > 1)) : [];
  const supLocked = (k: string) => locked && (LOCKED_SUP as string[]).includes(k);

  const check = (state: 'ok' | 'bad' | 'warn' | 'na', text: React.ReactNode, key?: React.Key) => (
    <li key={key} className="flex items-start gap-2 text-sm">
      <span className={`mt-0.5 inline-block h-4 w-4 shrink-0 rounded-full text-center text-[10px] font-bold leading-4 text-white ${
        state === 'ok' ? 'bg-green-600' : state === 'bad' ? 'bg-red-600' : state === 'warn' ? 'bg-amber-500' : 'bg-gray-400'}`}>
        {state === 'ok' ? '✓' : state === 'bad' ? '✕' : state === 'warn' ? '!' : '?'}
      </span>
      <span className="text-gray-700 dark:text-gray-200">{text}</span>
    </li>
  );

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------ header */}
      <div className={cardCls}>
        <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-white">GSTR-3B Preparation & Filing</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Ret Period (MMYYYY)</label>
            <input
              value={fp}
              onChange={(e) => setFp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className={`w-32 rounded border px-2 py-1.5 text-sm dark:bg-gray-700 dark:text-gray-100 ${validFp ? 'border-gray-300 dark:border-gray-600' : 'border-red-500'}`}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} />
            Download fresh copy (ignore saved AUTOLIAB / RETINT / RETSUM)
          </label>
          <div className="flex items-center gap-2">
            <select value={sysSource} onChange={(e) => setSysSource(e.target.value as 'cash' | 'csv')} className="rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
              <option value="cash">Books: CASH ledger</option>
              <option value="csv">Books: GSTR-3.csv (VFP export)</option>
            </select>
          </div>
        </div>
        <div className="mt-3 text-sm font-semibold text-blue-700 dark:text-blue-400">{busy ? `${busy}…` : status}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn onClick={loadPortal} disabled={!!busy} tone="bg-blue-700 hover:bg-blue-800">1. Load portal data</Btn>
          <Btn onClick={loadBooks} disabled={!!busy} tone="bg-green-700 hover:bg-green-800">2. Load book figures</Btn>
          <Btn onClick={() => fillFrom('auto')} disabled={!!busy || !auto} tone="bg-slate-600 hover:bg-slate-700">Fill from GSTN auto</Btn>
          <Btn onClick={() => fillFrom('saved')} disabled={!!busy || !retsum} tone="bg-slate-600 hover:bg-slate-700">Fill from saved return</Btn>
          <Btn onClick={() => fillFrom('books')} disabled={!!busy || !sys} tone="bg-slate-600 hover:bg-slate-700">Fill 3.1(a) / 4A(5) from books</Btn>
          <Btn onClick={nilReturn} disabled={!!busy} tone="bg-gray-500 hover:bg-gray-600">NIL return</Btn>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          {warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}
      {filed3b && (
        <div className="rounded border border-green-300 bg-green-50 p-3 text-sm font-semibold text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-200">
          GSTR-3B for {fp} is already FILED on {filed3b.dof} — ARN {filed3b.arn}. Save, offset and filing are disabled.
        </div>
      )}

      {/* ------------------------------------------------ pre-filing checklist */}
      <div className={cardCls}>
        <h3 className="mb-2 font-semibold text-gray-800 dark:text-white">Pre-filing checklist</h3>
        <ul className="grid gap-1 md:grid-cols-2">
          {check(!track ? 'na' : filed1 ? 'ok' : 'bad', track ? (filed1 ? <>GSTR-1 filed on {filed1.dof} (ARN {filed1.arn})</> : <>GSTR-1 / IFF for {fp} is not filed — liability in 3.1 will be incomplete</>) : 'GSTR-1 filing status — load portal data')}
          {check(!autoMeta ? 'na' : autoMeta.r2bgendt ? 'ok' : 'warn', autoMeta ? (autoMeta.r2bgendt ? <>GSTR-2B generated on {autoMeta.r2bgendt}</> : 'GSTR-2B not generated yet — Table 4 auto values may be empty') : 'GSTR-2B generation date — load portal data')}
          {check(!autoMeta ? 'na' : autoMeta.errors.length ? 'warn' : 'ok', autoMeta ? (autoMeta.errors.length ? `Auto-population messages: ${autoMeta.errors.join('; ')}` : `GSTR-3B auto-populated on ${autoMeta.r3bgendt || '—'}`) : 'Auto-populated GSTR-3B — load portal data')}
          {check(!track ? 'na' : filed3b ? 'bad' : 'ok', track ? (filed3b ? `Already filed (ARN ${filed3b.arn})` : 'GSTR-3B not filed yet') : 'GSTR-3B filing status — load portal data')}
          {bar && check(bar.barred ? 'bad' : 'ok', bar.barred ? `Time-barred: due ${bar.due.toLocaleDateString('en-IN')}, cannot be filed after ${bar.bar.toLocaleDateString('en-IN')}` : `Due date ${bar.due.toLocaleDateString('en-IN')} (3-year filing limit ${bar.bar.toLocaleDateString('en-IN')})`)}
          {check(locked ? 'warn' : 'ok', locked
            ? <>Liability is hard-locked for this period (3.1 a/b/c/e, 3.1.1{locked32 ? ', 3.2' : ''}) — correct mismatches through GSTR-1A before filing</>
            : 'Liability tables editable for this period')}
          {check(over2b.length ? 'bad' : auto ? 'ok' : 'na', auto ? (over2b.length ? `ITC claimed above GSTR-2B in 4A ${over2b.map((r) => r.label.slice(0, 3)).join(', ')} — review Table 4` : 'ITC claimed is within GSTR-2B') : 'ITC vs GSTR-2B — load portal data')}
          {check(!validation ? 'na' : validation.ok ? 'ok' : 'bad', validation ? validation.text : 'GSTN validation against auto-calculated values — click “Validate with GSTN” before saving')}
          {check(checks.some((c) => !c.ok) ? 'bad' : 'ok', checks.some((c) => !c.ok) ? 'Reclaim / RCM ledger validation fails — see Reconciliation tab' : 'Reclaim (4D1) and RCM ITC validations pass')}
        </ul>
      </div>

      {/* ------------------------------------------------ tables */}
      <div className={cardCls}>
        <div className="mb-3 flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-600">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400'}`}>
              {l}
            </button>
          ))}
        </div>

        {tab === 'liab' && (
          <div className="space-y-5">
            <div>
              <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">3.1 Details of outward supplies and inward supplies liable to reverse charge</div>
              <HeadTable rows={SUP_ROWS} keys={FULL_KEYS} get={(k) => form.sup[k]} set={editSup} locked={supLocked} compare={auto ? (k) => auto.sup[k] : undefined} />
            </div>
            <div>
              <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">3.1.1 Supplies notified under section 9(5) of the CGST Act</div>
              <HeadTable rows={ECO_ROWS} keys={FULL_KEYS} get={(k) => form.eco[k]} set={editEco} locked={() => locked} compare={auto ? (k) => auto.eco[k] : undefined} />
            </div>
            <div>
              <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
                3.2 Inter-state supplies (out of 3.1 and 3.1.1) {locked32 && <Lock />}
              </div>
              {INTER_ROWS.map((g) => (
                <div key={g.key} className="mb-3">
                  <div className="mb-1 flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                    {g.label}
                    {!locked32 && (
                      <button onClick={() => setForm((f) => ({ ...f, inter: { ...f.inter, [g.key]: [...f.inter[g.key], { pos: '', txval: 0, iamt: 0 }] } }))} className="rounded bg-blue-600 px-2 py-0.5 text-white hover:bg-blue-700">
                        + Add state
                      </button>
                    )}
                  </div>
                  {form.inter[g.key].length === 0 ? (
                    <div className="text-xs text-gray-400">No entries</div>
                  ) : (
                    <table className="text-sm">
                      <thead className="bg-gray-100 dark:bg-gray-700">
                        <tr>
                          <th className="px-2 py-1 text-left text-xs font-semibold text-gray-700 dark:text-gray-200">Place of supply</th>
                          <th className={thCls}>Taxable Value</th>
                          <th className={thCls}>IGST</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {form.inter[g.key].map((r, i) => (
                          <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                            <td className="px-1 py-1">
                              <select
                                disabled={locked32}
                                value={r.pos}
                                onChange={(e) => editInter(g.key, i, { pos: e.target.value })}
                                className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                              >
                                <option value="">Select state</option>
                                {Object.entries(STATES).map(([c, n]) => <option key={c} value={c}>{c} - {n}</option>)}
                              </select>
                            </td>
                            <td className="px-1 py-1"><Num value={r.txval} disabled={locked32} onChange={(v) => editInter(g.key, i, { txval: v })} /></td>
                            <td className="px-1 py-1"><Num value={r.iamt} disabled={locked32} onChange={(v) => editInter(g.key, i, { iamt: v })} /></td>
                            <td className="px-1">
                              {!locked32 && (
                                <button onClick={() => setForm((f) => ({ ...f, inter: { ...f.inter, [g.key]: f.inter[g.key].filter((_, j) => j !== i) } }))} className="text-xs text-red-600 hover:underline">
                                  Remove
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'itc' && (
          <div className="space-y-5">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Grey figures under each cell are the GSTN auto-populated values (from GSTR-2B / IMS). <span className="font-semibold text-red-600">Red</span> = claimed more than GSTR-2B.
            </p>
            <div>
              <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">(A) ITC Available (whether in full or part)</div>
              <HeadTable rows={AVL_ROWS.map((r) => ({ key: r.ty, label: r.label }))} keys={TAX_KEYS} get={(k) => form.itc_avl[k]} set={(k, h, v) => editTax('itc_avl', k, h, v)} compare={auto ? (k) => auto.itc_avl[k] : undefined} />
            </div>
            <div>
              <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">(B) ITC Reversed</div>
              <HeadTable rows={REV_ROWS.map((r) => ({ key: r.ty, label: r.label }))} keys={TAX_KEYS} get={(k) => form.itc_rev[k]} set={(k, h, v) => editTax('itc_rev', k, h, v)} compare={auto ? (k) => auto.itc_rev[k] : undefined} />
            </div>
            <div className="rounded bg-blue-50 p-2 text-sm dark:bg-blue-900/30">
              <span className="font-semibold text-blue-900 dark:text-blue-200">(C) Net ITC available (A) − (B): </span>
              {TAX_KEYS.map((k) => <span key={k} className="mr-4 tabular-nums text-blue-900 dark:text-blue-100">{HEAD_LABEL[k]} {fmtNum(net[k])}</span>)}
            </div>
            <div>
              <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">(D) Other details</div>
              <HeadTable rows={INELG_ROWS.map((r) => ({ key: r.ty, label: r.label }))} keys={TAX_KEYS} get={(k) => form.itc_inelg[k]} set={(k, h, v) => editTax('itc_inelg', k, h, v)} compare={auto ? (k) => auto.itc_inelg[k] : undefined} />
            </div>
          </div>
        )}

        {tab === 'other' && (
          <div className="space-y-5">
            <div>
              <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">5. Values of exempt, nil-rated and non-GST inward supplies</div>
              <table className="text-sm">
                <thead className="bg-gray-100 dark:bg-gray-700">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-200">Nature of supplies</th>
                    <th className={thCls}>Inter-State</th>
                    <th className={thCls}>Intra-State</th>
                  </tr>
                </thead>
                <tbody>
                  {([['GST', 'From a supplier under composition scheme, exempt and nil-rated supply'], ['NONGST', 'Non-GST supply']] as ['GST' | 'NONGST', string][]).map(([k, l]) => (
                    <tr key={k} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-2 py-1 text-gray-800 dark:text-gray-100">{l}</td>
                      {(['inter', 'intra'] as const).map((s) => (
                        <td key={s} className="px-1 py-1">
                          <Num value={form.inward[k][s]} onChange={(v) => setForm((f) => ({ ...f, inward: { ...f.inward, [k]: { ...f.inward[k], [s]: v } } }))} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">5.1 Interest & late fee for previous tax period</div>
              <HeadTable
                rows={[{ key: 'intr' as const, label: 'Interest' }, { key: 'ltfee' as const, label: 'Late fee' }]}
                keys={TAX_KEYS}
                get={(k) => form[k]}
                set={(k, h, v) => setForm((f) => ({ ...f, [k]: { ...f[k], [h]: v } }))}
                compare={(k) => (k === 'intr' ? interest : retsum ? retsum.form.ltfee : null)}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Grey values: interest computed by GSTN (RETINT) and late fee from the saved return. Interest and late fee are payable in cash only.</p>
              <button onClick={recomputeInterest} disabled={!!busy} className="mt-2 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                Re-compute interest (GSTN)
              </button>
            </div>
          </div>
        )}

        {tab === 'recon' && (
          <div className="space-y-5">
            <div>
              <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
                Books vs GSTN {sys ? `(books: ${sys.source})` : ''}
              </div>
              {!sys || !auto ? (
                <p className="text-sm text-gray-500">Load portal data and book figures to compare.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-gray-700">
                    <tr>
                      <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-200">Item</th>
                      <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-200">Head</th>
                      <th className={thCls}>Books</th>
                      <th className={thCls}>GSTN</th>
                      <th className={thCls}>Difference</th>
                      <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-200">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ...FULL_KEYS.map((h) => ({ item: '3.1(a) Outward taxable', h, b: sys.sale[h], g: auto.sup.osup_det[h], hint: 'Mismatch: amend through GSTR-1A (liability is locked) or correct books' })),
                      ...TAX_KEYS.map((h) => ({ item: '4A(5) All other ITC', h: h as keyof Full, b: sys.itc[h as keyof Tax], g: auto.itc_avl.OTH[h as keyof Tax], hint: 'Books above GSTR-2B: claim only what is in 2B (Rule 36(4)); check IMS for pending / rejected invoices' })),
                    ].map((r, i) => {
                      const d = r2(r.b - r.g);
                      const bad = Math.abs(d) > 1;
                      return (
                        <tr key={i} className={`border-t border-gray-100 dark:border-gray-700 ${bad ? 'bg-red-50 dark:bg-red-900/20' : ''}`}>
                          <td className="px-2 py-1 text-gray-800 dark:text-gray-100">{r.item}</td>
                          <td className="px-2 py-1 text-gray-600 dark:text-gray-300">{HEAD_LABEL[r.h]}</td>
                          <td className="px-2 py-1 text-right tabular-nums dark:text-gray-100">{fmtNum(r.b)}</td>
                          <td className="px-2 py-1 text-right tabular-nums dark:text-gray-100">{fmtNum(r.g)}</td>
                          <td className={`px-2 py-1 text-right tabular-nums ${bad ? 'font-semibold text-red-600' : 'text-gray-500'}`}>{fmtNum(d)}</td>
                          <td className="px-2 py-1 text-xs text-gray-600 dark:text-gray-300">{bad ? r.hint : 'OK'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div>
              <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Reclaim ledger (ECRS) & RCM ledger validation — GSTN advisory 643</div>
              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                {balFromPortal
                  ? 'Closing balances read from the portal (Electronic Credit Reversal and Re-claimed Statement / RCM Liability-ITC Statement). You can adjust them to test.'
                  : 'Load portal data to read the closing balances of the Electronic Credit Reversal and Re-claimed Statement and the RCM Liability-ITC Statement, or type them in.'}
              </p>
              <table className="text-sm">
                <thead className="bg-gray-100 dark:bg-gray-700">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700 dark:text-gray-200">Closing balance</th>
                    {TAX_KEYS.map((k) => <th key={k} className={thCls}>{HEAD_LABEL[k]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {([['Reclaim ledger (ECRS)', reclaimBal, setReclaimBal], ['RCM ledger', rcmBal, setRcmBal]] as [string, Tax, React.Dispatch<React.SetStateAction<Tax>>][]).map(([l, v, set]) => (
                    <tr key={l} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-2 py-1 text-gray-800 dark:text-gray-100">{l}</td>
                      {TAX_KEYS.map((k) => (
                        <td key={k} className="px-1 py-1"><Num value={v[k]} onChange={(x) => set({ ...v, [k]: x })} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {openingDeclared !== null && (
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                  Opening balance declared on the reclaim statement: {openingDeclared.length ? `${openingDeclared.length} entr${openingDeclared.length === 1 ? 'y' : 'ies'}` : 'none (not reported)'}
                </p>
              )}
              <ul className="mt-2 space-y-1">
                {checks.length === 0 && <li className="text-sm text-gray-500">No 4D(1) reclaim or RCM ITC claimed — nothing to validate.</li>}
                {checks.map((c, i) => check(c.ok ? 'ok' : 'bad', c.text, i))}
              </ul>
            </div>
          </div>
        )}

        {tab === 'pay' && (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Ledger balance (live)</div>
                {!bal ? <p className="text-sm text-gray-500">Load portal data to read the cash and credit ledgers.</p> : (
                  <table className="text-sm">
                    <thead className="bg-gray-100 dark:bg-gray-700">
                      <tr><th className="px-2 py-1 text-left text-xs font-semibold">Ledger</th>{(['igst', 'cgst', 'sgst', 'cess'] as const).map((h) => <th key={h} className={thCls}>{h.toUpperCase()}</th>)}</tr>
                    </thead>
                    <tbody className="dark:text-gray-100">
                      {([['Cash', bal.cash], ['ITC (credit)', bal.itc], ['ITC blocked', bal.blocked]] as [string, LedgerBal['cash']][]).map(([l, v]) => (
                        <tr key={l} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="px-2 py-1">{l}</td>
                          {(['igst', 'cgst', 'sgst', 'cess'] as const).map((h) => <td key={h} className="px-2 py-1 text-right tabular-nums">{fmtNum(v[h])}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Liability of this return</div>
                <table className="text-sm">
                  <thead className="bg-gray-100 dark:bg-gray-700">
                    <tr><th className="px-2 py-1 text-left text-xs font-semibold">Ledger</th>{(['igst', 'cgst', 'sgst', 'cess'] as const).map((h) => <th key={h} className={thCls}>{h.toUpperCase()}</th>)}</tr>
                  </thead>
                  <tbody className="dark:text-gray-100">
                    {([['Tax (other than RC)', liab.normal], ['Tax (reverse charge / 9(5)) — cash only', liab.rc], ['Interest — cash only', liab.interest], ['Late fee — cash only', liab.fee]] as [string, LedgerBal['cash']][]).map(([l, v]) => (
                      <tr key={l} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-2 py-1">{l}</td>
                        {(['igst', 'cgst', 'sgst', 'cess'] as const).map((h) => <td key={h} className="px-2 py-1 text-right tabular-nums">{fmtNum(v[h])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Liability ledgers: {retsum?.ledgers.length ? retsum.ledgers.map((l) => `${l.desc} #${l.liab_ldg_id}`).join(' · ') : 'not loaded (load portal data / save first)'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Btn onClick={autoOffset} disabled={!!busy} tone="bg-blue-600 hover:bg-blue-700">Auto-calculate (Rule 88A)</Btn>
            </div>

            <div>
              <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Paid through ITC (ledger #{pditc.liab_ldg_id || '—'})</div>
              <div className="overflow-x-auto">
                <table className="text-sm">
                  <thead className="bg-gray-100 dark:bg-gray-700">
                    <tr>
                      {([['i_pdi', 'IGST by IGST'], ['i_pdc', 'IGST by CGST'], ['i_pds', 'IGST by SGST'], ['c_pdi', 'CGST by IGST'], ['c_pdc', 'CGST by CGST'], ['s_pdi', 'SGST by IGST'], ['s_pds', 'SGST by SGST'], ['cs_pdcs', 'Cess by Cess']] as [keyof PdItc, string][]).map(([k, l]) => (
                        <th key={k} className={thCls}>{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {(['i_pdi', 'i_pdc', 'i_pds', 'c_pdi', 'c_pdc', 's_pdi', 's_pds', 'cs_pdcs'] as (keyof PdItc)[]).map((k) => (
                        <td key={k} className="px-1 py-1"><Num value={pditc[k]} onChange={(v) => setPditc({ ...pditc, [k]: v })} /></td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Paid in cash</div>
              <div className="overflow-x-auto">
                <table className="text-sm">
                  <thead className="bg-gray-100 dark:bg-gray-700">
                    <tr>
                      <th className="px-2 py-1 text-left text-xs font-semibold">Ledger</th>
                      {([['ipd', 'IGST'], ['cpd', 'CGST'], ['spd', 'SGST'], ['cspd', 'Cess'], ['i_intrpd', 'IGST int'], ['c_intrpd', 'CGST int'], ['s_intrpd', 'SGST int'], ['cs_intrpd', 'Cess int'], ['c_lfeepd', 'CGST fee'], ['s_lfeepd', 'SGST fee']] as [keyof PdCash, string][]).map(([k, l]) => (
                        <th key={k} className={thCls}>{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pdcash.map((c, i) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-2 py-1 text-xs text-gray-700 dark:text-gray-200">{c.label} #{c.liab_ldg_id || '—'}</td>
                        {(['ipd', 'cpd', 'spd', 'cspd', 'i_intrpd', 'c_intrpd', 's_intrpd', 'cs_intrpd', 'c_lfeepd', 's_lfeepd'] as (keyof PdCash)[]).map((k) => (
                          <td key={k} className="px-1 py-1">
                            <Num value={Number(c[k])} onChange={(v) => setPdcash(pdcash.map((x, j) => (j === i ? { ...x, [k]: v } : x)))} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={`mt-2 rounded p-2 text-sm ${cash.total > 0 ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200'}`}>
                Cash required: {(['igst', 'cgst', 'sgst', 'cess'] as const).map((h) => `${h.toUpperCase()} ${fmtNum(cash.need[h])}`).join(' · ')}
                {cash.total > 0
                  ? <> — <b>short by ₹{fmtNum(cash.total)}</b> ({(['igst', 'cgst', 'sgst', 'cess'] as const).filter((h) => cash.short[h] > 0).map((h) => `${h.toUpperCase()} ${fmtNum(cash.short[h])}`).join(', ')}). Create a challan (PMT-06) on the portal and pay before offsetting.</>
                  : bal ? ' — cash ledger is sufficient.' : ''}
              </div>
            </div>

            <div>
              <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Tax liability breakup by tax period (Table 6.1) — after offset</div>
              <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                Only needed when part of this month's tax belongs to earlier periods (late-reported supplies), so GSTN can compute interest. The rows must add up to the tax paid.
              </p>
              <div className="mb-2 flex flex-wrap gap-2">
                <button onClick={prefillBreakup} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">All for {fp}</button>
                <button
                  onClick={() => setBreakup((b) => [...b, { ret_period: '', liability: zTax() }])}
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  + Earlier period
                </button>
              </div>
              {breakup.length > 0 && (() => {
                const tot = taxTotal();
                const sum = breakup.reduce((a, b) => ({ iamt: r2(a.iamt + b.liability.iamt), camt: r2(a.camt + b.liability.camt), samt: r2(a.samt + b.liability.samt), csamt: r2(a.csamt + b.liability.csamt) }), zTax());
                const off = TAX_KEYS.some((k) => Math.abs(sum[k] - tot[k]) > 1);
                return (
                  <>
                    <table className="text-sm">
                      <thead className="bg-gray-100 dark:bg-gray-700">
                        <tr>
                          <th className="px-2 py-1 text-left text-xs font-semibold">Period (MMYYYY)</th>
                          {TAX_KEYS.map((k) => <th key={k} className={thCls}>{HEAD_LABEL[k]}</th>)}
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {breakup.map((b, i) => (
                          <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                            <td className="px-1 py-1">
                              <input
                                value={b.ret_period}
                                onChange={(e) => setBreakup(breakup.map((x, j) => (j === i ? { ...x, ret_period: e.target.value.replace(/D/g, '').slice(0, 6) } : x)))}
                                placeholder="MMYYYY"
                                className="w-24 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                              />
                            </td>
                            {TAX_KEYS.map((k) => (
                              <td key={k} className="px-1 py-1">
                                <Num value={b.liability[k]} onChange={(v) => setBreakup(breakup.map((x, j) => (j === i ? { ...x, liability: { ...x.liability, [k]: v } } : x)))} />
                              </td>
                            ))}
                            <td className="px-1">
                              <button onClick={() => setBreakup(breakup.filter((_, j) => j !== i))} className="text-xs text-red-600 hover:underline">Remove</button>
                            </td>
                          </tr>
                        ))}
                        <tr className={`border-t-2 font-semibold ${off ? 'text-red-600' : 'text-green-700 dark:text-green-400'}`}>
                          <td className="px-2 py-1 text-xs">Total / tax of return</td>
                          {TAX_KEYS.map((k) => <td key={k} className="px-2 py-1 text-right text-xs tabular-nums">{fmtNum(sum[k])} / {fmtNum(tot[k])}</td>)}
                          <td />
                        </tr>
                      </tbody>
                    </table>
                    <Btn onClick={saveBreakup} disabled={!!busy || off || !!filed3b} tone="bg-indigo-700 hover:bg-indigo-800" className="mt-2">
                      Save liability breakup
                    </Btn>
                    {off && <span className="ml-2 text-xs text-red-600">Rows must add up to the tax of the return.</span>}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {tab === 'summary' && (
          <div className="space-y-4">
            {!retsum ? <p className="text-sm text-gray-500">Load portal data to see the return currently saved on the portal.</p> : (
              <>
                <p className="text-xs text-gray-500 dark:text-gray-400">This is what the GST portal currently holds for {fp} (RETSUM).</p>
                <HeadTable rows={SUP_ROWS} keys={FULL_KEYS} get={(k) => retsum.form.sup[k]} />
                <HeadTable rows={ECO_ROWS} keys={FULL_KEYS} get={(k) => retsum.form.eco[k]} />
                <HeadTable rows={[...AVL_ROWS.map((r) => ({ key: `A${r.ty}`, label: `4A${r.label}` })), ...REV_ROWS.map((r) => ({ key: `B${r.ty}`, label: `4B${r.label}` })), ...INELG_ROWS.map((r) => ({ key: `D${r.ty}`, label: `4D${r.label}` }))]}
                  keys={TAX_KEYS}
                  get={(k) => {
                    const ty = k.slice(1);
                    return k[0] === 'A' ? retsum.form.itc_avl[ty as 'OTH'] : k[0] === 'B' ? retsum.form.itc_rev[ty as 'OTH'] : retsum.form.itc_inelg[ty as 'OTH'];
                  }}
                />
                <HeadTable rows={[{ key: 'intr' as const, label: '5.1 Interest' }, { key: 'ltfee' as const, label: '5.1 Late fee' }]} keys={TAX_KEYS} get={(k) => retsum.form[k]} />
                {retsum.paid.pditc && (
                  <div className="text-sm text-gray-700 dark:text-gray-200">
                    <div className="font-semibold">Already offset</div>
                    <pre className="mt-1 max-h-48 overflow-auto rounded bg-gray-50 p-2 text-xs dark:bg-gray-900">{JSON.stringify({ pditc: retsum.paid.pditc, pdcash: retsum.paid.pdcash }, null, 2)}</pre>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------ actions */}
      <div className={cardCls}>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={validate} disabled={!!busy || !!filed3b} tone="bg-teal-700 hover:bg-teal-800">Validate with GSTN</Btn>
          <Btn onClick={startSave} disabled={!!busy || !!filed3b} tone="bg-blue-700 hover:bg-blue-800">3. Save GSTR-3B</Btn>
          <Btn onClick={offset} disabled={!!busy || !!filed3b} tone="bg-red-700 hover:bg-red-800">4. Offset Liability</Btn>
        </div>
        <div className="mt-4 rounded border border-purple-200 p-3 dark:border-purple-800">
          <div className="mb-2 text-sm font-semibold text-purple-800 dark:text-purple-300">5. File Return (EVC)</div>
          <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">Use the authorised signatory's personal PAN — do not use the company PAN.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase().slice(0, 10))} placeholder="Signatory PAN" className="w-36 rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            <Btn onClick={requestEvc} disabled={!!busy || pan.length !== 10 || !!filed3b} tone="bg-purple-600 hover:bg-purple-700">Request EVC OTP</Btn>
            {evcSent && (
              <>
                <input value={evcOtp} onChange={(e) => setEvcOtp(e.target.value.trim().toUpperCase())} placeholder="EVC OTP" className="w-28 rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
                <Btn onClick={fileReturn} disabled={!!busy || !evcOtp} tone="bg-purple-800 hover:bg-purple-900">File Return</Btn>
              </>
            )}
          </div>
        </div>
      </div>

      {response && (
        <div className={cardCls}>
          <h3 className="mb-2 font-semibold text-gray-800 dark:text-white">{response.title}</h3>
          <pre className="max-h-72 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">{JSON.stringify(response.body, null, 2)}</pre>
        </div>
      )}

      {/* ------------------------------------------------ save preview */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800">
            <h3 className="mb-2 text-lg font-semibold text-gray-800 dark:text-white">Save GSTR-3B {fp} — changes against the portal</h3>
            {preview.changes.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">No changes — the portal already holds these values.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 dark:bg-gray-700">
                  <tr>
                    <th className="px-2 py-1 text-left text-xs font-semibold">Field</th>
                    <th className={thCls}>On portal</th>
                    <th className={thCls}>Will be</th>
                  </tr>
                </thead>
                <tbody className="dark:text-gray-100">
                  {preview.changes.map((c) => (
                    <tr key={c.field} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-2 py-1 font-mono text-xs">{c.field}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{fmtNum(c.saved)}</td>
                      <td className="px-2 py-1 text-right font-semibold tabular-nums">{fmtNum(c.now)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <details className="mt-3 text-xs text-gray-600 dark:text-gray-300">
              <summary className="cursor-pointer">Full payload</summary>
              <pre className="mt-1 max-h-60 overflow-auto rounded bg-gray-50 p-2 dark:bg-gray-900">{JSON.stringify(preview.payload, null, 2)}</pre>
            </details>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPreview(null)} className="rounded border border-gray-300 px-4 py-2 text-sm dark:border-gray-600 dark:text-gray-200">Cancel</button>
              <Btn onClick={confirmSave} tone="bg-blue-700 hover:bg-blue-800">Confirm & Save</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Gstr3bUpload;
