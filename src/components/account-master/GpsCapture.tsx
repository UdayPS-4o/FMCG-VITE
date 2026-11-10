import React, { useState } from 'react';
import { LocateFixed, MapPin, MapPinned, RefreshCw, ExternalLink } from 'lucide-react';

export interface GpsValue {
  latitude: number;
  longitude: number;
  accuracy: number; // metres
  capturedAt: string; // ISO
}

interface Props {
  value: GpsValue | null;
  onChange: (value: GpsValue | null) => void;
}

const errorMessage = (err: GeolocationPositionError | Error): string => {
  if ('code' in err) {
    if (err.code === err.PERMISSION_DENIED) return 'Location is blocked. Allow location for this site in your browser settings.';
    if (err.code === err.POSITION_UNAVAILABLE) return "Couldn't get a GPS fix. Turn on location and try again outdoors.";
    if (err.code === err.TIMEOUT) return 'GPS took too long. Try again.';
  }
  return err.message || "Couldn't get your location.";
};

const GpsCapture: React.FC<Props> = ({ value, onChange }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const capture = () => {
    if (loading) return;
    if (!navigator.geolocation) {
      setError("This browser can't share location.");
      return;
    }
    setError(null);
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
          capturedAt: new Date(pos.timestamp || Date.now()).toISOString(),
        });
        setLoading(false);
      },
      (err) => {
        setError(errorMessage(err));
        setLoading(false);
      },
      // Fresh fix only: the point must be where the user is standing now (the shop)
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const tileBase =
    'relative flex flex-col items-center justify-center gap-2 text-center rounded-xl min-h-[190px] p-4 transition-colors duration-200';

  if (loading) {
    return (
      <div className={`${tileBase} border-2 border-dashed border-brand-300 dark:border-brand-700`} aria-live="polite">
        <div className="relative w-12 h-12 flex items-center justify-center">
          <span className="am-ping absolute inset-0 rounded-full border-2 border-brand-500" />
          <span className="am-ping absolute inset-0 rounded-full border-2 border-brand-500" style={{ animationDelay: '0.45s' }} />
          <MapPin className="w-6 h-6 text-brand-500" />
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">Finding your location…</p>
      </div>
    );
  }

  if (value) {
    const mapUrl = `https://www.google.com/maps?q=${value.latitude},${value.longitude}`;
    return (
      <div className={`${tileBase} border border-green-500/60 dark:border-green-400/50`}>
        <MapPinned className="am-pop w-7 h-7 text-green-500" aria-hidden="true" />
        <p className="text-xs text-gray-500 dark:text-gray-400">GPS coordinates</p>
        <p className="font-mono text-base font-medium text-gray-800 dark:text-white/90">
          {value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}
        </p>
        <span
          className={`am-pop inline-flex items-center text-xs px-2.5 py-1 rounded-md ${
            value.accuracy <= 30
              ? 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
          }`}
        >
          Accuracy ±{value.accuracy} m{value.accuracy > 30 ? ' · step outside for a better fix' : ''}
        </span>
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={capture}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Recapture
          </button>
          <a
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Map
          </a>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={capture}
      className={`${tileBase} w-full border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-brand-400 hover:bg-brand-50/60 dark:hover:bg-brand-500/10 cursor-pointer`}
    >
      <LocateFixed className="w-7 h-7 text-brand-500" aria-hidden="true" />
      <span className="text-sm font-medium text-gray-800 dark:text-white/90">GPS coordinates</span>
      <span className="text-xs text-gray-500 dark:text-gray-400">Tap while standing at the shop</span>
      <span className="mt-1 inline-flex items-center text-xs px-3 py-1.5 rounded-md bg-brand-500 text-white">Get location</span>
      {error && <span className="text-xs text-red-500 dark:text-red-400 mt-1 max-w-[260px]">{error}</span>}
    </button>
  );
};

export default GpsCapture;
