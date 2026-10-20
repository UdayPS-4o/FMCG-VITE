import React, { useState } from 'react';
import { errMsg, fmtNum, gstApi, isValidPeriod, previousPeriod } from './gstApi';

type Fig = { txval: number; igst: number; cgst: number; sgst: number; cess: number };
type Table = Record<string, Fig>;
const zero = (): Fig => ({ txval: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });

const OSUP_ROWS: [string, string][] = [
  ['osup_det', '(a) Outward Taxable'],
  ['osup_zero', '(b) Outward Zero Rated'],
  ['osup_nil_exmp', '(c) Other Outward (Nil)'],
  ['isup_rev', '(d) Inward liable to RC'],
  ['osup_nongst', '(e) Non-GST Outward'],
];
const ITC_ROWS: [string, string][] = [
  ['itc_avl_oth', '(A5) All other ITC (Available)'],
  ['itc_rev_oth', '(B2) Others (Reversal)'],
  ['itc_inelg_oth', '(D1) Ineligible ITC'],
];
const AUTO_OSUP_ROWS: [string, string][] = [
  ['osup_3_1a', '(a) Outward Taxable (Auto)'],
  ['osup_3_1b', '(b) Outward Zero Rated (Auto)'],
  ['osup_3_1c', '(c) Other Outward (Nil) (Auto)'],
  ['isup_3_1d', '(d) Inward liable to RC (Auto)'],
  ['osup_3_1e', '(e) E-Commerce (Auto)'],
];
const AUTO_ITC_ROWS: [string, string][] = [
  ['itc_avl', '(4A) Total ITC Available (Auto)'],
  ['itc_rev', '(4B) Total ITC Reversed (Auto)'],
  ['itc_net', '(4C) Net ITC Available (Auto)'],
  ['itc_inelg', '(4D) Ineligible ITC (Auto)'],
];

const PDITC_COLS: [string, string][] = [
  ['liab_id', 'Liability ID'], ['i_pdi', 'IGST by IGST'], ['i_pdc', 'IGST by CGST'], ['i_pds', 'IGST by SGST'], ['c_pdi', 'CGST by IGST'],
  ['c_pdc', 'CGST by CGST'], ['s_pdi', 'SGST by IGST'], ['s_pds', 'SGST by SGST'], ['cs_pdcs', 'CESS by CESS'],
];
const PDCASH_COLS: [string, string][] = [
  ['liab_id', 'Liability ID'], ['ipd', 'IGST Cash'], ['cpd', 'CGST Cash'], ['spd', 'SGST Cash'], ['cspd', 'CESS Cash'], ['i_intr', 'IGST Int'],
  ['c_intr', 'CGST Int'], ['s_intr', 'SGST Int'], ['cs_intr', 'CESS Int'], ['c_fee', 'CGST Fee'], ['s_fee', 'SGST Fee'],
];
const blank = (cols: [string, string][]) => Object.fromEntries(cols.map(([k]) => [k, 0])) as Record<string, number>;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const FigTable: React.FC<{
  rows: [string, string][];
  data: Table;
  withTxval: boolean;
  onChange?: (id: string, field: keyof Fig, v: number) => void;
}> = ({ rows, data, withTxval, onChange }) => {
  const fields: (keyof Fig)[] = withTxval ? ['txval', 'igst', 'cgst', 'sgst', 'cess'] : ['igst', 'cgst', 'sgst', 'cess'];
  return (
    <table className="min-w-full text-sm">
      <thead className="bg-gray-100 dark:bg-gray-700">
        <tr>
          <th className="px-2 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">Details</th>
          {fields.map((f) => (
            <th key={f} className="px-2 py-2 text-right font-semibold uppercase text-gray-700 dark:text-gray-200">{f === 'txval' ? 'Taxable Value' : f}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([id, label]) => (
          <tr key={id} className="border-t border-gray-100 dark:border-gray-700">
            <td className="px-2 py-1 text-gray-800 dark:text-gray-100">{label}</td>
            {fields.map((f) => (
              <td key={f} className="px-1 py-1 text-right">
                {onChange ? (
                  <input
                    type="number"
                    step="0.01"
                    value={data[id]?.[f] ?? 0}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => onChange(id, f, parseFloat(e.target.value) || 0)}
                    className="w-36 rounded border border-gray-300 px-2 py-1 text-right text-sm tabular-nums dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                ) : (
                  <span className="tabular-nums text-gray-800 dark:text-gray-100">{fmtNum(data[id]?.[f] ?? 0)}</span>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const MatrixTable: React.FC<{ cols: [string, string][]; data: Record<string, number>; onChange: (k: string, v: number) => void }> = ({ cols, data, onChange }) => (
  <div className="overflow-x-auto">
    <table className="text-sm">
      <thead className="bg-gray-100 dark:bg-gray-700">
        <tr>
          {cols.map(([k, l]) => (
            <th key={k} className="px-2 py-2 text-right text-xs font-semibold text-gray-700 dark:text-gray-200">{l}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {cols.map(([k]) => (
            <td key={k} className="px-1 py-1">
              <input
                type="number"
                step={k === 'liab_id' ? '1' : '0.01'}
                value={data[k] ?? 0}
                onFocus={(e) => e.target.select()}
                onChange={(e) => onChange(k, parseFloat(e.target.value) || 0)}
                className="w-28 rounded border border-gray-300 px-2 py-1 text-right text-sm tabular-nums dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  </div>
);

// Rule 88A set-off order, as in PrefillOffsetMatrix of GSTR3B_PORTAL_UPLOAD.PRG
function prefillOffset(osup: Table, itc: Table) {
  let iL = 0, cL = 0, sL = 0, csL = 0;
  Object.values(osup).forEach((r) => { iL += r.igst; cL += r.cgst; sL += r.sgst; csL += r.cess; });
  const a = itc.itc_avl_oth || zero();
  let iI = a.igst, cI = a.cgst, sI = a.sgst, csI = a.cess;
  const take = (liab: number, credit: number) => (liab > 0 && credit > 0 ? Math.min(liab, credit) : 0);
  let x;
  const m = blank(PDITC_COLS);
  x = take(iL, iI); m.i_pdi = x; iL -= x; iI -= x; // IGST liability ← IGST ITC
  x = take(cL, iI); m.c_pdi = x; cL -= x; iI -= x; // CGST liability ← IGST ITC
  x = take(sL, iI); m.s_pdi = x; sL -= x; iI -= x; // SGST liability ← IGST ITC
  x = take(cL, cI); m.c_pdc = x; cL -= x; cI -= x; // CGST ← CGST
  x = take(sL, sI); m.s_pds = x; sL -= x; sI -= x; // SGST ← SGST
  x = take(iL, cI); m.i_pdc = x; iL -= x; cI -= x; // remaining IGST ← CGST
  x = take(iL, sI); m.i_pds = x; iL -= x; sI -= x; // remaining IGST ← SGST
  x = take(csL, csI); m.cs_pdcs = x; csL -= x; csI -= x;
  Object.keys(m).forEach((k) => (m[k] = r2(m[k])));
  return { pditc: m, cash: { ipd: r2(Math.max(0, iL)), cpd: r2(Math.max(0, cL)), spd: r2(Math.max(0, sL)), cspd: r2(Math.max(0, csL)) } };
}

const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: string }> = ({ tone = 'bg-gray-700 hover:bg-gray-800', className = '', ...p }) => (
  <button {...p} className={`rounded px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${tone} ${className}`} />
);

// Port of GSTR3B_PORTAL_UPLOAD.PRG: GSTR-3.csv → editable grids → AUTOLIAB / RETINT auto-fill → RETSAVE → RETOFFSET → RETFILE (EVC)
const Gstr3bUpload: React.FC = () => {
  const [fp, setFp] = useState(previousPeriod());
  const [osup, setOsup] = useState<Table>(() => Object.fromEntries(OSUP_ROWS.map(([k]) => [k, zero()])));
  const [itc, setItc] = useState<Table>(() => Object.fromEntries(ITC_ROWS.map(([k]) => [k, zero()])));
  const [autoOsup, setAutoOsup] = useState<Table>({});
  const [autoItc, setAutoItc] = useState<Table>({});
  const [retint, setRetint] = useState<any>(null);
  const [pditc, setPditc] = useState(blank(PDITC_COLS));
  const [pdcash, setPdcash] = useState(blank(PDCASH_COLS));
  const [tab, setTab] = useState<1 | 2 | 3>(1);
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('Ready…');
  const [error, setError] = useState('');
  const [response, setResponse] = useState<{ title: string; body: unknown } | null>(null);
  const [pan, setPan] = useState('');
  const [evcSent, setEvcSent] = useState(false);
  const [evcOtp, setEvcOtp] = useState('');

  const validFp = isValidPeriod(fp);

  const run = async (label: string, fn: () => Promise<void>) => {
    if (!validFp) {
      setError('Return period must be MMYYYY, e.g. 032026');
      return;
    }
    setBusy(label);
    setError('');
    setStatus(`${label}…`);
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
      setStatus(`${label} failed.`);
    } finally {
      setBusy('');
    }
  };

  const parseCsv = () =>
    run('Parsing GSTR-3.csv', async () => {
      const res = await gstApi<{ osup: Table; itc: Table }>('/gstr3b/parse-csv', {});
      setOsup(res.osup);
      setItc(res.itc);
      setTab(1);
      setStatus('Parsed CSV & updated grids. Edit values as needed.');
    });

  const autoFill = () =>
    run('Fetching Auto Details (AUTOLIAB & RETINT)', async () => {
      const res = await gstApi('/gstr3b/autofill', { fp, fresh });
      setAutoOsup(res.osup);
      setAutoItc(res.itc);
      setRetint(res.retint);
      setTab(2);
      setStatus(`Auto Fill details loaded${res.fromCache ? ' from saved copy (tick "fresh" to re-download)' : ''}.`);
    });

  const summary = () =>
    run('Fetching GSTR-3B Summary', async () => {
      const res = await gstApi('/gstr3b/summary', { fp, fresh });
      setResponse({ title: `Portal Summary${res.fromCache ? ' (saved copy)' : ''}`, body: res.data });
      setStatus('Summary loaded.');
    });

  const copyAuto = () => {
    const pick = (k: string) => autoOsup[k] || zero();
    setOsup({ osup_det: pick('osup_3_1a'), osup_zero: pick('osup_3_1b'), osup_nil_exmp: pick('osup_3_1c'), isup_rev: pick('isup_3_1d'), osup_nongst: osup.osup_nongst || zero() });
    setItc({ itc_avl_oth: autoItc.itc_avl || zero(), itc_rev_oth: autoItc.itc_rev || zero(), itc_inelg_oth: autoItc.itc_inelg || zero() });
    setTab(1);
    setStatus('Auto-fill values copied into Liabilities & ITC.');
  };

  const viewPayload = () =>
    run('Building payload', async () => {
      setResponse({ title: 'GSTR-3B RETSAVE payload', body: await gstApi('/gstr3b/payload', { fp, osup, itc }) });
      setStatus('Payload built (not sent).');
    });

  const save = () =>
    run('Saving GSTR-3B Data to Portal', async () => {
      const res = await gstApi('/gstr3b/save', { fp, osup, itc });
      setResponse({ title: 'Save Successful — Portal Response', body: res.data });
      setStatus('Saved successfully.');
    });

  const runPrefill = () => {
    const r = prefillOffset(osup, itc);
    setPditc({ ...r.pditc, liab_id: pditc.liab_id });
    setPdcash({ ...pdcash, ...r.cash });
    setTab(3);
    setStatus('Offset matrix calculated with Rule 88A — review Tab 3 before offsetting.');
  };

  const offset = () => {
    const empty = ['i_pdi', 'i_pdc', 'i_pds', 'c_pdc', 's_pds', 'cs_pdcs'].every((k) => !pditc[k]);
    if (empty) {
      if (window.confirm('Your Set-Off Matrix (Tab 3) is empty.\n\nCalculate the offset automatically using Rule 88A and pre-fill the grids for review?')) {
        runPrefill();
        return;
      }
      if (!window.confirm('Sending an empty payload may be rejected (RT-3BGC-9017). Send anyway?')) return;
    }
    if (!window.confirm(`Offset liability for ${fp} on the GST portal with the matrix in Tab 3?`)) return;
    run('Transmitting Offset Matrix (RETOFFSET)', async () => {
      const res = await gstApi('/gstr3b/offset', { fp, pditc, pdcash });
      setResponse({ title: 'Liability Offset — Portal Response', body: res.data });
      setStatus('Liability offset successfully.');
    });
  };

  const requestEvc = () =>
    run('Requesting EVC OTP', async () => {
      const res = await gstApi('/evc-otp', { pan, form: 'R3B' });
      setEvcSent(true);
      setResponse({ title: 'EVC OTP Response', body: res.data });
      setStatus('EVC OTP requested — check mobile / email.');
    });

  const fileReturn = () => {
    if (!window.confirm(`WARNING: This will FILE your GSTR-3B return for period ${fp} via EVC. This cannot be undone. Proceed?`)) return;
    run('Submitting EVC signature (RETFILE)', async () => {
      const res = await gstApi('/gstr3b/file', { fp, pan, otp: evcOtp });
      setResponse({ title: 'GSTR-3B RETURN FILED', body: res.data });
      setEvcSent(false);
      setEvcOtp('');
      setStatus('Return cycle complete.');
    });
  };

  const editFig = (setter: React.Dispatch<React.SetStateAction<Table>>) => (id: string, f: keyof Fig, v: number) =>
    setter((t) => ({ ...t, [id]: { ...(t[id] || zero()), [f]: v } }));

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
        <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-white">GSTR-3B CSV Uploader & Filing Utility</h2>
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
            Download fresh copy from portal (ignore saved AUTOLIAB / RETINT / RETSUM)
          </label>
        </div>
        <div className="mt-3 text-sm font-semibold text-blue-700 dark:text-blue-400">{busy ? `${busy}…` : status}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn onClick={parseCsv} disabled={!!busy} tone="bg-green-700 hover:bg-green-800">1. Parse GSTR-3.csv to Grids</Btn>
          <Btn onClick={autoFill} disabled={!!busy}>2. Auto Fill (GSTN)</Btn>
          <Btn onClick={summary} disabled={!!busy}>Get Summary</Btn>
          <Btn onClick={viewPayload} disabled={!!busy} tone="bg-slate-500 hover:bg-slate-600">View Payload</Btn>
        </div>
      </div>

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

      <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
        <div className="mb-3 flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-600">
          {([[1, 'Liabilities & ITC Details'], [2, 'GSTN Auto Fill'], [3, '3. Offset Matrix']] as [1 | 2 | 3, string][]).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400'}`}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === 1 && (
          <div className="space-y-4 overflow-x-auto">
            <div>
              <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">3.1 Outward supplies & inward supplies liable to reverse charge</div>
              <FigTable rows={OSUP_ROWS} data={osup} withTxval onChange={editFig(setOsup)} />
            </div>
            <div>
              <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">4. Eligible ITC</div>
              <FigTable rows={ITC_ROWS} data={itc} withTxval={false} onChange={editFig(setItc)} />
            </div>
          </div>
        )}

        {tab === 2 && (
          <div className="space-y-4 overflow-x-auto">
            {!Object.keys(autoOsup).length ? (
              <p className="text-sm text-gray-500">Click “2. Auto Fill (GSTN)” to load the system-computed GSTR-3B from the portal.</p>
            ) : (
              <>
                <FigTable rows={AUTO_OSUP_ROWS} data={autoOsup} withTxval />
                <FigTable rows={AUTO_ITC_ROWS} data={autoItc} withTxval={false} />
                <button onClick={copyAuto} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
                  Copy Auto Fill values into Liabilities & ITC
                </button>
                {retint && (
                  <details className="text-xs text-gray-600 dark:text-gray-300">
                    <summary className="cursor-pointer">Interest computation (RETINT)</summary>
                    <pre className="mt-2 max-h-60 overflow-auto rounded bg-gray-50 p-2 dark:bg-gray-900">{JSON.stringify(retint, null, 2)}</pre>
                  </details>
                )}
              </>
            )}
          </div>
        )}

        {tab === 3 && (
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Paid through ITC</div>
              <MatrixTable cols={PDITC_COLS} data={pditc} onChange={(k, v) => setPditc({ ...pditc, [k]: v })} />
            </div>
            <div>
              <div className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Paid in cash / interest / late fee</div>
              <MatrixTable cols={PDCASH_COLS} data={pdcash} onChange={(k, v) => setPdcash({ ...pdcash, [k]: v })} />
            </div>
            <button onClick={runPrefill} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
              Auto-calculate (Rule 88A)
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
        <div className="flex flex-wrap gap-2">
          <Btn onClick={save} disabled={!!busy} tone="bg-blue-700 hover:bg-blue-800">3. Save GSTR3B Details</Btn>
          <Btn onClick={offset} disabled={!!busy} tone="bg-red-700 hover:bg-red-800">4. Offset Liability</Btn>
        </div>
        <div className="mt-4 rounded border border-purple-200 p-3 dark:border-purple-800">
          <div className="mb-2 text-sm font-semibold text-purple-800 dark:text-purple-300">5. File Return (EVC)</div>
          <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">Use the authorised signatory's personal PAN — do not use the company PAN.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase().slice(0, 10))}
              placeholder="Signatory PAN"
              className="w-36 rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
            <Btn onClick={requestEvc} disabled={!!busy || pan.length !== 10} tone="bg-purple-600 hover:bg-purple-700">Request EVC OTP</Btn>
            {evcSent && (
              <>
                <input
                  value={evcOtp}
                  onChange={(e) => setEvcOtp(e.target.value.trim().toUpperCase())}
                  placeholder="EVC OTP"
                  className="w-28 rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
                <Btn onClick={fileReturn} disabled={!!busy || !evcOtp} tone="bg-purple-800 hover:bg-purple-900">File Return</Btn>
              </>
            )}
          </div>
        </div>
      </div>

      {response && (
        <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
          <h3 className="mb-2 font-semibold text-gray-800 dark:text-white">{response.title}</h3>
          <pre className="max-h-72 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">{JSON.stringify(response.body, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default Gstr3bUpload;
