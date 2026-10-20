import React, { useCallback, useEffect, useState } from 'react';
import { errMsg, gstApi } from './gstApi';

interface Status {
  hasToken: boolean;
  savedDate?: string;
  tokenPreview?: string;
}

// GST portal login shared by the GSTR-1 / GSTR-2B / GSTR-3B sections.
// The auth token is saved on the server (GST_TOKEN.json, same file the VFP tools use) and reused until it expires.
const GstAuthPanel: React.FC = () => {
  const [status, setStatus] = useState<Status | null>(null);
  const [cfg, setCfg] = useState<{ gstin: string; username: string } | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await gstApi<Status>('/auth/status'));
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    }
  }, []);

  useEffect(() => {
    refresh();
    gstApi('/config').then(setCfg).catch((e) => setMsg({ ok: false, text: errMsg(e) }));
    const onChange = () => refresh();
    window.addEventListener('gst-auth-changed', onChange);
    return () => window.removeEventListener('gst-auth-changed', onChange);
  }, [refresh]);

  const requestOtp = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await gstApi('/auth/otp', {});
      setOtpSent(true);
      setMsg({ ok: true, text: 'OTP sent to the registered mobile / email.' });
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await gstApi('/auth/token', { otp });
      setOtpSent(false);
      setOtp('');
      setMsg({ ok: true, text: 'Authenticated with the GST portal.' });
      await refresh();
      window.dispatchEvent(new Event('gst-auth-changed'));
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await gstApi('/auth/token', undefined, 'DELETE').catch(() => undefined);
    await refresh();
  };

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm text-gray-700 dark:text-gray-200">
          <span className="font-semibold">GST Portal</span>
          {cfg && (
            <span className="ml-2 text-gray-500 dark:text-gray-400">
              GSTIN {cfg.gstin} · user {cfg.username}
            </span>
          )}
        </div>
        {status?.hasToken ? (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
            Token saved on {status.savedDate || '—'} ({status.tokenPreview})
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            Not authenticated
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!otpSent && (
            <button onClick={requestOtp} disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? 'Requesting…' : status?.hasToken ? 'Login fresh (new OTP)' : 'Request OTP'}
            </button>
          )}
          {otpSent && (
            <>
              <input
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                maxLength={8}
                placeholder="Enter OTP"
                className="w-28 rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
              <button onClick={verify} disabled={busy || otp.length < 4} className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50">
                {busy ? 'Verifying…' : 'Authenticate'}
              </button>
              <button onClick={() => setOtpSent(false)} className="text-sm text-gray-500 hover:underline">
                Cancel
              </button>
            </>
          )}
          {status?.hasToken && !otpSent && (
            <button onClick={logout} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
              Forget token
            </button>
          )}
        </div>
      </div>
      {msg && <div className={`mt-2 text-sm ${msg.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{msg.text}</div>}
    </div>
  );
};

export default GstAuthPanel;
