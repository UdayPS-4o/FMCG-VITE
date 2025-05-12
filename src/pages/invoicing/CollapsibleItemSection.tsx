import React, { useEffect, useState, useRef, KeyboardEvent, forwardRef, useImperativeHandle, useMemo } from 'react';
import Autocomplete, { AutocompleteRefHandle } from '../../components/form/input/Autocomplete';
import Input, { InputRefHandle } from '../../components/form/input/Input';
import { useInvoiceContext, type ItemData } from '../../contexts/InvoiceContext';
import Toast from '../../components/ui/toast/Toast';
import constants from '../../constants'; // Added import for constants

// Replace scrollIntoViewIfNeeded with centerElementInViewport
const centerElementInViewport = (element: HTMLElement) => {
  if (!element) return;
  
  // Use the more powerful scrollIntoView with {block: 'center'} option
  // This will center the element vertically in the viewport
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center' 
  });
};

interface CollapsibleItemSectionProps {
  index: number;
  item: ItemData;
  expanded: boolean;
  partyCode: string | null; // Added partyCode prop
  handleAccordionChange: (panel: number) => (event: React.SyntheticEvent, isExpanded: boolean) => void;
  updateItem: (index: number, data: ItemData) => void;
  removeItem: (index: number) => void;
  showValidationErrors?: boolean;
  onCdPressNavigate?: () => void; // Callback to focus Add Another Item button
  // Prop to indicate if this section should auto-focus its item name (e.g., when newly added)
  shouldFocusOnExpand?: boolean; 
  // Add new props for inter-item navigation
  onTabToNextItem?: (currentIndex: number) => void;
  onShiftTabToPreviousItem?: (currentIndex: number) => void;
}

// Define handle types for the ref exposed by CollapsibleItemSection
export interface CollapsibleItemSectionRefHandle {
  focusItemName: () => void;
  focusGodown: () => void;
  focusQty: () => void;
  focusCdInput: () => void;
}

const CollapsibleItemSection = forwardRef<CollapsibleItemSectionRefHandle, CollapsibleItemSectionProps>(({
  index,
  item,
  expanded,
  partyCode, // Destructure partyCode from props
  handleAccordionChange,
  updateItem,
  removeItem,
  showValidationErrors = false,
  onCdPressNavigate,
  shouldFocusOnExpand = false,
  // Add new props for inter-item navigation
  onTabToNextItem,
  onShiftTabToPreviousItem,
}, ref) => {
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
  const [tooltipData, setTooltipData] = useState<any>(null); // State for tooltip data
  const [activeTooltipField, setActiveTooltipField] = useState<string | null>(null); // State for active tooltip
  
  // State to track if initial focus (on expand) has been handled
  const [initialFocusHandled, setInitialFocusHandled] = useState<boolean>(false);

  // Use DOM-based approach for focus control
  const [shouldFocusGodownDOM, setShouldFocusGodownDOM] = useState<boolean>(false);
  const [shouldFocusQtyDOM, setShouldFocusQtyDOM] = useState<boolean>(false);
  
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

  // Ref to track if swap unit was focused by Enter on Godown
  const swapUnitFocusedByEnter = useRef(false);

  // Focus qty field after godown selection
  useEffect(() => {
    if (shouldFocusQtyDOM && expanded && item.godown && qtyInputRef.current) {
      if (swapUnitFocusedByEnter.current) { // If swap unit was just focused by Enter on Godown
        setShouldFocusQtyDOM(false);      // Consume the trigger but do not focus QTY
        // swapUnitFocusedByEnter.current is reset in handleGodownEnter after a timeout
        return;
      }
      setShouldFocusQtyDOM(false); // Consume the trigger
      setTimeout(() => {
        qtyInputRef.current?.focus();
        const inputElement = document.getElementById(`qty-${index}`);
        if (inputElement) {
          centerElementInViewport(inputElement);
        }
      }, 100); 
    }
  }, [shouldFocusQtyDOM, expanded, item.godown, index]); // swapUnitFocusedByEnter.current is not a dependency here

  // Helper to force re-render
  const [, forceUpdate] = useState({});

  const handleGodownChange = (newValue: string | null) => {
    const godownCode = newValue || '';
    let currentGodownStock = 0;
    if (item.item && godownCode && stockList[item.item] && stockList[item.item][godownCode]) {
      currentGodownStock = parseInt(stockList[item.item][godownCode] as string, 10);
      if (isNaN(currentGodownStock)) currentGodownStock = 0;
    }

    updateItem(index, { 
      ...item, 
      godown: godownCode,
      // item.stock is for the "Total Stock" display field, which shows overall stock for the item
      // item.stockLimit is the crucial one for QTY validation based on *selected* godown
      stockLimit: currentGodownStock, // Set stockLimit to current godown's stock
      // qty: '', // Optionally reset qty, or let user adjust
    });
    setInitialInteraction(false);
    // If godown is selected, attempt to focus Qty
    if (godownCode) {
      setShouldFocusQtyDOM(true);
    }
  };

  const handleSwapUnit = () => {
    if (item.selectedItem && unitOptions.length > 1) {
      const selectedItem = item.selectedItem;
      const currentUnit = item.unit;
      // Find the unit to switch to (the one that is not the current unit)
      const newUnit = unitOptions.find(u => u !== currentUnit);

      if (!newUnit) return; // Should ideally not happen if unitOptions.length > 1

      let newRateString = item.rate; // Default to current rate string
      const newPackString = selectedItem.PACK || ''; // Pack value is consistently from selectedItem.PACK

      if (newUnit === selectedItem.UNIT_1) { // If switching to the primary unit (e.g., PCS)
        newRateString = selectedItem.RATE1 || '0';
      } else if (newUnit === selectedItem.UNIT_2) { // If switching to the secondary unit (e.g., BOX)
        // Ensure RATE1 and MULT_F are available for calculation
        if (selectedItem.RATE1 && selectedItem.MULT_F) {
          const rate1 = parseFloat(selectedItem.RATE1);
          const multF = parseFloat(selectedItem.MULT_F);
          if (!isNaN(rate1) && !isNaN(multF) && multF !== 0) {
            newRateString = (rate1 * multF).toFixed(2);
          } else {
            newRateString = '0'; // Fallback if conversion fails or multF is 0
          }
        } else {
          // If RATE1 or MULT_F is missing for UNIT_2 calculation, keep current rate or set to 0
          // This case depends on whether pmplData might have a direct RATE_2. For now, stick to MULT_F logic.
          newRateString = selectedItem.RATE2 || '0'; // Or keep item.rate if RATE_2 is not a field
        }
      }

      updateItem(index, { ...item, unit: newUnit, rate: newRateString, pack: newPackString });
    }
  };

  const calculateAmounts = (data: ItemData): ItemData => {
    const rate = parseFloat(data.rate || '0');
    const qty = parseFloat(data.qty || '0');
    const schRs = parseFloat(data.schRs || '0');
    const schP = parseFloat(data.sch || '0');
    const cdP = parseFloat(data.cd || '0');

    let amount = qty * rate;
    let schemeValue = (qty * schRs) + (amount * schP / 100);
    let netAmountBeforeCd = amount - schemeValue;
    let cdValue = netAmountBeforeCd * cdP / 100;
    let finalAmount = netAmountBeforeCd - cdValue;

    return {
      ...data,
      amount: amount.toFixed(2),
      netAmount: finalAmount.toFixed(2),
    };
  };

  const handleFieldChange = (name: string, newValue: string) => {
    let updatedData = { ...item, [name]: newValue };
    if (name === 'qty' || name === 'rate' || name === 'schRs' || name === 'sch' || name === 'cd') {
      if (name === 'qty' && parseInt(newValue) > item.stockLimit) {
        setError(`Quantity cannot exceed available stock of ${item.stockLimit}`);
      } else {
        setError('');
      }
      updatedData = calculateAmounts(updatedData);
    }
    updateItem(index, updatedData);
    if (name === 'qty') setInitialInteraction(false);
  };

  // useEffect for focusing godown field (remains largely the same, ensure it doesn't conflict)
  useEffect(() => {
    if (shouldFocusGodownDOM && expanded && item.item) {
      setShouldFocusGodownDOM(false); 
      let autoSelectedGodown = false;
      if (stockList[item.item]) {
        const availableGodowns = Object.entries(stockList[item.item])
          .filter(([gdnCode, stock]) => godownOptions.some(g => g.value === gdnCode) && gdnCode && parseInt(stock as string, 10) > 0);
        if (availableGodowns.length === 1) {
          const [gdnCode] = availableGodowns[0];
          handleGodownChange(gdnCode); 
          // handleGodownChange now sets setShouldFocusQtyDOM(true), which will trigger the QTY focus useEffect
          autoSelectedGodown = true;
        }
      }

      if (!autoSelectedGodown) {
        const godownElementWrapper = document.getElementById(`godown-${index}`);
        if (godownAutocompleteRef.current && godownElementWrapper) {
          godownAutocompleteRef.current.focus();
          setTimeout(() => {
            centerElementInViewport(godownElementWrapper);
          }, 50); 
        }
      }
    }
  }, [shouldFocusGodownDOM, expanded, item.item, stockList, godownOptions, handleGodownChange, index, item.selectedItem]);

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

  const handleItemChange = (selectedPmplItem: any | null) => {
    if (!selectedPmplItem) {
      // Item deselected or cleared
      updateItem(index, {
        ...item,
        item: '',
        selectedItem: null,
        unit: '',
        pack: '',
        gst: '',
        pcBx: '',
        mrp: '',
        rate: '',
        cess: '',
        schRs: '',
        sch: '',
        cd: '',
        amount: '0.00',
        netAmount: '0.00',
        stock: '', 
        stockLimit: 0, 
      });
      setUnitOptions([]);
      itemNameAutocompleteRef.current?.focus(); // Using correct ref name
      return;
    }

    const productCode = selectedPmplItem.CODE;

    const { isDuplicate, existingItem, itemIndex: duplicateItemIndex } = checkForDuplicateItem(productCode);
    if (isDuplicate && existingItem && duplicateItemIndex !== undefined) {
      setToast({
        visible: true,
        message: `Item ${selectedPmplItem.PRODUCT} is already added at position ${duplicateItemIndex + 1}.`,
        type: 'warning',
      });
      updateItem(index, {
        ...item, 
        item: '', selectedItem: null, unit: '', pack: '', gst: '', pcBx: '', rate: '', stock: '', stockLimit: 0
      });
      setTimeout(() => itemNameAutocompleteRef.current?.focus(), 0); // Using correct ref name
      return;
    }

    const units = [selectedPmplItem.UNIT_1, selectedPmplItem.UNIT_2].filter(Boolean);
    setUnitOptions(units);
    const initialUnit = selectedPmplItem.UNIT_1 || '';
    const initialRate = selectedPmplItem.RATE1 || '0';
    const initialPack = selectedPmplItem.PACK || '';

    // Calculate total stock (fixing TypeScript error)
    let totalStockForItem = 0;
    if (selectedPmplItem.CODE && stockList[selectedPmplItem.CODE]) {
      const itemStockObject = stockList[selectedPmplItem.CODE];
      if (typeof itemStockObject === 'object' && itemStockObject !== null) {
        // Extract values as array first, then iterate through them
        const stockValues = Object.values(itemStockObject);
        for (let i = 0; i < stockValues.length; i++) {
          const stockValue = stockValues[i] as string;
          const stockNum = parseInt(stockValue, 10) || 0;
          totalStockForItem += stockNum;
        }
      }
    }
    
    // Determine initial stockLimit based on currently selected godown (if any)
    let currentGodownStock = 0;
    if (item.godown && stockList[selectedPmplItem.CODE] && stockList[selectedPmplItem.CODE][item.godown]) {
      currentGodownStock = parseInt(stockList[selectedPmplItem.CODE][item.godown] as string, 10);
      if (isNaN(currentGodownStock)) currentGodownStock = 0;
    }

    let updatedItemData = {
      ...item,
      item: selectedPmplItem.CODE,
      selectedItem: selectedPmplItem,
      unit: initialUnit,
      pack: initialPack,
      gst: selectedPmplItem.GST || '',
      pcBx: selectedPmplItem.MULT_F || '',
      mrp: selectedPmplItem.MRP1 || '',
      rate: initialRate,
      stock: totalStockForItem.toString(), // For "Total Stock" display field
      stockLimit: currentGodownStock, // Initial stock limit based on current godown
       // Do not reset qty here, allow user to input
    };

    updatedItemData = calculateAmounts(updatedItemData); // Recalculate amounts with new rate/item details

    updateItem(index, updatedItemData);
    setInitialInteraction(false);

    // Fetch tooltip data if productCode and partyCode are available
    if (productCode && partyCode) {
      const url = `${constants.baseURL}/tooltip/${productCode}/${partyCode}`;
      const token = localStorage.getItem('token');

      console.log(`Fetching tooltip data from: ${url} with partyCode: ${partyCode} and productCode: ${productCode}`);

      fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      .then(response => {
        if (!response.ok) {
          // Log more details on error
          response.json().then(errData => {
            console.error('Tooltip API response error data:', errData);
          }).catch(() => {
            // If response body is not JSON or empty
            console.error('Tooltip API response was not OK and body could not be parsed as JSON or was empty. Status:', response.status);
          });
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('Tooltip data received:', data);
        setTooltipData(data); // Store fetched data
      })
      .catch(error => {
        console.error('Error fetching tooltip data:', error);
        setTooltipData(null); // Clear data on error
      });
    }

    // If no godown selected yet, or if godown auto-selection fails, focus godown. Otherwise, qty will be focused.
    if (!item.godown) {
      setShouldFocusGodownDOM(true);
    } else if (currentGodownStock > 0) { // If there was a godown and it has stock
        setShouldFocusQtyDOM(true);
    } else { // If there was a godown but it has no stock for the new item
        setShouldFocusGodownDOM(true); // Prompt to re-select godown
    }
  };

  // Refs for focusable elements within the item section
  const itemNameAutocompleteRef = useRef<AutocompleteRefHandle>(null);
  const godownAutocompleteRef = useRef<AutocompleteRefHandle>(null);
  const qtyInputRef = useRef<InputRefHandle>(null);
  const schRsInputRef = useRef<InputRefHandle>(null);
  const schInputRef = useRef<InputRefHandle>(null);
  const cdInputRef = useRef<InputRefHandle>(null);
  const swapUnitButtonRef = useRef<HTMLButtonElement>(null);
  const rateInputRef = useRef<InputRefHandle>(null);

  // Expose methods via the ref
  useImperativeHandle(ref, () => ({
    focusItemName: () => {
      if (itemNameAutocompleteRef.current) {
        itemNameAutocompleteRef.current.focus();
        const el = document.getElementById(`item-${index}`);
        if (el) centerElementInViewport(el);
      }
    },
    focusGodown: () => {
      if (godownAutocompleteRef.current) {
        godownAutocompleteRef.current.focus();
        const el = document.getElementById(`godown-${index}`);
        if (el) centerElementInViewport(el);
      }
    },
    focusQty: () => {
      if (qtyInputRef.current) {
        qtyInputRef.current.focus();
        const el = document.getElementById(`qty-${index}`);
        if (el) centerElementInViewport(el);
      }
    },
    focusCdInput: () => {
      // Check if CD field is enabled, otherwise fallback to QTY
      if (!cdInputRef.current || item.qty === '') {
        if (qtyInputRef.current) {
          qtyInputRef.current.focus();
          const el = document.getElementById(`qty-${index}`);
          if (el) centerElementInViewport(el);
        }
        return;
      }
      
      // Focus CD field if it's enabled
      cdInputRef.current.focus();
      const el = document.getElementById(`cd-${index}`);
      if (el) centerElementInViewport(el);
    }
  }));

  // Auto-focus Item Name when the section is expanded due to being newly added
  useEffect(() => {
    if (expanded && shouldFocusOnExpand && !initialFocusHandled && itemNameAutocompleteRef.current) {
      itemNameAutocompleteRef.current.focus();
      const inputElement = document.getElementById(`item-${index}`);
      if (inputElement) {
        centerElementInViewport(inputElement);
      }
      setInitialFocusHandled(true); // Mark as handled
    }
  }, [expanded, shouldFocusOnExpand, index, initialFocusHandled]);

  // Reset initialFocusHandled if the item is collapsed or no longer the designated "new item"
  useEffect(() => {
    if (!expanded || !shouldFocusOnExpand) {
      setInitialFocusHandled(false);
    }
  }, [expanded, shouldFocusOnExpand]);

  // Action for Item Name Autocomplete Enter
  const handleItemNameEnter = () => {
    setInitialInteraction(false);
    if (item.item && !item.godown) {
      setShouldFocusGodownDOM(true); // Trigger godown auto-selection or focus
    } else if (item.item && item.godown && qtyInputRef.current) {
      qtyInputRef.current.focus(); // If godown already selected (e.g. auto-selected), focus QTY
    }
  };
  
  // Action for Godown Autocomplete Enter
  const handleGodownEnter = () => {
    setInitialInteraction(false);
    if (unitOptions.length > 1 && item.selectedItem?.UNIT_2 && swapUnitButtonRef.current) {
      swapUnitButtonRef.current.focus();
      const unitButtonEl = swapUnitButtonRef.current;
      if (unitButtonEl) centerElementInViewport(unitButtonEl);
      swapUnitFocusedByEnter.current = true; // Signal that swap unit was focused by Enter
      // Reset this signal after a short delay allowing the QTY focus useEffect to check it
      setTimeout(() => { swapUnitFocusedByEnter.current = false; }, 60); // Slightly longer than godown focus timeout
    }
  };

  // Add a local key to force re-render of Autocomplete when item is cleared
  const [itemAutocompleteKey, setItemAutocompleteKey] = useState(0);

  // Prepare godown options for Autocomplete based on current item
  const availableGodownsForCurrentItem = useMemo(() => {
    if (!item.item || !stockList[item.item]) {
      return [];
    }
    // Map over godownOptions (which are already filtered by user access)
    return godownOptions
      .map(gdnOption => {
        const stockInGodown = parseInt(stockList[item.item][gdnOption.value] as string, 10) || 0;
        return {
          code: gdnOption.value,
          name: gdnOption.label, // label from godownOptions is just the name
          stockInGodown: stockInGodown,
        };
      })
      .filter(gdn => gdn.stockInGodown > 0); // Only show godowns where current item has stock > 0
  }, [item.item, stockList, godownOptions]);

  const formatDateForTooltip = (isoDateString: string | undefined): string => {
    if (!isoDateString) return 'N/A';
    try {
      const date = new Date(isoDateString);
      const day = date.getDate().toString().padStart(2, '0');
      const month = date.toLocaleString('default', { month: 'short' }).toUpperCase();
      return `${day} ${month}`;
    } catch (e) {
      console.error("Error formatting date for tooltip:", e);
      return 'N/A';
    }
  };

  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipPositionStyle, setTooltipPositionStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  // Renamed from renderTooltip to renderTooltipContent
  // This function now ONLY returns the inner content of the tooltip
  const renderTooltipContent = (fieldType: 'schRs' | 'schP' | 'rate') => {
    if (!tooltipData) return null;

    if (fieldType === 'schRs') {
      return (
        <>
          <div>Last Scheme (Rs): {tooltipData.SCHEME !== undefined ? tooltipData.SCHEME : 'N/A'}</div>
          <div>Last Qty: {tooltipData.QTY !== undefined ? tooltipData.QTY : 'N/A'}</div>
          <div>Last Rate: {tooltipData.RATE !== undefined ? tooltipData.RATE : 'N/A'}</div>
        </>
      );
    } else if (fieldType === 'schP') {
      return (
        <>
          <div>Last Discount (%): {tooltipData.DISCOUNT !== undefined ? tooltipData.DISCOUNT : 'N/A'}</div>
          <div>Last Qty: {tooltipData.QTY !== undefined ? tooltipData.QTY : 'N/A'}</div>
          <div>Last Rate: {tooltipData.RATE !== undefined ? tooltipData.RATE : 'N/A'}</div>
        </>
      );
    } else if (fieldType === 'rate') {
      const billNo = tooltipData.BILL_BB || 'N/A';
      const date = formatDateForTooltip(tooltipData.DATE);
      const rateVal = tooltipData.RATE !== undefined ? tooltipData.RATE : 'N/A'; // Renamed to avoid conflict
      const qty = tooltipData.QTY !== undefined ? tooltipData.QTY : 'N/A';
      const schRs = tooltipData.SCHEME !== undefined ? tooltipData.SCHEME : '0';
      const schP = tooltipData.DISCOUNT !== undefined ? tooltipData.DISCOUNT : '0';
      const cdP = tooltipData.CASH_DIS !== undefined ? tooltipData.CASH_DIS : '0';

      return (
        <div 
          onClick={() => {
            console.log('[Tooltip Click Debug] Tooltip div clicked.');
            console.log('[Tooltip Click Debug] Current tooltipData:', tooltipData);
            if (tooltipData) {
              console.log('[Tooltip Click Debug] tooltipData is valid. Constructing new item data.');
              
              const updatedItemFields: ItemData = {
                ...item,
                rate: (tooltipData.RATE !== undefined ? tooltipData.RATE : '0').toString(),
                schRs: (tooltipData.SCHEME !== undefined ? tooltipData.SCHEME : '0').toString(),
                sch: (tooltipData.DISCOUNT !== undefined ? tooltipData.DISCOUNT : '0').toString(),
                cd: (tooltipData.CASH_DIS !== undefined ? tooltipData.CASH_DIS : '0').toString(),
              };

              console.log('[Tooltip Click Debug] New item data before calculation:', updatedItemFields);
              const finalData = calculateAmounts(updatedItemFields);
              console.log('[Tooltip Click Debug] Data after calculation:', finalData);
              updateItem(index, finalData);
              console.log('[Tooltip Click Debug] Item updated via updateItem.');
              setInitialInteraction(false);
              setActiveTooltipField(null);
            } else {
              console.log('[Tooltip Click Debug] tooltipData is null or undefined. Not updating fields.');
            }
          }}
          className="cursor-pointer"
        >
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="border border-gray-600 px-2 py-1 bg-black">Bill No</th>
                <th className="border border-gray-600 px-2 py-1 bg-black">Date</th>
                <th className="border border-gray-600 px-2 py-1 bg-black">Rate</th>
                <th className="border border-gray-600 px-2 py-1 bg-black">Qty</th>
                <th className="border border-gray-600 px-2 py-1 bg-black">Sch(Rs)</th>
                <th className="border border-gray-600 px-2 py-1 bg-black">Sch(%)</th>
                <th className="border border-gray-600 px-2 py-1 bg-black">CD(%)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-600 px-2 py-1 bg-black">{billNo}</td>
                <td className="border border-gray-600 px-2 py-1 bg-black">{date}</td>
                <td className="border border-gray-600 px-2 py-1 bg-black">{rateVal}</td>
                <td className="border border-gray-600 px-2 py-1 bg-black">{qty}</td>
                <td className="border border-gray-600 px-2 py-1 bg-black">{schRs}</td>
                <td className="border border-gray-600 px-2 py-1 bg-black">{schP}</td>
                <td className="border border-gray-600 px-2 py-1 bg-black">{cdP}</td>
              </tr>
            </tbody>
          </table>
        </div>
      );
    }
    return null; // Fallback if fieldType is not matched
  };

  useEffect(() => {
    if (activeTooltipField && tooltipRef.current) {
      let fieldType: 'schRs' | 'schP' | 'rate' | null = null;
      let triggerInputId: string | null = null;

      if (activeTooltipField.startsWith('schRs-')) {
        fieldType = 'schRs';
        triggerInputId = activeTooltipField;
      } else if (activeTooltipField.startsWith('schP-')) {
        fieldType = 'schP';
        triggerInputId = activeTooltipField.replace('schP-', 'sch-'); // Map state key to actual DOM ID
      } else if (activeTooltipField.startsWith('rate-')) {
        fieldType = 'rate';
        triggerInputId = activeTooltipField;
      }

      const triggerElement = triggerInputId ? document.getElementById(triggerInputId) : null;

      if (triggerElement) {
        const tooltipEl = tooltipRef.current;
        // Temporarily make it visible to measure, then hide until position is set
        tooltipEl.style.visibility = 'hidden';
        tooltipEl.style.display = 'block'; // Ensure it's rendered for measurement
        const tooltipRect = tooltipEl.getBoundingClientRect();
        tooltipEl.style.display = ''; // Reset display

        const triggerRect = triggerElement.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight; // For potential vertical adjustments later

        // Position tooltip above the trigger
        let top = triggerRect.top - tooltipRect.height - 8; // 8px spacing
        let left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);

        // Edge detection and adjustment
        const PADDING = 8; // 8px padding from viewport edges

        // Adjust left position if overflowing
        if (left < PADDING) {
          left = PADDING;
        } else if (left + tooltipRect.width > viewportWidth - PADDING) {
          left = viewportWidth - tooltipRect.width - PADDING;
        }

        // Adjust top position if overflowing (e.g., trigger is at the very top of the screen)
        if (top < PADDING) {
          top = triggerRect.bottom + 8; // Position below trigger if no space above
          // Here you might also want to adjust the arrow to point upwards
        }
        
        // Ensure it doesn't go off bottom if positioned below
        if (top + tooltipRect.height > viewportHeight - PADDING) {
            top = viewportHeight - tooltipRect.height - PADDING;
        }


        setTooltipPositionStyle({
          position: 'fixed', // Use fixed positioning to break out of parent containers
          top: `${top}px`,
          left: `${left}px`,
          visibility: 'visible',
        });
      } else {
        setTooltipPositionStyle({ visibility: 'hidden' });
      }
    } else {
      setTooltipPositionStyle({ visibility: 'hidden' });
    }
  // Add tooltipData to dependencies, as its content change can affect tooltipRect.width
  }, [activeTooltipField, tooltipData]);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm mb-3 transition-all duration-300 ${showRedOutline ? 'ring-2 ring-red-500' : 'ring-1 ring-gray-200 dark:ring-gray-700'}`}>
      <Toast         
        message={toast.message}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast({ ...toast, visible: false })}
      />
      
      <div 
        className={`flex justify-between items-center p-4 cursor-pointer ${expanded ? 'bg-brand-50 dark:bg-gray-800' : showRedOutline ? 'bg-red-50 dark:bg-red-900/20' : 'bg-white dark:bg-gray-900'}`}
        onClick={(e) => handleAccordionChange(index)(e, !expanded)}
      >
        <h3 className={`text-md font-medium text-gray-800 dark:text-gray-100 ${item.item ? 'text-brand-600 dark:text-brand-400' : ''} ${showRedOutline ? 'text-red-600 dark:text-red-400' : ''} truncate flex-1 pr-4`} title={item.item ? `${item.item} | ${item.selectedItem?.PRODUCT || 'No Product Name'}` : 'Select an item'}>
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
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 relative">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div 
              onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                if (e.key === 'Tab' && e.shiftKey) {
                  if (onShiftTabToPreviousItem) {
                    e.preventDefault();
                    onShiftTabToPreviousItem(index);
                  }
                }
              }}
              className="relative" style={{ zIndex: 100 }}
            >
              <Autocomplete
                key={itemAutocompleteKey}
                id={`item-${index}`}
                label="Item Name"
                options={pmplData
                  .filter((item) => {
                    // Check if this item has stock in any of the user's accessible godowns
                    if (stockList[item.CODE]) {
                      const hasStockInAccessibleGodown = Object.entries(stockList[item.CODE]).some(
                        ([gdnCode, stock]) => {
                          // Check if this godown is in user's accessible godowns
                          const isAccessible = godownOptions.some(g => g.value === gdnCode);
                          return isAccessible && parseInt(stock as string, 10) > 0;
                        }
                      );
                      return hasStockInAccessibleGodown;
                    }
                    return false;
                  })
                  .map((item) => ({
                    value: item.CODE,
                    label: `${item.CODE} | ${item.PRODUCT || 'No Product Name'} [${item.MRP1 !== null && item.MRP1 !== undefined ? item.MRP1 : 'N/A'}]`
                  }))}
                onChange={(value) => {
                  const selectedPmplItem = pmplData.find(p => p.CODE === value);
                  handleItemChange(selectedPmplItem || null);
                }}
                defaultValue={item.item}
                onEnter={handleItemNameEnter}
                ref={itemNameAutocompleteRef}
              />
            </div>
            <div>
              <Input
                id={`total-stock-item-${index}`}
                label="Total Stock"
                value={item.godown && stockList[item.item]?.[item.godown] 
                  ? `${stockList[item.item][item.godown]}`
                  : "0"
                }
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
                options={availableGodownsForCurrentItem.map(gdn => ({
                  value: gdn.code,
                  label: `${gdn.name} | ${gdn.stockInGodown}`
                }))}
                onChange={(val) => handleGodownChange(val)}
                defaultValue={item.godown}
                onEnter={handleGodownEnter}
                ref={godownAutocompleteRef}
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
                {item.selectedItem && unitOptions.length > 1 && item.selectedItem.UNIT_2 && (
                  <button
                    type="button"
                    onClick={handleSwapUnit}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-brand-500 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 p-1"
                    title="Swap Unit"
                    ref={swapUnitButtonRef}
                    tabIndex={ (item.selectedItem && unitOptions.length > 1 && item.selectedItem.UNIT_2) ? 0 : -1 }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSwapUnit();
                      }
                    }}
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
            <div className="relative">
              <Input
                id={`rate-${index}`}
                label="Rate"
                value={item.rate}
                onChange={(e) => handleFieldChange('rate', e.target.value)}
                variant="outlined"
                ref={rateInputRef}
                onFocus={() => setActiveTooltipField(`rate-${index}`)}
                onBlur={() => setTimeout(() => setActiveTooltipField(null), 150)}
              />
            </div>
            <div>
              <Input
                id={`qty-${index}`}
                label={`QTY (${item.unit || ''})`}
                value={item.qty}
                onChange={(e) => handleFieldChange('qty', e.target.value)}
                disabled={!item.godown || !item.unit}
                type="text"
                inputMode="numeric"
                variant="outlined"
                error={(shouldShowValidation && item.item && item.godown && (!item.qty || item.qty === '0')) || !!error}
                hint={error ? error : (shouldShowValidation && item.item && item.godown && parseInt(item.qty) > item.stockLimit && item.stockLimit > 0 ? `Max: ${item.stockLimit}` : '' )}
                ref={qtyInputRef}
                onKeyDown={(e) => { 
                  if (e.key === 'Enter') { 
                    e.preventDefault(); 
                    schRsInputRef.current?.focus();
                    const inputElement = document.getElementById(`schRs-${index}`);
                    if (inputElement) {
                      centerElementInViewport(inputElement);
                    }
                  } 
                  setInitialInteraction(false); 
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <div className="relative">
              <Input
                id={`schRs-${index}`}
                label="SCH (RS)"
                value={item.schRs}
                onChange={(e) => handleFieldChange('schRs', e.target.value)}
                disabled={!item.qty}
                type="text" inputMode="decimal"
                variant="outlined"
                ref={schRsInputRef}
                onFocus={() => setActiveTooltipField(`schRs-${index}`)}
                onBlur={() => setTimeout(() => setActiveTooltipField(null), 150)}
                onKeyDown={(e) => { 
                  if (e.key === 'Enter') { 
                    e.preventDefault(); 
                    schInputRef.current?.focus();
                    const inputElement = document.getElementById(`sch-${index}`);
                    if (inputElement) {
                      centerElementInViewport(inputElement);
                    }
                  }
                }}
              />
            </div>
            <div className="relative">
              <Input
                id={`sch-${index}`}
                label="Sch%"
                value={item.sch}
                onChange={(e) => handleFieldChange('sch', e.target.value)}
                disabled={!item.qty}
                type="text" inputMode="decimal"
                variant="outlined"
                ref={schInputRef}
                onFocus={() => setActiveTooltipField(`schP-${index}`)}
                onBlur={() => setTimeout(() => setActiveTooltipField(null), 150)}
                onKeyDown={(e) => { 
                  if (e.key === 'Enter') { 
                    e.preventDefault(); 
                    cdInputRef.current?.focus();
                    const inputElement = document.getElementById(`cd-${index}`);
                    if (inputElement) {
                      centerElementInViewport(inputElement);
                    }
                  }
                }}
              />
            </div>
            <div>
              <Input
                id={`cd-${index}`}
                label="CD%"
                value={item.cd}
                onChange={(e) => handleFieldChange('cd', e.target.value)}
                disabled={!item.qty}
                type="text" inputMode="decimal"
                variant="outlined"
                ref={cdInputRef}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (onCdPressNavigate) {
                      onCdPressNavigate();
                      const addItemButtons = Array.from(document.querySelectorAll('button'));
                      const addItemButton = addItemButtons.find(button => 
                        button.textContent?.includes('Add Another Item')
                      );
                      if (addItemButton) {
                        centerElementInViewport(addItemButton);
                      }
                    }
                  } else if (e.key === 'Tab') {
                    if (e.shiftKey) {
                      // Don't intercept shift+tab - let browser handle the default navigation
                      // to previous fields within the same section (e.g. back to Sch%)
                      return;
                    } else {
                      // Tab (forward) from CD% field - go to next item's Item Name
                      e.preventDefault(); 
                      if (onTabToNextItem) {
                        onTabToNextItem(index);
                      } else if (onCdPressNavigate) { // Fallback if no next item
                        onCdPressNavigate();
                        const addItemButtons = Array.from(document.querySelectorAll('button'));
                        const addItemButton = addItemButtons.find(button => 
                          button.textContent?.includes('Add Another Item')
                        );
                        if (addItemButton) {
                          centerElementInViewport(addItemButton);
                        }
                      }
                    }
                  }
                }}
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

      {/* Tooltip main container - moved here for dynamic positioning via JS */}
      {activeTooltipField && (
        <div
          ref={tooltipRef}
          style={tooltipPositionStyle}
          className="w-max max-w-xs bg-black opacity-100 text-white text-xs rounded py-1 px-2 z-[200] shadow-lg break-words whitespace-normal"
        >
          {renderTooltipContent(
            activeTooltipField.startsWith('schRs-') ? 'schRs' :
            activeTooltipField.startsWith('schP-') ? 'schP' :
            activeTooltipField.startsWith('rate-') ? 'rate' : 'rate' // Fallback, should be determined correctly
          )}
          <div 
            className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-black opacity-100 z-[200] rotate-45"
          ></div>
        </div>
      )}
    </div>
  );
});

export default CollapsibleItemSection; 
