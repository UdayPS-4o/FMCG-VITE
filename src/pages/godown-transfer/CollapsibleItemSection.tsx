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

// Interface for stock data from API
interface StockData {
  [itemCode: string]: {
    [godownCode: string]: number;
  }
}

interface Props {
  itemData: any;
  pmplData: any[];
  pmpl: any[];
  index: number;
  updateItem: (index: number, data: any) => void;
  removeItem: (index: number) => void;
  expanded: number | false;
  handleChange: (panel: number) => (event: React.SyntheticEvent, isExpanded: boolean) => void;
  stockData?: StockData;
  isOriginalItem?: boolean;
  originalQty?: string;
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
  stockData = {},
  isOriginalItem,
  originalQty
}) => {
  const [error, setError] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  
  useEffect(() => {
    // If item and godown are set, update the stock value
    if (itemData && itemData.item && itemData.godown) {
      // Only try to set stock if the stockData object has been initialized
      const stockDataIsAvailable = stockData && Object.keys(stockData).length > 0;
      
      // Determine the new stock value only if stock data is available
      if (stockDataIsAvailable) {
        let newStockValue = "";
        
        // Use the stockData from props if available, otherwise fallback to legacy method
        if (stockData[itemData.item] && stockData[itemData.item][itemData.godown] !== undefined) {
          // This includes any adjustments made in the parent component
          newStockValue = stockData[itemData.item][itemData.godown].toString();
          console.log(`Setting stock for item ${itemData.item} in godown ${itemData.godown}: ${newStockValue}`);
        } else {
          // Legacy method (fallback)
          const product = pmpl.find((p) => p.CODE === itemData.item);
          if (product && product.stock) {
            const godownStock = product.stock.find(
              (s: StockItem) => s.GDN_CODE === itemData.godown
            );
            
            if (godownStock) {
              newStockValue = godownStock.STOCK.toString();
            }
          }
        }
        
        // Only update if the stock value has changed to prevent infinite loops
        if (newStockValue && newStockValue !== itemData.stock) {
          updateItem(index, {
            ...itemData,
            stock: newStockValue
          });
        }
      }
    }
  }, [itemData.item, itemData.godown, pmpl, index, updateItem, stockData, itemData.stock]);

  // Get stock for a specific item and godown
  const getStockForItemAndGodown = (itemCode: string, godownCode: string): number => {
    // Check if stock data is available
    if (!stockData || !Object.keys(stockData).length) return 0;
    
    if (!stockData[itemCode] || stockData[itemCode][godownCode] === undefined) {
      return 0;
    }
    return stockData[itemCode][godownCode];
  };

  const handleItemChange = (value: string) => {
    const selectedPMPL = pmpl.find(
      (product) => product.CODE === value
    );

    if (selectedPMPL) {
      // Get stock for the selected godown using the new stockData API
      let stockValue = "";
      if (itemData.godown && stockData && Object.keys(stockData).length > 0) {
        // Check if we have stock data from the API
        if (stockData[value] && stockData[value][itemData.godown] !== undefined) {
          stockValue = stockData[value][itemData.godown].toString();
        } 
        // Fallback to legacy method if needed
        else if (selectedPMPL.stock) {
          const godownStock = selectedPMPL.stock.find(
            (s: StockItem) => s.GDN_CODE === itemData.godown && s.STOCK > 0
          );
          if (godownStock) {
            stockValue = godownStock.STOCK.toString();
          }
        }
      }

      // Ensure we're using the actual unit text value, not a code
      let unitValue = selectedPMPL.UNIT_1 || "";
      
      // If the selected item has a unit value that's a code (like "01" or "02"),
      // map it to the actual text representation
      if (unitValue === "01" && selectedPMPL.UNIT_1) {
        unitValue = selectedPMPL.UNIT_1;
      } else if (unitValue === "02" && selectedPMPL.UNIT_2) {
        unitValue = selectedPMPL.UNIT_2;
      }

      updateItem(index, {
        ...itemData,
        item: value,
        stock: stockValue,
        pack: selectedPMPL.PACK || "",
        gst: selectedPMPL.GST || "",
        unit: unitValue,
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
    
    // Check if quantity is less than or equal to max allowed
    if (value && itemData.stock) {
      const qty = parseInt(value, 10);
      const stock = parseInt(itemData.stock, 10);
      const origQty = originalQty ? parseInt(originalQty, 10) : 0;
      
      // Allow quantity up to the maximum of either:
      // 1. Original quantity, or
      // 2. Current stock + original quantity
      const maxAllowedQty = Math.max(origQty, stock + origQty);
      
      if (qty > maxAllowedQty) {
        // Different error message based on whether it's an original item or not
        if (isOriginalItem) {
          setError(`Quantity cannot exceed ${maxAllowedQty} (original: ${origQty}, stock: ${stock})`);
        } else {
          setError(`Quantity cannot exceed available stock (${stock})`);
        }
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
    
    // Map unit codes to text values if needed
    let unit1 = product.UNIT_1;
    let unit2 = product.UNIT_2;
    
    // Check for numeric unit codes and transform them
    if (unit1 === "01" && product.UNIT_1_DESC) unit1 = product.UNIT_1_DESC;
    if (unit2 === "02" && product.UNIT_2_DESC) unit2 = product.UNIT_2_DESC;
    
    // Add units to options
    if (unit1) options.push({ value: unit1, label: unit1 });
    if (unit2 && unit2 !== unit1) options.push({ value: unit2, label: unit2 });
    
    // If no valid options were found, check if the current itemData.unit is valid
    if (options.length === 0 && itemData.unit) {
      options.push({ value: itemData.unit, label: itemData.unit });
    }
    
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
    if (!itemData.godown || !stockData || Object.keys(stockData).length === 0) return [];
    
    // Create a filtered list of products that have stock in the selected godown
    return pmpl
      .filter(product => {
        if (!product) return false;
        
        // Always include the currently selected item
        if (itemData.item && product.CODE === itemData.item) return true;
        
        // Check if there's stock in the selected godown using stockData API
        const stockAmount = stockData && stockData[product.CODE] ? 
                         stockData[product.CODE][itemData.godown] || 0 : 0;
                         
        if (stockAmount > 0) return true;
        
        // Fallback to legacy method if needed
        if (product.stock) {
          const hasNonZeroStock = product.stock.some(
            (stockItem: StockItem) => 
              stockItem.GDN_CODE === itemData.godown && 
              stockItem.STOCK > 0
          );
          return hasNonZeroStock;
        }
        
        return false;
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
