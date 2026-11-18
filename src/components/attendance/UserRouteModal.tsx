import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import constants from '../../constants';

interface RoutePoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: string;
  source?: string;
}

interface Stop {
  latitude: number;
  longitude: number;
  from: string;
  to: string;
  minutes: number;
}

interface Props {
  userId: number;
  userName: string;
  onClose: () => void;
}

const MAX_ACCURACY_M = 100; // ignore very rough fixes
const STOP_RADIUS_M = 150;
const STOP_MIN_MINUTES = 10;

const todayIST = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];

const distanceM = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

const fmtDuration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

// Group consecutive points that stay within STOP_RADIUS_M for STOP_MIN_MINUTES or more.
const findStops = (points: RoutePoint[]): Stop[] => {
  const stops: Stop[] = [];
  let i = 0;
  while (i < points.length) {
    const anchor = points[i];
    let j = i + 1;
    while (j < points.length && distanceM(anchor, points[j]) <= STOP_RADIUS_M) j++;
    const last = points[j - 1];
    const minutes = (new Date(last.timestamp).getTime() - new Date(anchor.timestamp).getTime()) / 60000;
    if (minutes >= STOP_MIN_MINUTES) {
      stops.push({ latitude: anchor.latitude, longitude: anchor.longitude, from: anchor.timestamp, to: last.timestamp, minutes });
      i = j;
    } else {
      i++;
    }
  }
  return stops;
};

const UserRouteModal: React.FC<Props> = ({ userId, userName, onClose }) => {
  const [date, setDate] = useState(todayIST());
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${constants.baseURL}/api/attendance/admin/route?userId=${userId}&date=${date}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setPoints(data.points || []);
      } catch (e) {
        if (!cancelled) {
          setPoints([]);
          setError('Could not load route');
          console.error('Route load failed:', e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [userId, date]);

  const clean = useMemo(
    () => points.filter(p => p.accuracy == null || p.accuracy <= MAX_ACCURACY_M),
    [points]
  );

  const stats = useMemo(() => {
    let meters = 0;
    for (let i = 1; i < clean.length; i++) meters += distanceM(clean[i - 1], clean[i]);
    return { km: meters / 1000, stops: findStops(clean) };
  }, [clean]);

  // Create the map once
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { zoomControl: true }).setView([22.07, 79.54], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Draw route
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!clean.length) return;

    const latlngs = clean.map(p => [p.latitude, p.longitude] as L.LatLngTuple);
    L.polyline(latlngs, { color: '#2563eb', weight: 4, opacity: 0.8 }).addTo(layer);

    stats.stops.forEach((s, idx) =>
      L.circleMarker([s.latitude, s.longitude], { radius: 8, color: '#f59e0b', fillColor: '#fbbf24', fillOpacity: 0.9, weight: 2 })
        .bindPopup(`<b>Stop ${idx + 1}</b><br>${fmtTime(s.from)} – ${fmtTime(s.to)} (${fmtDuration(s.minutes)})`)
        .addTo(layer)
    );

    const first = clean[0];
    const last = clean[clean.length - 1];
    L.circleMarker([first.latitude, first.longitude], { radius: 9, color: '#15803d', fillColor: '#22c55e', fillOpacity: 1, weight: 2 })
      .bindPopup(`<b>Start</b><br>${fmtTime(first.timestamp)}`)
      .addTo(layer);
    L.circleMarker([last.latitude, last.longitude], { radius: 9, color: '#b91c1c', fillColor: '#ef4444', fillOpacity: 1, weight: 2 })
      .bindPopup(`<b>Latest</b><br>${fmtTime(last.timestamp)}`)
      .addTo(layer);

    map.invalidateSize();
    if (latlngs.length === 1) map.setView(latlngs[0], 16);
    else map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30] });
  }, [clean, stats]);

  const focus = (lat: number, lng: number) => mapRef.current?.setView([lat, lng], 17);

  const first = clean[0];
  const last = clean[clean.length - 1];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100000] p-2 sm:p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">🛣️ Route – {userName}</h3>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              max={todayIST()}
              onChange={e => e.target.value && setDate(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-sm dark:bg-gray-700 dark:text-white"
            />
            <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:hover:text-white text-2xl leading-none px-2" aria-label="Close">
              ×
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 text-sm">
          <div className="bg-gray-50 dark:bg-gray-700 rounded p-2"><div className="text-xs text-gray-500 dark:text-gray-400">Distance</div><div className="font-semibold dark:text-white">{stats.km.toFixed(1)} km</div></div>
          <div className="bg-gray-50 dark:bg-gray-700 rounded p-2"><div className="text-xs text-gray-500 dark:text-gray-400">First seen</div><div className="font-semibold dark:text-white">{first ? fmtTime(first.timestamp) : '–'}</div></div>
          <div className="bg-gray-50 dark:bg-gray-700 rounded p-2"><div className="text-xs text-gray-500 dark:text-gray-400">Last seen</div><div className="font-semibold dark:text-white">{last ? fmtTime(last.timestamp) : '–'}</div></div>
          <div className="bg-gray-50 dark:bg-gray-700 rounded p-2"><div className="text-xs text-gray-500 dark:text-gray-400">Points / Stops</div><div className="font-semibold dark:text-white">{clean.length} / {stats.stops.length}</div></div>
        </div>

        <div className="relative mx-3 mb-3">
          <div ref={mapEl} className="rounded-lg overflow-hidden" style={{ height: '55vh', minHeight: 280 }} />
          {(loading || error || (!clean.length && !loading)) && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-800/70 rounded-lg z-[1000] text-sm text-gray-700 dark:text-gray-200">
              {loading ? 'Loading route…' : error ? error : 'No location points recorded for this day.'}
            </div>
          )}
        </div>

        {stats.stops.length > 0 && (
          <div className="px-3 pb-3 max-h-40 overflow-y-auto">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Stops (≥ {STOP_MIN_MINUTES} min)</div>
            <ul className="text-sm divide-y divide-gray-100 dark:divide-gray-700">
              {stats.stops.map((s, i) => (
                <li key={s.from} className="flex items-center justify-between py-1">
                  <button onClick={() => focus(s.latitude, s.longitude)} className="text-left text-blue-600 dark:text-blue-400 hover:underline">
                    Stop {i + 1}: {fmtTime(s.from)} – {fmtTime(s.to)} ({fmtDuration(s.minutes)})
                  </button>
                  <a
                    href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-green-600 dark:text-green-400 text-xs"
                  >
                    Google Maps ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserRouteModal;
