import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch all data sources in parallel with Promise.all
        const [pmplResponse, stockResponse, godownResponse, partyResponse] = await Promise.all([
          apiCache.fetchWithCache<any[]>(`${constants.baseURL}/api/dbf/pmpl.json`),
          apiCache.fetchWithCache<any>(`${constants.baseURL}/api/stock`),
          apiCache.fetchWithCache<any[]>(`${constants.baseURL}/api/dbf/godown.json`),
          apiCache.fetchWithCache<any[]>(`${constants.baseURL}/cmpl`)
        ]);
        
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
          // Filter for parties (DT group)
          const dtParties = partyResponse.filter(party => party.M_GROUP === 'DT');
          
          const partyOpts = dtParties.map(party => ({
            value: party.C_CODE,
            label: `${party.C_NAME} | ${party.C_CODE}`,
            gst: party.GST_NO || party.GST || '',
          }));
          setPartyOptions(partyOpts);
          
          // Process SM options from the same CMPL data
          const smList = partyResponse.filter(sm => sm.M_GROUP === 'SM');
          
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
  }, []);

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
        setExpandedIndex
      }}
    >
      {children}
    </InvoiceContext.Provider>
  );
};

export default InvoiceProvider; 