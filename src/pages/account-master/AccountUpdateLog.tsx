import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageBreadcrumb from '../../components/common/PageBreadCrumb';
import PageMeta from '../../components/common/PageMeta';
import constants from '../../constants';
import { useAuth } from '../../contexts/AuthContext';
import {
  Camera, MapPin, Search, RefreshCw, LoaderCircle, ExternalLink, X, Users, History, ArrowRight, ImageOff,
} from 'lucide-react';

interface Change {
  field: string;
  label: string;
  from: string;
  to: string;
}

interface LogEntry {
  id: string;
  at: string;
  code: string;
  partyName: string;
  place: string;
  userId: number | null;
  userName: string | null;
  changes: Change[];
  gps: { latitude: number; longitude: number; accuracy?: number | string } | null;
  gpsRemoved?: boolean;
  shopPhoto: string | null;
  photoRemoved?: boolean;
  seeded?: boolean;
}

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const initials = (name: string | null) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

// Photos are behind auth: fetch with the token and show a blob URL
const usePhotoUrl = (file: string | null) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!file) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    fetch(`${constants.baseURL}/api/shop-photos/${encodeURIComponent(file)}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);
  return { url, failed };
};

const PhotoThumb: React.FC<{ file: string; onOpen: (url: string) => void }> = ({ file, onOpen }) => {
  const { url, failed } = usePhotoUrl(file);
  if (failed) {
    return (
      <span className="w-20 h-14 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400" title="Photo not found">
        <ImageOff className="w-5 h-5" />
      </span>
    );
  }
  if (!url) return <span className="w-20 h-14 rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse" />;
  return (
    <button type="button" onClick={() => onOpen(url)} className="am-pop w-20 h-14 rounded-lg overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700 hover:ring-brand-400 transition">
      <img src={url} alt="Shop photo" className="w-full h-full object-cover" />
    </button>
  );
};

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

const AccountUpdateLog: React.FC = () => {
  const { user } = useAuth();
  // Staff only ever receive their own entries from the server; this just adapts the page
  const isAdmin = Boolean(user?.routeAccess?.includes('Admin'));
  const pageTitle = isAdmin ? 'Account Update Log' : 'My Update Activity';
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [range, setRange] = useState('7');
  const [preview, setPreview] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${constants.baseURL}/api/account-updates/log`, { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Could not load the update log');
      setEntries(data.entries || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the update log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const users = useMemo(
    () => Array.from(new Set(entries.map((e) => e.userName || 'Unknown'))).sort(),
    [entries]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = new Date();
    const from =
      range === 'all'
        ? 0
        : range === 'today'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        : now.getTime() - Number(range) * 24 * 60 * 60 * 1000;
    return entries.filter(
      (e) =>
        new Date(e.at).getTime() >= from &&
        (!userFilter || (e.userName || 'Unknown') === userFilter) &&
        (!q || `${e.partyName} ${e.code} ${e.place} ${e.userName}`.toLowerCase().includes(q))
    );
  }, [entries, query, userFilter, range]);

  const stats = useMemo(
    () => ({
      saves: filtered.length,
      parties: new Set(filtered.map((e) => e.code)).size,
      gps: new Set(filtered.filter((e) => e.gps).map((e) => e.code)).size,
      photos: new Set(filtered.filter((e) => e.shopPhoto).map((e) => e.code)).size,
      users: new Set(filtered.map((e) => e.userName)).size,
    }),
    [filtered]
  );

  const selectClass =
    'h-10 px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-3 focus:ring-brand-500/15 focus:border-brand-500';

  return (
    <div>
      <PageMeta title={`${pageTitle} | FMCG Vite Admin Template`} description="Who updated which account, and what changed" />
      <PageBreadcrumb pageTitle={pageTitle} />

      <div className="bg-white dark:bg-gray-800 p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        {/* Summary */}
        <div className={`grid grid-cols-2 ${isAdmin ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-3 mb-6`}>
          {[
            { label: 'Saves', value: stats.saves, icon: <History className="w-4 h-4" />, tone: 'text-brand-600 bg-brand-50 dark:bg-brand-500/15 dark:text-brand-400' },
            { label: 'Parties updated', value: stats.parties, icon: <ArrowRight className="w-4 h-4" />, tone: 'text-green-600 bg-green-50 dark:bg-green-500/15 dark:text-green-400' },
            { label: 'With GPS', value: stats.gps, icon: <MapPin className="w-4 h-4" />, tone: 'text-sky-600 bg-sky-50 dark:bg-sky-500/15 dark:text-sky-400' },
            { label: 'With photo', value: stats.photos, icon: <Camera className="w-4 h-4" />, tone: 'text-violet-600 bg-violet-50 dark:bg-violet-500/15 dark:text-violet-400' },
            ...(isAdmin
              ? [{ label: 'Staff', value: stats.users, icon: <Users className="w-4 h-4" />, tone: 'text-amber-600 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-400' }]
              : []),
          ].map((s, i) => (
            <div key={s.label} className="am-enter rounded-xl bg-gray-50 dark:bg-gray-900/40 p-4" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${s.tone}`}>{s.icon}</span>
                {s.label}
              </div>
              <div key={s.value} className="am-pop text-2xl font-medium text-gray-800 dark:text-white/90 mt-2">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="am-enter flex flex-wrap items-center gap-3 mb-5" style={{ animationDelay: '300ms' }}>
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isAdmin ? 'Search party, code, place or staff' : 'Search party, code or place'}
              className={`${selectClass} w-full pl-9`}
            />
          </div>
          {isAdmin && (
            <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className={selectClass} aria-label="Staff">
              <option value="">All staff</option>
              {users.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          )}
          <select value={range} onChange={(e) => setRange(e.target.value)} className={selectClass} aria-label="Date range">
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={load}
            className="h-10 inline-flex items-center gap-2 px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {error && <div className="am-pop text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg px-4 py-3 mb-5">{error}</div>}

        {loading && !entries.length ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
            <LoaderCircle className="w-5 h-5 animate-spin" /> Loading updates
          </div>
        ) : !filtered.length ? (
          <div className="am-enter flex flex-col items-center text-center gap-2 py-14 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <History className="w-8 h-8 text-brand-500" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {isAdmin || entries.length ? 'No updates in this view' : "You haven't updated any accounts yet"}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Try another date range or clear the search.</p>
          </div>
        ) : (
          <ol className="relative border-l border-gray-200 dark:border-gray-700 ml-4">
            {filtered.map((e, i) => (
              <li
                key={e.id}
                className="am-enter relative pl-8 pb-6 last:pb-0"
                style={{ animationDelay: `${Math.min(i, 12) * 50}ms` }}
              >
                <span
                  className="absolute -left-4 top-0 w-8 h-8 rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400 ring-4 ring-white dark:ring-gray-800 flex items-center justify-center text-xs font-medium"
                  title={e.userName || 'Unknown'}
                >
                  {initials(e.userName)}
                </span>
                <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-4 hover:border-brand-200 dark:hover:border-brand-700 transition-colors">
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 dark:text-white/90">
                        <span className="font-medium">{isAdmin ? e.userName || 'Unknown' : 'You'}</span>
                        <span className="text-gray-500 dark:text-gray-400"> updated </span>
                        <span className="font-medium">{e.partyName}</span>
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {e.code}
                        {e.place ? ` · ${e.place}` : ''} · {fmtTime(e.at)}
                        {e.seeded ? ' · saved before history was kept' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {e.gps && (
                        <a
                          href={`https://www.google.com/maps?q=${e.gps.latitude},${e.gps.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300 hover:bg-sky-100"
                          title="Open in Google Maps"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          {Number(e.gps.latitude).toFixed(5)}, {Number(e.gps.longitude).toFixed(5)}
                          {e.gps.accuracy ? ` · ±${e.gps.accuracy} m` : ''}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {e.shopPhoto && <PhotoThumb file={e.shopPhoto} onOpen={setPreview} />}
                    </div>
                  </div>

                  {(e.changes.length > 0 || e.gpsRemoved || e.photoRemoved) && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {e.changes.map((c) => (
                        <span
                          key={c.field}
                          className="inline-flex flex-wrap items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-300"
                        >
                          <span className="text-gray-400 dark:text-gray-500">{c.label}:</span>
                          {c.from ? <span className="line-through text-red-500/80">{c.from}</span> : <span className="italic text-gray-400">empty</span>}
                          <ArrowRight className="w-3 h-3 text-gray-400" />
                          {c.to ? <span className="text-green-700 dark:text-green-400">{c.to}</span> : <span className="italic text-gray-400">empty</span>}
                        </span>
                      ))}
                      {e.gpsRemoved && <span className="text-xs px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">GPS removed</span>}
                      {e.photoRemoved && <span className="text-xs px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Photo removed</span>}
                    </div>
                  )}
                  {e.changes.length === 0 && !e.gps && !e.shopPhoto && !e.gpsRemoved && !e.photoRemoved && (
                    <p className="text-xs text-gray-400 mt-2">Saved without changes</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-6">
          Updates are saved in the web app only. Staff make them from{' '}
          <Link to="/account-master/update" className="text-brand-500 hover:underline">Update Account Master</Link>.
        </p>
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-[99999] bg-black/80 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-label="Shop photo"
        >
          <img src={preview} alt="Shop photo" className="am-pop max-w-full max-h-[85vh] rounded-xl" onClick={(ev) => ev.stopPropagation()} />
          <button type="button" onClick={() => setPreview(null)} aria-label="Close" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default AccountUpdateLog;
