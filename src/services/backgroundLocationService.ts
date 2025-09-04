import constants from '../constants';

class BackgroundLocationService {
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  private isBackgroundTrackingEnabled: boolean = false;
  private fallbackIntervalId: ReturnType<typeof setInterval> | null = null;
  private lastKnownPosition: GeolocationPosition | null = null;
  private updateInterval: number = 60000; // Update every 1 minute for background

  constructor() {
    this.initializeBackgroundTracking();
  }

  // Initialize background location tracking
  async initializeBackgroundTracking(): Promise<void> {
    try {
      // Check if service workers are supported
      if ('serviceWorker' in navigator) {
        await this.registerServiceWorker();
      }

      // Check if background sync is supported
      if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
        console.log('Background sync is supported');
        this.isBackgroundTrackingEnabled = true;
      } else {
        console.log('Background sync not supported, using fallback method');
        this.setupFallbackTracking();
      }

      // Note: Notification permissions are handled separately for admin users only
      // Regular location tracking does not require notifications

    } catch (error) {
      console.error('Error initializing background tracking:', error);
      this.setupFallbackTracking();
    }
  }

  // Register service worker for background tasks
  private async registerServiceWorker(): Promise<void> {
    try {
      // Force update of service worker to get latest version
      this.serviceWorkerRegistration = await navigator.serviceWorker.register('/sw-location.js', {
        updateViaCache: 'none'
      });
      console.log('Location service worker registered successfully');
      
      // Wait for service worker to be ready
      await navigator.serviceWorker.ready;
      console.log('Service worker is ready');
      
      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage.bind(this));
    } catch (error) {
      console.error('Service worker registration failed:', error);
      throw error;
    }
  }

  // Handle messages from service worker
  private handleServiceWorkerMessage(event: MessageEvent): void {
    if (event.data.type === 'LOCATION_UPDATE') {
      console.log('Received location update from service worker:', event.data.location);
      this.sendLocationToServer(event.data.location);
    }
  }

  // Setup fallback tracking using Page Visibility API and intervals
  private setupFallbackTracking(): void {
    // Track when page becomes visible/hidden
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.startActiveTracking();
      } else {
        this.startBackgroundTracking();
      }
    });

    // Start with active tracking
    this.startActiveTracking();
  }

  // Start active tracking (when app is in foreground)
  private startActiveTracking(): void {
    this.clearFallbackInterval();
    
    // More frequent updates when app is active (every 30 seconds)
    this.fallbackIntervalId = setInterval(() => {
      this.getCurrentLocationAndSend();
    }, 30000);

    // Get immediate location
    this.getCurrentLocationAndSend();
  }

  // Start background tracking (when app is in background)
  private startBackgroundTracking(): void {
    this.clearFallbackInterval();
    
    // Less frequent updates when app is in background (every 2 minutes)
    this.fallbackIntervalId = setInterval(() => {
      this.getCurrentLocationAndSend();
    }, 120000);
  }

  // Clear fallback interval
  private clearFallbackInterval(): void {
    if (this.fallbackIntervalId) {
      clearInterval(this.fallbackIntervalId);
      this.fallbackIntervalId = null;
    }
  }

  // Get current location and send to server
  private async getCurrentLocationAndSend(): Promise<void> {
    try {
      const position = await this.getCurrentLocation();
      if (position) {
        this.lastKnownPosition = position;
        await this.sendLocationToServer({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date(position.timestamp).toISOString()
        });
      }
    } catch (error) {
      console.error('Error getting location:', error);
      // If we can't get new location, send last known position if available
      if (this.lastKnownPosition) {
        await this.sendLocationToServer({
          latitude: this.lastKnownPosition.coords.latitude,
          longitude: this.lastKnownPosition.coords.longitude,
          accuracy: this.lastKnownPosition.coords.accuracy,
          timestamp: new Date().toISOString() // Update timestamp
        });
      }
    }
  }

  // Get current location
  private getCurrentLocation(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        {
          enableHighAccuracy: false, // Use less battery for background tracking
          timeout: 15000,
          maximumAge: 300000 // Accept 5-minute old location for background
        }
      );
    });
  }

  // Send location to server
  private async sendLocationToServer(location: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: string;
  }): Promise<void> {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('No auth token found, skipping location update');
        return;
      }

      const response = await fetch(`${constants.baseURL}/api/attendance/location/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          location,
          source: this.isBackgroundTrackingEnabled ? 'service-worker' : 'background-timer'
        })
      });

      if (!response.ok) {
        console.error('Failed to update location on server:', response.statusText);
      } else {
        console.log('Background location updated successfully');
      }
    } catch (error) {
      console.error('Error sending location to server:', error);
    }
  }

  // Start background location tracking
  async startTracking(): Promise<boolean> {
    try {
      // Request location permission
      const position = await this.getCurrentLocation();
      this.lastKnownPosition = position;

      // Send initial location
      await this.sendLocationToServer({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: new Date(position.timestamp).toISOString()
      });

      // Start appropriate tracking method
      if (this.isBackgroundTrackingEnabled && this.serviceWorkerRegistration) {
        // Use service worker for background tracking
        this.serviceWorkerRegistration.active?.postMessage({
          type: 'START_LOCATION_TRACKING',
          interval: this.updateInterval
        });
      } else {
        // Use fallback method
        this.setupFallbackTracking();
      }

      return true;
    } catch (error) {
      console.error('Error starting background location tracking:', error);
      return false;
    }
  }

  // Stop background location tracking
  stopTracking(): void {
    // Stop service worker tracking
    if (this.serviceWorkerRegistration) {
      this.serviceWorkerRegistration.active?.postMessage({
        type: 'STOP_LOCATION_TRACKING'
      });
    }

    // Clear fallback intervals
    this.clearFallbackInterval();

    console.log('Background location tracking stopped');
  }

  // Check if background tracking is supported
  isBackgroundTrackingSupported(): boolean {
    return this.isBackgroundTrackingEnabled;
  }

  // Set update interval
  setUpdateInterval(interval: number): void {
    this.updateInterval = interval;
    
    // Update service worker if active
    if (this.serviceWorkerRegistration) {
      this.serviceWorkerRegistration.active?.postMessage({
        type: 'UPDATE_INTERVAL',
        interval: interval
      });
    }
  }

  // Get last known position
  getLastKnownPosition(): GeolocationPosition | null {
    return this.lastKnownPosition;
  }
}

// Create and export singleton instance
const backgroundLocationService = new BackgroundLocationService();
export default backgroundLocationService;
export { BackgroundLocationService };