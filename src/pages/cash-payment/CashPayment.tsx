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
import apiCache from '../../utils/apiCache';
import useAuth from "../../hooks/useAuth";

// Utility function to center an element in the viewport
const centerElementInViewport = (element: HTMLElement) => {
  if (!element) return;
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'center' 
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
  voucherNo: string;
  narration: string;
  party?: string;
  sm?: string;
  smName?: string;
}

interface VoucherIdInfo {
  nextReceiptNo: number;
  nextSeries: {
    [key: string]: number;
  };
}

interface CashPaymentEntry {
  voucherNo: string;
  date: string;
  series: string;
  amount: string;
  discount: string;
  narration: string;
  party: string; // Assuming party is a string ID/code
  sm?: string; // Add missing sm property
  // Add other properties if they exist in the cash payment objects
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

const CashPayment: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [party, setParty] = useState<PartyOption | null>(null);
  const [partyOptions, setPartyOptions] = useState<PartyOption[]>([]);
  const [sm, setSm] = useState<PartyOption | null>(null);
  const [smOptions, setSmOptions] = useState<PartyOption[]>([]);
  const [voucherNo, setVoucherNo] = useState<string | null>(null);
  const [voucherIdInfo, setVoucherIdInfo] = useState<VoucherIdInfo | null>(null);
  const [formValues, setFormValues] = useState<FormValues>({
    date: getTodayFormatted(),
    series: '',
    amount: '',
    discount: '',
    voucherNo: '',
    narration: '',
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const { user } = useAuth();

  const navigate = useNavigate();

  // Define field order for Enter key navigation
  const fieldOrder = [
    'party-select',
    'sm-select',
    'date',
    'series',
    'voucherNo',
    'amount',
    'discount',
    'narration'
  ];

  // Ref for the Series input field
  const seriesInputRef = useRef<InputRefHandle>(null);

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
    // Consider if there's a loading state that needs to resolve before focusing.
    // For now, assuming it can be focused on initial mount or after user/defaultSeries logic.
    if (seriesInputRef.current) {
      seriesInputRef.current.focus();
      // Also center it
      const seriesElement = document.getElementById('series'); // Assuming 'series' is the ID
      if (seriesElement) {
        centerElementInViewport(seriesElement);
      }
    }
  }, []); // Empty dependency array ensures this runs once on mount

  // Apply default series from user settings
  useEffect(() => {
    if (user && user.defaultSeries && user.defaultSeries.cashPayment && !isEditMode && !formValues.series) {
      setFormValues(prev => ({
        ...prev,
        series: user.defaultSeries.cashPayment
      }));
      // If seriesInputRef is already focused, this state update won't blur it.
      // If focus hasn't happened yet, the focus useEffect will handle it.
    }
  }, [user, isEditMode, formValues.series]);

  // Fetch edit data if in edit mode
  useEffect(() => {
    if (id) {
      setIsEditMode(true);
      const fetchEditData = async () => {
        try {
          const res = await fetch(constants.baseURL + '/json/cash-payments', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          const rawData = await res.json();
          // It's good practice to validate or ensure rawData is an array before calling find
          const data: CashPaymentEntry[] = Array.isArray(rawData) ? rawData : [];
          console.log('data', data);

          const voucher = id;

          const paymentToEdit = data.find((payment) => payment.voucherNo === voucher);

          if (!paymentToEdit) {
            setToastMessage('Payment record not found');
            setToastType('error');
            setShowToast(true);
            return;
          }

          setVoucherNo(paymentToEdit.voucherNo);

          const updatedValues = {
            date: formatDateForDisplay(paymentToEdit.date),
            series: paymentToEdit.series,
            amount: paymentToEdit.amount,
            discount: paymentToEdit.discount,
            voucherNo: paymentToEdit.voucherNo,
            narration: paymentToEdit.narration,
          };
          
          setFormValues(updatedValues);

          // Use apiCache for CMPL data
          const partyData = await apiCache.fetchWithCache<CmplEntry[]>(`${constants.baseURL}/cmpl`);
          
          // Use apiCache for balance data
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
            console.log(`Filtering parties by user's assigned subgroups, but always including EE prefix`);
            
            // Get all subgroup prefixes from user's assigned subgroups
            const subgroupPrefixes = user.subgroups.map((sg: any) => 
              sg.subgroupCode.substring(0, 2).toUpperCase()
            );
            
            console.log(`User's subgroup prefixes: ${subgroupPrefixes.join(', ')}`);
            
            // Filter parties: include if EE prefix OR if C_CODE starts with any of the user's subgroup prefixes
            filteredPartyData = filteredPartyData.filter((party) => {
              const partyPrefix = party.C_CODE.substring(0, 2).toUpperCase();
              // Always include if prefix is EE
              if (partyPrefix === 'EE') {
                return true;
              }
              // Otherwise, include if it matches one of the user's subgroup prefixes
              return subgroupPrefixes.includes(partyPrefix);
            });
            
            console.log(`Filtered to ${filteredPartyData.length} parties based on user's subgroups and EE inclusion`);
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
              label: `${party.C_NAME} | ${party.C_CODE}`,
            };
          });

          setPartyOptions(partyList);
          
          setParty(partyList.find((p: PartyOption) => p.value === paymentToEdit.party));

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

            // Set S/M if editing and S/M code exists on payment
            if (paymentToEdit.sm) { 
              const currentSm = smApiOptions.find((s: PartyOption) => s.value === paymentToEdit.sm);
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
          console.error('Error fetching edit data:', error);
          setToastMessage('Failed to load payment details');
          setToastType('error');
          setShowToast(true);
        }
      };
      fetchEditData();
    } else {
      // Fetch party data and S/M data for new payment
      const fetchDataForNewEntry = async () => {
        try {
          // Use apiCache for CMPL data
          const partyData = await apiCache.fetchWithCache<CmplEntry[]>(`${constants.baseURL}/cmpl`);
          const cmplData = partyData; // Define cmplData variable to fix reference errors
          
          // Use apiCache for balance data
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
            console.log(`Filtering parties by user's assigned subgroups, but always including EE prefix`);
            
            // Get all subgroup prefixes from user's assigned subgroups
            const subgroupPrefixes = user.subgroups.map((sg: any) => 
              sg.subgroupCode.substring(0, 2).toUpperCase()
            );
            
            console.log(`User's subgroup prefixes: ${subgroupPrefixes.join(', ')}`);
            
            // Filter parties: include if EE prefix OR if C_CODE starts with any of the user's subgroup prefixes
            filteredPartyData = filteredPartyData.filter((party) => {
              const partyPrefix = party.C_CODE.substring(0, 2).toUpperCase();
              // Always include if prefix is EE
              if (partyPrefix === 'EE') {
                return true;
              }
              // Otherwise, include if it matches one of the user's subgroup prefixes
              return subgroupPrefixes.includes(partyPrefix);
            });
            
            console.log(`Filtered to ${filteredPartyData.length} parties based on user's subgroups and EE inclusion`);
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
              label: `${party.C_NAME} | ${party.C_CODE}`,
            };
          });

          setPartyOptions(partyList);
          
          // Process S/M options from the same CMPL data
          if (Array.isArray(cmplData)) {
            const smList = cmplData.filter(item => 
              item.C_CODE && item.C_CODE.startsWith('SM') && !item.C_CODE.endsWith('000')
            );
            const smApiOptions = smList.map((item: any) => ({
              value: item.C_CODE, // Assuming C_CODE is the SM_CODE
              label: `${item.C_NAME} | ${item.C_CODE}`, // Assuming C_NAME is the SM_NAME
            }));
            setSmOptions(smApiOptions);
            // Auto-selection for new data is handled by a separate useEffect below
          } else {
            console.warn('CMPL data for S/M is not an array:', cmplData);
            setSmOptions([]);
            setToastMessage('Failed to fetch S/M options (CMPL data invalid)');
            setToastType('error');
            setShowToast(true);
          }
          
          // Clear expired cache entries
          apiCache.clearExpiredCache();
        } catch (error) {
          setToastMessage('Failed to fetch party data');
          setToastType('error');
          setShowToast(true);
        }
      };
      
      fetchDataForNewEntry(); // Renamed from fetchPartyData
    }
  }, [id, user]);

  // Filter SM options based on user's role and assigned SM code
  const filteredSmOptions = useMemo(() => {
    if (!user || !smOptions) return [];
    
    const isAdmin = user.routeAccess && user.routeAccess.includes('Admin');
    
    if (!isAdmin && user.smCode) {
      const userSm = smOptions.find(option => option.value === user.smCode);
      return userSm ? [userSm] : [];
    }
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
    if (user && smOptions && smOptions.length > 0 && !isEditMode) {
      const isAdmin = user.routeAccess && user.routeAccess.includes('Admin');
      
      if (user.smCode && !isAdmin) {
        const userSm = smOptions.find(option => option.value === user.smCode);
        if (userSm) {
          setSm(userSm);
        }
      }
    }
  }, [user, smOptions, isEditMode]);

  // Handle fetch next voucher number
  useEffect(() => {
    const fetchNextVoucherNo = async () => {
      try {
        const response = await fetch(`${constants.baseURL}/slink/cashPaymentId`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        // If the response is 304 Not Modified, we don't need to update state
        if (response.status === 304) {
          console.log('Voucher ID info unchanged, using cached data');
          return;
        }
        
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        setVoucherIdInfo(data);
        
        // Set the next voucher number
        setVoucherNo(data.nextReceiptNo.toString());
        
        // Apply default series if available and get its next number
        if (user?.defaultSeries?.cashPayment) {
          const series = user.defaultSeries.cashPayment.toUpperCase();
          const seriesNextNumber = data.nextSeries && data.nextSeries[series] 
            ? data.nextSeries[series] 
            : 1;
          
          const updatedValues = {
            ...formValues,
            series: series,
            voucherNo: seriesNextNumber.toString()
          };
          
          setFormValues(updatedValues);
          
          // Generate narration based on voucher number and series
          setTimeout(() => updateNarration(updatedValues), 0);
        } else {
          const updatedValues = {
            ...formValues,
            voucherNo: data.nextReceiptNo.toString()
          };
          
          setFormValues(updatedValues);
          
          // Generate narration based on voucher number
          setTimeout(() => updateNarration(updatedValues), 0);
        }
      } catch (error) {
        console.error('Error fetching next voucher ID info:', error);
        // Fallback to the old approach
        fetchFallbackVoucherNo();
      }
    };

    if (!isEditMode) {
      fetchNextVoucherNo();
    }
  }, [isEditMode, user]);

  // Update voucher number when series changes (if we have voucher ID info)
  useEffect(() => {
    if (!isEditMode && voucherIdInfo && formValues.series) {
      // Only auto-update voucher number if it hasn't been manually edited
      // or when the series changes
      const series = formValues.series.toUpperCase();
      const seriesNextNumber = voucherIdInfo.nextSeries && voucherIdInfo.nextSeries[series] 
        ? voucherIdInfo.nextSeries[series] 
        : 1; // Start with 1 for new series
      
      const newVoucherNo = seriesNextNumber.toString();
      
      setFormValues(prev => ({
        ...prev,
        voucherNo: newVoucherNo
      }));
      
      // Update narration with the new voucher number and series
      setTimeout(() => {
        updateNarration({
          ...formValues,
          series: series,
          voucherNo: newVoucherNo
        });
      }, 10);
    }
  }, [formValues.series, voucherIdInfo, isEditMode]);

  // Fallback method to get next voucher number (old implementation)
  const fetchFallbackVoucherNo = async () => {
    try {
      const response = await fetch(`${constants.baseURL}/cash-payments`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      
      setVoucherNo(data.nextReceiptNo.toString());
      
      // Apply default series if available
      if (user?.defaultSeries?.cashPayment && !isEditMode) {
        const updatedValues = {
          ...formValues,
          series: user.defaultSeries.cashPayment,
          voucherNo: data.nextReceiptNo.toString()
        };
        setFormValues(updatedValues);
        
        // Generate narration based on voucher number and series
        setTimeout(() => updateNarration(updatedValues), 0);
      } else {
        const updatedValues = {
          ...formValues,
          voucherNo: data.nextReceiptNo.toString()
        };
        setFormValues(updatedValues);
        
        // Generate narration based on voucher number
        setTimeout(() => updateNarration(updatedValues), 0);
      }
    } catch (error) {
      console.error('Error fetching next voucher number:', error);
    }
  };

  const handlePartyChange = (value: string) => {
    const selectedParty = partyOptions.find(p => p.value === value);
    setParty(selectedParty || null);
  };

  const handleSmChange = (value: string) => {
    const selected = smOptions.find(option => option.value === value);
    setSm(selected || null);
  };

  // New handler for input changes (excluding date)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    if (name === 'voucherNo') {
      // Only allow numeric values, max 6 digits
      const numericValue = value.replace(/\D/g, '');
      const truncatedValue = numericValue.slice(0, 6);
      
      setFormValues(prev => {
        const updated = {
          ...prev,
          [name]: truncatedValue
        };
        
        // Update narration when voucherNo changes (even if empty)
        setTimeout(() => updateNarration(updated), 0);
        
        return updated;
      });
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
          // Optionally update narration if needed when date changes
          // updateNarration(updated);
          return updated;
      });
  };

  // Update narration when series changes
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
  
  // Function to automatically generate narration
  const updateNarration = (values: FormValues) => {
    const voucherText = values.series 
      ? `VR.No.${values.series}-${values.voucherNo || ""}`
      : `VR.No.${values.voucherNo || ""}`;
    
    setFormValues(prev => ({
      ...prev,
      narration: `TO CASH AS PER ${voucherText}`
    }));
  };

  // Refactored handleSubmit to use state directly
  const handleSubmit = async () => {
    // No e.preventDefault() needed as it's not triggered by form onSubmit

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

    // Validate other required fields if necessary
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
    if (!formValues.voucherNo) {
        setToastMessage('Voucher No. is required.');
        setToastType('error');
        setShowToast(true);
        return;
    }

    setIsSubmitting(true);

    // Prepare data directly from state
    const submissionData = {
      ...formValues,
      date: formatDateForAPI(formValues.date), // Ensure date is formatted correctly
      party: party?.value, // Get party value from state
      sm: sm?.value || '', // Add S/M value
      smName: sm?.label?.split('|')[0]?.trim() || '', // Add S/M name (extract from label)
    };

    try {
      const route = isEditMode ? `/edit/cash-payments` : `/cash-payments`;
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

      const responseData = await response.json();
      const savedVoucherNo = submissionData.voucherNo; // Use voucher number from submission data

      setToastMessage('Data saved successfully!');
      setToastType('success');
      setShowToast(true);

      // Check flag immediately before timeout
      const shouldRedirectToPrint = localStorage.getItem('redirectToPrint') === 'true';

      setTimeout(() => {
        try {
          if (shouldRedirectToPrint && savedVoucherNo) {
            localStorage.removeItem('redirectToPrint'); // Clean up flag
            console.log(`Redirecting to print page: /print?VoucherNo=${savedVoucherNo}`);
            navigate(`/print?VoucherNo=${savedVoucherNo}`);
          } else {
            console.log('Redirecting to list page: /db/cash-payments');
            navigate('/db/cash-payments');
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
      <PageMeta title="Cash Payments" description="Cash Payments Form" />
      <PageBreadcrumb pageTitle="Cash Payments" />
      
      <div className="container mx-auto px-0 py-4 md:max-w-3xl">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">Cash Payment Form</h2>
          
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
                    disabled={isSmDisabled}
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
                      id="voucherNo"
                      name="voucherNo"
                      label="Voucher No."
                      type="text"
                      value={voucherNo || formValues.voucherNo || ''}
                      onChange={handleInputChange}
                      className="w-full"
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
                onClick={() => navigate('/db/cash-payments')}
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
    </div>
  );
};

export default CashPayment; 