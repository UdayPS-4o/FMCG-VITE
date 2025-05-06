/**
 * Utility for fetching data with client-side caching
 */
class ApiCache {
  private cacheKeyPrefix: string;
  private hashKeyPrefix: string;
  
  constructor() {
    this.cacheKeyPrefix = 'api_cache_';
    this.hashKeyPrefix = 'api_hash_';
  }

  /**
   * Fetch data with caching
   */
  async fetchWithCache<T>(url: string, options: RequestInit = {}): Promise<T> {
    const cacheKey = this.cacheKeyPrefix + url;
    const hashKey = this.hashKeyPrefix + url;
    
    // Try to get cached data from localStorage
    let cachedData: { data: T, timestamp: number } | null = null;
    let cachedHash: string | null = null;
    
    try {
      const cachedDataStr = localStorage.getItem(cacheKey);
      if (cachedDataStr) {
        cachedData = JSON.parse(cachedDataStr);
      }
      
      cachedHash = localStorage.getItem(hashKey);
    } catch (e) {
      console.error('Error reading from cache:', e);
    }
    
    // Prepare headers
    const headers = new Headers(options.headers || {});
    if (cachedHash) {
      headers.set('If-None-Match', cachedHash);
    }
    
    // Add JWT token to authorization header if available
    const token = localStorage.getItem('token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    
    // Create the request with the updated headers
    const requestOptions = {
      ...options,
      headers
    };
    
    try {
      // Make the network request
      const response = await fetch(url, requestOptions);
      
      // If server returns 304 Not Modified, use cached data
      if (response.status === 304 && cachedData) {
        console.log(`Using cached data for ${url}`);
        return cachedData.data;
      }
      
      // For all other responses, parse the JSON
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json() as T;
      
      // Get ETag if present
      const newETag = response.headers.get('ETag');
      
      // Store the response data and ETag in localStorage
      try {
        const cacheItem = {
          data,
          timestamp: Date.now()
        };
        
        localStorage.setItem(cacheKey, JSON.stringify(cacheItem));
        
        if (newETag) {
          localStorage.setItem(hashKey, newETag);
        }
      } catch (e) {
        console.error('Error writing to cache:', e);
      }
      
      return data;
    } catch (error) {
      // If network request fails but we have cached data, use it as fallback
      if (cachedData) {
        console.log(`Network request failed for ${url}, using cached data`);
        return cachedData.data;
      }
      
      // Re-throw the error if we don't have cached data
      throw error;
    }
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(maxAge = 7 * 24 * 60 * 60 * 1000): void { // Default: 7 days
    try {
      const now = Date.now();
      let deletedCount = 0;
      const keysToCheck = [];
      
      // Collect all cache keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.cacheKeyPrefix)) {
          keysToCheck.push(key);
        }
      }
      
      // Check and delete expired items
      for (const key of keysToCheck) {
        try {
          const item = JSON.parse(localStorage.getItem(key) || '');
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
      
      console.log(`Cache cleanup completed. Deleted ${deletedCount} entries.`);
    } catch (error) {
      console.error('Error clearing expired cache:', error);
    }
  }
}

// Export as singleton
const apiCache = new ApiCache();
export default apiCache; 