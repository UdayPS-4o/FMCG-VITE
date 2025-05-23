import { useState, useEffect, useRef } from 'react';
import constants from '../constants';
import apiCache from '../utils/apiCache';

export interface Option {
  value: string;
  label: string;
  stockLimit?: number;
  name?: string;
  balance?: string;
  gst?: string;
}

interface Account {
  AC_CODE?: string;
  C_CODE?: string;
  id?: string;
  AC_HEAD?: string;
  C_NAME?: string;
  name?: string;
  GST?: string;
  GSTNO?: string;
}

interface PmplItem {
  // Define properties for PMPL items if known, otherwise use any
  [key: string]: any;
}

interface Godown {
  GDN_CODE: string;
  GDN_NAME: string;
}

interface BalanceEntry {
  partycode?: string;
  C_CODE?: string;
  result?: string | number;
}

interface BalanceResponse {
  data: BalanceEntry[];
}

export const useInvoiceData = () => {
  const [partyOptions, setPartyOptions] = useState<Option[]>([]);
  const [smOptions, setSmOptions] = useState<Option[]>([]);
  const [pmplData, setPmplData] = useState<any[]>([]);
  const [stockList, setStockList] = useState<Record<string, any>>({});
  const [godownOptions, setGodownOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const dataFetchedRef = useRef<boolean>(false);

  useEffect(() => {
    // Don't fetch if we already have data (prevents double fetching in StrictMode)
    if (dataFetchedRef.current) return;
    
    // Create a new AbortController for this fetch operation
    fetchControllerRef.current = new AbortController();
    const signal = fetchControllerRef.current.signal;

    const loadAllData = async () => {
      try {
        setLoading(true);
        
        // Fetch all data in parallel for better performance
        const [accountData, pmplRes, stockRes, godownRes, balanceRes] = await Promise.all([
          // Fetch account data with fallback
          apiCache.fetchWithCache<Account[]>(`${constants.baseURL}/cmpl`),
          // Fetch PMPL data
          apiCache.fetchWithCache<PmplItem[]>(`${constants.baseURL}/api/dbf/pmpl.json`),
          // Fetch stock data
          apiCache.fetchWithCache<Record<string, any>>(`${constants.baseURL}/api/stock`),
          // Fetch godown data
          apiCache.fetchWithCache<Godown[]>(`${constants.baseURL}/api/dbf/godown.json`),
          // Fetch balance data
          apiCache.fetchWithCache<BalanceResponse>(`${constants.baseURL}/json/balance`)
        ]);

        // Helper function to get balance for a party code
        const getBalance = (code: string) => {
          const balanceData = balanceRes?.data?.find((user: any) => 
            user.partycode === code || user.C_CODE === code
          );
          
          if (!balanceData) return "0.00";
          
          const balanceValue = balanceData.result || 0;
          let formattedBalance = "";
          
          // Check if the balance already contains CR/DR indicators
          if (typeof balanceValue === 'string') {
            if (balanceValue.includes('CR') || balanceValue.includes('DR')) {
              // Extract the number part and format it
              const parts = balanceValue.split(' ');
              const number = parseFloat(parts[0]);
              const indicator = parts[1] || '';
              formattedBalance = `${number.toFixed(2)} ${indicator}`;
            } else {
              // Just a number in string format
              formattedBalance = `${parseFloat(balanceValue).toFixed(2)}`;
            }
          } else {
            // Numeric value
            formattedBalance = `${Math.abs(balanceValue).toFixed(2)} ${balanceValue < 0 ? 'CR' : 'DR'}`;
          }
          
          return formattedBalance;
        };

        // Process account data
        const parties = Array.isArray(accountData) 
          ? accountData.map(acc => {
              const code = acc.AC_CODE || acc.C_CODE || acc.id;
              const name = acc.AC_HEAD || acc.C_NAME || acc.name;
              const balance = getBalance(code);
              return {
                value: code,
                label: `${name} | ${balance}`,
                name: name,
                balance: balance,
                gst: acc.GST || acc.GSTNO || ''
              };
            })
          : [];

        // Filter salesmen (codes that start with 'SM')
        const sms = parties.filter(p => {
          // Skip any item with undefined or null value
          if (p.value === undefined || p.value === null) return false;
          // Only include items where value starts with 'SM'
          return p.value.toString().startsWith('SM');
        });

        // Set all state
        setPartyOptions(parties);
        setSmOptions(sms);
        setPmplData(pmplRes);
        setStockList(stockRes);
        setGodownOptions(godownRes.map((gdn: Godown) => ({ 
          value: gdn.GDN_CODE, 
          label: gdn.GDN_NAME 
        })));

        // Clear expired cache items
        apiCache.clearExpiredCache();

        // Mark that we've successfully fetched the data
        dataFetchedRef.current = true;
        setError(null);
      } catch (err) {
        // Don't set error if it was just an abort
        if ((err as Error).name !== 'AbortError') {
          console.error('Failed to load invoice data:', err);
          setError(err instanceof Error ? err.message : 'Failed to load data');
        }
      } finally {
        setLoading(false);
      }
    };

    loadAllData();

    // Cleanup function to abort fetch if component unmounts
    return () => {
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
      }
    };
  }, []);

  return {
    partyOptions,
    smOptions,
    pmplData,
    stockList,
    godownOptions,
    loading,
    error
  };
};

export default useInvoiceData; 