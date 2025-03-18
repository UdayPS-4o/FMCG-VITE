import React, { useState, useEffect } from 'react';
import Input from "../../components/form/input/Input";
import Autocomplete from "../../components/form/input/Autocomplete";

// Simple icon components
const ExpandMoreIcon = () => (
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
    className="text-blue-400"
  >
    <polyline points="6 9 12 15 18 9"></polyline>
  </svg>
);

const CancelIcon = () => (
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
  >
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="15" y1="9" x2="9" y2="15"></line>
    <line x1="9" y1="9" x2="15" y2="15"></line>
  </svg>
);

interface Props {
  itemData: any;
  pmplData: any[];
  pmpl: any[];
  index: number;
  updateItem: (index: number, data: any) => void;
  removeItem: (index: number) => void;
  expanded: number | false;
  handleChange: (panel: number) => (event: React.SyntheticEvent, isExpanded: boolean) => void;
}

interface StockItem {
  GDN_CODE: string;
  STOCK: number;
}

const CollapsibleItemSection: React.FC<Props> = ({
  itemData,
  pmplData,
  pmpl,
  index,
  updateItem,
  removeItem,
  expanded,
  handleChange,
}) => {
  const [error, setError] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  
  useEffect(() => {
    // If item and godown are set, update the stock value
    if (itemData && itemData.item && itemData.godown) {
      const product = pmpl.find((p) => p.CODE === itemData.item);
      if (product && product.stock) {
        const godownStock = product.stock.find(
          (s: StockItem) => s.GDN_CODE === itemData.godown
        );
        
        if (godownStock) {
          updateItem(index, {
            ...itemData,
            stock: godownStock.STOCK.toString()
          });
        }
      }
    }
  }, [itemData.item, itemData.godown, pmpl, index, updateItem]);

  const handleItemChange = (value: string) => {
    const selectedPMPL = pmpl.find(
      (product) => product.CODE === value
    );

    if (selectedPMPL) {
      // Get stock for the selected godown if available
      let stockValue = "";
      if (itemData.godown && selectedPMPL.stock) {
        const godownStock = selectedPMPL.stock.find(
          (s: StockItem) => s.GDN_CODE === itemData.godown && s.STOCK > 0
        );
        if (godownStock) {
          stockValue = godownStock.STOCK.toString();
        }
      }

      updateItem(index, {
        ...itemData,
        item: value,
        stock: stockValue,
        pack: selectedPMPL.PACK || "",
        gst: selectedPMPL.GST || "",
        unit: selectedPMPL.UNIT_1 || "",
        pcBx: selectedPMPL.MULT_F || "",
        mrp: selectedPMPL.MRP1 || "",
        rate: selectedPMPL.RATE1 || "",
        qty: ""
      });
    } else {
      updateItem(index, {
        ...itemData,
        item: value,
      });
    }
  };

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Only accept numbers
    if (value && !/^\d+$/.test(value)) {
      setError('Only numbers are allowed for quantity');
      return;
    }
    
    setError('');
    
    // Check if quantity is less than or equal to stock
    if (value && itemData.stock) {
      const qty = parseInt(value, 10);
      const stock = parseInt(itemData.stock, 10);
      
      if (qty > stock) {
        setError('Quantity cannot exceed available stock');
        return;
      }
    }
    
    updateItem(index, {
      ...itemData,
      qty: value
    });
  };

  const handleUnitChange = (value: string) => {
    updateItem(index, {
      ...itemData,
      unit: value,
    });
  };

  // Get available units for this item
  const getUnitOptions = () => {
    const product = pmpl.find(p => p.CODE === itemData.item);
    if (!product) return [];
    
    const options = [];
    if (product.UNIT_1) options.push({ value: product.UNIT_1, label: product.UNIT_1 });
    if (product.UNIT_2 && product.UNIT_2 !== product.UNIT_1) options.push({ value: product.UNIT_2, label: product.UNIT_2 });
    return options;
  };

  // Get product name for display
  const getProductName = () => {
    if (!itemData.item) return 'Unknown';
    const product = pmpl.find(p => p.CODE === itemData.item);
    return product?.PRODUCT || product?.NAME || 'Unknown';
  };

  // Get filtered items with non-zero stock
  const getFilteredItems = () => {
    if (!itemData.godown) return [];
    
    // Create a filtered list of products that have stock in the selected godown
    return pmpl
      .filter(product => {
        if (!product || !product.stock) return false;
        
        // Check if there's a stock entry for this godown with stock > 0
        const hasNonZeroStock = product.stock.some(
          (stockItem: StockItem) => 
            stockItem.GDN_CODE === itemData.godown && 
            stockItem.STOCK > 0
        );
        
        return hasNonZeroStock;
      })
      .map(product => ({
        value: product.CODE,
        label: `${product.CODE} | ${product.PRODUCT || product.NAME || 'Unknown'}`
      }));
  };

  const isExpanded = expanded === index;
  
  return (
    <div className="mb-4 border rounded-lg overflow-hidden bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div 
        className={`p-4 cursor-pointer flex justify-between items-center ${isExpanded ? 'bg-brand-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-900'}`}
        onClick={(e) => handleChange(index)(e, !isExpanded)}
      >
        <h3 className="text-lg font-medium dark:text-white">
          {itemData.item
            ? `${itemData.item} | ${getProductName()}`
            : `Select an item`}
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
            className={`ml-2 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          >
            <path d="m6 9 6 6 6-6"></path>
          </svg>
        </div>
      </div>
      
      {/* Content */}
      {isExpanded && (
        <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="relative" style={{ zIndex: 1000 }}>
              <Autocomplete
                id={`item-${index}`}
                label="Item Name"
                options={getFilteredItems()}
                onChange={handleItemChange}
                defaultValue={itemData.item}
                className="z-[1000]"
              />
              {!itemData.godown && (
                <p className="text-amber-600 text-xs mt-1">
                  Please select a From Godown first to see available items
                </p>
              )}
              {itemData.godown && getFilteredItems().length === 0 && (
                <p className="text-amber-600 text-xs mt-1">
                  No items with stock available in this godown
                </p>
              )}
            </div>
            <div>
              <Input
                id={`stock-${index}`}
                label="Total Stock"
                value={itemData.stock}
                disabled
                variant="outlined"
              />
            </div>
            <div>
              <Input
                id={`pack-${index}`}
                label="Pack"
                value={itemData.pack}
                disabled
                variant="outlined"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <div>
              <Input
                id={`gst-${index}`}
                label="GST%"
                value={itemData.gst}
                disabled
                variant="outlined"
              />
            </div>
            <div className="relative" style={{ zIndex: 900 }}>
              <Autocomplete
                id={`unit-${index}`}
                label="Unit"
                options={getUnitOptions()}
                onChange={handleUnitChange}
                defaultValue={itemData.unit}
                className="z-[900]"
              />
            </div>
            <div>
              <Input
                id={`pcBx-${index}`}
                label="Pc/Bx"
                value={itemData.pcBx}
                disabled
                variant="outlined"
              />
            </div>
            <div>
              <Input
                id={`mrp-${index}`}
                label="M.R.P."
                value={itemData.mrp}
                disabled
                variant="outlined"
              />
            </div>
            <div>
              <Input
                id={`rate-${index}`}
                label="Rate"
                value={itemData.rate}
                disabled
                variant="outlined"
              />
            </div>
            <div>
              <Input
                id={`qty-${index}`}
                label={`QTY (${itemData.unit || ''})`}
                value={itemData.qty}
                onChange={handleQuantityChange}
                variant="outlined"
              />
              {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollapsibleItemSection; 
