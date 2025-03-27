interface CacheEntry {
  data: any;
  hash: string;
  timestamp: number;
}

class ApiCacheService {
  private dbName = 'api-cache-db';
  private storeName = 'api-cache-store';
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;
  
  constructor() {
    this.initDb();
  }
  
  private initDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'url' });
        }
      };
      
      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve(this.db);
      };
      
      request.onerror = (event) => {
        console.error('IndexedDB error:', event);
        reject('Failed to open IndexedDB');
      };
    });
    
    return this.dbPromise;
  }
  
  async get(url: string): Promise<CacheEntry | null> {
    try {
      const db = await this.initDb();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get(url);
        
        request.onsuccess = () => {
          resolve(request.result || null);
        };
        
        request.onerror = () => {
          reject('Error getting data from cache');
        };
      });
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }
  
  async set(url: string, data: any, hash: string): Promise<void> {
    try {
      const db = await this.initDb();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.put({
          url,
          data,
          hash,
          timestamp: Date.now()
        });
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject('Error saving data to cache');
      });
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }
  
  async fetchWithCache(url: string, options: RequestInit = {}): Promise<any> {
    try {
      // Try to get from cache first
      const cacheEntry = await this.get(url);
      
      // If we have a cached version, add the hash to the request
      if (cacheEntry) {
        const headers = new Headers(options.headers || {});
        headers.set('If-None-Match', cacheEntry.hash);
        options.headers = headers;
      }
      
      // Make the API request
      const response = await fetch(url, options);
      
      // If server returns 304 Not Modified, use cached data
      if (response.status === 304 && cacheEntry) {
        return cacheEntry.data;
      }
      
      // Otherwise, parse the response
      const data = await response.json();
      
      // Get the ETag (hash) from the response
      const hash = response.headers.get('ETag');
      
      // Store in cache if we have a hash
      if (hash) {
        await this.set(url, data, hash);
      }
      
      return data;
    } catch (error) {
      console.error('Error in fetchWithCache:', error);
      
      // If we have cached data, return it as fallback
      const cacheEntry = await this.get(url);
      if (cacheEntry) {
        console.log('Using cached data as fallback');
        return cacheEntry.data;
      }
      
      throw error;
    }
  }
  
  // Helper method to clean old cache entries
  async cleanCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const db = await this.initDb();
      const now = Date.now();
      
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.openCursor();
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          if (now - cursor.value.timestamp > maxAgeMs) {
            store.delete(cursor.value.url);
          }
          cursor.continue();
        }
      };
    } catch (error) {
      console.error('Cache cleaning error:', error);
    }
  }
}

// Create a singleton instance
export const apiCache = new ApiCacheService(); 