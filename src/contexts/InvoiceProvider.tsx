import React, { useState, useEffect, useRef } from 'react';
import { InvoiceContext, ItemData } from './InvoiceContext';
import constants from '../constants';
import apiCache from '../utils/apiCache';
import useAuth, { getUserSubgroups } from '../hooks/useAuth';

interface InvoiceProviderProps {
  children: React.ReactNode;
  items: ItemData[];
  updateItem: (index: number, newData: ItemData) => void;
  removeItem: (index: number) => void;
  addItem: () => void;
  calculateTotal: () => string;
  expandedIndex: number;
  setExpandedIndex: (index: number) => void;
  focusNewItemIndex: number | null;
  setFocusNewItemIndex: React.Dispatch<React.SetStateAction<number | null>>;
  setItems: React.Dispatch<React.SetStateAction<ItemData[]>>;
}

const InvoiceProvider: React.FC<InvoiceProviderProps> = ({
  children,
  items,
  updateItem,
  removeItem,
  addItem,
  calculateTotal,
  expandedIndex,
  setExpandedIndex,
  focusNewItemIndex,
  setFocusNewItemIndex,
  setItems
}) => {
  const [pmplData, setPmplData] = useState<any[]>([]);
  const [stockList, setStockList] = useState<any>({});
  const [godownOptions, setGodownOptions] = useState<any[]>([]);
  const [smOptions, setSmOptions] = useState<any[]>([]);
  const [partyOptions, setPartyOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const [invoiceIdInfo, setInvoiceIdInfo] = useState<{
    nextInvoiceId: number;
    nextSeries: Record<string, number>;
  }>({
    nextInvoiceId: 1,
    nextSeries: {},
  });
  const dataFetched = useRef<boolean>(false);
  
  useEffect(() => {
    // Avoid refetching data if we've already done it or if user is still loading
    if (!user || dataFetched.current) {
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch master data in parallel (stock fetched in a dedicated effect)
        const [pmplResponse, godownResponse, partyResponse, balanceResponse, invoiceIdResponse] = await Promise.all([
          apiCache.fetchWithCache<any[]>(`${constants.baseURL}/api/dbf/pmpl.json`),
          apiCache.fetchWithCache<any[]>(`${constants.baseURL}/api/dbf/godown.json`),
          apiCache.fetchWithCache<any[]>(`${constants.baseURL}/cmpl`),
          apiCache.fetchWithCache<any>(`${constants.baseURL}/json/balance`),
          apiCache.fetchWithCache<any>(`${constants.baseURL}/slink/invoiceID`)
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

        // Process godown data
        if (Array.isArray(godownResponse)) {
          // First create all godown options
          const allGodowns = godownResponse.map(gdn => ({
            value: gdn.GDN_CODE,
            label: gdn.GDN_NAME,
          }));

          // Filter godowns based on user access rights
          let filteredGodowns = allGodowns;

          // If user has godownAccess restrictions, filter the godowns
          if (user && user.godownAccess && user.godownAccess.length > 0) {
            filteredGodowns = allGodowns.filter(godown =>
              user.godownAccess.includes(godown.value)
            );
            console.log(`Filtered to ${filteredGodowns.length} godowns based on user's access`);
          }

          setGodownOptions(filteredGodowns);
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
          const isAdmin = user && user.routeAccess && user.routeAccess.includes('Admin');

          if (isAdmin) {
            console.log('User is admin - showing all parties without filtering');
          } else {
            const userSubgroups = getUserSubgroups(user);
            if (userSubgroups.length > 0) {
              console.log(`Filtering parties by user's assigned subgroups`);

              // Get all subgroup prefixes from user's assigned subgroups
              const subgroupPrefixes = userSubgroups.map((sg: any) =>
                (sg.subgroupCode || '').substring(0, 2).toUpperCase()
              ).filter(Boolean);

              console.log(`User's subgroup prefixes: ${subgroupPrefixes.join(', ')}`);

              // Filter parties where C_CODE starts with any of the user's subgroup prefixes
              dtParties = dtParties.filter(party => {
                const partyPrefix = party.C_CODE.substring(0, 2).toUpperCase();
                return subgroupPrefixes.includes(partyPrefix);
              });

              console.log(`Filtered to ${dtParties.length} parties based on user's subgroups`);
            } else {
              console.log('User is not admin and has no subgroups - hiding all parties');
              dtParties = [];
            }
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

  useEffect(() => {
    const fetchStock = async () => {
      try {
        const stockResponse = await apiCache.fetchWithCache<any>(`${constants.baseURL}/api/stock`);
        setStockList(stockResponse || {});
      } catch (error) {
        console.error('Error fetching stock:', error);
      }
    };
    fetchStock();
  }, []);

  return (
    <InvoiceContext.Provider
      value={{
        pmplData,
        stockList,
        setStockList,
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
        invoiceIdInfo,
        focusNewItemIndex,
        setFocusNewItemIndex,
        setItems
      }}
    >
      {children}
    </InvoiceContext.Provider>
  );
};

export default InvoiceProvider; 
