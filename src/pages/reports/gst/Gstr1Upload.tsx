import React, { useState } from 'react';
import { downloadText, errMsg, fmtNum, gstApi, isValidPeriod, previousPeriod } from './gstApi';

type Modules = { b2b: boolean; b2cs: boolean; cdnr: boolean; hsn: boolean; doc: boolean };
interface SecSum {
  sec_nm: string;
  ttl_rec?: number; ttl_val?: number; ttl_tax?: number; ttl_igst?: number; ttl_cgst?: number; ttl_sgst?: number; ttl_cess?: number;
  ttl_doc_issued?: number; ttl_doc_cancelled?: number; net_doc_issued?: number;
}

const SUMMARY_TABS: { key: string; label: string; test: (s: string) => boolean }[] = [
  { key: 'all', label: 'All Sections', test: () => true },
  { key: 'b2b', label: 'B2B', test: (s) => s === 'B2B' || s === 'B2BA' },
  { key: 'b2cs', label: 'B2CS', test: (s) => s === 'B2CS' || s === 'B2CSA' },
  { key: 'cdnr', label: 'CDNR', test: (s) => s === 'CDNR' || s === 'CDNRA' },
  { key: 'hsn', label: 'HSN / DOC', test: (s) => s.startsWith('HSN') || s.includes('DOC') },
];

const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: string }> = ({ tone = 'bg-gray-700 hover:bg-gray-800', className = '', ...p }) => (
  <button {...p} className={`rounded px-3 py-2 text-sm font-medium text-white disabled:opacity-50 ${tone} ${className}`} />
);

// Port of GSTR1_PORTAL_UPLOAD.PRG: builds the GSTR-1 JSON from the system CSV exports and runs the portal actions
// RETSAVE → RETSUM / RETSTATUS → RETNEWPTF (proceed to file) → RETSUBMIT → RETFILE (EVC), plus RESET.
const Gstr1Upload: React.FC = () => {
  const [fp, setFp] = useState(previousPeriod());
  const [modules, setModules] = useState<Modules>({ b2b: true, b2cs: true, cdnr: true, hsn: true, doc: true });
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('Ready…');
  const [error, setError] = useState('');
  const [response, setResponse] = useState<{ title: string; body: unknown } | null>(null);
  const [preview, setPreview] = useState<{ payload: any; counts: Record<string, number>; gross: number; missing: string[] } | null>(null);
  const [refId, setRefId] = useState('');
  const [summary, setSummary] = useState<SecSum[] | null>(null);
  const [sumTab, setSumTab] = useState('all');
  const [pan, setPan] = useState('');
  const [evcSent, setEvcSent] = useState(false);
  const [evcOtp, setEvcOtp] = useState('');

  const validFp = isValidPeriod(fp);

  const run = async (label: string, fn: () => Promise<void>) => {
    if (!validFp) {
      setError('Return period must be MMYYYY, e.g. 082026');
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

  const buildPreview = () =>
    run('Generating JSON', async () => {
      const res = await gstApi('/gstr1/build', { fp, modules });
      setPreview(res);
      setStatus('JSON generated (not uploaded yet).');
    });

  const save = () =>
    run('Uploading GSTR-1 JSON (RETSAVE)', async () => {
      const res = await gstApi('/gstr1/save', { fp, modules });
      if (res.refId) setRefId(res.refId);
      setResponse({ title: 'Portal Response (RETSAVE)', body: res.data ?? res });
      setStatus(res.refId ? `Saved. Reference ID ${res.refId} — use Get Status to check processing.` : 'Save request sent.');
    });

  const getSummary = () =>
    run('Fetching GSTR-1 Summary (RETSUM)', async () => {
      const res = await gstApi('/gstr1/summary', { fp });
      setSummary(res.secSum || []);
      setSumTab('all');
      setStatus('Summary downloaded.');
    });

  const getStatus = () => {
    const id = refId || window.prompt('Enter Reference ID:') || '';
    if (!id) return;
    setRefId(id);
    run('Fetching Return Status', async () => {
      const res = await gstApi('/gstr1/status', { fp, refId: id });
      setResponse({ title: `Status for Ref ${id}`, body: res.data });
      setStatus('Status fetch completed.');
    });
  };

  const proceed = () =>
    run('Sending Proceed to File (RETNEWPTF)', async () => {
      const res = await gstApi('/gstr1/proceed', { fp });
      setResponse({ title: 'Proceed to File (RETNEWPTF) Response', body: res.data });
      setStatus('Proceed to File completed.');
    });

  const reset = () => {
    if (!window.confirm(`WARNING: This will reset your GSTR-1 return for the period ${fp} on the GST Portal.\nAll records will be deleted to 0 values.\n\nAre you sure you want to proceed?`)) return;
    run('Resetting GSTR-1 Return (RESET)', async () => {
      const res = await gstApi('/gstr1/reset', { fp });
      setResponse({ title: 'Portal Response (RESET)', body: res.data });
      setStatus('Reset complete.');
    });
  };

  const requestEvc = () =>
    run('Requesting EVC OTP', async () => {
      const res = await gstApi('/evc-otp', { pan, form: 'R1' });
      setEvcSent(true);
      setResponse({ title: 'EVC OTP Response', body: res.data });
      setStatus('EVC OTP requested — check mobile / email.');
    });

  const fileReturn = () => {
    if (!window.confirm(`WARNING: This will FILE your GSTR-1 return for period ${fp} via EVC. Proceed?`)) return;
    run('Filing GSTR-1 Return (RETFILE)', async () => {
      const res = await gstApi('/gstr1/file', { fp, pan, otp: evcOtp });
      setResponse({ title: 'File Return (RETFILE) Response', body: res.data });
      setEvcSent(false);
      setEvcOtp('');
      setStatus('File Return completed.');
    });
  };

  const sumRows = (summary || []).filter((s) => SUMMARY_TABS.find((t) => t.key === sumTab)!.test(String(s.sec_nm).toUpperCase()));

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
        <h2 className="mb-3 text-lg font-semibold text-gray-800 dark:text-white">GSTR-1 JSON Generator & Portal Uploader</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Ret. Period (MMYYYY)</label>
            <input
              value={fp}
              onChange={(e) => setFp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className={`w-32 rounded border px-2 py-1.5 text-sm dark:bg-gray-700 dark:text-gray-100 ${validFp ? 'border-gray-300 dark:border-gray-600' : 'border-red-500'}`}
            />
          </div>
          <div>
            <div className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Include Modules</div>
            <div className="flex gap-3">
              {(Object.keys(modules) as (keyof Modules)[]).map((m) => (
                <label key={m} className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={modules[m]} onChange={(e) => setModules({ ...modules, [m]: e.target.checked })} />
                  {m.toUpperCase()}
                </label>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Filing order: Generate JSON & Save → Get Status (wait till processed) → Proceed to File → File Return (EVC). GSTN no longer has a
          separate “Submit” step for GSTR-1 — Proceed to File replaces it.
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Reads B2B.CSV, B2CS.CSV, CDNR.CSV, DOC.CSV, hsn(b2b).csv and hsn(b2c).csv from the server's GST CSV folder.
        </p>

        <div className="mt-3 text-sm font-semibold text-blue-700 dark:text-blue-400">{busy ? `${busy}…` : status}</div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Btn onClick={buildPreview} disabled={!!busy} tone="bg-slate-600 hover:bg-slate-700">Preview JSON</Btn>
          <Btn onClick={save} disabled={!!busy} tone="bg-blue-700 hover:bg-blue-800">Generate JSON & Save</Btn>
          <Btn onClick={getSummary} disabled={!!busy}>Get Summary</Btn>
          <Btn onClick={getStatus} disabled={!!busy}>Get Status{refId ? ` (${refId})` : ''}</Btn>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Btn onClick={proceed} disabled={!!busy} tone="bg-green-700 hover:bg-green-800">Proceed to File</Btn>
          <Btn onClick={reset} disabled={!!busy} tone="bg-red-600 hover:bg-red-700">Reset GSTR1</Btn>
        </div>

        <div className="mt-4 rounded border border-purple-200 p-3 dark:border-purple-800">
          <div className="mb-2 text-sm font-semibold text-purple-800 dark:text-purple-300">File Return (EVC)</div>
          <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">
            Use the PAN of the <b>individual authorised signatory</b> — not the PAN contained in the company GSTIN.
          </p>
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
                  onChange={(e) => setEvcOtp(e.target.value.trim())}
                  placeholder="EVC OTP"
                  className="w-28 rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
                <Btn onClick={fileReturn} disabled={!!busy || !evcOtp} tone="bg-purple-800 hover:bg-purple-900">File Return</Btn>
              </>
            )}
          </div>
        </div>
      </div>

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

      {preview && (
        <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h3 className="font-semibold text-gray-800 dark:text-white">Generated JSON</h3>
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {Object.entries(preview.counts).map(([k, v]) => `${k.toUpperCase()}: ${v}`).join(' · ')} · Gross total ₹{fmtNum(preview.gross)}
            </span>
            <button
              onClick={() => downloadText(`GSTR1_${fp}.json`, JSON.stringify(preview.payload, null, 2), 'application/json')}
              className="ml-auto rounded bg-green-700 px-3 py-1 text-xs font-semibold text-white hover:bg-green-800"
            >
              Download JSON
            </button>
          </div>
          {preview.missing.length > 0 && <div className="mb-2 text-xs text-amber-700 dark:text-amber-400">Not found: {preview.missing.join(', ')}</div>}
          <pre className="max-h-80 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">{JSON.stringify(preview.payload, null, 2).slice(0, 20000)}</pre>
        </div>
      )}

      {response && (
        <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
          <h3 className="mb-2 font-semibold text-gray-800 dark:text-white">{response.title}</h3>
          <pre className="max-h-72 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">{JSON.stringify(response.body, null, 2)}</pre>
        </div>
      )}

      {summary && (
        <div className="rounded-lg bg-white p-4 shadow dark:bg-gray-800">
          <h3 className="mb-2 font-semibold text-gray-800 dark:text-white">GSTR-1 Summary: {fp}</h3>
          <div className="mb-3 flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-600">
            {SUMMARY_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setSumTab(t.key)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${sumTab === t.key ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-100 dark:bg-gray-700">
                <tr>
                  {['Section', 'Records', 'Total Value', 'Taxable', 'IGST', 'CGST', 'SGST', 'Cess', 'Docs Issued', 'Cancelled', 'Net Issued'].map((h) => (
                    <th key={h} className="px-2 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="dark:text-gray-100">
                {sumRows.map((s, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                    <td className="px-2 py-1 font-medium">{s.sec_nm}</td>
                    <td className="px-2 py-1 text-right">{s.ttl_rec ?? ''}</td>
                    {[s.ttl_val, s.ttl_tax, s.ttl_igst, s.ttl_cgst, s.ttl_sgst, s.ttl_cess].map((v, j) => (
                      <td key={j} className="px-2 py-1 text-right tabular-nums">{v === undefined ? '' : fmtNum(v)}</td>
                    ))}
                    <td className="px-2 py-1 text-right">{s.ttl_doc_issued ?? ''}</td>
                    <td className="px-2 py-1 text-right">{s.ttl_doc_cancelled ?? ''}</td>
                    <td className="px-2 py-1 text-right">{s.net_doc_issued ?? ''}</td>
                  </tr>
                ))}
                {!sumRows.length && (
                  <tr>
                    <td colSpan={11} className="px-2 py-4 text-center text-gray-500">No sections</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Gstr1Upload;
