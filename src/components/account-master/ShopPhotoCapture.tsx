import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, SwitchCamera, X, LoaderCircle } from 'lucide-react';
import type { GpsValue } from './GpsCapture';

interface Props {
  /** JPEG data URL of the captured photo (or an existing image URL), null when empty */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Stamped onto the photo as proof of where it was taken */
  gps?: GpsValue | null;
}

const MAX_SIDE = 1280; // keeps a photo around 150–250 KB
const JPEG_QUALITY = 0.8;

// Camera only: there is deliberately no <input type="file">, so the gallery can't be used.
const ShopPhotoCapture: React.FC<Props> = ({ value, onChange, gps }) => {
  const [mode, setMode] = useState<'idle' | 'opening' | 'live'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => stopStream, []);

  const openCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't open the camera. Use Chrome on your phone.");
      return;
    }
    setMode('opening');
    try {
      let stream: MediaStream;
      try {
        // Back camera on phones
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch (e) {
        // Laptops/desktops have no back camera: fall back to whatever camera exists
        if (e instanceof DOMException && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError')) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        } else {
          throw e;
        }
      }
      streamRef.current = stream;
      setMode('live');
      // The <video> is rendered once mode is 'live'
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (e) {
      stopStream();
      setMode('idle');
      const name = e instanceof DOMException ? e.name : '';
      setError(
        name === 'NotAllowedError'
          ? 'Camera is blocked. Allow camera for this site in your browser settings.'
          : name === 'NotFoundError'
          ? 'No camera found on this device.'
          : "Couldn't open the camera. Try again."
      );
    }
  };

  const cancel = () => {
    stopStream();
    setMode('idle');
  };

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    // Stamp date/time and GPS along the bottom edge
    const fontSize = Math.max(14, Math.round(w / 45));
    const band = Math.round(fontSize * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, h - band, w, band);
    ctx.fillStyle = '#fff';
    ctx.font = `${fontSize}px monospace`;
    ctx.textBaseline = 'middle';
    const now = new Date();
    ctx.textAlign = 'left';
    ctx.fillText(
      `${now.toLocaleDateString('en-IN')} ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`,
      fontSize,
      h - band / 2
    );
    ctx.textAlign = 'right';
    ctx.fillText(
      gps ? `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}` : 'GPS not captured',
      w - fontSize,
      h - band / 2
    );

    setFlash(true);
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    setTimeout(() => {
      stopStream();
      setMode('idle');
      setFlash(false);
      onChange(dataUrl);
    }, 350);
  };

  const tileBase = 'relative rounded-xl min-h-[190px] overflow-hidden';

  if (mode === 'live' || mode === 'opening') {
    return (
      <div className={`${tileBase} bg-black`}>
        <video ref={videoRef} playsInline muted autoPlay className="w-full h-[260px] object-cover" />
        {mode === 'opening' && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80">
            <LoaderCircle className="w-7 h-7 animate-spin" />
          </div>
        )}
        {/* Frame guides */}
        <span className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-white/90" />
        <span className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-white/90" />
        <span className="absolute bottom-20 left-3 w-5 h-5 border-b-2 border-l-2 border-white/90" />
        <span className="absolute bottom-20 right-3 w-5 h-5 border-b-2 border-r-2 border-white/90" />
        <span className="absolute top-3 left-1/2 -translate-x-1/2 text-[11px] text-white bg-black/50 px-2 py-0.5 rounded-full">
          Fit the shop front in the frame
        </span>
        <button
          type="button"
          onClick={cancel}
          aria-label="Close camera"
          className="absolute bottom-5 left-5 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={takePhoto}
          disabled={mode !== 'live'}
          aria-label="Take photo"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-white border-4 border-white/40 bg-clip-padding active:scale-90 transition-transform disabled:opacity-50"
        />
        {flash && <div className="am-shutter absolute inset-0 bg-white pointer-events-none" />}
      </div>
    );
  }

  if (value) {
    return (
      <div className={`${tileBase} border border-green-500/60 dark:border-green-400/50 p-2 flex flex-col gap-2`}>
        <div className="am-pop relative rounded-lg overflow-hidden bg-gray-900">
          <img src={value} alt="Shop front" className="w-full h-[200px] object-contain" />
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-green-50 text-green-700 dark:bg-green-900/80 dark:text-green-300">
            <Camera className="w-3.5 h-3.5" /> Shop photo
          </span>
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={openCamera}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <SwitchCamera className="w-3.5 h-3.5" /> Retake
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={openCamera}
      className={`${tileBase} w-full flex flex-col items-center justify-center gap-2 text-center p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-brand-400 hover:bg-brand-50/60 dark:hover:bg-brand-500/10 cursor-pointer transition-colors duration-200`}
    >
      {error ? <CameraOff className="w-7 h-7 text-red-500" aria-hidden="true" /> : <Camera className="w-7 h-7 text-brand-500" aria-hidden="true" />}
      <span className="text-sm font-medium text-gray-800 dark:text-white/90">Shop photo</span>
      <span className="text-xs text-gray-500 dark:text-gray-400">Opens the back camera. Gallery is turned off.</span>
      <span className="mt-1 inline-flex items-center text-xs px-3 py-1.5 rounded-md bg-brand-500 text-white">Open camera</span>
      {error && <span className="text-xs text-red-500 dark:text-red-400 mt-1 max-w-[260px]">{error}</span>}
    </button>
  );
};

export default ShopPhotoCapture;
