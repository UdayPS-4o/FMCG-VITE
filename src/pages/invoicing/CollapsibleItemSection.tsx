import React, { useEffect, useState, useRef, KeyboardEvent } from 'react';
import Autocomplete from '../../components/form/input/Autocomplete';
import Input from '../../components/form/input/Input';
import { useInvoiceContext, type ItemData } from '../../contexts/InvoiceContext';
import Toast from '../../components/ui/toast/Toast';

interface CollapsibleItemSectionProps {
  index: number;
  item: ItemData;
  expanded: boolean;
  handleAccordionChange: (panel: number) => (event: React.SyntheticEvent, isExpanded: boolean) => void;
  updateItem: (index: number, data: ItemData) => void;
  removeItem: (index: number) => void;
  showValidationErrors?: boolean;
}

const CollapsibleItemSection: React.FC<CollapsibleItemSectionProps> = ({
  index,
  item,
  expanded,
  handleAccordionChange,
  updateItem,
  removeItem,
  showValidationErrors = false,
}) => {
  const [unitOptions, setUnitOptions] = useState<string[]>([]);
  const [initialInteraction, setInitialInteraction] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  }>({
    visible: false,
    message: '',
    type: 'info',
  });
  
  // Use DOM-based approach for focus control
  const [shouldFocusGodown, setShouldFocusGodown] = useState<boolean>(false);
  const [shouldFocusQty, setShouldFocusQty] = useState<boolean>(false);
  
  // Get shared data from context
  const { pmplData, stockList, godownOptions, items } = useInvoiceContext();

  // Check if an item is incomplete (missing godown or qty)
  const isIncomplete = item.item && (!item.godown || !item.qty);
  
  // Only show validation errors if explicitly requested AND not the first interaction with this item
  const shouldShowValidation = showValidationErrors && isIncomplete && expanded && !initialInteraction;
  
  // Also mark collapsed incomplete items if validation errors are being shown and it's not the initial interaction
  const showRedOutline = showValidationErrors && isIncomplete && !initialInteraction;

  // Reset initialInteraction when index changes (new item) or when expanded status changes
  useEffect(() => {
    if (expanded) {
      // Reset initialInteraction to true when a section is newly expanded
      setInitialInteraction(true);
    }
  }, [expanded]);

  // Mark as not initial interaction when user collapses or navigates away
  useEffect(() => {
    if (!expanded && item.item && initialInteraction) {
      setInitialInteraction(false);
    }
  }, [expanded, item.item, initialInteraction]);

  useEffect(() => {
    // Initialize unitOptions when item or selectedItem changes
    if (item.selectedItem) {
      const units = [item.selectedItem.UNIT_1, item.selectedItem.UNIT_2].filter(Boolean);
      setUnitOptions(units);
    }
  }, [item.selectedItem]);

  // Focus qty field after godown selection
  useEffect(() => {
    if (shouldFocusQty && expanded && item.godown) {
      // Reset flag
      setShouldFocusQty(false);
      
      // Use setTimeout to ensure DOM is ready
      setTimeout(() => {
        const qtyInput = document.getElementById(`qty-${index}`);
        if (qtyInput) {
          qtyInput.focus();
        }
      }, 100);
    }
  }, [shouldFocusQty, expanded, item.godown, index]);

  // Handle Enter key for form field navigation
  useEffect(() => {
    // Add keyboard event listeners to the input fields
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        
        const fieldOrder = ['qty', 'schRs', 'sch', 'cd'];
        const currentId = (e.target as HTMLElement).id;
        
        // Extract the field name from the id (e.g., "qty-1" => "qty")
        const currentField = currentId.split('-')[0];
        
        // Find current field index
        const currentIndex = fieldOrder.indexOf(currentField);
        
        // If found and not the last field, move to the next one
        if (currentIndex >= 0 && currentIndex < fieldOrder.length - 1) {
          const nextFieldId = `${fieldOrder[currentIndex + 1]}-${index}`;
          const nextField = document.getElementById(nextFieldId);
          if (nextField) {
            nextField.focus();
          }
        }
      }
    };

    // Add event listeners to all the relevant inputs when the component is expanded
    if (expanded) {
      const qtyInput = document.getElementById(`qty-${index}`);
      const schRsInput = document.getElementById(`schRs-${index}`);
      const schInput = document.getElementById(`sch-${index}`);
      const cdInput = document.getElementById(`cd-${index}`);
      
      if (qtyInput) qtyInput.addEventListener('keydown', handleKeyDown as any);
      if (schRsInput) schRsInput.addEventListener('keydown', handleKeyDown as any);
      if (schInput) schInput.addEventListener('keydown', handleKeyDown as any);
      if (cdInput) cdInput.addEventListener('keydown', handleKeyDown as any);
      
      // Cleanup function to remove event listeners
      return () => {
        if (qtyInput) qtyInput.removeEventListener('keydown', handleKeyDown as any);
        if (schRsInput) schRsInput.removeEventListener('keydown', handleKeyDown as any);
        if (schInput) schInput.removeEventListener('keydown', handleKeyDown as any);
        if (cdInput) cdInput.removeEventListener('keydown', handleKeyDown as any);
      };
    }
  }, [expanded, index]);

  // New approach: Focus godown field using DOM when triggered
  useEffect(() => {
    if (shouldFocusGodown && expanded && item.item) {
      // Reset flag
      setShouldFocusGodown(false);
      
      // Before trying to focus, check if there's only one godown with stock
      // and auto-select it if that's the case
      if (stockList[item.item]) {
        const availableGodowns = Object.entries(stockList[item.item])
          .filter(([gdnCode, stock]) => gdnCode && parseInt(stock as string, 10) > 0);
        
        if (availableGodowns.length === 1) {
          // If there's only one godown available, auto-select it
          const [gdnCode] = availableGodowns[0];
          handleGodownChange(gdnCode);
          // Set focus to qty field instead of godown
          setShouldFocusQty(true);
          return;
        }
      }
      
      // If multiple godowns available, focus the godown dropdown
      setTimeout(() => {
        // Find godown dropdown by ID and interact with it
        const godownDropdown = document.getElementById(`godown-${index}`);
        if (godownDropdown) {
          godownDropdown.focus();
          
          // Simulate a click to open the dropdown
          godownDropdown.click();
        }
      }, 100);
    }
  }, [shouldFocusGodown, expanded, item.item, index, stockList]);

  const checkForDuplicateItem = (itemCode: string): { isDuplicate: boolean, existingItem?: ItemData, itemIndex?: number } => {
    // Skip check for empty items or self
    if (!itemCode) return { isDuplicate: false };
    
    for (let i = 0; i < items.length; i++) {
      if (i !== index && items[i].item === itemCode) {
        return { 
          isDuplicate: true, 
          existingItem: items[i],
          itemIndex: i
        };
      }
    }
    
    return { isDuplicate: false };
  };

  const handleItemChange = (newValue: any) => {
    if (!newValue) {
      // Reset all fields when item is cleared via the cross button in autocomplete
      const resetData = {
        item: '',
        godown: '', // Make sure godown is reset
        unit: '',
        stock: '',
        pack: '',
        gst: '',
        pcBx: '',
        mrp: '',
        rate: '',
        qty: '',
        cess: '',
        schRs: '',
        sch: '',
        cd: '',
        amount: '',
        netAmount: '',
        selectedItem: null,
        stockLimit: 0,
      };
      updateItem(index, resetData);
      
      // Force re-render of the component by using a key
      forceUpdate({});
      return;
    }

    const selectedItem = newValue;
    
    // Check if this item is already added in another section
    const { isDuplicate, existingItem, itemIndex } = checkForDuplicateItem(selectedItem.CODE);
    
    if (isDuplicate && existingItem) {
      // Show toast notification
      setToast({
        visible: true,
        message: `Item ${selectedItem.CODE} is already added with unit ${existingItem.unit} and qty ${existingItem.qty || 'not set'}`,
        type: 'warning',
      });
      
      // Clear the item selection
      const resetData = {
        item: '',
        godown: '', // Make sure godown is reset
        unit: '',
        stock: '',
        pack: '',
        gst: '',
        pcBx: '',
        mrp: '',
        rate: '',
        qty: '',
        cess: '',
        schRs: '',
        sch: '',
        cd: '',
        amount: '',
        netAmount: '',
        selectedItem: null,
        stockLimit: 0,
      };
      updateItem(index, resetData);
      return;
    }

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
      stock: totalStock > 0 ? totalStock.toString() : '', // Just show the total stock number
      stockLimit: 0, // Will be updated when godown is selected
      godown: '', // Reset godown when item changes
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

    // This is no longer an initial interaction once user has selected an item
    setInitialInteraction(false);
    
    setUnitOptions(units);
    updateItem(index, updatedData);
    
    // Trigger godown focus after item selection
    setShouldFocusGodown(true);
  };

  // Helper to force re-render
  const [, forceUpdate] = useState({});

  const handleGodownChange = (newValue: string | null) => {
    if (!newValue || !item.selectedItem) {
      // If godown is cleared, clear stock as well as qty
      const updatedData = {
        ...item,
        godown: '',
        stock: '',
        stockLimit: 0,
        qty: '', // Reset qty when godown is cleared
        amount: '', // Also reset calculated values
        netAmount: ''
      };
      updateItem(index, updatedData);
      return;
    }
    
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
      stock: totalStock > 0 ? `${totalStock}` : '', // Standardize format to just show the number
      stockLimit: stockLimit,
    };

    // Clear any previous errors
    setError('');
    
    updateItem(index, updatedData);

    // Set focus to qty field after godown selection
    setShouldFocusQty(true);
  };

  const handleSwapUnit = () => {
    if (unitOptions.length < 2 || !item.unit) return;
    
    // Find the other unit option that's not currently selected
    const otherUnit = unitOptions.find(unit => unit !== item.unit);
    if (!otherUnit) return;
    
    const updatedData = {
      ...item,
      unit: otherUnit,
    };

    // Recalculate stockLimit based on the new unit
    let stockLimit = 0;
    
    if (item.godown && item.selectedItem) {
      const godownStock = stockList[item.selectedItem.CODE]?.[item.godown] || '0';
      const stockValue = parseInt(godownStock, 10);
      
      if (otherUnit === item.selectedItem?.UNIT_2) {
        // Unit is BOX
        stockLimit = Math.floor(stockValue / parseInt(item.pcBx, 10));
      } else {
        // Unit is PCS
        stockLimit = stockValue;
      }
    }

    updatedData.stockLimit = stockLimit;

    // Check if the existing quantity exceeds the new stockLimit
    if (updatedData.qty && parseInt(updatedData.qty, 10) > stockLimit) {
      updatedData.qty = stockLimit.toString();
      // Show a message about the automatic adjustment
      setError(`Quantity adjusted to maximum available: ${stockLimit} ${otherUnit}`);
    } else {
      setError('');
    }

    updateItem(index, calculateAmounts(updatedData));
  };

  const handleFieldChange = (name: string, newValue: string) => {
    if (name === 'qty') {
      // Only accept numbers
      if (newValue && !/^\d*$/.test(newValue)) {
        setError('Only numbers are allowed for quantity');
        return;
      }

      if (newValue === '') {
        const updatedData = { ...item, qty: '', amount: '', netAmount: '' };
        updateItem(index, updatedData);
        setError('');
        return;
      }

      const totalQty = parseInt(newValue, 10);
      if (!isNaN(totalQty)) {
        const stockLimit = item.stockLimit;
        
        // Special case: If unit is BOX and stockLimit is 0 (not enough items to make a box)
        if (item.selectedItem && item.unit === item.selectedItem.UNIT_2 && stockLimit === 0) {
          setError(`Not enough stock to make a complete box (need ${item.pcBx} pieces per box)`);
          return;
        }
        
        // Enforce stock limit - don't allow values greater than stock limit
        if (stockLimit > 0 && totalQty > stockLimit) {
          // Don't update with a value beyond the stock limit
          setError(`Quantity cannot exceed available stock (${stockLimit} ${item.unit})`);
          return;
        }
        
        // Valid quantity within stock limit - update and clear error
        const updatedData = { ...item, qty: totalQty.toString() };
        updateItem(index, calculateAmounts(updatedData));
        setError('');
        return;
      }

      // Handle NaN case
      setError('Please enter a valid number');
      return;
    }

    // For other fields (not qty)
    let updatedData = { ...item, [name]: newValue };
    if (['rate', 'schRs', 'cd', 'sch'].includes(name)) {
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
    const multF = selectedItem ? parseInt(selectedItem.MULT_F, 10) : 1;

    if (selectedItem) {
      if (data.unit === selectedItem.UNIT_2) {
        // Unit is BOX - multiply qty by MULT_F
        amount = rate * (qty * multF);
      } else {
        // Unit is PCS - direct multiplication
        amount = rate * qty;
      }
    } else {
      amount = rate * qty;
    }

    let netAmount = amount;

    // Process scheme percentage discount
    if (data.sch && !isNaN(parseFloat(data.sch))) {
      netAmount -= amount * (parseFloat(data.sch) / 100);
    }

    // Process scheme amount discount (previously CESS)
    if (data.schRs && !isNaN(parseFloat(data.schRs))) {
      netAmount -= parseFloat(data.schRs);
    }

    // Process cash discount percentage
    if (data.cd && !isNaN(parseFloat(data.cd))) {
      netAmount -= amount * (parseFloat(data.cd) / 100);
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
    <div className={`mb-4 border rounded-lg ${showRedOutline ? 'border-red-500' : expanded ? 'border-brand-500' : 'border-gray-200 dark:border-gray-700'}`}>
      <Toast         
        message={toast.message}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast({ ...toast, visible: false })}
      />
      
      <div 
        className={`p-4 cursor-pointer flex justify-between items-center ${expanded ? 'bg-brand-50 dark:bg-gray-800' : showRedOutline ? 'bg-red-50 dark:bg-red-900/20' : 'bg-white dark:bg-gray-900'}`}
        onClick={(e) => handleAccordionChange(index)(e, !expanded)}
      >
        <h3 className={`text-lg font-medium dark:text-white ${item.item ? 'text-brand-600 dark:text-brand-400' : ''} ${showRedOutline ? 'text-red-600 dark:text-red-400' : ''} truncate flex-1 pr-4`} title={item.item ? `${item.item} | ${item.selectedItem?.PRODUCT || 'No Product Name'}` : 'Select an item'}>
          {item.item
            ? `${item.item} | ${item.selectedItem?.PRODUCT || 'No Product Name'}`
            : 'Select an item'}
        </h3>
        <div className="flex items-center shrink-0">
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
        <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 relative">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="relative" style={{ zIndex: 100 }}>
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
                  else handleItemChange(null); // This handles the case when the clear button (x) is clicked
                }}
                defaultValue={item.item}
              />
            </div>
            <div>
              <Input
                id={`stock-${index}`}
                label="Total Stock"
                value={item.stock}
                disabled
                variant="outlined"
              />
            </div>
            <div className="relative" style={{ zIndex: 90 }}>
              <Autocomplete
                id={`godown-${index}`}
                label="Godown"
                key={`godown-${index}-${item.item || 'empty'}`} 
                className={shouldShowValidation && item.item && !item.godown ? "border-red-500" : ""}
                options={Object.entries(stockList[item.item] || {})
                  .filter(([gdnCode, stock]) => gdnCode && parseInt(stock as string, 10) > 0)
                  .map(([gdnCode, stock]) => {
                    const godown = godownOptions.find((gdn) => gdn.value === gdnCode);
                    return {
                      value: gdnCode,
                      label: `${godown?.label || ''} | ${stock}`
                    };
                  })}
                onChange={handleGodownChange}
                defaultValue={item.godown}
              />
              {shouldShowValidation && item.item && !item.godown && (
                <p className="text-xs text-red-500 mt-1">Godown is required</p>
              )}
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
              <div className="relative border border-gray-300 dark:border-gray-700 rounded-lg transition-all duration-200 bg-white dark:bg-gray-800">
                <Input
                  id={`unit-${index}`}
                  label="Unit"
                  value={item.unit}
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
                disabled={!item.godown} 
                className={`${shouldShowValidation && item.item && !item.qty ? "border-red-500" : ""} ${error ? "border-red-500" : ""}`}
              />
              {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
              {shouldShowValidation && item.item && !item.qty && !error && (
                <p className="text-xs text-red-500 mt-1">Quantity is required</p>
              )}
              {!item.godown && item.item && item.qty && (
                <p className="text-xs text-amber-500 mt-1">Select a godown first</p>
              )}
              {item.godown && item.stockLimit > 0 && (
                <p className="text-xs text-gray-500 mt-1">Available: {item.stockLimit} {item.unit}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <div>
              <Input
                id={`schRs-${index}`}
                label="SCH (RS)"
                value={item.schRs}
                onChange={(e) => handleFieldChange('schRs', e.target.value)}
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
