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
  calculateTotal: () => '0.00'
});

export const useInvoiceContext = () => useContext(InvoiceContext);

export default InvoiceContext; 