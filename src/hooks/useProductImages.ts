import { useEffect, useState } from 'react';
import constants from '../constants';

/**
 * Item CODE → photo URL for dropdown thumbnails (same photos as the customer app).
 *
 * Fast path: the last map is kept in localStorage, so thumbnails show instantly.
 * The server is asked once per session; the browser revalidates it with the ETag
 * (Cache-Control: no-cache) so an unchanged map comes back as a tiny 304.
 * The server itself caches the map (see /api/app/product-images).
 */
export type ProductImageMap = Record<string, string>;

const LS_MAP = 'product_image_map_v1';

let memory: ProductImageMap | null = null;
let inflight: Promise<ProductImageMap> | null = null;

// Uploaded photos are stored as "/uploads/…" on the API server
const absolutize = (map: ProductImageMap): ProductImageMap => {
  const out: ProductImageMap = {};
  for (const [code, url] of Object.entries(map)) {
    out[code] = url.startsWith('/') ? `${constants.baseURL}${url}` : url;
  }
  return out;
};

const readStored = (): ProductImageMap | null => {
  try {
    const raw = localStorage.getItem(LS_MAP);
    return raw ? absolutize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

export const loadProductImages = (): Promise<ProductImageMap> => {
  if (memory) return Promise.resolve(memory);
  if (inflight) return inflight;

  inflight = (async () => {
    const stored = readStored();
    try {
      // No manual If-None-Match: that makes fetch add "Cache-Control: no-cache" and defeats the 304
      const res = await fetch(`${constants.baseURL}/api/app/product-images`);
      if (res.ok) {
        const raw = (await res.json()) as ProductImageMap;
        try { localStorage.setItem(LS_MAP, JSON.stringify(raw)); } catch { /* storage full: still works this session */ }
        memory = absolutize(raw);
      } else {
        memory = stored ?? {};
      }
    } catch {
      memory = stored ?? {}; // offline: last known photos
    }
    inflight = null;
    return memory;
  })();
  return inflight;
};

/** Returns the photo map; starts with the stored copy so the first render already has thumbnails. */
const useProductImages = (): ProductImageMap => {
  const [map, setMap] = useState<ProductImageMap>(() => memory ?? readStored() ?? {});
  useEffect(() => {
    let alive = true;
    loadProductImages().then(m => { if (alive) setMap(m); });
    return () => { alive = false; };
  }, []);
  return map;
};

export default useProductImages;
