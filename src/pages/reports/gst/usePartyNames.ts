import { useEffect, useState } from 'react';
import { loadPartyNames } from './gstApi';

// Party name lookup for GSTIN tooltips
export default function usePartyNames() {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    loadPartyNames().then((n) => alive && setNames(n));
    return () => {
      alive = false;
    };
  }, []);
  return (gstin: unknown) => names[String(gstin || '').trim().toUpperCase()] || '';
}
