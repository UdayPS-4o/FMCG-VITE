// Service Worker for Background Location Tracking

const CACHE_NAME = 'location-tracker-v1';
const API_BASE_URL = 'http://localhost:3000'; // This should match your backend URL

let locationTrackingInterval = null;
let updateInterval = 60000; // Default 1 minute
let isTracking = false;

// Install event
self.addEventListener('install', (event) => {
  console.log('Location tracking service worker installed');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('Location tracking service worker activated');
  event.waitUntil(self.clients.claim());
});

// Listen for messages from main thread
self.addEventListener('message', (event) => {
  const { type, interval } = event.data;
  
  switch (type) {
    case 'START_LOCATION_TRACKING':
      if (interval) updateInterval = interval;
      startLocationTracking();
      break;
      
    case 'STOP_LOCATION_TRACKING':
      stopLocationTracking();
      break;
      
    case 'UPDATE_INTERVAL':
      if (interval) {
        updateInterval = interval;
        if (isTracking) {
          stopLocationTracking();
          startLocationTracking();
        }
      }
      break;
  }
});

// Background sync event
self.addEventListener('sync', (event) => {
  if (event.tag === 'location-sync') {
    event.waitUntil(syncLocationData());
  }
});

// Start location tracking
function startLocationTracking() {
  if (isTracking) return;
  
  isTracking = true;
  console.log('Starting background location tracking with interval:', updateInterval);
  
  // Get initial location
  getCurrentLocationAndSend();
  
  // Set up periodic location updates
  locationTrackingInterval = setInterval(() => {
    getCurrentLocationAndSend();
  }, updateInterval);
}

// Stop location tracking
function stopLocationTracking() {
  if (!isTracking) return;
  
  isTracking = false;
  console.log('Stopping background location tracking');
  
  if (locationTrackingInterval) {
    clearInterval(locationTrackingInterval);
    locationTrackingInterval = null;
  }
}

// Get current location and send to main thread
async function getCurrentLocationAndSend() {
  try {
    const position = await getCurrentLocation();
    
    const locationData = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: new Date(position.timestamp).toISOString()
    };
    
    // Send to main thread
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'LOCATION_UPDATE',
        location: locationData
      });
    });
    
    // Also try to send directly to server
    await sendLocationToServer(locationData);
    
  } catch (error) {
    console.error('Error getting location in service worker:', error);
    
    // Try to get cached location data and send it
    const cachedLocation = await getCachedLocation();
    if (cachedLocation) {
      // Update timestamp and send cached location
      cachedLocation.timestamp = new Date().toISOString();
      await sendLocationToServer(cachedLocation);
    }
  }
}

// Get current location using Geolocation API
function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported'));
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      {
        enableHighAccuracy: false, // Use less battery for background
        timeout: 20000,
        maximumAge: 600000 // Accept 10-minute old location for background
      }
    );
  });
}

// Send location to server
async function sendLocationToServer(locationData) {
  try {
    // Get auth token from IndexedDB or cache
    const token = await getAuthToken();
    
    if (!token) {
      console.warn('No auth token found in service worker');
      // Cache the location data for later sync
      await cacheLocationData(locationData);
      return;
    }
    
    const response = await fetch(`${API_BASE_URL}/api/attendance/location/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        location: locationData,
        source: 'service-worker'
      })
    });
    
    if (response.ok) {
      console.log('Background location sent successfully');
      // Cache successful location for fallback
      await cacheLocationData(locationData);
    } else {
      console.error('Failed to send location:', response.statusText);
      // Cache for retry
      await cacheLocationData(locationData);
    }
    
  } catch (error) {
    console.error('Error sending location in service worker:', error);
    // Cache for retry
    await cacheLocationData(locationData);
  }
}

// Get auth token (try multiple sources)
async function getAuthToken() {
  try {
    // Try to get from IndexedDB first
    const token = await getFromIndexedDB('authToken');
    if (token) return token;
    
    // Fallback: try to get from cache
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match('/auth-token');
    if (response) {
      const data = await response.json();
      return data.token;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

// Cache location data for later sync
async function cacheLocationData(locationData) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const timestamp = Date.now();
    
    await cache.put(
      `/location-data-${timestamp}`,
      new Response(JSON.stringify(locationData), {
        headers: { 'Content-Type': 'application/json' }
      })
    );
    
    console.log('Location data cached for later sync');
  } catch (error) {
    console.error('Error caching location data:', error);
  }
}

// Get cached location data
async function getCachedLocation() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    
    // Find the most recent location data
    const locationKeys = keys.filter(key => key.url.includes('/location-data-'));
    if (locationKeys.length === 0) return null;
    
    // Sort by timestamp (newest first)
    locationKeys.sort((a, b) => {
      const timestampA = parseInt(a.url.split('-').pop());
      const timestampB = parseInt(b.url.split('-').pop());
      return timestampB - timestampA;
    });
    
    const response = await cache.match(locationKeys[0]);
    if (response) {
      return await response.json();
    }
    
    return null;
  } catch (error) {
    console.error('Error getting cached location:', error);
    return null;
  }
}

// Sync cached location data
async function syncLocationData() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    
    const locationKeys = keys.filter(key => key.url.includes('/location-data-'));
    
    for (const key of locationKeys) {
      const response = await cache.match(key);
      if (response) {
        const locationData = await response.json();
        await sendLocationToServer(locationData);
        // Remove from cache after successful sync
        await cache.delete(key);
      }
    }
    
    console.log('Location data sync completed');
  } catch (error) {
    console.error('Error syncing location data:', error);
  }
}

// IndexedDB helper functions
function getFromIndexedDB(key) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('LocationTrackerDB', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      const db = request.result;
      
      if (!db.objectStoreNames.contains('data')) {
        resolve(null);
        return;
      }
      
      const transaction = db.transaction(['data'], 'readonly');
      const store = transaction.objectStore('data');
      const getRequest = store.get(key);
      
      getRequest.onsuccess = () => {
        resolve(getRequest.result ? getRequest.result.value : null);
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    };
    
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('data')) {
        db.createObjectStore('data', { keyPath: 'key' });
      }
    };
  });
}

// Handle fetch events (for caching auth token)
self.addEventListener('fetch', (event) => {
  // Cache auth token when it's stored
  if (event.request.url.includes('/auth-token') && event.request.method === 'POST') {
    event.respondWith(
      event.request.clone().json().then(async (data) => {
        if (data.token) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/auth-token', new Response(JSON.stringify(data)));
        }
        return new Response('OK');
      })
    );
  }
});