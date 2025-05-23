import React, { useState, useEffect, useRef, createRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Input, { InputRefHandle } from "../../components/form/input/Input";
import DatePicker from '../../components/form/input/DatePicker';
import Autocomplete from "../../components/form/input/Autocomplete";
import FormComponent from "../../components/form/Form";
import constants from "../../constants";
import CollapsibleItemSection, { CollapsibleItemSectionRefHandle } from './CollapsibleItemSection';
import Toast from '../../components/ui/toast/Toast';
import { InvoiceContext, useInvoiceContext, type Option, type ItemData } from '../../contexts/InvoiceContext';
import InvoiceProvider from '../../contexts/InvoiceProvider';
import InvoicingSkeletonLoader from '../../components/ui/skeleton/SkeletonLoader';
import useAuth from "../../hooks/useAuth";

// Utility function to center an element in the viewport
const centerElementInViewport = (element: HTMLElement) => {
  if (!element) return;
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center' 
  });
};

// Helper function to format Date object to DD-MM-YYYY string
const convertDateToDDMMYYYY = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

const EditInvoicingContent: React.FC<{
  invoiceItemsRef: React.RefObject<ItemData[]>;
  setAllItems: React.Dispatch<React.SetStateAction<ItemData[]>>;
}> = ({ invoiceItemsRef, setAllItems }) => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const dataLoadedRef = useRef(false);
  const invoiceDataRef = useRef<any>(null);
  const { user } = useAuth();
  
  // Get shared invoice data from context
  const { 
    partyOptions, 
    smOptions, 
    pmplData, 
    stockList, 
    loading: dataLoading,
    error: dataError,
    items,
    updateItem,
    removeItem,
    addItem,
    expandedIndex,
    setExpandedIndex,
    invoiceIdInfo,
    focusNewItemIndex
  } = useInvoiceContext();

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [searchItems, setSearchItems] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showValidationErrors, setShowValidationErrors] = useState<boolean>(false);
  
  // Form state
  const [date, setDate] = useState<string>(convertDateToDDMMYYYY(new Date()));
  const [series, setSeries] = useState<string>('');
  const [billNo, setBillNo] = useState<string>('1');
  const [cash, setCash] = useState<string>('Y');
  const [party, setParty] = useState<Option | null>(null);
  const [sm, setSm] = useState<Option | null>(null);
  const [ref, setRef] = useState<string>('');
  const [dueDays, setDueDays] = useState<string>('7');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formReady, setFormReady] = useState<boolean>(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  }>({
    visible: false,
    message: '',
    type: 'info',
  });

  // Refs for focus management (similar to Invoicing.tsx)
  const searchItemsRef = useRef<InputRefHandle>(null);
  const addAnotherItemButtonRef = useRef<HTMLButtonElement>(null);
  const collapsibleItemRefs = useRef<Array<React.RefObject<CollapsibleItemSectionRefHandle>>>([]);

  // Update bill number when series changes (unless editing an existing invoice)
  useEffect(() => {
    if (!id && series && invoiceIdInfo?.nextSeries) {
      const nextNumber = invoiceIdInfo.nextSeries[series.toUpperCase()] || 1;
      setBillNo(nextNumber.toString());
    }
  }, [series, invoiceIdInfo, id]);

  // Initialize/Update collapsibleItemRefs when items change
  useEffect(() => {
    collapsibleItemRefs.current = items.map((_, i) => 
      collapsibleItemRefs.current[i] ?? createRef<CollapsibleItemSectionRefHandle>()
    );
  }, [items]); // Depends on the items array from context

  // Step 1: Fetch invoice data
  useEffect(() => {
    const fetchInvoiceData = async () => {
      if (!id) {
        setError('No invoice ID provided');
        setLoading(false);
        return;
      }

      // If we've already loaded the data, don't load it again
      if (dataLoadedRef.current) {
        return;
      }

      try {
        // Try both possible endpoints with better error handling
        let invoiceData;
        let response;
        
        try {
          console.log(`Fetching invoice data from ${constants.baseURL}/edit/invoicing/${id}`);
          response = await fetch(`${constants.baseURL}/edit/invoicing/${id}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          
          if (!response.ok) {
            console.error(`Primary endpoint failed with status: ${response.status}`);
            throw new Error(`Primary endpoint failed: ${response.statusText}`);
          }
          
          invoiceData = await response.json();
          console.log('Fetched invoice data:', invoiceData);
        } catch (primaryError) {
          console.error('Error with primary endpoint:', primaryError);
          
          try {
            console.log(`Trying fallback endpoint ${constants.baseURL}/invoicing`);
            response = await fetch(`${constants.baseURL}/invoicing`, {
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
              }
            });
            
            if (!response.ok) {
              throw new Error(`Invoice not found: ${response.statusText}`);
            }
            
            invoiceData = await response.json();
            console.log('Fetched invoice data from fallback:', invoiceData);
          } catch (fallbackError) {
            console.error('Error with fallback endpoint:', fallbackError);
            throw new Error('Failed to fetch invoice data from both endpoints');
          }
        }

        if (!invoiceData) {
          throw new Error('No invoice data received');
        }

        // Store the loaded invoice data in a ref for later use
        invoiceDataRef.current = invoiceData;
        dataLoadedRef.current = true;
        setError(null);
      } catch (err) {
        console.error('Failed to load invoice:', err);
        setError(err instanceof Error ? err.message : 'Failed to load invoice');
        setToast({
          visible: true,
          message: 'Failed to load invoice',
          type: 'error'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchInvoiceData();
  }, [id]);

  // Step 2: Once all data is loaded (invoice data, partyOptions, smOptions, pmplData, stockList),
  // then populate the form
  useEffect(() => {
    // Check if all data is loaded
    const allDataLoaded = 
      dataLoadedRef.current && 
      !dataLoading && 
      !loading && 
      partyOptions.length > 0 && 
      smOptions.length > 0 && 
      pmplData.length > 0 && 
      Object.keys(stockList).length > 0;
      
    if (!allDataLoaded || formReady) {
      return;
    }
    
    console.log("All data loaded, populating form");
    
    // Get the stored invoice data
    const invoiceData = invoiceDataRef.current;
    if (!invoiceData) {
      console.error("Invoice data not found");
      return;
    }
    
    // Populate basic form fields
    setCash(invoiceData.cash === 'true' || invoiceData.cash === true ? 'Y' : 'N');
    setSeries(invoiceData.series || '');
    setBillNo(invoiceData.billNo || '1');
    setRef(invoiceData.ref || '');
    setDueDays(invoiceData.dueDays || '7');

    // Format and set date
    if (invoiceData.date) {
      try {
        const dateStr = String(invoiceData.date);
        let day: string | undefined, parsedMonth: string | undefined, parsedYear: string | undefined;

        // Regex for YYYY-MM-DD or YYYY/MM/DD
        let parts = dateStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
        if (parts) {
          parsedYear = parts[1];
          parsedMonth = parts[2];
          day = parts[3];
        } else {
          // Regex for DD-MM-YYYY or DD/MM/YYYY
          parts = dateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
          if (parts) {
            day = parts[1];
            parsedMonth = parts[2];
            parsedYear = parts[3];
          }
        }

        if (day && parsedMonth && parsedYear) {
          setDate(`${day.padStart(2, '0')}-${parsedMonth.padStart(2, '0')}-${parsedYear}`);
        } else {
          // Fallback: try parsing with Date constructor
          const parsedDateObj = new Date(dateStr);
          if (!isNaN(parsedDateObj.getTime())) {
            setDate(convertDateToDDMMYYYY(parsedDateObj));
          } else {
            // If all parsing fails, default to today's date
            setDate(convertDateToDDMMYYYY(new Date()));
          }
        }
      } catch (err) {
        console.error('Error formatting date from API:', err);
        setDate(convertDateToDDMMYYYY(new Date()));
      }
    } else {
      // If invoiceData.date is not present, default to today
      setDate(convertDateToDDMMYYYY(new Date()));
    }

    // Set party when party options are available
    if (invoiceData.party && partyOptions.length > 0) {
      console.log('Setting party with options:', partyOptions.length);
      const partyOption = partyOptions.find(p => p.value === invoiceData.party);
      if (partyOption) {
        console.log('Found matching party option:', partyOption);
        setParty(partyOption);
      } else {
        console.log('Creating placeholder party option');
        const placeholder = {
          value: invoiceData.party,
          label: invoiceData.partyName || invoiceData.party
        };
        setParty(placeholder);
      }
    }

    // Set SM when SM options are available
    if (invoiceData.sm && smOptions.length > 0) {
      console.log('Setting SM with options:', smOptions.length);
      const smOption = smOptions.find(s => s.value === invoiceData.sm);
      if (smOption) {
        console.log('Found matching SM option:', smOption);
        setSm(smOption);
      } else {
        console.log('Creating placeholder SM option');
        const placeholder = {
          value: invoiceData.sm,
          label: invoiceData.smName || invoiceData.sm
        };
        setSm(placeholder);
      }
    }

    // Process items - completely rewrite this section in the second useEffect
    if (invoiceData.items) {
      console.log('Processing invoice items:', typeof invoiceData.items);
      
      let itemsArray;
      try {
        itemsArray = typeof invoiceData.items === 'string' 
          ? JSON.parse(invoiceData.items) 
          : invoiceData.items;
          
        console.log('Parsed items array length:', itemsArray.length);
        
        // Create all processed items at once
        const processedItems = itemsArray.map((item: any) => {
          // Find the matching PMPL item
          const pmplItem = pmplData.find(p => p.CODE === item.item);
          
          // Calculate stock
          let totalStockForItem = 0;
          if (item.item && stockList[item.item]) {
            const itemStockObject = stockList[item.item];
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

          // Calculate stockLimit based on the specific godown for this item
          let currentGodownStock = 0;
          if (item.item && item.godown && stockList[item.item] && stockList[item.item][item.godown]) {
            currentGodownStock = parseInt(stockList[item.item][item.godown] as string, 10);
            if (isNaN(currentGodownStock)) currentGodownStock = 0;
          }
          const stockLimit = currentGodownStock; // stockLimit is the stock in the selected godown

          return {
            ...item,
            stock: totalStockForItem.toString(), // For the "Total Stock" display field
            stockLimit, // stockLimit for QTY validation against selected godown's stock
            selectedItem: pmplItem || null,
            // Ensure all required fields exist
            unit: item.unit || pmplItem?.UNIT_1 || '',
            pack: item.pack || pmplItem?.PACK || '',
            gst: item.gst || pmplItem?.GST || '',
            pcBx: item.pcBx || pmplItem?.MULT_F || '',
            mrp: item.mrp || pmplItem?.MRP1 || '',
            rate: item.rate || '',
            qty: item.qty || '',
            cess: item.cess || '',
            schRs: item.schRs || '',
            sch: item.sch || '',
            cd: item.cd || '',
            amount: item.amount || '',
            netAmount: item.netAmount || ''
          };
        });
        
        console.log('Created processed items array with length:', processedItems.length);
        // Store all items directly in the parent component state
        setAllItems(processedItems);
        
        // Also store in ref for safety
        invoiceItemsRef.current = processedItems;
      } catch (parseError) {
        console.error('Error processing items:', parseError);
      }
    }

    // Mark the form as ready to display
    setFormReady(true);
  }, [dataLoading, loading, partyOptions, smOptions, pmplData, stockList, items, updateItem, addItem, removeItem, formReady, setAllItems, invoiceItemsRef]);

  const handleAccordionChange = (panel: number) => (_: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedIndex?.(isExpanded ? panel : -1);
  };

  // Form handlers
  const handleDateChange = (selectedDate: string) => {
    setDate(selectedDate);
  };

  const handleSeriesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow alphabetic characters and convert to uppercase
    const value = e.target.value;
    const alphabeticValue = value.replace(/[^A-Za-z]/g, '');
    setSeries(alphabeticValue.toUpperCase());
  };

  const handleBillNoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBillNo(e.target.value);
  };

  const toggleCash = () => {
    setCash(prev => prev === 'Y' ? 'N' : 'Y');
  };

  const handleDueDaysChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDueDays(e.target.value);
  };

  const handleRefChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRef(e.target.value);
  };

  const handlePartyChange = (value: string) => {
    const selected = partyOptions.find(option => option.value === value);
    setParty(selected || null);
  };

  const handleSmChange = (value: string) => {
    const selected = smOptions.find(option => option.value === value);
    setSm(selected || null);
  };

  const handleSearchItemsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchItems(e.target.value);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!party) {
      newErrors.party = 'Party is required';
    }

    if (!sm) {
      newErrors.sm = 'S/M is required';
    }

    // Create a more detailed validation for items
    let hasInvalidItems = false;
    let itemErrorMessage = '';
    
    if (items.length === 0 || !items.some(item => item.item)) {
      newErrors.items = 'At least one item is required';
      hasInvalidItems = true;
      itemErrorMessage = 'At least one item is required';
    } else {
      // Check each item that has an item code
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        // Only validate items that have been selected (have an item code)
        if (item.item) {
          if (!item.godown) {
            hasInvalidItems = true;
            itemErrorMessage = `Item ${item.item} is missing a godown selection`;
            setExpandedIndex?.(i); // Expand the problematic item
            break;
          }
          
          if (!item.qty || item.qty === '0') {
            hasInvalidItems = true;
            itemErrorMessage = `Item ${item.item} is missing a quantity`;
            setExpandedIndex?.(i); // Expand the problematic item
            break;
          }
          
          // Validate that quantity doesn't exceed stock limit
          if (parseInt(item.qty) > item.stockLimit) {
            hasInvalidItems = true;
            itemErrorMessage = `Item ${item.item} quantity (${item.qty}) exceeds available stock (${item.stockLimit})`;
            setExpandedIndex?.(i); // Expand the problematic item
            break;
          }
        }
      }
    }
    
    if (hasInvalidItems) {
      newErrors.items = itemErrorMessage;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const calculateTotal = () => {
    return items.reduce((total, item) => {
      return total + (parseFloat(item.netAmount) || 0);
    }, 0).toFixed(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Set validation messages to be visible
    setShowValidationErrors(true);
    
    if (isSubmitting) {
      console.log('Already submitting, please wait...');
      return;
    }
    
    if (!validateForm()) {
      // Show a more detailed error message based on the specific validation error
      let errorMessage = 'Please fill in all required fields';
      
      if (errors.items) {
        errorMessage = errors.items;
      } else if (errors.party) {
        errorMessage = errors.party;
      } else if (errors.sm) {
        errorMessage = errors.sm;
      }
      
      setToast({
        visible: true,
        message: errorMessage,
        type: 'error'
      });
      
      console.log('Form validation failed');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const formattedItems = items.map(item => ({
        ...item,
        selectedItem: undefined
      }));
      
      const response = await fetch(`${constants.baseURL}/edit/invoicing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          id,
          series,
          billNo,
          date,
          cash,
          party: party?.value || '',
          partyName: party?.label || '',
          sm: sm?.value || '',
          smName: sm?.label || '',
          ref,
          dueDays,
          items: formattedItems,
          total: calculateTotal()
        })
      });
      
      // Handle duplicate bill number error (409 Conflict)
      if (response.status === 409) {
        const errorData = await response.json();
        setToast({
          visible: true,
          message: errorData.message,
          type: 'error'
        });
        
        // Update the bill number with the suggested number
        if (errorData.suggestedBillNo) {
          setBillNo(errorData.suggestedBillNo);
        }
        
        setIsSubmitting(false);
        return;
      }
      
      if (!response.ok) {
        let errorMessage = 'Failed to update invoice';
        try {
          const errorData = await response.text();
          errorMessage = `Server error: ${errorData || response.statusText}`;
        } catch (e) {
          console.error('Could not parse error response:', e);
        }
        throw new Error(errorMessage);
      }
      
      // Get the response data
      const responseData = await response.json();
      const invoiceId = id || responseData.id || responseData._id;
      
      setToast({
        visible: true,
        message: 'Invoice updated successfully',
        type: 'success',
      });
      
      // Store whether we should redirect to print page
      const shouldRedirectToPrint = localStorage.getItem('redirectToPrint') === 'true';
      
      setTimeout(() => {
        if (shouldRedirectToPrint && invoiceId) {
          // Remove the flag from localStorage
          localStorage.removeItem('redirectToPrint');
          // Redirect to print page with invoice ID
          navigate(`/printInvoice?id=${invoiceId}`);
        } else {
          // Regular redirect to invoice list
          navigate('/invoicing');
        }
      }, 1500);
    } catch (error) {
      console.error('Error updating invoice:', error);
      setToast({
        visible: true,
        message: `An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredItems = () => {
    if (!searchItems) return items;

    return items
      .filter((item) => item.item.toLowerCase().includes(searchItems.toLowerCase()))
      .sort((a, b) => a.item.localeCompare(b.item));
  };

  // Navigation Handlers (similar to Invoicing.tsx)
  const handleCdPressNavigateFromItem = () => {
    if (addAnotherItemButtonRef.current) {
      addAnotherItemButtonRef.current.focus();
      centerElementInViewport(addAnotherItemButtonRef.current);
    }
  };

  const handleTabToNextItem = (currentIndex: number) => {
    const nextItemIndex = currentIndex + 1;
    if (nextItemIndex < items.length && collapsibleItemRefs.current[nextItemIndex]?.current) {
      setExpandedIndex(nextItemIndex);
      setTimeout(() => {
        collapsibleItemRefs.current[nextItemIndex]?.current?.focusItemName();
      }, 50); // Delay to ensure section is expanded before focus
    } else if (addAnotherItemButtonRef.current) {
      // Last item remains expanded
      addAnotherItemButtonRef.current.focus();
      centerElementInViewport(addAnotherItemButtonRef.current);
    }
  };

  const handleShiftTabToPreviousItem = (currentIndex: number) => {
    const prevItemIndex = currentIndex - 1;
    if (prevItemIndex >= 0 && collapsibleItemRefs.current[prevItemIndex]?.current) {
      setExpandedIndex(prevItemIndex);
      setTimeout(() => {
        collapsibleItemRefs.current[prevItemIndex]?.current?.focusCdInput();
      }, 50); // Delay to ensure section is expanded before focus
    } else if (currentIndex === 0 && searchItemsRef.current) {
      // First item remains expanded
      searchItemsRef.current.focus();
      const searchEl = document.getElementById('searchItems'); // Assuming 'searchItems' is the ID of the input
      if (searchEl) centerElementInViewport(searchEl);
    }
  };

  if (dataLoading || loading || !formReady) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <PageMeta
          title="Edit Invoice | FMCG Vite Admin Template"
          description="Edit Invoice page in FMCG Vite Admin Template"
        />
        <PageBreadcrumb pageTitle="Edit Invoice" />
        <InvoicingSkeletonLoader />
      </div>
    );
  }

  if (dataError || error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-lg text-red-600 dark:text-red-400">{dataError || error}</div>
      </div>
    );
  }

  return (
    <div className="relative bg-white dark:bg-gray-900 rounded-sm shadow-sm w-full h-full p-6">
      <PageMeta
        title="Edit Invoice | FMCG Vite Admin Template"
        description="Edit Invoice page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Edit Invoice" />
      
      <Toast         
        message={toast.message}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast({ ...toast, visible: false })}
      />
      
      <FormComponent onSubmit={handleSubmit} autoComplete="off" className="flex flex-col w-full">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <DatePicker
                id="date"
                label="Date"
                value={date}
                onChange={handleDateChange}
                dateFormatType="dd-mm-yyyy"
                required
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Input
                  id="series"
                  label="Series"
                  placeholder="T"
                  value={series}
                  onChange={handleSeriesChange}
                  variant="outlined"
                  autoComplete="off"
                  maxLength={1}
                  disabled={user && user.canSelectSeries === false}
                />
              </div>
              <div>
                <Input
                  id="billNo"
                  label="Bill No."
                  value={billNo}
                  onChange={handleBillNoChange}
                  variant="outlined"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="flex items-center">
              <div className="flex items-center space-x-2">
                <span className="text-gray-700 dark:text-gray-300">CREDIT {cash === 'N' ? '(O)' : ''}</span>
                <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out rounded-full cursor-pointer">
                  <input
                    type="checkbox"
                    id="cash-toggle"
                    className="absolute w-6 h-6 transition duration-200 ease-in-out transform bg-white border rounded-full appearance-none cursor-pointer peer border-gray-300 dark:border-gray-600 checked:right-0 checked:border-brand-500 checked:bg-brand-500 dark:checked:border-brand-400 dark:checked:bg-brand-400"
                    checked={cash === 'Y'}
                    onChange={toggleCash}
                    autoComplete="off"
                  />
                  <label
                    htmlFor="cash-toggle"
                    className="block h-full overflow-hidden rounded-full cursor-pointer bg-gray-300 dark:bg-gray-700 peer-checked:bg-brand-100 dark:peer-checked:bg-brand-900"
                  ></label>
                </div>
                <span className="text-gray-700 dark:text-gray-300">CASH {cash === 'Y' ? '(O)' : ''}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <Autocomplete
                id="party"
                label="Party"
                options={partyOptions}
                onChange={handlePartyChange}
                defaultValue={party?.value}
                autoComplete="off"
              />
              {errors.party && (
                <p className="mt-1 text-sm text-red-500">{errors.party}</p>
              )}
            </div>
            <div>
              <Input
                id="gst"
                label="GST"
                value={party ? (party as any).gst || '' : ''}
                disabled
                variant="outlined"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <Autocomplete
                id="sm"
                label="S/M"
                options={smOptions}
                onChange={handleSmChange}
                defaultValue={sm?.value}
                autoComplete="off"
              />
              {errors.sm && (
                <p className="mt-1 text-sm text-red-500">{errors.sm}</p>
              )}
            </div>
            <div>
              <Input
                id="ref"
                label="Reference"
                value={ref}
                onChange={handleRefChange}
                variant="outlined"
                autoComplete="off"
              />
            </div>
          </div>

          {cash === 'N' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <Input
                  id="dueDays"
                  label="Due Date"
                  value={dueDays}
                  onChange={handleDueDaysChange}
                  variant="outlined"
                  autoComplete="off"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex-grow w-full mb-4 mt-6">
          <h2 className="text-xl font-semibold mb-2 dark:text-white">Items</h2>
          
          <div className="relative max-w-md mb-4">
            <Input
              ref={searchItemsRef}
              id="searchItems"
              label="Search Items"
              value={searchItems}
              onChange={handleSearchItemsChange}
              variant="outlined"
              className="pl-10"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="w-full mb-6 pr-2">
          {filteredItems().map((itemData, index) => (
            <CollapsibleItemSection
              key={itemData.item ? `item-${itemData.item}-${index}` : `item-section-${index}`}
              ref={collapsibleItemRefs.current[index]}
              index={index}
              item={itemData}
              partyCode={party?.value || null}
              handleAccordionChange={handleAccordionChange}
              expanded={expandedIndex === index}
              updateItem={updateItem}
              removeItem={removeItem}
              showValidationErrors={showValidationErrors}
              onCdPressNavigate={handleCdPressNavigateFromItem}
              onTabToNextItem={handleTabToNextItem}
              onShiftTabToPreviousItem={handleShiftTabToPreviousItem}
              shouldFocusOnExpand={focusNewItemIndex === index}
            />
          ))}
        </div>

        <div className="mb-6">
          <button
            ref={addAnotherItemButtonRef}
            type="button"
            className="px-5 py-3 text-brand-500 border-2 border-brand-500 font-medium rounded-md hover:bg-brand-50 hover:text-brand-600 dark:text-brand-400 dark:border-brand-400 dark:hover:bg-gray-800 flex items-center gap-2 transition-all duration-200"
            onClick={() => {
              const hasIncompleteItems = items.some(item => item.item && (!item.godown || !item.qty));
              if (hasIncompleteItems) {
                setShowValidationErrors(true);
                setToast({
                  visible: true,
                  message: 'Please complete all item details before adding another item',
                  type: 'error'
                });
              } else {
                setShowValidationErrors(false);
              }
              addItem();
            }}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="18" 
              height="18" 
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add Another Item
          </button>
        </div>

        <div className="flex justify-between items-center mb-6">
          <div className="text-xl font-semibold dark:text-white">
            Total: ₹{calculateTotal()}
          </div>
          <div className="flex space-x-4">
            <button
              type="submit"
              className="px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
              disabled={isSubmitting}
              onClick={() => {
                localStorage.removeItem('redirectToPrint');
              }}
            >
              {isSubmitting ? 'Updating...' : 'Update Invoice'}
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 flex items-center gap-2"
              disabled={isSubmitting}
              onClick={() => {
                localStorage.setItem('redirectToPrint', 'true');
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
              {isSubmitting ? 'Updating...' : 'Update & Print'}
            </button>
            <button
              type="button"
              className="px-4 py-2 text-gray-500 rounded-md hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              onClick={() => navigate('/db/invoicing')}
            >
              Cancel
            </button>
          </div>
        </div>
      </FormComponent>
    </div>
  );
};

const EditInvoicing: React.FC = () => {
  const [items, setItems] = useState<ItemData[]>([{
    item: '',
    godown: '',
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
  }]);
  const [expandedIndex, setExpandedIndex] = useState<number>(0);
  const invoiceItemsRef = useRef<ItemData[]>([]);
  const [focusNewItemIndex, setFocusNewItemIndex] = useState<number | null>(null);

  // Item management functions
  const addItem = () => {
    const newItems = [...items, {
      item: '',
      godown: '',
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
    }];
    setItems(newItems);
    // Set the expandedIndex to the new item's index
    setExpandedIndex(newItems.length - 1);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    } else if (items.length === 1) {
      // If there's only one item, clear its data instead of removing it
      setItems([{
        item: '',
        godown: '',
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
      }]);
    }
  };

  const updateItem = (index: number, newData: ItemData) => {
    console.log('Updating item at index', index, 'with data:', newData.item);
    const newItems = [...items];
    // Make sure the index exists
    if (index >= newItems.length) {
      // Add empty items until we reach the target index
      for (let i = newItems.length; i <= index; i++) {
        newItems.push({
          item: '',
          godown: '',
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
        });
      }
    }
    
    // Check if we're trying to set a duplicate item
    if (newData.item && newData.item !== newItems[index].item) {
      for (let i = 0; i < newItems.length; i++) {
        if (i !== index && newItems[i].item === newData.item) {
          // Don't update with duplicate item
          console.log('Duplicate item detected, not updating');
          return;
        }
      }
    }
    
    newItems[index] = newData;
    setItems(newItems);
  };

  const calculateTotal = () => {
    return items.reduce((total, item) => {
      return total + (parseFloat(item.netAmount) || 0);
    }, 0).toFixed(2);
  };

  return (
    <InvoiceProvider
      items={items}
      updateItem={updateItem}
      removeItem={removeItem}
      addItem={addItem}
      calculateTotal={calculateTotal}
      expandedIndex={expandedIndex}
      setExpandedIndex={setExpandedIndex}
      focusNewItemIndex={focusNewItemIndex}
      setFocusNewItemIndex={setFocusNewItemIndex}
      setItems={setItems}
    >
      <EditInvoicingContent invoiceItemsRef={invoiceItemsRef} setAllItems={setItems} />
    </InvoiceProvider>
  );
};

export default EditInvoicing; 