import { useEffect, useMemo, useState } from 'react';
import { fetchBrands } from './api';
import { getStale, setCache } from './cache';

interface BrandLike { brand_code?: string; brand_desc?: string }

export const BRAND_CACHE_KEY = 'brands_v1';
export const BRAND_CACHE_TTL = 5 * 60 * 1000;

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])\S/g, c => c.toUpperCase());

/** "BABY DOVE" → "Baby Dove", de-duplicated, for the rotating "Shop for <brand>..." hint. */
export const brandHintNames = (brands: BrandLike[]) =>
    Array.from(new Set(brands.map(b => titleCase((b.brand_desc || b.brand_code || '').trim())).filter(Boolean)));

/**
 * Brand names for the search hint on pages that don't load brands themselves
 * (Search). Same cache as the Home brand row: cached list first, refreshed in the background.
 */
export const useBrandHints = () => {
    const [brands, setBrands] = useState<BrandLike[]>([]);

    useEffect(() => {
        let alive = true;
        getStale<BrandLike[]>(BRAND_CACHE_KEY).then(cached => {
            if (alive && cached) setBrands(cached.data);
            fetchBrands()
                .then(fresh => { if (alive) setBrands(fresh); setCache(BRAND_CACHE_KEY, fresh, BRAND_CACHE_TTL); })
                .catch(() => { });
        });
        return () => { alive = false; };
    }, []);

    return useMemo(() => brandHintNames(brands), [brands]);
};
