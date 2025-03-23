import React, { ReactNode } from 'react';
import useInvoiceData from '../hooks/useInvoiceData';
import { InvoiceContext, ItemData } from './InvoiceContext';

interface InvoiceProviderProps {
  children: ReactNode;
  items: ItemData[];
  updateItem: (index: number, data: ItemData) => void;
  removeItem: (index: number) => void;
  addItem: () => void;
  calculateTotal: () => string;
  expandedIndex?: number;
  setExpandedIndex?: React.Dispatch<React.SetStateAction<number>>;
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
  // Use the hook to get all the data
  const { 
    partyOptions, 
    smOptions, 
    pmplData, 
    stockList, 
    godownOptions,
    loading,
    error 
  } = useInvoiceData();

  const contextValue = {
    pmplData,
    stockList,
    godownOptions,
    partyOptions,
    smOptions,
    items,
    updateItem,
    removeItem,
    addItem,
    calculateTotal,
    loading,
    error,
    expandedIndex,
    setExpandedIndex
  };

  return (
    <InvoiceContext.Provider value={contextValue}>
      {children}
    </InvoiceContext.Provider>
  );
};

export default InvoiceProvider; 