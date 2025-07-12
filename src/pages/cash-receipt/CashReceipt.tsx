import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Input, { InputRefHandle } from "../../components/form/input/Input";
import Autocomplete from "../../components/form/input/Autocomplete";
import DatePicker from '../../components/form/input/DatePicker';
import FormComponent from "../../components/form/Form";
import constants from "../../constants";
import Toast from '../../components/ui/toast/Toast';
import ShurutiAssistant from '../../components/ai/ShurutiAssistant';
import apiCache from '../../utils/apiCache';
import useAuth from "../../hooks/useAuth";

// Utility function to center an element in the viewport
const centerElementInViewport = (element: HTMLElement) => {
  if (!element) return;
  element.scrollIntoView({
    behavior: 'smooth', // options: smooth , auto , instant, 
    block: 'center' // options: center , start , end , nearest
  });
};

// Helper functions for date formatting
const formatDateForDisplay = (isoDate: string): string => {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return `${day}-${month}-${year}`;
};

const formatDateForAPI = (displayDate: string): string => {
  if (!displayDate) return '';
  const [day, month, year] = displayDate.split('-');
  return `${year}-${month}-${day}`;
};

// Get today's date in DD-MM-YYYY format
const getTodayFormatted = (): string => {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  return `${day}-${month}-${year}`;
};

interface PartyOption {
  value: string;
  label: string;
}

interface FormValues {
  date: string;
  series: string;
  amount: string;
  discount: string;
  receiptNo: string;
  narration: string;
  party?: string;
  sm?: string;
  smName?: string;
}

interface ReceiptIdInfo {
  nextReceiptNo: number;
  nextSeries: {
    [key: string]: number;
  };
}

interface CashReceiptEntry {
  receiptNo: string; // Note: The find condition uses ==, so it might be number or string
  date: string;
  series: string;
  amount: string;
  discount: string;
  narration: string;
  party: string; // Assuming party is a string ID/code
  sm?: string; // Salesman code might be optional
}

interface CmplEntry {
  C_CODE: string;
  C_NAME: string;
  // Add other properties from /cmpl if needed
}

interface BalanceEntry {
  partycode: string;
  result: string | number; // or a more specific type if known
}

interface BalanceResponse {
  data: BalanceEntry[];
}

// Function to calculate split amounts (Algorithm 5)
const calculateSplitAmounts = (totalAmount: number): string[] => {
  const MAX_AMOUNT_PER_SPLIT = 20000;
  const ROUND_UNIT = 500;
  const MIN_PRECISION = 0.01; // For floating point comparisons

  if (totalAmount <= MAX_AMOUNT_PER_SPLIT) {
    return [totalAmount.toFixed(2)];
  }

  const splits: string[] = [];
  let remaining = totalAmount;
  let currentIdealSplitAmount = MAX_AMOUNT_PER_SPLIT;

  while (remaining > MIN_PRECISION) {
    let amountToTake: number;

    if (currentIdealSplitAmount >= remaining - MIN_PRECISION) {
      // If ideal is greater or equal to remaining, take all remaining
      amountToTake = remaining;
    } else {
      // Otherwise, take the ideal amount
      amountToTake = currentIdealSplitAmount;
    }

    splits.push(amountToTake.toFixed(2));
    remaining -= amountToTake;
    remaining = parseFloat(remaining.toFixed(2)); // Mitigate floating point inaccuracies

    if (remaining > MIN_PRECISION) {
      const nextIdeal = Math.floor((currentIdealSplitAmount - 1) / ROUND_UNIT) * ROUND_UNIT;
      currentIdealSplitAmount = Math.max(ROUND_UNIT, nextIdeal);
      if (currentIdealSplitAmount <= 0) { // Should not happen if ROUND_UNIT is positive
        currentIdealSplitAmount = ROUND_UNIT; // Fallback, though logic should prevent this.
      }
    }
  }
  return splits;
};

const CashReceipt: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [party, setParty] = useState<PartyOption | null>(null);
  const [partyOptions, setPartyOptions] = useState<PartyOption[]>([]);
  const [sm, setSm] = useState<PartyOption | null>(null);
  const [smOptions, setSmOptions] = useState<PartyOption[]>([]);
  const [receiptNo, setReceiptNo] = useState<string | null>(null);
  const [receiptIdInfo, setReceiptIdInfo] = useState<ReceiptIdInfo | null>(null);
  const [formValues, setFormValues] = useState<FormValues>({
    date: getTodayFormatted(),
    series: '',
    amount: '',
    discount: '',
    receiptNo: '',
    narration: '',
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const { user } = useAuth();

  // New states for amount splitting
  const [originalAmountInput, setOriginalAmountInput] = useState<string>('');
  const [splitAmounts, setSplitAmounts] = useState<string[]>([]);
  const [isAmountOverLimit, setIsAmountOverLimit] = useState<boolean>(false);

  const navigate = useNavigate();

  // Ref for the Series input field
  const seriesInputRef = useRef<InputRefHandle>(null);

  // Define field order for Enter key navigation
  const fieldOrder = [
    'party-select',
    'sm-select',
    'date',
    'series',
    'receiptNo',
    'amount',
    'discount',
    'narration'
  ];

  // Handle Enter key for field navigation - ENHANCED WITH SCROLLING
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        const activeElement = document.activeElement as HTMLElement;
        if (!activeElement || !activeElement.id) return;
        
        e.preventDefault();
        
        const currentIndex = fieldOrder.indexOf(activeElement.id);
        
        if (currentIndex >= 0 && currentIndex < fieldOrder.length - 1) {
          const nextFieldId = fieldOrder[currentIndex + 1];
          const nextField = document.getElementById(nextFieldId) as HTMLElement | null; // Ensure it can be null
          if (nextField) {
            nextField.focus();
            centerElementInViewport(nextField); // Center the newly focused field
            
            if (nextField instanceof HTMLInputElement) {
              const inputLength = nextField.value.length;
              nextField.setSelectionRange(inputLength, inputLength);
            }
          }
        }
      }
    };
    
    fieldOrder.forEach(fieldId => {
      const element = document.getElementById(fieldId);
      if (element) {
        element.addEventListener('keydown', handleKeyDown);
      }
    });
    
    return () => {
      fieldOrder.forEach(fieldId => {
        const element = document.getElementById(fieldId);
        if (element) {
          element.removeEventListener('keydown', handleKeyDown);
        }
      });
    };
  }, [fieldOrder]); // fieldOrder is stable, so this runs once

  // useEffect for centering on focus (for Tab/Shift+Tab)
  useEffect(() => {
    const handleFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement) {
        centerElementInViewport(event.target);
      }
    };

    const elements: HTMLElement[] = [];
    fieldOrder.forEach(fieldId => {
      const element = document.getElementById(fieldId);
      if (element) {
        element.addEventListener('focus', handleFocus);
        elements.push(element); // Keep track for cleanup
      }
    });

    return () => {
      elements.forEach(element => {
        element.removeEventListener('focus', handleFocus);
      });
    };
  }, [fieldOrder]); // fieldOrder is stable, so this runs once

  // useEffect to focus Series input on page load
  useEffect(() => {
    if (seriesInputRef.current) {
      seriesInputRef.current.focus();
      const seriesElement = document.getElementById('series'); // Assuming 'series' is the ID
      if (seriesElement) {
        centerElementInViewport(seriesElement);
      }
    }
  }, []); // Empty dependency array ensures this runs once on mount

  // Apply default series from user settings
  useEffect(() => {
    if (user && user.defaultSeries && user.defaultSeries.cashReceipt && !isEditMode && !formValues.series) {
      setFormValues(prev => ({
        ...prev,
        series: user.defaultSeries.cashReceipt
      }));
    }
  }, [user, isEditMode, formValues.series]); // formValues.series dependency ensures it runs if series is cleared then default applied

  // Fetch receipt ID information (next receipt number for each series)
  useEffect(() => {
    if (!isEditMode) {
      const fetchNextReceiptInfo = async () => {
        try {
          const response = await fetch(`${constants.baseURL}/slink/cashReceiptId`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          
          // If the response is 304 Not Modified, we don't need to update state
          if (response.status === 304) {
            console.log('Receipt ID info unchanged, using cached data');
            return;
          }
          
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
          
          const data = await response.json();
          setReceiptIdInfo(data);
          
          // Set the next receipt number
          setReceiptNo(data.nextReceiptNo.toString());
          
          // Apply default series if available and get its next number
          if (user?.defaultSeries?.cashReceipt) {
            const series = user.defaultSeries.cashReceipt.toUpperCase();
            const seriesNextNumber = data.nextSeries && data.nextSeries[series] 
              ? data.nextSeries[series] 
              : 1;
            
            const updatedValues = {
              ...formValues,
              series: series,
              receiptNo: seriesNextNumber.toString()
            };
            
            setFormValues(updatedValues);
            
            // Generate narration based on receipt number and series
            setTimeout(() => updateNarration(updatedValues), 0);
          } else {
            const updatedValues = {
              ...formValues,
              receiptNo: data.nextReceiptNo.toString()
            };
            
            setFormValues(updatedValues);
            
            // Generate narration based on receipt number
            setTimeout(() => updateNarration(updatedValues), 0);
          }
        } catch (error) {
          console.error('Error fetching next receipt ID info:', error);
          // Fallback to the old approach
          fallbackFetchNextReceiptNo();
        }
      };
      
      fetchNextReceiptInfo();
    }
  }, [isEditMode, user]);

  // Update receipt number when series changes (if we have receipt ID info)
  useEffect(() => {
    if (!isEditMode && receiptIdInfo && formValues.series) {
      // Only auto-update receipt number if it hasn't been manually edited
      // or when the series changes
      const series = formValues.series.toUpperCase();
      const seriesNextNumber = receiptIdInfo.nextSeries && receiptIdInfo.nextSeries[series] 
        ? receiptIdInfo.nextSeries[series] 
        : 1; // Start with 1 for new series
      
      const newReceiptNo = seriesNextNumber.toString();
      
      setFormValues(prev => ({
        ...prev,
        receiptNo: newReceiptNo
      }));
      
      // Update narration with the new receipt number and series
      setTimeout(() => {
        updateNarration({
          ...formValues,
          series: series,
          receiptNo: newReceiptNo
        });
      }, 10);
    }
  }, [formValues.series, receiptIdInfo, isEditMode]);

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

  // Determine if S/M field should be disabled
  const isSmDisabled = useMemo(() => {
    if (!user) return false;
    const isAdmin = user.routeAccess && user.routeAccess.includes('Admin');
    return !!(!isAdmin && user.smCode);
  }, [user]);

  // Auto-select SM based on user's smCode (only for new entries)
  useEffect(() => {
    if (user && smOptions && smOptions.length > 0 && !isEditMode) { // Ensure not in edit mode
      const isAdmin = user.routeAccess && user.routeAccess.includes('Admin');
      
      if (user.smCode && !isAdmin) {
        const userSm = smOptions.find(option => option.value === user.smCode);
        if (userSm) {
          setSm(userSm);
        }
      }
    }
  }, [user, smOptions, isEditMode]); // Added isEditMode dependency

  // Fallback method to get next receipt number (old implementation)
  const fallbackFetchNextReceiptNo = async () => {
    try {
      const response = await fetch(`${constants.baseURL}/cash-receipts`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      
      setReceiptNo(data.nextReceiptNo.toString());
      
      // Apply default series if available
      if (user?.defaultSeries?.cashReceipt && !isEditMode) {
        const updatedValues = {
          ...formValues,
          series: user.defaultSeries.cashReceipt,
          receiptNo: data.nextReceiptNo.toString()
        };
        setFormValues(updatedValues);
        
        // Generate narration based on receipt number and series
        setTimeout(() => updateNarration(updatedValues), 0);
      } else {
        const updatedValues = {
          ...formValues,
          receiptNo: data.nextReceiptNo.toString()
        };
        setFormValues(updatedValues);
        
        // Generate narration based on receipt number
        setTimeout(() => updateNarration(updatedValues), 0);
      }
    } catch (error) {
      console.error('Error fetching next receipt number:', error);
    }
  };

  useEffect(() => {
    const fetchEditData = async () => {
      try {
        const res = await fetch(constants.baseURL + '/json/cash-receipts', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        const rawReceiptData = await res.json();
        // Ensure rawReceiptData is an array before calling find
        const data: CashReceiptEntry[] = Array.isArray(rawReceiptData) ? rawReceiptData : [];
        console.log('data', data);

        const receipt = id;

        const receiptToEdit = data.find((rec) => rec.receiptNo == receipt); // Consider strict equality if types are certain

        if (!receiptToEdit) {
          setToastMessage('Receipt record not found');
          setToastType('error');
          setShowToast(true);
          return;
        }

        setReceiptNo(receiptToEdit.receiptNo);

        const updatedValues = {
          date: formatDateForDisplay(receiptToEdit.date),
          series: receiptToEdit.series,
          amount: receiptToEdit.amount,
          discount: receiptToEdit.discount,
          receiptNo: receiptToEdit.receiptNo,
          narration: receiptToEdit.narration,
        };
        
        setFormValues(updatedValues);

        // Use apiCache for CMPL data
        const partyData = await apiCache.fetchWithCache<CmplEntry[]>(`${constants.baseURL}/cmpl`);
        
        // Use balance API directly from the specified endpoint
        const balanceData = await apiCache.fetchWithCache<BalanceResponse>(`${constants.baseURL}/json/balance`);
        
        // Create a balance lookup map
        const balanceMap = new Map<string, string | number>();
        if (balanceData && Array.isArray(balanceData.data)) {
          balanceData.data.forEach((item) => {
            balanceMap.set(item.partycode, item.result);
          });
        }

        // Check if user is admin
        const isAdmin = user && user.routeAccess && user.routeAccess.includes('Admin');

        // Filter parties based on user's subgroup if applicable and exclude C_CODE ending with "000"
        let filteredPartyData = partyData ? partyData.filter((party) => !party.C_CODE.endsWith('000')) : [];
        
        if (!isAdmin && user && user.subgroups && user.subgroups.length > 0) {
          console.log(`Filtering parties by user's assigned subgroups`);
          
          // Get all subgroup prefixes from user's assigned subgroups
          const subgroupPrefixes = user.subgroups.map((sg: any) => 
            sg.subgroupCode.substring(0, 2).toUpperCase()
          );
          
          console.log(`User's subgroup prefixes: ${subgroupPrefixes.join(', ')}`);
          
          // Filter parties where C_CODE starts with any of the user's subgroup prefixes
          filteredPartyData = filteredPartyData.filter((party) => {
            const partyPrefix = party.C_CODE.substring(0, 2).toUpperCase();
            return subgroupPrefixes.includes(partyPrefix);
          });
          
          console.log(`Filtered to ${filteredPartyData.length} parties based on user's subgroups`);
        } else if (isAdmin) {
          console.log('User is admin - showing all parties without filtering');
        }

        const partyList = filteredPartyData.map((party) => {
          // Get balance for this party
          const balance = balanceMap.get(party.C_CODE);
          
          // Check if balance is non-zero (either greater or in negative)
          const hasNonZeroBalance = balance && balance.toString().trim() !== '0 CR' && balance.toString().trim() !== '0 DR';
          
          return {
            value: party.C_CODE,
            label: hasNonZeroBalance
              ? `${party.C_NAME} | ${party.C_CODE} / ${balance}`
              : `${party.C_NAME} | ${party.C_CODE}`,
          };
        });

        setPartyOptions(partyList);
        setParty(partyList.find((p: PartyOption) => p.value == receiptToEdit.party));

        // Fetch S/M options from /cmpl and filter
        const cmplData = await apiCache.fetchWithCache<any[]>(`${constants.baseURL}/cmpl`);
        if (Array.isArray(cmplData)) {
          const smList = cmplData.filter(item => 
            item.C_CODE && item.C_CODE.startsWith('SM') && !item.C_CODE.endsWith('000')
          );
          const smApiOptions = smList.map((item: any) => ({
            value: item.C_CODE, // Assuming C_CODE is the SM_CODE
            label: `${item.C_NAME} | ${item.C_CODE}`, // Assuming C_NAME is the SM_NAME
          }));
          setSmOptions(smApiOptions);

          // Set S/M if editing and S/M code exists on receipt
          if (receiptToEdit.sm) { 
            const currentSm = smApiOptions.find((s: PartyOption) => s.value === receiptToEdit.sm);
            if (currentSm) {
              setSm(currentSm);
            }
          }
        } else {
          console.warn('CMPL data for S/M is not an array:', cmplData);
          setSmOptions([]);
          setToastMessage('Failed to fetch S/M options (CMPL data invalid)');
          setToastType('error');
          setShowToast(true);
        }

      } catch (error) {
        console.error('Failed to fetch data for edit:', error);
        setToastMessage('Failed to load receipt details');
        setToastType('error');
        setShowToast(true);
      }
    };

    const fetchNewData = async () => {
      try {
        // CMPL data for party and SM options
        const cmplData = await apiCache.fetchWithCache<CmplEntry[]>(`${constants.baseURL}/cmpl`);
        // Balance data
        const balanceData = await apiCache.fetchWithCache<BalanceResponse>(`${constants.baseURL}/json/balance`);

        // Create a balance lookup map
        const balanceMap = new Map<string, string | number>();
        if (balanceData && Array.isArray(balanceData.data)) {
          balanceData.data.forEach((item) => {
            balanceMap.set(item.partycode, item.result);
          });
        }

        // Check if user is admin
        const isAdmin = user && user.routeAccess && user.routeAccess.includes('Admin');

        // Filter parties (exclude C_CODE ending with "000")
        let filteredParties = cmplData ? cmplData.filter(p => !p.C_CODE.endsWith('000')) : [];

        if (!isAdmin && user && user.subgroups && user.subgroups.length > 0) {
          console.log(`Filtering parties by user's assigned subgroups`);
          const subgroupPrefixes = user.subgroups.map((sg: any) => 
            sg.subgroupCode.substring(0, 2).toUpperCase()
          );
          console.log(`User's subgroup prefixes: ${subgroupPrefixes.join(', ')}`);
          filteredParties = filteredParties.filter(p => {
            const partyPrefix = p.C_CODE.substring(0, 2).toUpperCase();
            return subgroupPrefixes.includes(partyPrefix);
          });
          console.log(`Filtered to ${filteredParties.length} parties based on user's subgroups`);
        } else if (isAdmin) {
          console.log('User is admin - showing all parties without filtering for new entry');
        }

        const partyApiOptions = filteredParties.map((p) => {
          const balance = balanceMap.get(p.C_CODE);
          const hasNonZeroBalance = balance && balance.toString().trim() !== '0 CR' && balance.toString().trim() !== '0 DR';
          return {
            value: p.C_CODE,
            label: hasNonZeroBalance
              ? `${p.C_NAME} | ${p.C_CODE} / ${balance}`
              : `${p.C_NAME} | ${p.C_CODE}`,
          };
        });
        setPartyOptions(partyApiOptions);

        // Filter S/M options (start with 'SM' and not ending with '000')
        const smList = cmplData ? cmplData.filter(item => 
          item.C_CODE && item.C_CODE.startsWith('SM') && !item.C_CODE.endsWith('000')
        ) : [];
        
        const smApiOptions = smList.map(item => ({
          value: item.C_CODE,
          label: `${item.C_NAME} | ${item.C_CODE}`,
        }));
        setSmOptions(smApiOptions);

        // Auto-select SM if applicable
        if (user && user.smCode && !isAdmin) {
          const userSm = smApiOptions.find(option => option.value === user.smCode);
          if (userSm) {
            setSm(userSm);
          }
        }

      } catch (error) {
        console.error('Error fetching data for new receipt:', error);
        setToastMessage('Failed to load initial data');
        setToastType('error');
        setShowToast(true);
      }
    };

    if (user) { // Only fetch data once we have user info
      if (id) {
        setIsEditMode(true);
        fetchEditData();
      } else {
        fetchNewData();
      }
    }
  }, [id, user]); // Add user as dependency

  const handlePartyChange = (value: string) => {
    const selectedParty = partyOptions.find(p => p.value == value);
    setParty(selectedParty || null);
  };

  const handleSmChange = (value: string) => {
    const selected = smOptions.find(option => option.value === value);
    setSm(selected || null);
  };

  // Add a simple function to ensure uppercase series input
  const handleSeriesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow alphabetic characters and convert to uppercase
    const alphabeticValue = value.replace(/[^A-Za-z]/g, '');
    const uppercaseValue = alphabeticValue.toUpperCase();
    
    setFormValues(prev => {
      const updated = {
        ...prev,
        series: uppercaseValue
      };
      
      // Update narration when series changes
      setTimeout(() => updateNarration(updated), 0);
      return updated;
    });
  };

  // New handler for input changes (excluding date)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === 'receiptNo') {
      // Only allow numeric values, max 6 digits
      const numericValue = value.replace(/\D/g, '');
      const truncatedValue = numericValue.slice(0, 6);
      
      setFormValues(prev => {
        const updated = {
          ...prev,
          [name]: truncatedValue
        };
        
        // Update narration when receiptNo changes (even if empty)
        setTimeout(() => updateNarration(updated), 0);
        
        return updated;
      });
    } else if (name === 'amount') {
      setOriginalAmountInput(value); // Store raw input
      const numericAmount = parseFloat(value);

      if (isNaN(numericAmount)) {
        setIsAmountOverLimit(false);
        setSplitAmounts([]);
        setFormValues(prev => ({ ...prev, [name]: value }));
        return;
      }

      if (numericAmount > 200000) {
        setToastMessage('Total amount cannot exceed 200,000.');
        setToastType('error');
        setShowToast(true);
        // Optionally, revert to a valid value or clear, here we just show message
        // and keep the invalid value for user to correct or formValues.amount unchanged
        setFormValues(prev => ({ ...prev, [name]: value })); // Keep value to show user their input
        setIsAmountOverLimit(false); // Reset splitting if invalid total
        setSplitAmounts([]);
        return;
      }

      if (numericAmount > 20000) {
        setIsAmountOverLimit(true);
        const splits = calculateSplitAmounts(numericAmount);
        setSplitAmounts(splits);
        // Keep formValues.amount as the total for now, submission will handle splits
        setFormValues(prev => {
            const updated = { ...prev, [name]: value }; // Store original value in form for display
            // setTimeout(() => updateNarration(updated), 0); // Narration updates based on main receipt no and series
            return updated;
        });
      } else {
        setIsAmountOverLimit(false);
        setSplitAmounts([]);
        setFormValues(prev => {
            const updated = { ...prev, [name]: value };
            // setTimeout(() => updateNarration(updated), 0);
            return updated;
        });
      }
    } else {
      // Handle other fields normally
      setFormValues(prev => {
        const updated = {
          ...prev,
          [name]: value
        };
        
        // Update narration when amount changes
        if (name === 'amount') {
          setTimeout(() => updateNarration(updated), 0);
        }
        
        return updated;
      });
    }
  };
  
  // Specific handler for DatePicker
  const handleDateChange = (dateString: string) => {
      setFormValues(prev => {
          const updated = { ...prev, date: dateString };
          // Optionally update narration if needed when date changes, though current logic doesn't
          // updateNarration(updated);
          return updated;
      });
  };

  // Function to automatically generate narration
  const updateNarration = (values: FormValues) => {
    const receiptText = values.series 
      ? `R/NO.${values.series}-${values.receiptNo || ""}`
      : `R/NO.${values.receiptNo || ""}`;
    
    setFormValues(prev => ({
      ...prev,
      narration: `BY CASH ON ${receiptText}`
    }));
  };

  // Refactored handleSubmit to use state directly
  const handleSubmit = async () => { 
    // No e.preventDefault() needed as it's not triggered by form onSubmit

    // Validation for total amount limit
    const totalAmountValue = parseFloat(formValues.amount);
    if (isNaN(totalAmountValue) || totalAmountValue > 200000) {
        setToastMessage('Total amount cannot exceed 200,000.');
        setToastType('error');
        setShowToast(true);
        setIsSubmitting(false); 
        return;
    }

    // Validation for Party field
    if (!party) {
      setToastMessage('Party selection is required.');
      setToastType('error');
      setShowToast(true);
      return; // Stop submission if party is not selected
    }

    // Validation for S/M field (if not disabled/auto-selected)
    if (!sm && !isSmDisabled) {
        setToastMessage('S/M selection is required.');
        setToastType('error');
        setShowToast(true);
        return;
    }

    // Validate other required fields if necessary (e.g., amount)
    if (!formValues.amount || parseFloat(formValues.amount) <= 0) {
        setToastMessage('Amount is required and must be positive.');
        setToastType('error');
        setShowToast(true);
        return;
    }
     if (!formValues.date) {
        setToastMessage('Date is required.');
        setToastType('error');
        setShowToast(true);
        return;
    }
    if (!formValues.receiptNo) {
        setToastMessage('Receipt No. is required.');
        setToastType('error');
        setShowToast(true);
        return;
    }

    setIsSubmitting(true);

    // Prepare data directly from state
    const baseSubmissionData = {
      ...formValues,
      date: formatDateForAPI(formValues.date), // Ensure date is formatted correctly
      party: party?.value, // Get party value from state
      sm: sm?.value || '', // Add S/M value
      smName: sm?.label?.split('|')[0]?.trim() || '', // Add S/M name (extract from label)
    };

    try {
      const route = isEditMode ? `/edit/cash-receipts` : `/cash-receipts`;
      let firstSavedReceiptNo = formValues.receiptNo; // For navigation
      let allSubmissionsSuccessful = true;

      if (isAmountOverLimit && splitAmounts.length > 1 && !isEditMode) {
        // Handle multiple submissions for split amounts
        console.log('Submitting split amounts:', splitAmounts);
        const initialReceiptNo = parseInt(formValues.receiptNo, 10);
        if (isNaN(initialReceiptNo)) {
          setToastMessage('Invalid Receipt No. for splitting.');
          setToastType('error');
          setShowToast(true);
          setIsSubmitting(false);
          return;
        }

        for (let i = 0; i < splitAmounts.length; i++) {
          const currentSplitAmount = splitAmounts[i];
          const currentReceiptNo = (initialReceiptNo + i).toString();
          const currentNarration = `BY CASH ON R/NO.${formValues.series}-${currentReceiptNo}`;

          const splitSubmissionData = {
            ...baseSubmissionData,
            amount: currentSplitAmount,
            receiptNo: currentReceiptNo,
            narration: currentNarration,
            discount: i === 0 ? baseSubmissionData.discount : '0', // Apply discount only to the first split
            originalAmount: formValues.amount, // Optionally send the original total amount
            splitIndex: i, // Optionally send the index of this split
            totalSplits: splitAmounts.length, // Optionally send the total number of splits
          };

          console.log(`Submitting split ${i+1}/${splitAmounts.length}:`, splitSubmissionData);

          const response = await fetch(constants.baseURL + route, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(splitSubmissionData)
          });

          if (!response.ok) {
            const errorMessage = await response.text();
            setToastMessage(`Error saving split ${i+1}: ${errorMessage}`);
            setToastType('error');
            setShowToast(true);
            allSubmissionsSuccessful = false;
            // Optionally, decide if you want to stop on first error or try all
            break; // Stop on first error for now
          }
          if (i === 0) {
            firstSavedReceiptNo = currentReceiptNo; // Update for navigation
          }
        }

        if (allSubmissionsSuccessful) {
          setToastMessage(`Successfully saved ${splitAmounts.length} entries.`);
          setToastType('success');
          setShowToast(true);
        } else {
          // Toast for partial failure is already shown
          setIsSubmitting(false);
          return; // Do not proceed to navigation if any split failed
        }

      } else {
        // Handle single submission (or edit mode)
        const submissionData = {
          ...baseSubmissionData,
          amount: isAmountOverLimit && splitAmounts.length === 1 ? splitAmounts[0] : formValues.amount,
        };

        console.log('Submitting single entry:', submissionData);
        const response = await fetch(constants.baseURL + route, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify(submissionData) // Use data from state
        });
  
        if (!response.ok) {
          const errorMessage = await response.text();
          setToastMessage(`Error: ${errorMessage}`);
          setToastType('error');
          setShowToast(true);
          setIsSubmitting(false); // Reset on error before timeout
          return;
        }
        firstSavedReceiptNo = submissionData.receiptNo;
        setToastMessage('Data saved successfully!');
        setToastType('success');
        setShowToast(true);
      }

      // Check flag immediately before timeout
      const shouldRedirectToPrint = localStorage.getItem('redirectToPrint') === 'true';
      console.log('HandleSubmit: Checking redirectToPrint flag:', shouldRedirectToPrint);
      console.log('HandleSubmit: firstSavedReceiptNo:', firstSavedReceiptNo);

      setTimeout(() => {
        try {
          if (shouldRedirectToPrint && firstSavedReceiptNo) {
            console.log('HandleSubmit: Conditions met for print redirection');
            localStorage.removeItem('redirectToPrint'); // Clean up flag
            
            // If we have multiple splits, include all receipt numbers in the URL
            if (isAmountOverLimit && splitAmounts.length > 1) {
              const allReceiptNos = splitAmounts.map((_, index) => 
                (parseInt(firstSavedReceiptNo, 10) + index).toString()
              ).join(',');
              console.log(`Redirecting to print page with multiple receipts: /print?ReceiptNo=${allReceiptNos}&Series=${formValues.series}`);
              navigate(`/print?ReceiptNo=${allReceiptNos}&Series=${formValues.series}`);
            } else {
              console.log(`Redirecting to print page: /print?ReceiptNo=${firstSavedReceiptNo}&Series=${formValues.series}`);
              navigate(`/print?ReceiptNo=${firstSavedReceiptNo}&Series=${formValues.series}`);
            }
          } else {
            console.log('HandleSubmit: Redirecting to list page (no print flag or no receipt number)');
            console.log('HandleSubmit: shouldRedirectToPrint:', shouldRedirectToPrint, 'firstSavedReceiptNo:', firstSavedReceiptNo);
            navigate('/db/cash-receipts');
          }
        } catch (navError) {
          console.error("Navigation failed:", navError);
        } finally {
          setIsSubmitting(false);
        }
      }, 1500);

    } catch (error) {
      console.error('Submit error:', error);
      setToastMessage('Network error or submission failed. Please try again later.');
      setToastType('error');
      setShowToast(true);
      setIsSubmitting(false); // Reset on submit error
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-900">
      <PageMeta title="Cash Receipts" description="Cash Receipts Form" />
      <PageBreadcrumb pageTitle="Cash Receipts" />
      
      <div className="container mx-auto px-0 py-4 md:max-w-3xl">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">Cash Receipt Form</h2>
          
          <FormComponent onSubmit={(e) => e.preventDefault()}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-1">
                <DatePicker
                  id="date"
                  name="date"
                  label="Date"
                  value={formValues.date}
                  onChange={handleDateChange}
                  dateFormatType="dd-mm-yyyy"
                  placeholderText="DD-MM-YYYY"
                  required
                  className="w-full"
                />
                
                <div className="mt-4">
                  <Autocomplete
                    id="party-select"
                    label="Party"
                    options={partyOptions}
                    onChange={handlePartyChange}
                    defaultValue={party?.value}
                  />
                </div>

                <div className="mt-4">
                  <Autocomplete
                    id="sm-select"
                    label="S/M"
                    options={filteredSmOptions}
                    onChange={handleSmChange}
                    value={sm?.value || ''}
                    defaultValue={sm?.value || ''}
                    disabled={isSmDisabled} // Use pre-calculated isSmDisabled
                  />
                  {isSmDisabled && (
                    <p className="mt-1 text-xs text-gray-500">S/M is locked to your assigned salesman code</p>
                  )}
                </div>
              </div>
              
              <div className="col-span-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-1">
                    <Input 
                      ref={seriesInputRef}
                      id="series"
                      name="series" 
                      label="Series" 
                      value={formValues.series}
                      onChange={handleSeriesChange}
                      required
                      maxLength={1}
                      className="w-full uppercase"
                      disabled={user && user.canSelectSeries === false}
                    />
                  </div>
                  
                  <div className="col-span-1">
                    <Input
                      id="receiptNo"
                      name="receiptNo"
                      label="Receipt No."
                      type="text"
                      value={formValues.receiptNo || ''} 
                      onChange={handleInputChange}
                      className="w-full"
                      placeholder="Enter receipt number"
                      maxLength={6}
                      inputMode="numeric"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="col-span-1">
                    <Input 
                      id="amount"
                      name="amount"
                      type="number"
                      label="Amount"
                      value={formValues.amount}
                      onChange={handleInputChange}
                      required
                      className="w-full"
                    />
                  </div>
                  
                  <div className="col-span-1">
                    <Input 
                      id="discount"
                      name="discount"
                      type="number"
                      label="Discount"
                      value={formValues.discount}
                      onChange={handleInputChange}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Display split amounts if amount is over limit */}
                {isAmountOverLimit && splitAmounts.length > 1 && (
                  <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-md">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Amount Splits (using Receipt Nos. starting from {formValues.receiptNo}):
                    </h4>
                    <ul className="list-disc list-inside pl-2 space-y-1">
                      {splitAmounts.map((split, index) => {
                        const currentReceiptNoForDisplay = !isNaN(parseInt(formValues.receiptNo, 10)) 
                          ? (parseInt(formValues.receiptNo, 10) + index).toString()
                          : `${formValues.receiptNo}+${index}`;
                        return (
                          <li key={index} className="text-sm text-gray-600 dark:text-gray-400">
                            Split {index + 1}: {split} | R-{currentReceiptNoForDisplay}
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      This will be submitted as {splitAmounts.length} separate entries.
                    </p>
                  </div>
                )}
                
                <div className="mt-4">
                  <Input 
                    id="narration"
                    name="narration"
                    type="text"
                    label="Narration"
                    maxLength={25}
                    value={formValues.narration}
                    onChange={handleInputChange}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => navigate('/db/cash-receipts')}
                className="px-4 py-2 text-gray-500 rounded-md hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
                disabled={isSubmitting}
                onClick={() => {
                  localStorage.removeItem('redirectToPrint'); // Clear flag first
                  handleSubmit(); // Then call submit handler
                }}
              >
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 flex items-center gap-2"
                disabled={isSubmitting}
                onClick={() => {
                  localStorage.setItem('redirectToPrint', 'true'); // Set flag first
                  handleSubmit(); // Then call submit handler
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"></polyline>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                  <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
                {isSubmitting ? 'Saving...' : 'Save & Print'}
              </button>
            </div>
          </FormComponent>
        </div>
      </div>
      
      {showToast && (
        <Toast
          message={toastMessage}
          type={toastType}
          isVisible={showToast}
          onClose={() => setShowToast(false)}
        />
      )}
      
      {/* Shuruti AI Assistant */}
      <ShurutiAssistant 
        currentFormData={{
          party: party?.value,
          amount: formValues.amount,
          series: formValues.series,
          narration: formValues.narration,
          smName: sm?.label
        }}
        user={user}
        onSuggestion={(field, value) => {
          // Handle AI suggestions for form fields
          if (field === 'narration') {
            setFormValues(prev => ({ ...prev, narration: value }));
          } else if (field === 'party') {
            // Find existing party option
            const existingParty = partyOptions.find(p => 
              p.label.toLowerCase().includes(value.toLowerCase()) ||
              value.toLowerCase().includes(p.label.toLowerCase())
            );
            if (existingParty) {
              setParty(existingParty);
            } else {
              // Show toast message that party was not found
              setToastMessage(`Party "${value}" not found in existing parties. Please select from the dropdown or add manually.`);
              setToastType('error'); // Changed from 'warning' to 'error' since only 'success' | 'error' are valid types
              setShowToast(true);
              
              // Still create a temporary party option for user convenience
              const newParty = { value: value, label: value };
              setParty(newParty);
            }
          } else if (field === 'amount') {
            // Use handleInputChange to trigger split calculation logic
            const syntheticEvent = {
              target: {
                name: 'amount',
                value: value
              }
            } as React.ChangeEvent<HTMLInputElement>;
            handleInputChange(syntheticEvent);
          } else if (field === 'series') {
            setFormValues(prev => ({ ...prev, series: value.toUpperCase() }));
          }
        }}
        onSubmitAndPrint={() => {
          // This function will be called when AI processes "Submit and Print" command
          handleSubmit();
        }}
      />
    </div>
  );
};

export default CashReceipt;