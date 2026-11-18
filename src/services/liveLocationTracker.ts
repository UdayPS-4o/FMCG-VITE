import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import constants from '../constants';

/**
 * App-wide live location tracker.
 *
 * - Android app (with the native plugin): runs a foreground service with a
 *   persistent notification, so updates keep flowing when the app is minimised
 *   or the screen is off. Posts through CapacitorHttp because Android throttles
 *   WebView fetch() after ~5 minutes in the background.
 * - Browser / older APKs without the plugin: falls back to
 *   navigator.geolocation.watchPosition, which only works while the app is open.
 *
 * Independent of locationService (used by the Attendance page), so leaving that
 * page no longer stops live tracking.
 */

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

const MIN_SEND_GAP_MS = 30_000; // don't post more often than this
const HEARTBEAT_MS = 2 * 60_000; // re-post last fix so a stationary user stays "Online"

type Fix = { latitude: number; longitude: number; accuracy: number; timestamp: string };
type Source = 'background' | 'foreground';

class LiveLocationTracker {
  private running = false;
  private nativeWatcherId: string | null = null;
  private webWatchId: number | null = null;
  private heartbeatId: ReturnType<typeof setInterval> | null = null;
  private lastFix: Fix | null = null;
  private lastSentAt = 0;
  private source: Source = 'foreground';

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const startedNative = Capacitor.isNativePlatform() && (await this.startNative());
    if (!this.running) {
      // stop() was called while we were starting
      await this.teardown();
      return;
    }
    if (!startedNative) this.startWeb();

    this.heartbeatId = setInterval(() => {
      if (this.lastFix) void this.send(this.lastFix, true);
    }, HEARTBEAT_MS);
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.teardown();
  }

  private async teardown(): Promise<void> {
    if (this.heartbeatId !== null) {
      clearInterval(this.heartbeatId);
      this.heartbeatId = null;
    }
    if (this.webWatchId !== null) {
      navigator.geolocation.clearWatch(this.webWatchId);
      this.webWatchId = null;
    }
    if (this.nativeWatcherId !== null) {
      const id = this.nativeWatcherId;
      this.nativeWatcherId = null;
      try {
        await BackgroundGeolocation.removeWatcher({ id });
      } catch (e) {
        console.warn('Failed to remove background location watcher:', e);
      }
    }
    this.lastFix = null;
    this.lastSentAt = 0;
  }

  private async startNative(): Promise<boolean> {
    try {
      this.nativeWatcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: 'Ekta Enterprises',
          backgroundMessage: 'Sharing your live location with the office while on duty.',
          requestPermissions: true,
          stale: false,
          distanceFilter: 10,
        },
        (location, error) => {
          if (error) {
            if (error.code === 'NOT_AUTHORIZED') {
              if (window.confirm('Location permission is off. Live location cannot be shared with the office.\n\nOpen settings now?')) {
                void BackgroundGeolocation.openSettings();
              }
            }
            console.error('Background location error:', error);
            return;
          }
          if (!location) return;
          this.onFix({
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            timestamp: new Date(location.time ?? Date.now()).toISOString(),
          });
        }
      );
      this.source = 'background';
      return true;
    } catch (e) {
      // Older APK built without the plugin → "not implemented"
      console.warn('Native background location unavailable, using browser GPS:', e);
      return false;
    }
  }

  private startWeb(): void {
    if (!navigator.geolocation) return;
    this.source = 'foreground';
    this.webWatchId = navigator.geolocation.watchPosition(
      (pos) =>
        this.onFix({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: new Date(pos.timestamp).toISOString(),
        }),
      (err) => console.error('Live location watch error:', err),
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 60_000 }
    );
  }

  private onFix(fix: Fix): void {
    this.lastFix = fix;
    void this.send(fix, false);
  }

  private async send(fix: Fix, force: boolean): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastSentAt < MIN_SEND_GAP_MS) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    this.lastSentAt = now;

    const url = `${constants.baseURL}/api/attendance/location/update`;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const body = { location: fix, source: this.source };

    try {
      if (Capacitor.isNativePlatform()) {
        const res = await CapacitorHttp.post({ url, headers, data: body });
        if (res.status >= 400) console.error('Live location update failed:', res.status);
      } else {
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!res.ok) console.error('Live location update failed:', res.status);
      }
    } catch (e) {
      console.error('Error sending live location:', e);
    }
  }
}

const liveLocationTracker = new LiveLocationTracker();
export default liveLocationTracker;
