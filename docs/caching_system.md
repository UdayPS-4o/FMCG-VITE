# Caching System: Stale-While-Revalidate (SWR)

The FMCG application implements a sophisticated caching strategy to balance UI performance with data accuracy, especially for volatile information like product prices and stock levels.

## 1. Core Implementation
- **Location**: `app/src/lib/cache.ts`
- **Engine**: **IndexedDB**. Unlike `localStorage`, IndexedDB is asynchronous and better suited for larger datasets or complex objects.

## 2. Patterns Used

### Stale-While-Revalidate (SWR)
This pattern is used for both Brands and Product Listings to provide "instant-on" navigation.
1.  **Read**: App checks the IndexedDB cache.
2.  **Display**: If data exists (even if stale), it is returned immediately to the UI.
3.  **Fetch**: A network request is triggered in the background.
4.  **Update**: When the network response arrives, the UI updates silently, and the new data is persisted back to IndexedDB with a fresh TTL.

### Time-To-Live (TTL)
- **Standard TTL**: 5 Minutes (`5 * 60 * 1000` ms).
- **Enforcement**: 
    - For **Brands**: Stale data is always shown (to keep the brand bar full), but background refreshes happen every visit.
    - For **Products**: If the cached price is older than 5 minutes, the `pricesStale` flag is set to `true`.

## 3. UI Feedback
To maintain trust, the app provides visual cues when data is stale:
- **Price Indicator**: A "⚡ Prices are being updated..." badge appears below the product grid when the displayed data is from a stale cache.
- **Sync Fix**: When switching brands, the app ensures `loading` state is set synchronously with the data reset to prevent "No products found" flashes before the cache/network response resolves.

## 4. Key Functions
- `getCache<T>(key)`: Simple TTL-enforced read. Returns `null` if expired.
- `getStale<T>(key)`: Returns data regardless of age, along with an `isStale` flag.
- `setCache(key, data, ttl)`: Persists data with a `cachedAt` timestamp and expiry.
