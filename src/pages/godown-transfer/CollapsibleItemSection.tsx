import React, { useState, useEffect, useRef, KeyboardEvent, forwardRef, useImperativeHandle } from 'react';
import Input, { InputRefHandle } from "../../components/form/input/Input";
import Autocomplete, { AutocompleteRefHandle } from "../../components/form/input/Autocomplete";

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
  shouldFocusOnExpand?: boolean;
  onQtyEnterNavigate?: () => void;
  onTabToNextItem?: (currentIndex: number) => void;
  onShiftTabToPreviousItem?: (currentIndex: number) => void;
}

interface StockItem {
  GDN_CODE: string;
  STOCK: number;
}

// Define handle types for the ref exposed by CollapsibleItemSection
export interface CollapsibleItemSectionRefHandle {
  focusItemName: () => void;
  focusQty: () => void;
}

const CollapsibleItemSection = forwardRef<CollapsibleItemSectionRefHandle, Props>(({
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
  originalQty,
  shouldFocusOnExpand = false,
  onQtyEnterNavigate,
  onTabToNextItem,
  onShiftTabToPreviousItem,
}, ref) => {
  const [error, setError] = useState('');
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [shouldFocusQty, setShouldFocusQty] = useState<boolean>(false);
  const [initialFocusHandled, setInitialFocusHandled] = useState<boolean>(false);

  const itemNameAutocompleteRef = useRef<AutocompleteRefHandle>(null);
  const qtyInputRef = useRef<InputRefHandle>(null);

  // Helper to center element in viewport
  const centerElementInViewport = (element: HTMLElement | null) => {
    if (!element) return;
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  };

  useImperativeHandle(ref, () => ({
    focusItemName: () => {
      if (itemNameAutocompleteRef.current) {
        itemNameAutocompleteRef.current.focus();
        centerElementInViewport(document.getElementById(`item-${index}`));
      }
    },
    focusQty: () => {
      if (qtyInputRef.current) {
        qtyInputRef.current.focus();
        centerElementInViewport(document.getElementById(`qty-${index}`));
      }
    }
  }));
  
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

  // Update unitOptions when item changes
  useEffect(() => {
    if (itemData.item) {
      const product = pmpl.find(p => p.CODE === itemData.item);
      if (product) {
        const units = [product.UNIT_1, product.UNIT_2].filter(Boolean);
        setUnitOptions(units);
      }
    }
  }, [itemData.item, pmpl]);

  // Focus qty field after item is selected (and expanded)
  useEffect(() => {
    if (shouldFocusQty && expanded === index && itemData.item && qtyInputRef.current) {
      setShouldFocusQty(false); // Consume the trigger
      setTimeout(() => {
        qtyInputRef.current?.focus();
        centerElementInViewport(document.getElementById(`qty-${index}`));
      }, 100); 
    }
  }, [shouldFocusQty, expanded, itemData.item, index]);

  // Auto-focus Item Name when the section is expanded due to being newly added
  useEffect(() => {
    if (expanded === index && shouldFocusOnExpand && !initialFocusHandled && itemNameAutocompleteRef.current) {
      itemNameAutocompleteRef.current.focus();
      centerElementInViewport(document.getElementById(`item-${index}`));
      setInitialFocusHandled(true); // Mark as handled
    }
  }, [expanded, shouldFocusOnExpand, index, initialFocusHandled]);

  // Reset initialFocusHandled if the item is collapsed or no longer the designated "new item"
  useEffect(() => {
    if (expanded !== index || !shouldFocusOnExpand) {
      setInitialFocusHandled(false);
    }
  }, [expanded, shouldFocusOnExpand, index]);

  // Get stock for a specific item and godown
  const getStockForItemAndGodown = (itemCode: string, godownCode: string): number => {
    // Check if stock data is available
    if (!stockData || !Object.keys(stockData).length) return 0;
    
    if (!stockData[itemCode] || stockData[itemCode][godownCode] === undefined) {
      return 0;
    }
    return stockData[itemCode][godownCode];
  };

  const handleItemChange = (value: string | null) => {
    // Clear the item if null value is passed (cross button clicked)
    if (!value) {
      updateItem(index, {
        item: '',
        stock: '',
        pack: '',
        gst: '',
        unit: '',
        pcBx: '',
        mrp: '',
        rate: '',
        qty: '',
        cess: '',
        cd: '',
        sch: '',
        amount: '',
        netAmount: '',
        godown: itemData.godown // Keep the godown selection
      });
      return;
    }

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

      // Set unit options
      const units = [selectedPMPL.UNIT_1, selectedPMPL.UNIT_2].filter(Boolean);
      setUnitOptions(units);

      const updatedData = {
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
      };

      updateItem(index, updatedData);
      
      // Focus on quantity field after item selection
      setShouldFocusQty(true);
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
    
    // Find the selected product to get MULT_F and unit info
    const product = pmpl.find(p => p.CODE === itemData.item);
    if (!product) {
      updateItem(index, {
        ...itemData,
        qty: value
      });
      return;
    }
    
    const multF = parseInt(product.MULT_F, 10) || 1;
    
    // Check if quantity is less than or equal to max allowed
    if (value && itemData.stock) {
      const qty = parseInt(value, 10);
      const origQty = originalQty ? parseInt(originalQty, 10) : 0;
      
      // Get current stock value and adjust for unit type
      const stockValue = parseInt(itemData.stock, 10);
      
      // Calculate maximum allowed quantity based on unit type
      let maxAllowedQty;
      
      if (itemData.unit === product.UNIT_2) {
        // Unit is BOX - divide stock by MULT_F to get max box count
        const maxBoxes = Math.floor((stockValue + (origQty * multF)) / multF);
        maxAllowedQty = Math.max(origQty, maxBoxes);
      } else {
        // Unit is PCS - direct comparison
        maxAllowedQty = Math.max(origQty, stockValue + origQty);
      }
      
      if (qty > maxAllowedQty) {
        // Different error message based on whether it's an original item or not
        if (isOriginalItem) {
          setError(`Quantity cannot exceed ${maxAllowedQty} (original: ${origQty}, stock: ${stockValue})`);
        } else {
          setError(`Quantity cannot exceed available stock (${maxAllowedQty} ${itemData.unit})`);
        }
        return;
      }
    }
    
    updateItem(index, {
      ...itemData,
      qty: value
    });
  };

  const handleSwapUnit = () => {
    if (unitOptions.length < 2 || !itemData.unit) return;
    
    // Find the product for MULT_F
    const product = pmpl.find(p => p.CODE === itemData.item);
    if (!product) return;
    
    // Find the other unit option that's not currently selected
    const otherUnit = unitOptions.find(unit => unit !== itemData.unit);
    if (!otherUnit) return;
    
    // Check if any quantity is already entered
    const currentQty = itemData.qty ? parseInt(itemData.qty, 10) : 0;
    const multF = parseInt(product.MULT_F, 10) || 1;
    
    // Convert quantity based on unit type
    let newQty = "";
    if (currentQty > 0) {
      if (itemData.unit === product.UNIT_1 && otherUnit === product.UNIT_2) {
        // Converting from PCS to BOX
        newQty = Math.floor(currentQty / multF).toString();
      } else if (itemData.unit === product.UNIT_2 && otherUnit === product.UNIT_1) {
        // Converting from BOX to PCS
        newQty = (currentQty * multF).toString();
      }
    }
    
    // Update item with new unit and converted quantity
    updateItem(index, {
      ...itemData,
      unit: otherUnit,
      qty: newQty
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
                         
        // Only include items that have stock in the godown
        return stockAmount > 0;
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
            <div 
              className="relative" style={{ zIndex: 1000 }}
              onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'Tab' && e.shiftKey) {
                  if (onShiftTabToPreviousItem) {
                    e.preventDefault();
                    onShiftTabToPreviousItem(index);
                  }
                }
              }}
            >
              <Autocomplete
                id={`item-${index}`}
                label="Item Name"
                options={getFilteredItems()}
                onChange={handleItemChange}
                defaultValue={itemData.item}
                ref={itemNameAutocompleteRef}
                onEnter={() => {
                  if (itemData.item) {
                    setShouldFocusQty(true);
                  }
                }}
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
            <div className="relative">
              <div className="relative border border-gray-300 dark:border-gray-700 rounded-lg transition-all duration-200 bg-white dark:bg-gray-800">
                <Input
                  id={`unit-${index}`}
                  label="Unit"
                  value={itemData.unit}
                  disabled
                  variant="outlined"
                  className="pr-10"
                />
                {unitOptions.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleSwapUnit();
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-500 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 p-1"
                    title="Swap Unit"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 16V4M7 4L3 8M7 4L11 8" />
                      <path d="M17 8v12m0-12l4-4m-4 4l-4-4" />
                    </svg>
                  </button>
                )}
              </div>
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
                type="text"
                inputMode="numeric"
                ref={qtyInputRef}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (onQtyEnterNavigate) {
                      onQtyEnterNavigate();
                    }
                  } else if (e.key === 'Tab' && !e.shiftKey) {
                    e.preventDefault();
                    if (onTabToNextItem) {
                      onTabToNextItem(index);
                    } else if (onQtyEnterNavigate) {
                      onQtyEnterNavigate();
                    }
                  }
                }}
              />
              {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default CollapsibleItemSection; 
