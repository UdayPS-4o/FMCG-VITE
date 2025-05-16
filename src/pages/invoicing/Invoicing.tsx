import React, { useState, useEffect, useMemo, useRef, createRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Input, { InputRefHandle } from "../../components/form/input/Input";
import Autocomplete, { AutocompleteRefHandle } from "../../components/form/input/Autocomplete";
import DatePicker from '../../components/form/input/DatePicker';
import FormComponent from "../../components/form/Form";
import constants from "../../constants";
import CollapsibleItemSection, { CollapsibleItemSectionRefHandle } from './CollapsibleItemSection';
import Toast from '../../components/ui/toast/Toast';
import { InvoiceContext, useInvoiceContext, type ItemData } from '../../contexts/InvoiceContext';
import InvoiceProvider from '../../contexts/InvoiceProvider';
import InvoicingSkeletonLoader from '../../components/ui/skeleton/SkeletonLoader';

// Utility function to center an element in the viewport
const centerElementInViewport = (element: HTMLElement) => {
  if (!element) return;
  
  // Use the built-in scrollIntoView with {block: 'center'} option
  // This will center the element vertically in the viewport
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center' 
  });
};

interface Option {
  value: string;
  label: string;
  stockLimit?: number;
}

// Define a type for the User object expected from localStorage
interface User {
  id: number;
  name: string;
  username: string;
  routeAccess: string[];
  powers: string[];
  subgroups: string[];
  smCode?: string; // smCode might be optional
  defaultSeries?: { billing?: string };
  godownAccess: string[];
  canSelectSeries?: boolean;
}

// Define a type for the invoice draft
interface InvoiceDraft {
  date: string;
  series: string;
  billNo: string;
  cash: 'Y' | 'N';
  party: Option | null;
  sm: Option | null;
  ref: string;
  dueDays: string;
  items: ItemData[];
}

const InvoicingContent: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [draftExistsInStorage, setDraftExistsInStorage] = useState<boolean>(false);
  const [showLoadDraftButton, setShowLoadDraftButton] = useState<boolean>(false);

  // Refs for input elements (local to InvoicingContent)
  const partyAutocompleteRef = useRef<AutocompleteRefHandle>(null);
  const smAutocompleteRef = useRef<AutocompleteRefHandle>(null);
  const refRef = useRef<InputRefHandle>(null);
  const dueDaysRef = useRef<InputRefHandle>(null);
  const searchItemsRef = useRef<InputRefHandle>(null);
  const seriesRef = useRef<InputRefHandle>(null);
  const billNoRef = useRef<InputRefHandle>(null);
  const addAnotherItemButtonRef = useRef<HTMLButtonElement>(null); // This is local
  const collapsibleItemRefs = useRef<Array<React.RefObject<CollapsibleItemSectionRefHandle>>>([]); // This is local

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse user data from localStorage", e);
        // Handle potential corrupt data: clear storage and redirect to login?
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        navigate('/login'); 
      }
    }
    // If no user data, potentially redirect to login or show an error
    // else { navigate('/login'); } // Uncomment if redirect is desired
  }, [navigate]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [searchItems, setSearchItems] = useState<string>('');
  const [showValidationErrors, setShowValidationErrors] = useState<boolean>(false);
  
  const { 
    partyOptions, 
    smOptions, 
    loading,
    error,
    items,
    updateItem,
    removeItem,
    addItem: contextAddItem,
    calculateTotal,
    expandedIndex,
    setExpandedIndex,
    invoiceIdInfo,
    focusNewItemIndex,
    setFocusNewItemIndex,
    setItems: contextSetItems
  } = useInvoiceContext();
  
  // Helper function to format local date as DD-MM-YYYY
  const getLocalDateDDMMYYYY = (date: Date): string => {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Add 1 because months are 0-indexed
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };
  
  // Form state - Use local date for default
  const [date, setDate] = useState<string>(getLocalDateDDMMYYYY(new Date()));
  const [series, setSeries] = useState<string>('T');
  const [billNo, setBillNo] = useState<string>('1');
  const [cash, setCash] = useState<'Y' | 'N'>('N');
  const [party, setParty] = useState<Option | null>(null);
  const [sm, setSm] = useState<Option | null>(null);
  const [ref, setRef] = useState<string>('');
  const [dueDays, setDueDays] = useState<string>('7');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [toast, setToast] = useState<{ 
    visible: boolean, 
    message: string, 
    type: 'success' | 'error' | 'info' 
  }>({ 
    visible: false, 
    message: '', 
    type: 'info' 
  });

  // Check for existing draft on component mount and set initial button visibility
  useEffect(() => {
    const storedDraftString = localStorage.getItem('invoicingDraft');
    if (storedDraftString) {
      setDraftExistsInStorage(true);
      // Initial check for button visibility will be handled by the comparison effect below
    } else {
      setDraftExistsInStorage(false);
      setShowLoadDraftButton(false);
    }
  }, []);

  // Effect to save draft to localStorage
  useEffect(() => {
    // This effect should run when form data changes to save it
    const currentDraftData: InvoiceDraft = {
      date,
      series,
      billNo,
      cash,
      party,
      sm,
      ref,
      dueDays,
      items,
    };

    if (items.length >= 2) {
      localStorage.setItem('invoicingDraft', JSON.stringify(currentDraftData));
      if (!draftExistsInStorage) {
        setDraftExistsInStorage(true); // Update if it wasn't set before
      }
    } else {
      // Optional: If you want to remove the draft if items < 2
      // if (draftExistsInStorage) {
      //   localStorage.removeItem('invoicingDraft');
      //   setDraftExistsInStorage(false);
      // }
    }
    // Note: The comparison effect will handle setShowLoadDraftButton update
  }, [date, series, billNo, cash, party, sm, ref, dueDays, items, draftExistsInStorage]);

  // Effect to compare current form with stored draft and set button visibility
  useEffect(() => {
    if (!draftExistsInStorage) {
      setShowLoadDraftButton(false);
      return;
    }

    const storedDraftString = localStorage.getItem('invoicingDraft');
    if (!storedDraftString) { // Should not happen if draftExistsInStorage is true
      setDraftExistsInStorage(false);
      setShowLoadDraftButton(false);
      return;
    }

    try {
      // Parse the stored draft
      const storedDraft = JSON.parse(storedDraftString);
      
      // Create comparable version of current form state
      const currentState = {
        date,
        series,
        billNo,
        cash,
        party: party ? { value: party.value, label: party.label } : null,
        sm: sm ? { value: sm.value, label: sm.label } : null,
        ref,
        dueDays,
        // Only include key properties for comparison
        items: items.map(item => ({
          item: item.item,
          godown: item.godown,
          qty: item.qty,
          rate: item.rate,
          amount: item.amount,
          netAmount: item.netAmount
        }))
      };

      // Compare only essential properties
      let isDifferent = false;
      
      // Basic properties
      if (storedDraft.date !== currentState.date || 
          storedDraft.series !== currentState.series ||
          storedDraft.billNo !== currentState.billNo ||
          storedDraft.cash !== currentState.cash ||
          storedDraft.ref !== currentState.ref ||
          storedDraft.dueDays !== currentState.dueDays) {
        isDifferent = true;
      }
      
      // Compare party
      if ((storedDraft.party === null && currentState.party !== null) ||
          (storedDraft.party !== null && currentState.party === null) ||
          (storedDraft.party !== null && currentState.party !== null && 
           storedDraft.party.value !== currentState.party.value)) {
        isDifferent = true;
      }
      
      // Compare SM
      if ((storedDraft.sm === null && currentState.sm !== null) ||
          (storedDraft.sm !== null && currentState.sm === null) ||
          (storedDraft.sm !== null && currentState.sm !== null && 
           storedDraft.sm.value !== currentState.sm.value)) {
        isDifferent = true;
      }
      
      // Compare items (length and key properties)
      if (!isDifferent) {
        if (storedDraft.items.length !== currentState.items.length) {
          isDifferent = true;
        } else {
          // Check each item for differences
          for (let i = 0; i < storedDraft.items.length; i++) {
            const storedItem = storedDraft.items[i];
            const currentItem = currentState.items[i];
            
            if (storedItem.item !== currentItem.item ||
                storedItem.godown !== currentItem.godown ||
                storedItem.qty !== currentItem.qty ||
                storedItem.rate !== currentItem.rate) {
              isDifferent = true;
              break;
            }
          }
        }
      }
      
      setShowLoadDraftButton(isDifferent);
    } catch (e) {
      console.error("Error comparing current form with stored draft:", e);
      // Default to showing button if comparison fails
      setShowLoadDraftButton(true); 
    }
  }, [date, series, billNo, cash, party, sm, ref, dueDays, items, draftExistsInStorage]);

  // useEffect for collapsibleItemRefs.current (this was correct locally)
  useEffect(() => {
    collapsibleItemRefs.current = items.map((_, i) => collapsibleItemRefs.current[i] ?? createRef<CollapsibleItemSectionRefHandle>());
  }, [items, items.length]); // Added items.length for robustness, though items itself should suffice

  // Focus series input on initial load, after loading is complete
  useEffect(() => {
    if (!loading && seriesRef.current) {
      seriesRef.current.focus();
    }
  }, [loading]); // Depend on the loading state

  // Apply default series from user settings
  useEffect(() => {
    // Check if user exists and has defaultSeries with billing property
    if (user && user.defaultSeries && typeof user.defaultSeries.billing === 'string') {
      setSeries(user.defaultSeries.billing);
    }
    // Set a default series 'T' if no user preference or billing series is found
    // else {
    //   setSeries('T'); // Keep default or adjust as needed
    // }
  }, [user]); // Dependency is now the user state derived from localStorage

  // Filter SM options based on user's role and assigned SM code
  const filteredSmOptions = useMemo(() => {
    if (!user || !smOptions) return [];
    
    const isAdmin = user.routeAccess && user.routeAccess.includes('Admin');
    
    // If user is not admin and has an assigned SM code, only show that option
    if (!isAdmin && user.smCode) {
      const userSm = smOptions.find(option => option.value === user.smCode);
      return userSm ? [userSm] : [];
    }
    
    // Otherwise, show all options
    return smOptions;
  }, [user, smOptions]);

  // Update bill number whenever series changes
  useEffect(() => {
    if (series && invoiceIdInfo?.nextSeries) {
      const nextNumber = invoiceIdInfo.nextSeries[series.toUpperCase()] || 1;
      setBillNo(nextNumber.toString());
    } else {
      setBillNo('1');
    }
  }, [series, invoiceIdInfo]);

  // Auto-select SM based on user's smCode
  useEffect(() => {
    if (user && smOptions && smOptions.length > 0) {
      const isAdmin = user.routeAccess && user.routeAccess.includes('Admin');
      
      if (user.smCode && !isAdmin) {
        const userSm = smOptions.find(option => option.value === user.smCode);
        if (userSm) {
          setSm(userSm);
        }
      }
    }
  }, [user, smOptions]);

  const handleAccordionChange = (panel: number) => (_: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedIndex?.(isExpanded ? panel : -1);
  };

  // Form handlers
  const handleDateChange = (selectedDate: string) => {
    setDate(selectedDate);
  };

  const handleSeriesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const alphabeticValue = value.replace(/[^A-Za-z]/g, '');
    // Always take the last typed alphabetic character and make it uppercase.
    // If the result is an empty string (e.g., if a non-alphabetic char was typed), 
    // it will effectively clear the input or keep it empty if it was already empty.
    const newValue = alphabeticValue.length > 0 ? alphabeticValue.slice(-1).toUpperCase() : '';
    setSeries(newValue);
  };

  const handleBillNoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBillNo(e.target.value);
  };

  const toggleCash = () => {
    setCash(prev => {
      // When changing to credit (N), ensure due days is set to 7 if empty
      if (prev === 'Y') {
        if (!dueDays) {
          setDueDays('7');
        }
        return 'N';
      } else {
        return 'Y';
      }
    });
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

  const handlePartyEnter = () => {
    const isAdmin = user?.routeAccess?.includes('Admin');
    const smIsDisabled = !!(user && !isAdmin && user.smCode);
    if (!smIsDisabled && smAutocompleteRef.current) {
      smAutocompleteRef.current.focus();
      const smEl = document.getElementById('sm');
      if (smEl) centerElementInViewport(smEl);
    } else if (refRef.current) {
      refRef.current.focus();
      const refEl = document.getElementById('ref');
      if (refEl) centerElementInViewport(refEl);
    }
  };

  const handleSmChange = (value: string) => {
    const selected = smOptions.find(option => option.value === value);
    setSm(selected || null);
  };

  const handleSmEnter = () => {
    if (refRef.current) {
      refRef.current.focus();
      const refEl = document.getElementById('ref');
      if (refEl) centerElementInViewport(refEl);
    }
  };

  const handleSearchItemsEnter = () => {
    if (items.length > 0 && collapsibleItemRefs.current[0]?.current) {
      collapsibleItemRefs.current[0].current.focusItemName();
      const itemEl = document.getElementById(`item-0`);
      if (itemEl) centerElementInViewport(itemEl);
    } else if (addAnotherItemButtonRef.current) {
      addAnotherItemButtonRef.current.focus();
      centerElementInViewport(addAnotherItemButtonRef.current);
    }
  };

  const handleDueDaysEnter = () => {
    if (searchItemsRef.current) {
        searchItemsRef.current.focus();
        const searchEl = document.getElementById('searchItems');
        if (searchEl) centerElementInViewport(searchEl);
    }
  };

  const handleRefEnter = () => {
    if (cash === 'N' && dueDaysRef.current) {
      dueDaysRef.current.focus();
      const dueDaysEl = document.getElementById('dueDays');
      if (dueDaysEl) centerElementInViewport(dueDaysEl);
    } else if (searchItemsRef.current) {
        searchItemsRef.current.focus();
        const searchEl = document.getElementById('searchItems');
        if (searchEl) centerElementInViewport(searchEl);
    } else if (items.length > 0 && collapsibleItemRefs.current[0]?.current) {
        collapsibleItemRefs.current[0].current.focusItemName();
        const itemEl = document.getElementById(`item-0`);
        if (itemEl) centerElementInViewport(itemEl);
    } else if (addAnotherItemButtonRef.current) { 
        addAnotherItemButtonRef.current.focus();
        centerElementInViewport(addAnotherItemButtonRef.current);
    }
  };

  const handleCdPressNavigateFromItem = () => {
    if (addAnotherItemButtonRef.current) {
      addAnotherItemButtonRef.current.focus();
      centerElementInViewport(addAnotherItemButtonRef.current);
    }
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
      newErrors.sm = 'SM is required';
    }
    
    // Create a more detailed validation for items
    let hasInvalidItems = false;
    let itemErrorMessage = '';
    
    // Check if there are any items
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

  // Function to generate PDF in background
  const generatePdfInBackground = async (invoiceIdToPrint: string) => {
    const token = localStorage.getItem('token');
    // if (!token) {
    //   setToast({
    //     visible: true,
    //     message: 'Authentication required to generate PDF',
    //     type: 'error'
    //   });
    //   return;
    // }

    // No need for a separate PDF loading state here as it's background

    try {
      const response = await fetch(`${constants.baseURL}/api/generate-pdf/invoice/${invoiceIdToPrint}?redirect=false`, {
        method: 'GET',
        headers: {
          // 'Authorization': `Bearer ${token}` // Uncomment if auth is needed
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to generate PDF. Server returned an error.' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.pdfPath) {
        const backendBaseUrl = constants.baseURL.replace('/api', '');
        setToast({
          visible: true,
          message: `PDF generated successfully.`,
          type: 'success'
        });
      } else {
        throw new Error('PDF path not found in server response.');
      }

    } catch (err: any) {
      console.error('Error generating PDF in background:', err);
      setToast({
        visible: true,
        message: `Error generating PDF: ${err.message}`,
        type: 'error'
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Set validation messages to be visible
    setShowValidationErrors(true);
    
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
      return;
    }
    
    setIsSubmitting(true);
    
    try {

      const apiData = {
        date,
        series,
        billNo,
        cash,
        party: party?.value || '',
        partyName: party?.label.split('|')[0]?.trim() || '',
        sm: sm?.value || '',
        smName: sm?.label.split('|')[0]?.trim() || '',
        ref,
        dueDays: cash === 'N' ? dueDays : '',
        items: items.filter(item => item.item).map(item => ({
          item: item.item,
          godown: item.godown,
          unit: item.unit,
          rate: item.rate,
          qty: item.qty,
          cess: item.cess,
          schRs: item.schRs,
          sch: item.sch,
          cd: item.cd,
          amount: item.amount,
          netAmount: item.netAmount
        }))
      };
      
      const response = await fetch(`${constants.baseURL}/invoicing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(apiData)
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
        throw new Error(`Error: ${response.status}`);
      }
      
      // Get the invoice ID from the response
      const responseData = await response.json();
      const invoiceId = responseData.id || responseData._id;
      
      // Delete the draft from localStorage after successful submission
      localStorage.removeItem('invoicingDraft');
      setDraftExistsInStorage(false);
      setShowLoadDraftButton(false);
      
      setToast({
        visible: true,
        message: 'Invoice created successfully!',
        type: 'success'
      });
      
      // Store whether we should redirect to print page
      const shouldRedirectToPrint = localStorage.getItem('redirectToPrint') === 'true';
      
      setTimeout(() => {
        if (shouldRedirectToPrint && invoiceId) {
          // Remove the flag from localStorage
          localStorage.removeItem('redirectToPrint');
          // Generate PDF in background instead of redirecting
          generatePdfInBackground(invoiceId);
          // Navigate to invoice list after attempting PDF generation
          navigate('/db/invoicing');
        } else {
          // Regular redirect to invoice list
          navigate('/db/invoicing');
        }
      }, 2000);
      
    } catch (error) {
      console.error('Failed to submit invoice:', error);
      setToast({
        visible: true,
        message: 'Failed to create invoice',
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredItems = () => {
    if (!searchItems.trim()) {
      return items;
    }
    
    return items.map(item => {
      if (item.selectedItem) {
        const matchesSearch = item.selectedItem.PRODUCT?.toLowerCase().includes(searchItems.toLowerCase()) ||
                            item.item.toLowerCase().includes(searchItems.toLowerCase());
        if (matchesSearch) {
          return { ...item, searchHighlight: true };
        }
      }
      return { ...item, searchHighlight: false };
    });
  };

  const handleTabToNextItem = (currentIndex: number) => {
    const nextItemIndex = currentIndex + 1;
    if (nextItemIndex < items.length && collapsibleItemRefs.current[nextItemIndex]?.current) {
      setExpandedIndex(nextItemIndex); 
      
      // Ensure focus happens after the section has been expanded
      setTimeout(() => {
        collapsibleItemRefs.current[nextItemIndex]?.current?.focusItemName();
      }, 50);
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
      
      // Ensure focus happens after the section has been expanded
      setTimeout(() => {
        collapsibleItemRefs.current[prevItemIndex]?.current?.focusCdInput();
      }, 50);
    } else if (currentIndex === 0 && searchItemsRef.current) { 
      // First item remains expanded
      searchItemsRef.current.focus();
      const searchEl = document.getElementById('searchItems');
      if (searchEl) centerElementInViewport(searchEl);
    }
  };

  // Function to load draft from localStorage
  const loadDraft = () => {
    const storedDraft = localStorage.getItem('invoicingDraft');
    if (storedDraft) {
      try {
        const draft: InvoiceDraft = JSON.parse(storedDraft);
        setDate(draft.date);
        setSeries(draft.series);
        setBillNo(draft.billNo);
        setCash(draft.cash);
        
        // For party and SM, match with current options to ensure proper references
        if (draft.party && draft.party.value) {
          // Find matching party in current options
          const matchedParty = partyOptions.find(p => p.value == draft.party.value);
          if (matchedParty) {
            setParty(matchedParty);
          } else {
            console.warn(`Party with value ${draft.party.value} not found in current options`);
            setParty(draft.party); // Fallback to saved party
          }
        } else {
          setParty(null);
        }
        
        // Similar approach for SM
        if (draft.sm && draft.sm.value) {
          const matchedSm = smOptions.find(s => s.value === draft.sm.value);
          if (matchedSm) {
            setSm(matchedSm);
          } else {
            console.warn(`SM with value ${draft.sm.value} not found in current options`);
            setSm(draft.sm); // Fallback to saved SM
          }
        } else {
          setSm(null);
        }
        
        setRef(draft.ref);
        setDueDays(draft.dueDays);
        
        if (contextSetItems) {
          contextSetItems(draft.items);
        }

        setToast({
          visible: true,
          message: 'Draft loaded successfully!',
          type: 'success'
        });
        
        // The comparison effect will handle updating showLoadDraftButton
        // But let's set it explicitly here to ensure it happens immediately
        setShowLoadDraftButton(false);

      } catch (e) {
        console.error("Failed to parse draft data from localStorage", e);
        setToast({
          visible: true,
          message: 'Failed to load draft. The data might be corrupted.',
          type: 'error'
        });
        localStorage.removeItem('invoicingDraft');
        setDraftExistsInStorage(false);
        setShowLoadDraftButton(false);
      }
    } else {
      setToast({
        visible: true,
        message: 'No draft found to load.',
        type: 'info'
      });
    }
  };

  if (loading) {
    return (
      <div>
        <PageMeta
          title="Invoicing | FMCG Vite Admin Template"
          description="Create Invoice in FMCG Vite Admin Template"
        />
        <PageBreadcrumb pageTitle="Invoicing" />
        <InvoicingSkeletonLoader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-lg text-red-600 dark:text-red-400">{error}</div>
      </div>
    );
  }

  return (
    <div>
      <PageMeta
        title="Invoicing | FMCG Vite Admin Template"
        description="Create Invoice in FMCG Vite Admin Template"
      />
      <PageBreadcrumb 
        pageTitle="Invoicing" 
        showDraftIcon={showLoadDraftButton}
        onDraftIconClick={loadDraft} 
      />
      
      <Toast         
        message={toast.message}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast({ ...toast, visible: false })}
      />
      
      <FormComponent onSubmit={handleSubmit} autoComplete="off">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div>
              <DatePicker
                id="date"
                label="Date"
                value={date}
                onChange={handleDateChange}
                dateFormatType="dd-mm-yyyy"
                required
                // ref={dateRef} // Add if direct focus needed
              />
            </div>
            <div>
              <Input
                id="series"
                label="Series"
                value={series}
                onChange={handleSeriesChange}
                variant="outlined"
                maxLength={1}
                autoComplete="off"
                required
                className="uppercase"
                disabled={user && user.canSelectSeries === false}
                ref={seriesRef}
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
                required
                disabled={user && !user.routeAccess.includes('Admin')}
                ref={billNoRef}
              />
            </div>
            <div>
              <div className="flex items-center h-full">
                <div
                  className={`relative inline-block w-16 h-8 cursor-pointer rounded-full transition-colors ease-in-out duration-200 ${
                    cash === 'Y' ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                  onClick={toggleCash}
                >
                  <span
                    className={`absolute left-1 top-1 inline-block w-6 h-6 rounded-full bg-white shadow transform transition-transform duration-200 ${
                      cash === 'Y' ? 'translate-x-8' : 'translate-x-0'
                    }`}
                  />
                </div>
                <div className="ml-3 text-gray-700 dark:text-gray-300 text-sm">
                  {cash === 'Y' ? 'Cash' : 'Credit'}
                </div>
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
                autoComplete="off"
                onEnter={handlePartyEnter}
                ref={partyAutocompleteRef}
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
                options={filteredSmOptions}
                onChange={handleSmChange}
                defaultValue={sm?.value || ''}
                value={sm?.value || ''}
                disabled={!!(user && !user.routeAccess.includes('Admin') && user.smCode)}
                autoComplete="off"
                onEnter={handleSmEnter}
                ref={smAutocompleteRef}
              />
              {user && !user.routeAccess.includes('Admin') && user.smCode && (
                <p className="mt-1 text-xs text-gray-500">S/M is locked to your assigned salesman code</p>
              )}
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
                ref={refRef}
                onKeyDown={(e) => e.key === 'Enter' && handleRefEnter()}
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
                  ref={dueDaysRef}
                  onKeyDown={(e) => {if (e.key === 'Enter') {e.preventDefault(); handleDueDaysEnter();}}}
                />
              </div>
            </div>
          )}
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2 dark:text-white">Items</h2>
          
          <div className="relative max-w-md mb-4">
            <Input
              id="searchItems"
              label="Search Items"
              value={searchItems}
              onChange={handleSearchItemsChange}
              variant="outlined"
              autoComplete="off"
              ref={searchItemsRef}
              onKeyDown={(e) => {if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {e.preventDefault(); handleSearchItemsEnter();}}}
            />
          </div>
        </div>

        <div className="mb-6">
          {filteredItems().map((itemData, index) => (
            <CollapsibleItemSection
              key={index}
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
              shouldFocusOnExpand={focusNewItemIndex === index}
              onTabToNextItem={handleTabToNextItem}
              onShiftTabToPreviousItem={handleShiftTabToPreviousItem}
            />
          ))}
        </div>

        <div className="mb-6">
          <button
            type="button"
            className="px-4 py-2 text-brand-500 border border-brand-500 rounded-md hover:bg-brand-50 dark:text-brand-400 dark:border-brand-400 dark:hover:bg-gray-800"
            onClick={() => {
              // Check if there are any incomplete items
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
              // Always add a new item regardless of validation state
              contextAddItem();
            }}
            ref={addAnotherItemButtonRef}
          >
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
              {isSubmitting ? 'Submitting...' : 'Submit'}
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
              {isSubmitting ? 'Submitting...' : 'Submit & Print'}
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

const Invoicing: React.FC = () => {
  const [items, setItems] = useState<ItemData[]>([{ 
    item: '', godown: '', unit: '', stock: '', pack: '', gst: '', 
    pcBx: '', mrp: '', rate: '', qty: '', cess: '', schRs: '', sch: '', 
    cd: '', amount: '', netAmount: '', selectedItem: null, stockLimit: 0 
  }]);
  const [expandedIndex, setExpandedIndex] = useState<number>(0);
  const [focusNewItemIndex, setFocusNewItemIndex] = useState<number | null>(null);

  // Expose setItems to be callable from InvoicingContent for draft loading
  // useEffect(() => {
  //   (window as any).setInvoiceItems = setItems;
  //   return () => {
  //     delete (window as any).setInvoiceItems; // Clean up
  //   };
  // }, [setItems]);

  // Item management functions
  const addItem = () => {
    const newItem: ItemData = { 
      item: '', godown: '', unit: '', stock: '', pack: '', gst: '', 
      pcBx: '', mrp: '', rate: '', qty: '', cess: '', schRs: '', sch: '', 
      cd: '', amount: '', netAmount: '', selectedItem: null, stockLimit: 0 // Initial stockLimit is 0
    };
    const newItems = [...items, newItem];
    setItems(newItems);
    // Set the expanded index to the new item
    setExpandedIndex(newItems.length - 1);
    setFocusNewItemIndex(newItems.length - 1);
  };

  const removeItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const updateItem = (index: number, newData: ItemData) => {
    const newItems = [...items];
    newItems[index] = newData; // newData from CollapsibleItemSection should now have the correct stockLimit
    setItems(newItems);
  };

  const calculateTotal = () => {
    return items
      .reduce((sum, item) => sum + parseFloat(item.netAmount || '0'), 0)
      .toFixed(2);
  };

  // Reset focusNewItemIndex after it has been used
  // This might need to be coordinated with CollapsibleItemSection if it signals back after focusing.
  // For simplicity, reset it after a short delay or when expandedIndex changes away from it.
  useEffect(() => {
    if (focusNewItemIndex !== null) {
        // Simple reset, assuming CollapsibleItemSection will pick up shouldFocusOnExpand once.
        // A more robust way might involve a callback from CollapsibleItemSection after it focuses.
        const timer = setTimeout(() => setFocusNewItemIndex(null), 100);
        return () => clearTimeout(timer);
    }
  }, [focusNewItemIndex]);

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
      <InvoicingContent />
    </InvoiceProvider>
  );
};

export default Invoicing; 