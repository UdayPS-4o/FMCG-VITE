/**
 * Utility for fetching data with client-side caching
 */
class ApiCache {
  constructor() {
    // Determine which storage to use based on data size requirements
    this.storage = this._initStorage();
    this.cacheKeyPrefix = 'api_cache_';
    this.hashKeyPrefix = 'api_hash_';
  }

  /**
   * Initialize the storage mechanism
   */
  _initStorage() {
    // Check if IndexedDB is available
    if ('indexedDB' in window) {
      return {
        type: 'indexedDB',
        db: null,
        dbName: 'apiCacheDB',
        dbVersion: 1,
        storeName: 'apiCache',
        
        // Initialize the database
        init: async () => {
          return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.storage.dbName, this.storage.dbVersion);
            
            request.onupgradeneeded = (event) => {
              const db = event.target.result;
              if (!db.objectStoreNames.contains(this.storage.storeName)) {
                db.createObjectStore(this.storage.storeName);
              }
            };
            
            request.onsuccess = (event) => {
              this.storage.db = event.target.result;
              resolve();
            };
            
            request.onerror = (event) => {
              console.error('IndexedDB error:', event.target.error);
              reject(event.target.error);
            };
          });
        },
        
        // Get an item from storage
        getItem: async (key) => {
          if (!this.storage.db) await this.storage.init();
          
          return new Promise((resolve, reject) => {
            const transaction = this.storage.db.transaction([this.storage.storeName], 'readonly');
            const store = transaction.objectStore(this.storage.storeName);
            const request = store.get(key);
            
            request.onsuccess = () => {
              resolve(request.result);
            };
            
            request.onerror = (event) => {
              reject(event.target.error);
            };
          });
        },
        
        // Set an item in storage
        setItem: async (key, value) => {
          if (!this.storage.db) await this.storage.init();
          
          return new Promise((resolve, reject) => {
            const transaction = this.storage.db.transaction([this.storage.storeName], 'readwrite');
            const store = transaction.objectStore(this.storage.storeName);
            const request = store.put(value, key);
            
            request.onsuccess = () => {
              resolve();
            };
            
            request.onerror = (event) => {
              reject(event.target.error);
            };
          });
        }
      };
    } else {
      // Fallback to localStorage
      return {
        type: 'localStorage',
        
        init: async () => {
          // No initialization needed
          return Promise.resolve();
        },
        
        getItem: async (key) => {
          try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : null;
          } catch (e) {
            console.error('Error getting item from localStorage:', e);
            return null;
          }
        },
        
        setItem: async (key, value) => {
          try {
            localStorage.setItem(key, JSON.stringify(value));
            return Promise.resolve();
          } catch (e) {
            console.error('Error saving to localStorage:', e);
            return Promise.reject(e);
          }
        }
      };
    }
  }

  /**
   * Fetch data with caching
   */
  async fetchWithCache(url, options = {}) {
    await this.storage.init();
    
    const cacheKey = this.cacheKeyPrefix + url;
    const hashKey = this.hashKeyPrefix + url;
    
    // Try to get the hash and data from storage
    const cachedHash = await this.storage.getItem(hashKey);
    const cachedData = await this.storage.getItem(cacheKey);
    
    console.log(`Cache check for ${url}: `, { hashExists: !!cachedHash, dataExists: !!cachedData });
    
    // Prepare headers
    const headers = options.headers || {};
    if (cachedHash) {
      // Send the cached hash exactly as stored (with or without quotes)
      headers['If-None-Match'] = cachedHash;
      console.log(`Using ETag: ${cachedHash} for ${url}`);
    }
    
    try {
      // Make the fetch request with the cached hash
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include' // Include credentials for API requests
      });
      
      console.log(`Response status for ${url}: ${response.status}`);
      
      // Log all response headers for debugging
      const allHeaders = {};
      response.headers.forEach((value, key) => {
        allHeaders[key] = value;
      });
      console.log(`Response headers for ${url}:`, allHeaders);
      
      // If server returns 304 Not Modified, use cached data
      if (response.status === 304 && cachedData) {
        console.log(`Using cached data for ${url}`);
        return cachedData;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      // Otherwise, parse the new data
      const data = await response.json();
      
      // Get the new hash from response headers
      let newHash = response.headers.get('etag') || response.headers.get('ETag');
      console.log(`Received ETag from server for ${url}: ${newHash || 'none'}`);
      
      if (newHash) {
        // Store the ETag exactly as received
        console.log(`Saving data to cache for ${url} with ETag: ${newHash}`);
        await this.storage.setItem(hashKey, newHash);
        await this.storage.setItem(cacheKey, data);
      } else if (data) {
        // If no ETag but we have data, still cache it (with a timestamp as hash)
        console.log(`No ETag received, generating timestamp hash for ${url}`);
        const timestampHash = `ts-${Date.now()}`;
        await this.storage.setItem(hashKey, timestampHash);
        await this.storage.setItem(cacheKey, data);
      }
      
      return data;
    } catch (error) {
      console.error(`Fetch error for ${url}:`, error);
      
      // If fetch fails, try to use cached data as fallback
      if (cachedData) {
        console.log(`Using cached data as fallback for ${url}`);
        return cachedData;
      }
      
      // No cached data available
      throw error;
    }
  }

  /**
   * Clear expired cache entries
   */
  async clearExpiredCache(maxAge = 7 * 24 * 60 * 60 * 1000) { // Default: 7 days
    await this.storage.init();
    
    try {
      const now = Date.now();
      console.log(`Starting cache cleanup, removing items older than ${maxAge}ms`);
      
      if (this.storage.type === 'indexedDB') {
        // For IndexedDB, use a cursor to iterate through all entries
        const transaction = this.storage.db.transaction([this.storage.storeName], 'readwrite');
        const store = transaction.objectStore(this.storage.storeName);
        const request = store.openCursor();
        
        // Count deleted items
        let deletedCount = 0;
        
        return new Promise((resolve) => {
          request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
              const key = cursor.key;
              const value = cursor.value;
              
              // If it's a cache key (not a hash key) and has a timestamp
              if (typeof key === 'string' && key.startsWith(this.cacheKeyPrefix) && value && value.timestamp) {
                if (now - value.timestamp > maxAge) {
                  // Delete the cache entry
                  cursor.delete();
                  
                  // Also delete the corresponding hash key
                  const hashKey = key.replace(this.cacheKeyPrefix, this.hashKeyPrefix);
                  store.delete(hashKey);
                  
                  deletedCount++;
                }
              }
              
              cursor.continue();
            } else {
              // No more entries to process
              console.log(`Cache cleanup completed for IndexedDB. Deleted ${deletedCount} entries.`);
              resolve();
            }
          };
          
          request.onerror = (event) => {
            console.error('Error in cache cleanup:', event.target.error);
            resolve();
          };
        });
      } else {
        // For localStorage, iterate through all keys
        let deletedCount = 0;
        const keysToCheck = [];
        
        // First collect all cache keys
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(this.cacheKeyPrefix)) {
            keysToCheck.push(key);
          }
        }
        
        // Then check and delete expired items
        for (const key of keysToCheck) {
          try {
            const item = JSON.parse(localStorage.getItem(key));
            if (item && item.timestamp && now - item.timestamp > maxAge) {
              // Delete the cache entry
              localStorage.removeItem(key);
              
              // Also delete the corresponding hash key
              const hashKey = key.replace(this.cacheKeyPrefix, this.hashKeyPrefix);
              localStorage.removeItem(hashKey);
              
              deletedCount++;
            }
          } catch (e) {
            console.warn(`Error processing localStorage key ${key}:`, e);
          }
        }
        
        console.log(`Cache cleanup completed for localStorage. Deleted ${deletedCount} entries.`);
      }
    } catch (error) {
      console.error('Error clearing expired cache:', error);
    }
  }
}

// Export as singleton
export default new ApiCache(); 