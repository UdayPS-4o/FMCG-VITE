import React, { createContext, useContext } from 'react';

export interface Option {
  value: string;
  label: string;
  stockLimit?: number;
  name?: string;
  balance?: string;
  gst?: string;
}

export interface ItemData {
  item: string;
  godown: string;
  unit: string;
  stock: string;
  pack: string;
  gst: string;
  pcBx: string;
  mrp: string;
  rate: string;
  qty: string;
  cess: string;
  schRs: string;
  sch: string;
  cd: string;
  amount: string;
  netAmount: string;
  selectedItem: any;
  stockLimit: number;
}

export interface InvoiceContextType {
  pmplData: any[];
  stockList: Record<string, any>;
  godownOptions: Option[];
  partyOptions: Option[];
  smOptions: Option[];
  items: ItemData[];
  updateItem: (index: number, data: ItemData) => void;
  removeItem: (index: number) => void;
  addItem: () => void;
  calculateTotal: () => string;
  loading: boolean;
  error: string | null;
  expandedIndex?: number;
  setExpandedIndex?: React.Dispatch<React.SetStateAction<number>>;
  invoiceIdInfo: {
    nextInvoiceId: number;
    nextSeries: Record<string, number>;
  };
  focusNewItemIndex?: number | null;
  setFocusNewItemIndex?: React.Dispatch<React.SetStateAction<number | null>>;
  setItems?: React.Dispatch<React.SetStateAction<ItemData[]>>;
}

export const InvoiceContext = createContext<InvoiceContextType>({
  pmplData: [],
  stockList: {},
  godownOptions: [],
  partyOptions: [],
  smOptions: [],
  items: [],
  updateItem: () => {},
  removeItem: () => {},
  addItem: () => {},
  calculateTotal: () => '0.00',
  loading: false,
  error: null,
  expandedIndex: 0,
  setExpandedIndex: () => {},
  invoiceIdInfo: {
    nextInvoiceId: 1,
    nextSeries: {},
  },
  focusNewItemIndex: null,
  setFocusNewItemIndex: () => {},
  setItems: () => {},
});

export const useInvoiceContext = () => useContext(InvoiceContext); 