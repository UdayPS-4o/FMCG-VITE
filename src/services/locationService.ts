import constants from '../constants';

class LocationService {
  private watchId: number | null = null;
  private isTracking: boolean = false;
  private updateInterval: number = 30000; // Update every 30 seconds
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastKnownPosition: GeolocationPosition | null = null;

  constructor() {
    this.startTracking = this.startTracking.bind(this);
    this.stopTracking = this.stopTracking.bind(this);
    this.updateLocation = this.updateLocation.bind(this);
  }

  // Start continuous location tracking
  startTracking(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (this.isTracking) {
        resolve(true);
        return;
      }

      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      // Get initial position
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.lastKnownPosition = position;
          this.isTracking = true;
          
          // Send initial location
          this.sendLocationToServer(position);
          
          // Start watching position changes
          this.watchId = navigator.geolocation.watchPosition(
            (pos) => {
              this.lastKnownPosition = pos;
              this.sendLocationToServer(pos);
            },
            (error) => {
              console.error('Error watching position:', error);
            },
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 60000 // 1 minute
            }
          );

          // Also set up periodic updates in case watchPosition doesn't trigger
          this.intervalId = setInterval(() => {
            if (this.lastKnownPosition) {
              this.sendLocationToServer(this.lastKnownPosition);
            }
          }, this.updateInterval);

          resolve(true);
        },
        (error) => {
          console.error('Error getting initial position:', error);
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    });
  }

  // Stop location tracking
  stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isTracking = false;
    this.lastKnownPosition = null;
  }

  // Get current location once
  getCurrentLocation(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve(position);
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        }
      );
    });
  }

  // Send location to server
  private async sendLocationToServer(position: GeolocationPosition): Promise<void> {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('No auth token found, skipping location update');
        return;
      }

      const location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: new Date(position.timestamp).toISOString()
      };

      const response = await fetch(`${constants.baseURL}/api/attendance/location/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ location })
      });

      if (!response.ok) {
        console.error('Failed to update location on server:', response.statusText);
      }
    } catch (error) {
      console.error('Error sending location to server:', error);
    }
  }

  // Update location manually
  async updateLocation(): Promise<void> {
    try {
      const position = await this.getCurrentLocation();
      await this.sendLocationToServer(position);
    } catch (error) {
      console.error('Error updating location:', error);
      throw error;
    }
  }

  // Check if tracking is active
  isTrackingActive(): boolean {
    return this.isTracking;
  }

  // Set update interval (in milliseconds)
  setUpdateInterval(interval: number): void {
    this.updateInterval = interval;
    
    // Restart interval if tracking is active
    if (this.isTracking && this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = setInterval(() => {
        if (this.lastKnownPosition) {
          this.sendLocationToServer(this.lastKnownPosition);
        }
      }, this.updateInterval);
    }
  }

  // Get last known position
  getLastKnownPosition(): GeolocationPosition | null {
    return this.lastKnownPosition;
  }
}

// Create and export a singleton instance
const locationService = new LocationService();
export default locationService;

// Also export the class for testing purposes
export { LocationService };