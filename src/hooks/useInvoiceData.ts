import { useState, useEffect, useRef } from 'react';
import constants from '../constants';

export interface Option {
  value: string;
  label: string;
  stockLimit?: number;
  name?: string;
  balance?: string;
  gst?: string;
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
          (async () => {
            try {
              // Try primary endpoint
              const accRes = await fetch(`${constants.baseURL}/api/dbf/acm.json`, { 
                signal,
                credentials: 'include' 
              });
              if (!accRes.ok) throw new Error('Primary endpoint failed');
              return await accRes.json();
            } catch (error) {
              if ((error as Error).name === 'AbortError') {
                throw error;
              }
              // Try fallback endpoint
              const cmplRes = await fetch(`${constants.baseURL}/cmpl`, { 
                signal,
                credentials: 'include'
              });
              if (!cmplRes.ok) throw new Error('Fallback endpoint failed');
              return await cmplRes.json();
            }
          })(),
          // Fetch PMPL data
          fetch(`${constants.baseURL}/api/dbf/pmpl.json`, { 
            signal, 
            credentials: 'include' 
          }).then(res => res.json()),
          // Fetch stock data
          fetch(`${constants.baseURL}/api/stock`, { 
            signal, 
            credentials: 'include' 
          }).then(res => res.json()),
          // Fetch godown data
          fetch(`${constants.baseURL}/api/dbf/godown.json`, { 
            signal, 
            credentials: 'include' 
          }).then(res => res.json()),
          // Fetch balance data
          fetch(`${constants.baseURL}/json/balance`, { 
            signal, 
            credentials: 'include' 
          }).then(res => res.json())
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
        const sms = parties.filter(p => 
          p.value.toString().startsWith('SM')
        );

        // Set all state
        setPartyOptions(parties);
        setSmOptions(sms);
        setPmplData(pmplRes);
        setStockList(stockRes);
        setGodownOptions(godownRes.map((gdn: any) => ({ 
          value: gdn.GDN_CODE, 
          label: gdn.GDN_NAME 
        })));

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