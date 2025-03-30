import React, { useState, useEffect, useRef } from 'react';
import { InvoiceContext, ItemData } from './InvoiceContext';
import constants from '../constants';
import apiCache from '../utils/apiCache';

interface InvoiceProviderProps {
  children: React.ReactNode;
  items: ItemData[];
  updateItem: (index: number, newData: ItemData) => void;
  removeItem: (index: number) => void;
  addItem: () => void;
  calculateTotal: () => string;
  expandedIndex: number;
  setExpandedIndex: (index: number) => void;
}

const InvoiceProvider: React.FC<InvoiceProviderProps> = ({ 
  children, 
  items, 
  updateItem, 
  removeItem, 
  addItem,
  calculateTotal,
  expandedIndex,
  setExpandedIndex
}) => {
  const [pmplData, setPmplData] = useState<any[]>([]);
  const [stockList, setStockList] = useState<any>({});
  const [godownOptions, setGodownOptions] = useState<any[]>([]);
  const [smOptions, setSmOptions] = useState<any[]>([]);
  const [partyOptions, setPartyOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const userRef = useRef<any>(null);
  const [invoiceIdInfo, setInvoiceIdInfo] = useState<{
    nextInvoiceId: number;
    nextSeries: Record<string, number>;
  }>({
    nextInvoiceId: 1,
    nextSeries: {},
  });
  const dataFetched = useRef<boolean>(false);

  // First fetch the current user data
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await fetch(`${constants.baseURL}/api/checkIsAuth`, {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.authenticated && data.user) {
            setUser(data.user);
            userRef.current = data.user;
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchUserData();
  }, []);

  useEffect(() => {
    // Avoid refetching data if we've already done it or if user is still loading
    if (dataFetched.current) {
      return;
    }
    
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch all data sources in parallel with Promise.all
        const [pmplResponse, stockResponse, godownResponse, partyResponse, balanceResponse, invoiceIdResponse] = await Promise.all([
          apiCache.fetchWithCache<any[]>(`${constants.baseURL}/api/dbf/pmpl.json`),
          apiCache.fetchWithCache<any>(`${constants.baseURL}/api/stock`),
          apiCache.fetchWithCache<any[]>(`${constants.baseURL}/api/dbf/godown.json`),
          apiCache.fetchWithCache<any[]>(`${constants.baseURL}/cmpl`),
          apiCache.fetchWithCache<any>(`${constants.baseURL}/json/balance`),
          apiCache.fetchWithCache<any>(`${constants.baseURL}/slink/invoiceID`, { credentials: 'include' })
        ]);
        
        // Mark data as fetched to avoid repeating expensive operations
        dataFetched.current = true;
        
        // Store the invoice ID information
        if (invoiceIdResponse && invoiceIdResponse.nextSeries) {
          setInvoiceIdInfo(invoiceIdResponse);
        }
        
        // Process PMPL data
        if (Array.isArray(pmplResponse)) {
          setPmplData(pmplResponse);
        } else {
          console.warn('PMPL response is not an array:', pmplResponse);
          setPmplData([]);
        }

        // Process stock data
        setStockList(stockResponse || {});

        // Process godown data
        if (Array.isArray(godownResponse)) {
          const gdnOptions = godownResponse.map(gdn => ({
            value: gdn.GDN_CODE,
            label: gdn.GDN_NAME,
          }));
          setGodownOptions(gdnOptions);
        } else {
          console.warn('Godown response is not an array:', godownResponse);
          setGodownOptions([]);
        }

        // Process party and SM data
        if (Array.isArray(partyResponse)) {
          // Filter for parties (DT group) and exclude those with C_CODE ending in "000"
          let dtParties = partyResponse.filter(party => 
            // party.M_GROUP === 'DT' &&
             !party.C_CODE.endsWith('000')
          );
          
          // Check if user is an admin
          const currentUser = userRef.current;
          const isAdmin = currentUser && currentUser.routeAccess && currentUser.routeAccess.includes('Admin');
          
          // Only filter parties if user is not an admin and has assigned subgroups
          if (!isAdmin && currentUser && currentUser.subgroups && currentUser.subgroups.length > 0) {
            console.log(`Filtering parties by user's assigned subgroups`);
            
            // Get all subgroup prefixes from user's assigned subgroups
            const subgroupPrefixes = currentUser.subgroups.map(sg => 
              sg.subgroupCode.substring(0, 2).toUpperCase()
            );
            
            console.log(`User's subgroup prefixes: ${subgroupPrefixes.join(', ')}`);
            
            // Filter parties where C_CODE starts with any of the user's subgroup prefixes
            dtParties = dtParties.filter(party => {
              const partyPrefix = party.C_CODE.substring(0, 2).toUpperCase();
              return subgroupPrefixes.includes(partyPrefix);
            });
            
            console.log(`Filtered to ${dtParties.length} parties based on user's subgroups`);
          } else if (isAdmin) {
            console.log('User is admin - showing all parties without filtering');
          }
          
          // Get balance information
          const balanceMap = new Map();
          if (balanceResponse && Array.isArray(balanceResponse.data)) {
            balanceResponse.data.forEach((item: any) => {
              balanceMap.set(item.partycode, item.result);
            });
          }
          
          const partyOpts = dtParties.map(party => {
            // Get balance for this party
            const balance = balanceMap.get(party.C_CODE);
            
            // Check if balance is non-zero (either greater or in negative)
            const hasNonZeroBalance = balance && balance.trim() !== '0 CR' && balance.trim() !== '0 DR';
            
            return {
              value: party.C_CODE,
              label: hasNonZeroBalance
                ? `${party.C_NAME} | ${party.C_CODE} / ${balance}`
                : `${party.C_NAME} | ${party.C_CODE}`,
              gst: party.GST_NO || party.GST || '',
            };
          });
          
          setPartyOptions(partyOpts);
          
          // Process SM options from the same CMPL data, excluding those ending with "000"
          const smList = partyResponse.filter(sm => 
            sm.C_CODE.startsWith('SM') && !sm.C_CODE.endsWith('000')
          );
          
          const smOpts = smList.map(sm => ({
            value: sm.C_CODE,
            label: `${sm.C_NAME} | ${sm.C_CODE}`,
          }));
          setSmOptions(smOpts);
        } else {
          console.warn('Party response is not an array:', partyResponse);
          setPartyOptions([]);
          setSmOptions([]);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load data. Please try again later.');
        setLoading(false);
      }
    };

    fetchData();
    
    // Clean up expired cache items
    try {
      apiCache.clearExpiredCache();
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }, [user]); // Depend on user but with dataFetched ref to prevent duplicate fetches

  return (
    <InvoiceContext.Provider
      value={{
        pmplData,
        stockList,
        godownOptions,
        partyOptions,
        smOptions,
        loading,
        error,
        items,
        updateItem,
        removeItem,
        addItem,
        calculateTotal,
        expandedIndex,
        setExpandedIndex,
        invoiceIdInfo
      }}
    >
      {children}
    </InvoiceContext.Provider>
  );
};

export default InvoiceProvider; 