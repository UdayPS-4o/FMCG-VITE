import React, { useEffect, useState } from 'react';
import Autocomplete from '../../components/form/input/Autocomplete';
import Input from '../../components/form/input/Input';
import { useInvoiceContext, type ItemData } from '../../contexts/InvoiceContext';

interface CollapsibleItemSectionProps {
  index: number;
  item: ItemData;
  expanded: boolean;
  handleAccordionChange: (panel: number) => (event: React.SyntheticEvent, isExpanded: boolean) => void;
  updateItem: (index: number, data: ItemData) => void;
  removeItem: (index: number) => void;
}

const CollapsibleItemSection: React.FC<CollapsibleItemSectionProps> = ({
  index,
  item,
  expanded,
  handleAccordionChange,
  updateItem,
  removeItem,
}) => {
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  
  // Get shared data from context
  const { pmplData, stockList, godownOptions } = useInvoiceContext();

  useEffect(() => {
    // Initialize unitOptions when item or selectedItem changes
    if (item.selectedItem) {
      const units = [item.selectedItem.UNIT_1, item.selectedItem.UNIT_2].filter(Boolean);
      setUnitOptions(units);
    }
  }, [item.selectedItem]);

  const handleItemChange = (newValue: any) => {
    if (!newValue) return;

    const selectedItem = newValue;

    // Set the unit options
    const units = [selectedItem.UNIT_1, selectedItem.UNIT_2].filter(Boolean);

    // Set the initial unit
    const initialUnit = units[0];

    // Calculate total stock across all godowns
    let totalStock = 0;
    if (stockList[selectedItem.CODE]) {
      Object.values(stockList[selectedItem.CODE]).forEach(stock => {
        totalStock += parseInt(stock as string, 10);
      });
    }

    // Update state with the selected item data and dropdown options
    const updatedData = {
      ...item,
      item: selectedItem.CODE,
      stock: `0 (Total: ${totalStock})`, // Show total stock even before godown selection
      stockLimit: 0, // Will be updated when godown is selected
      godown: '',
      pack: selectedItem.PACK,
      gst: selectedItem.GST,
      pcBx: selectedItem.MULT_F,
      mrp: selectedItem.MRP1,
      rate: selectedItem.RATE1,
      qty: '',
      unit: initialUnit, // Auto-select the first unit option
      amount: '',
      netAmount: '',
      selectedItem: selectedItem, // Store the selected item
    };

    setUnitOptions(units);
    updateItem(index, updatedData);
  };

  const handleGodownChange = (newValue: string | null) => {
    if (!newValue || !item.selectedItem) return;
    
    // Get stock for selected godown
    const godownStock = stockList[item.selectedItem.CODE]?.[newValue] || '0';
    
    // Calculate total stock across all godowns
    let totalStock = 0;
    if (stockList[item.selectedItem.CODE]) {
      Object.values(stockList[item.selectedItem.CODE]).forEach(stock => {
        totalStock += parseInt(stock as string, 10);
      });
    }
    
    const stockValue = parseInt(godownStock, 10);

    // Calculate stock limit based on selected unit and godown stock
    let stockLimit;
    if (item.unit === item.selectedItem.UNIT_2) {
      // Unit is BOX
      stockLimit = Math.floor(stockValue / parseInt(item.pcBx, 10));
    } else {
      // Unit is PCS
      stockLimit = stockValue;
    }

    const updatedData = {
      ...item,
      godown: newValue,
      stock: `${godownStock} (Total: ${totalStock})`, // Show both selected godown stock and total stock
      stockLimit: stockLimit,
    };

    updateItem(index, updatedData);
  };

  const handleUnitChange = (newValue: string | null) => {
    if (!newValue) return;
    
    const updatedData = {
      ...item,
      unit: newValue,
    };

    // Recalculate stockLimit based on the new unit
    let stockLimit;
    if (newValue === item.selectedItem?.UNIT_2) {
      // Unit is BOX
      stockLimit = Math.floor(parseInt(item.stock, 10) / parseInt(item.pcBx, 10));
    } else {
      // Unit is PCS
      stockLimit = parseInt(item.stock, 10);
    }

    updatedData.stockLimit = stockLimit;

    // Optionally adjust qty if it exceeds new stockLimit
    if (parseInt(updatedData.qty, 10) > stockLimit) {
      updatedData.qty = stockLimit.toString();
    }

    updateItem(index, calculateAmounts(updatedData));
  };

  const handleFieldChange = (name: string, newValue: string) => {
    let updatedData = { ...item, [name]: newValue };

    if (name === 'qty') {
      if (newValue === '') {
        updatedData.qty = '';
      } else {
        const totalQty = parseInt(newValue, 10);

        if (!isNaN(totalQty)) {
          const stockLimit = item.stockLimit;

          if (stockLimit > 0 && totalQty > stockLimit) {
            updatedData.qty = stockLimit.toString();
          } else {
            updatedData.qty = totalQty.toString();
          }
        }
      }

      updatedData = calculateAmounts(updatedData);
    }

    if (['rate', 'cess', 'cd', 'sch'].includes(name)) {
      updatedData = calculateAmounts(updatedData);
    }

    updateItem(index, updatedData);
  };

  const calculateAmounts = (data: ItemData): ItemData => {
    const qty = parseFloat(data.qty);
    if (isNaN(qty) || qty <= 0) {
      return {
        ...data,
        amount: '',
        netAmount: '',
      };
    }

    let amount;
    const rate = parseFloat(data.rate);

    // Fix calculation issue by ensuring rate is properly used
    if (isNaN(rate)) {
      return {
        ...data,
        amount: '',
        netAmount: '',
      };
    }

    const selectedItem = data.selectedItem;

    if (selectedItem) {
      if (data.unit === selectedItem.UNIT_2) {
        // Unit is BOX
        amount = rate * qty;
      } else {
        // Unit is PCS - direct multiplication without division
        amount = rate * qty;
      }
    } else {
      amount = rate * qty;
    }

    let netAmount = amount;

    // Process additional charges and discounts
    if (data.cess && !isNaN(parseFloat(data.cess))) {
      netAmount += amount * (parseFloat(data.cess) / 100);
    }

    if (data.cd && !isNaN(parseFloat(data.cd))) {
      netAmount -= amount * (parseFloat(data.cd) / 100);
    }

    if (data.sch && !isNaN(parseFloat(data.sch))) {
      netAmount -= amount * (parseFloat(data.sch) / 100);
    }

    // Ensure we don't return NaN or invalid calculations
    if (isNaN(amount) || isNaN(netAmount)) {
      return {
        ...data,
        amount: '',
        netAmount: '',
      };
    }

    return {
      ...data,
      amount: amount.toFixed(2),
      netAmount: netAmount.toFixed(2),
    };
  };

  return (
    <div className={`mb-4 border rounded-lg overflow-hidden ${expanded ? 'border-brand-500' : 'border-gray-200 dark:border-gray-700'}`}>
      <div 
        className={`p-4 cursor-pointer flex justify-between items-center ${expanded ? 'bg-brand-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-900'}`}
        onClick={(e) => handleAccordionChange(index)(e, !expanded)}
      >
        <h3 className="text-lg font-medium dark:text-white">
          {item.item
            ? `${item.item} | ${item.selectedItem?.PRODUCT || 'No Product Name'}`
            : 'Select an item'}
        </h3>
        <div className="flex items-center">
          <button 
            type="button" 
            className="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            onClick={(e) => {
              e.stopPropagation();
              removeItem(index);
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            </svg>
          </button>
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className={`ml-2 transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <path d="m6 9 6 6 6-6"></path>
          </svg>
        </div>
      </div>
      
      {expanded && (
        <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div>
              <Autocomplete
                id={`item-${index}`}
                label="Item Name"
                options={pmplData.filter((item) => item.STK > 0).map((item) => ({
                  value: item.CODE,
                  label: `${item.CODE} | ${item.PRODUCT || 'No Product Name'}`
                }))}
                onChange={(value) => {
                  const selectedItem = pmplData.find(item => item.CODE === value);
                  if (selectedItem) handleItemChange(selectedItem);
                }}
                defaultValue={item.item}
              />
            </div>
            <div>
              <Input
                id={`stock-${index}`}
                label={`Total Stock (${item.unit || ''})`}
                value={
                  item.unit === item.selectedItem?.UNIT_2
                    ? Math.floor(parseInt(item.stock, 10) / parseInt(item.pcBx, 10)).toString()
                    : item.stock
                }
                disabled
                variant="outlined"
              />
            </div>
            <div>
              <Autocomplete
                id={`godown-${index}`}
                label="Godown"
                options={Object.keys(stockList[item.item] || {}).map((gdnCode) => {
                  const stock = stockList[item.item]?.[gdnCode] || '0';
                  const godown = godownOptions.find((gdn) => gdn.value === gdnCode);
                  return {
                    value: gdnCode,
                    label: `${godown?.label || ''} | Stock: ${stock}`
                  };
                })}
                onChange={handleGodownChange}
                defaultValue={item.godown}
              />
            </div>
            <div>
              <Input
                id={`pack-${index}`}
                label="Pack"
                value={item.pack}
                disabled
                variant="outlined"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
            <div>
              <Input
                id={`gst-${index}`}
                label="GST%"
                value={item.gst}
                disabled
                variant="outlined"
              />
            </div>
            <div className="relative">
              <div className={`relative border ${isFocused || item.unit ? 'border-brand-500 dark:border-brand-400' : 'border-gray-300 dark:border-gray-700'} rounded-lg transition-all duration-200`}>
                <select
                  id={`unit-${index}`}
                  className="w-full px-4 py-2.5 text-sm bg-transparent text-gray-800 dark:text-white appearance-none focus:outline-none"
                  value={item.unit}
                  onChange={(e) => handleUnitChange(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                >
                  {unitOptions.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <label 
                  htmlFor={`unit-${index}`} 
                  className={`absolute transition-all duration-200 pointer-events-none ${
                    isFocused || item.unit 
                      ? 'text-xs -top-2 left-2 px-1 text-brand-500 dark:text-brand-400 bg-white dark:bg-gray-900' 
                      : 'text-gray-500 dark:text-gray-400 top-1/2 -translate-y-1/2 left-4'
                  }`}
                >
                  Unit
                </label>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400">
                  <svg 
                    width="16" 
                    height="16" 
                    viewBox="0 0 16 16" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path 
                      d="M4 6L8 10L12 6" 
                      stroke="currentColor" 
                      strokeWidth="1.5" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            </div>
            <div>
              <Input
                id={`pcBx-${index}`}
                label="Pc/Bx"
                value={item.pcBx}
                disabled
                variant="outlined"
              />
            </div>
            <div>
              <Input
                id={`mrp-${index}`}
                label="M.R.P."
                value={item.mrp}
                disabled
                variant="outlined"
              />
            </div>
            <div>
              <Input
                id={`rate-${index}`}
                label="Rate"
                value={item.rate}
                onChange={(e) => handleFieldChange('rate', e.target.value)}
                variant="outlined"
              />
            </div>
            <div>
              <Input
                id={`qty-${index}`}
                label={`QTY (${item.unit || ''})`}
                value={item.qty}
                onChange={(e) => handleFieldChange('qty', e.target.value)}
                variant="outlined"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <div>
              <Input
                id={`cess-${index}`}
                label="Cess"
                value={item.cess}
                onChange={(e) => handleFieldChange('cess', e.target.value)}
                variant="outlined"
              />
            </div>
            <div>
              <Input
                id={`sch-${index}`}
                label="Sch%"
                value={item.sch}
                onChange={(e) => handleFieldChange('sch', e.target.value)}
                variant="outlined"
              />
            </div>
            <div>
              <Input
                id={`cd-${index}`}
                label="CD%"
                value={item.cd}
                onChange={(e) => handleFieldChange('cd', e.target.value)}
                variant="outlined"
              />
            </div>
            <div>
              <Input
                id={`amount-${index}`}
                label="Amount"
                value={item.amount}
                disabled
                variant="outlined"
              />
            </div>
            <div>
              <Input
                id={`netAmount-${index}`}
                label="Net Amount"
                value={item.netAmount}
                disabled
                variant="outlined"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollapsibleItemSection; 
