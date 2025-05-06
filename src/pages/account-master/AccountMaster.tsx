import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Input from "../../components/form/input/Input";
import Autocomplete from "../../components/form/input/Autocomplete";
import FormComponent from "../../components/form/Form";
import constants from "../../constants";
import { useAuth, getUserSubgroups, hasMultipleSubgroups, hasSingleSubgroup } from '../../contexts/AuthContext';
import apiCache from '../../utils/apiCache';
import { FormSkeletonLoader } from "../../components/ui/skeleton/SkeletonLoader";
import Toast from '../../components/ui/toast/Toast';
import { validateGSTIN, validatePAN, validateFSSAI, fetchGSTINDetails, validatePANFormat, validateGSTINFormat } from '../../utils/validators';

interface Option {
  label: string;
  value: string;
}

interface FormValues {
  achead: string;
  addressline1: string;
  addressline2: string;
  place: string;
  pincode: string;
  mobile: string;
  pan: string;
  aadhar: string;
  gstin: string;
  dlno: string;
  fssaino: string;
  email: string;
  statecode: string;
  subgroup: string;
  businessName: string;
}

interface ValidationErrors {
  gstin?: string;
  pan?: string;
  fssaino?: string;
  mobile?: string;
  pincode?: string;
  aadhar?: string;
}

// Add this interface to define Input component's error prop type
interface InputProps {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  variant: string;
  autoComplete: string;
  required?: boolean;
  maxLength?: number;
  type?: string;
  error?: string;
  hint?: string;
}

interface AccountMasterEntry {
  subgroup: string;
  achead?: string;
  addressline1?: string;
  addressline2?: string;
  place?: string;
  pincode?: string;
  mobile?: string;
  pan?: string;
  aadhar?: string;
  gst?: string;
  dlno?: string;
  fssaino?: string;
  email?: string;
  statecode?: string;
  businessName?: string;
}

interface SubgroupEntry {
  title: string;
  subgroupCode: string;
}

interface StateEntry {
  ST_CODE: string;
  ST_NAME: string;
}

const AccountMaster: React.FC = () => {
  const [group, setGroup] = useState<Option[]>([]);
  const [subgroup, setSubgroup] = useState<Option[]>([]);
  const [city, setCity] = useState<Option[]>([]);
  const [isEDIT, setIsEDIT] = useState<boolean>(false);
  const [SubName, setSubName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [isTouched, setIsTouched] = useState<Record<string, boolean>>({});
  const [fieldBlurred, setFieldBlurred] = useState<Record<string, boolean>>({});
  const [formValues, setFormValues] = useState<FormValues>({
    achead: '',
    addressline1: '',
    addressline2: '',
    place: '',
    pincode: '',
    mobile: '',
    pan: '',
    aadhar: '',
    gstin: '',
    dlno: '',
    fssaino: '',
    email: '',
    statecode: '',
    subgroup: '',
    businessName: '',
  });
  const navigate = useNavigate();
  const { user } = useAuth();
  const [toast, setToast] = useState<{ 
    visible: boolean, 
    message: string, 
    type: 'success' | 'error' | 'info' 
  }>({ 
    visible: false, 
    message: '', 
    type: 'info' 
  });

  // Check if user is admin
  const isAdmin = user && user.routeAccess && user.routeAccess.includes('Admin');

  // Configure field order for Enter key navigation
  const fieldOrder = [
    'subgroup',
    'achead',
    'addressline1',
    'addressline2', 
    'place',
    'pincode',
    'mobile',
    'pan',
    'aadhar',
    'gstin',
    'dlno',
    'fssaino',
    'email',
    'statecode'
  ];

  // Handle Enter key for field navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Get the active element's ID
        const activeElement = document.activeElement as HTMLElement;
        if (!activeElement || !activeElement.id) return;
        
        // Prevent form submission
        e.preventDefault();
        
        // Find the current field index in our order
        const currentIndex = fieldOrder.indexOf(activeElement.id);
        
        // If found and not the last field, move to the next one
        if (currentIndex >= 0 && currentIndex < fieldOrder.length - 1) {
          const nextFieldId = fieldOrder[currentIndex + 1];
          const nextField = document.getElementById(nextFieldId);
          if (nextField) {
            nextField.focus();
            
            // If it's an input, move cursor to the end
            if (nextField instanceof HTMLInputElement) {
              const inputLength = nextField.value.length;
              nextField.setSelectionRange(inputLength, inputLength);
            }
          }
        }
      }
    };
    
    // Add event listener to each field
    fieldOrder.forEach(fieldId => {
      const element = document.getElementById(fieldId);
      if (element) {
        element.addEventListener('keydown', handleKeyDown);
      }
    });
    
    // Cleanup function
    return () => {
      fieldOrder.forEach(fieldId => {
        const element = document.getElementById(fieldId);
        if (element) {
          element.removeEventListener('keydown', handleKeyDown);
        }
      });
    };
  }, [fieldOrder]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const currentUrl = window.location.href;
        
        if (currentUrl.includes('edit')) {
          setIsEDIT(true);
          const subgroup = currentUrl.split('?sub=').pop() || '';
          console.log('Fetching account data for subgroup:', subgroup);

          // Use apiCache for account-master data
          const data = await apiCache.fetchWithCache<AccountMasterEntry[]>(`${constants.baseURL}/json/account-master`);
          console.log('Account data:', data);

          const account = data.find((account) => account.subgroup === subgroup);
          if (account) {
            console.log('Found account:', account);
            setGroup([{ label: account.subgroup, value: account.subgroup }]);
            setSubgroup([{ label: account.subgroup, value: account.subgroup }]);
            setFormValues({
              subgroup: account.subgroup,
              achead: account.achead || '',
              addressline1: account.addressline1 || '',
              addressline2: account.addressline2 || '',
              place: account.place || '',
              pincode: account.pincode || '',
              mobile: account.mobile || '',
              pan: account.pan || '',
              aadhar: account.aadhar || '',
              gstin: account.gst || '',
              dlno: account.dlno || '',
              fssaino: account.fssaino || '',
              email: account.email || '',
              statecode: account.statecode || '',
              businessName: account.businessName || '',
            });
          } else {
            console.error('Account not found for subgroup:', subgroup);
            console.error('Available accounts:', data);
            throw new Error(`Subgroup "${subgroup}" not found in account data`);
          }
        } else {
          setIsEDIT(false);
          const response = await fetch(`${constants.baseURL}/slink/subgrp`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          if (!response.ok) {
            throw new Error('Failed to fetch subgroup data');
          }
          const data = await response.json() as SubgroupEntry[];
          
          // Get all available subgroups
          const allSubgroups = data.map((party) => ({
            label: party.title,
            value: party.subgroupCode,
          }));
          
          // Filter subgroups based on user permissions
          if (!isAdmin && user) {
            const userSubgroups = getUserSubgroups(user);
            const allowedSubgroupCodes = userSubgroups.map(sg => sg.subgroupCode);
            
            // Filter groups to only include allowed subgroups
            const filteredGroups = allSubgroups.filter(g => 
              allowedSubgroupCodes.includes(g.value)
            );
            
            setGroup(filteredGroups);
            
            // If user has only one subgroup or only one subgroup is available, pre-select it
            if (hasSingleSubgroup(user) || filteredGroups.length === 1) {
              const subgroupOption = hasSingleSubgroup(user) ? 
                {
                  label: userSubgroups[0]?.title || 'Unknown',
                  value: userSubgroups[0]?.subgroupCode || ''
                } : 
                filteredGroups[0];
              
              setSubgroup([subgroupOption]);
              
              setFormValues({
                ...formValues,
                subgroup: subgroupOption.value
              });
            }
          } else {
            // For admin users, show all subgroups
            setGroup(allSubgroups);
            
            // If only one subgroup is available, auto-select it
            if (allSubgroups.length === 1) {
              setSubgroup([allSubgroups[0]]);
              setFormValues({
                ...formValues,
                subgroup: allSubgroups[0].value
              });
            }
          }
        }

        // Fetch state data with caching
        const stateData = await apiCache.fetchWithCache<StateEntry[]>(`${constants.baseURL}/api/dbf/state.json`);
        
        const stateList = stateData.map((state) => ({
          value: state.ST_CODE,
          label: state.ST_NAME,
        }));
        setCity(stateList);

        // Clear expired cache entries
        apiCache.clearExpiredCache();
      } catch (error) {
        console.error('Error:', error);
        setError(error instanceof Error ? error.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user, isAdmin]);

  useEffect(() => {
    const subg = localStorage.getItem('subgroup');
    if (subg) {
      const parsedSubg = JSON.parse(subg);
      setFormValues({
        ...formValues,
        subgroup: parsedSubg.subgroupCode,
      });
      setSubName(parsedSubg.title);
    }
  }, []);

  const handlePartyChange = (value: string) => {
    const selectedOption = group.find(option => option.value === value);
    if (selectedOption) {
      setSubgroup([selectedOption]);
      setFormValues({
        ...formValues,
        subgroup: value,
      });
    }
  };

  // Fetch GSTIN details when valid GSTIN is entered
  const fetchGSTINData = async (gstin: string) => {
    if (gstin.length === 15) {
      try {
        const gstinData = await fetchGSTINDetails(gstin);
        
        if (gstinData && gstinData["Legal Name"]) {
          // Set the A/C Head to Business Name when GSTIN is verified
          setFormValues({
            ...formValues,
            businessName: gstinData["Business Name"] || "",
            achead: gstinData["Business Name"] || "",
            gstin: gstin || ""
          });
          
          // Store the entity type and legal name for display
          setGSTDetails({
            entityType: gstinData["Entity Type"] || "",
            legalName: gstinData["Legal Name"] || ""
          });

        }
      } catch (error) {
        console.error("Error fetching GSTIN data:", error);
      } 
    }
  };

  // Track GSTIN verification details
  const [gstDetails, setGSTDetails] = useState<{entityType: string, legalName: string}>({
    entityType: "",
    legalName: ""
  });

  // Validate specific fields
  const validateField = (id: string, value: string) => {
    let error = '';
    
    switch (id) {
      case 'gstin':
        if (value && value.length === 15) {
          if (!validateGSTIN(value)) {
            error = 'Invalid GSTIN';
          } else {
            // if gstin is not in focus 
            // if (!fieldBlurred[id]) {
              fetchGSTINData(value);
            // }
          }
        } else if (value && value.length > 0 && fieldBlurred[id]) {
          error = 'GSTIN must be 15 characters';
        }
        break;
      case 'pan':
        if (value && value.length === 10) {
          if (!validatePAN(value)) {
            error = 'Invalid PAN format';
          }
        } else if (value && value.length > 0 && fieldBlurred[id]) {
          error = 'PAN must be 10 characters';
        }
        break;
      case 'fssaino':
        if (value && fieldBlurred[id]) {
          const fssaiResult = validateFSSAI(value);
          if (fssaiResult !== true) {
            error = fssaiResult as string;
          }
        }
        break;
      case 'mobile':
        if (!value && fieldBlurred[id]) {
          error = 'Mobile number is required';
        } else if (value && value.length !== 10 && fieldBlurred[id]) {
          error = 'Mobile number must be 10 digits';
        }
        break;
      case 'pincode':
        if (value && value.length !== 6 && fieldBlurred[id]) {
          error = 'PIN code must be 6 digits';
        }
        break;
      case 'aadhar':
        if (value && value.length !== 12 && fieldBlurred[id]) {
          error = 'Aadhar number must be 12 digits';
        }
        break;
    }
    
    setValidationErrors(prev => ({
      ...prev,
      [id]: error
    }));
    
    return !error;
  };

  // Track whether a field is currently focused
  const [isFocused, setIsFocused] = useState<boolean>(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    
    // Mark field as touched
    if (!isTouched[id]) {
      setIsTouched({ ...isTouched, [id]: true });
    }
    
   
    if (id === 'pan') {
      // Progressive format validation for PAN
      if (value === '') {
        setFormValues({
          ...formValues,
          [id]: '',
        });
        setValidationErrors(prev => ({ ...prev, [id]: undefined }));
      } else {
        // Allow entry only if it matches PAN format for current position
        const newValue = value.toUpperCase();
        let isValid = true;
        
        // Check each character
        if (newValue.length > formValues.pan.length) {
          // Only validate the last character (newly added)
          const newChar = newValue[newValue.length - 1];
          const pos = newValue.length - 1;
          
          if (pos < 3) { // First 3 chars: Uppercase letters
            isValid = /^[A-Z]$/.test(newChar);
          } else if (pos === 3) { // 4th char: P, F, C, H, A, A, T
            isValid = /^[PFCHAAT]$/.test(newChar);
          } else if (pos === 4) { // 5th char: Uppercase letter
            isValid = /^[A-Z]$/.test(newChar);
          } else if (pos >= 5 && pos < 9) { // 6-9th chars: Digits
            isValid = /^[0-9]$/.test(newChar);
          } else if (pos === 9) { // 10th char: Uppercase letter
            isValid = /^[A-Z]$/.test(newChar);
          }
        }
        
        if (isValid) {
          setFormValues({
            ...formValues,
            [id]: newValue,
          });
          
          // Only validate complete PAN when blurred
          if (newValue.length === 10 && fieldBlurred[id]) {
            validateField(id, newValue);
          } else {
            setValidationErrors(prev => ({ ...prev, [id]: undefined }));
          }
        }
      }
    } else if (id === 'mobile') {
      // Format mobile: 10 digits
      const mobileRegex = /^[0-9]{0,10}$/;
      if (value === '' || mobileRegex.test(value)) {
        setFormValues({
          ...formValues,
          [id]: value,
        });
        
        // Only validate when field loses focus
        if (fieldBlurred[id] && !isFocused) {
          validateField(id, value);
        } else {
          setValidationErrors(prev => ({ ...prev, [id]: undefined }));
        }
      }
    } else if (id === 'pincode') {
      // Format pincode: 6 digits
      const pincodeRegex = /^[0-9]{0,6}$/;
      if (value === '' || pincodeRegex.test(value)) {
        setFormValues({
          ...formValues,
          [id]: value,
        });
        
        // Only validate when field loses focus
        if (fieldBlurred[id] && !isFocused) {
          validateField(id, value);
        } else {
          setValidationErrors(prev => ({ ...prev, [id]: undefined }));
        }
      }
    } else if (id === 'aadhar') {
      // Aadhar: 12 digits only
      const aadharRegex = /^[0-9]{0,12}$/;
      
      if (value === '' || aadharRegex.test(value)) {
        setFormValues({
          ...formValues,
          [id]: value,
        });
        
        // Only validate when field loses focus
        if (fieldBlurred[id] && !isFocused) {
          validateField(id, value);
        } else {
          setValidationErrors(prev => ({ ...prev, [id]: undefined }));
        }
      }
    } else if (id === 'gstin') {
      // Progressive format validation for GSTIN
      if (value === '') {
        setFormValues({
          ...formValues,
          [id]: '',
        });
        setValidationErrors(prev => ({ ...prev, [id]: undefined }));
        // Reset GSTIN verification details
        setGSTDetails({ entityType: "", legalName: "" });
      } else {
        // Allow entry only if it matches GSTIN format for current position
        const newValue = value.toUpperCase();
        let isValid = true;
        
        // Check each character
        if (newValue.length > formValues.gstin.length) {
          // Only validate the last character (newly added)
          const newChar = newValue[newValue.length - 1];
          const pos = newValue.length - 1;
          
          if (pos < 2) { // First 2 chars: Digits (state code)
            isValid = /^[0-9]$/.test(newChar);
          } else if (pos >= 2 && pos < 5) { // 3-5th chars: Uppercase letters (first 3 of PAN)
            isValid = /^[A-Z]$/.test(newChar);
          } else if (pos === 5) { // 6th char: P, F, C, H, A, A, T (4th of PAN)
            isValid = /^[PFCHAAT]$/.test(newChar);
          } else if (pos === 6) { // 7th char: Uppercase letter (5th of PAN)
            isValid = /^[A-Z]$/.test(newChar);
          } else if (pos >= 7 && pos < 11) { // 8-11th chars: Digits (6-9th of PAN)
            isValid = /^[0-9]$/.test(newChar);
          } else if (pos === 11) { // 12th char: Uppercase letter (10th of PAN)
            isValid = /^[A-Z]$/.test(newChar);
          } else if (pos === 12) { // 13th char: Digit 1-9 (entity number)
            isValid = /^[1-9]$/.test(newChar);
          } else if (pos === 13) { // 14th char: Z typically
            isValid = /^[A-Z]$/.test(newChar);
          } else if (pos === 14) { // 15th char: Checksum (alphanumeric)
            isValid = /^[0-9A-Z]$/.test(newChar);
          }
        }
        
        if (isValid) {
          // Reset GSTIN verification details when user modifies GSTIN
          if (newValue.length < 15 || newValue !== formValues.gstin) {
            setGSTDetails({ entityType: "", legalName: "" });
          }
          
          setFormValues({
            ...formValues,
            [id]: newValue,
          });
          
          // Validate complete GSTIN after user has typed 15 chars
          if (newValue.length === 15) {
            validateField(id, newValue);
          } else if (fieldBlurred[id] && !isFocused) {
            setValidationErrors(prev => ({ 
              ...prev, 
              [id]: 'GSTIN must be 15 characters'
            }));
          } else {
            // Clear validation error while user is still typing
            setValidationErrors(prev => ({ ...prev, [id]: undefined }));
          }
        }
      }
    } else if (id === 'fssaino') {
      // FSSAI: 14 digits
      const fssaiRegex = /^[0-9]{0,14}$/;
      if (value === '' || fssaiRegex.test(value)) {
        setFormValues({
          ...formValues,
          [id]: value,
        });
        
        // Validate when complete or field loses focus
        if (value.length === 14) {
          validateField(id, value);
        } else if (fieldBlurred[id] && !isFocused) {
          validateField(id, value);
        } else {
          // Clear validation error while user is still typing
          setValidationErrors(prev => ({ ...prev, [id]: undefined }));
        }
      }
    } else {
      setFormValues({
        ...formValues,
        [id]: value,
      });
    }
  };
  
  const handleFieldBlur = (id: string) => {
    setIsFocused(false);
    setFieldBlurred(prev => ({ ...prev, [id]: true }));
    validateField(id, formValues[id as keyof FormValues] as string);
  };

  const handleFieldFocus = (id: string) => {
    setIsFocused(true);
    // Clear validation errors when field gets focus
    setValidationErrors(prev => ({ ...prev, [id]: undefined }));
  };

  const handleStateChange = (value: string) => {
    setFormValues({
      ...formValues,
      statecode: value,
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setError(null);

      if (!subgroup || subgroup.length === 0) {
        throw new Error('Please select a subgroup');
      }
      
      // Mark all fields as blurred for validation
      const allFields = ['gstin', 'pan', 'fssaino', 'mobile', 'pincode', 'aadhar'];
      const newBlurredState: Record<string, boolean> = {};
      allFields.forEach(field => {
        newBlurredState[field] = true;
      });
      setFieldBlurred(prev => ({ ...prev, ...newBlurredState }));
      
      // Validate mobile (required)
      if (!formValues.mobile) {
        setValidationErrors(prev => ({
          ...prev,
          mobile: 'Mobile number is required'
        }));
        throw new Error('Mobile number is required');
      }
      
      // Validate all fields
      let isValid = true;
      
      allFields.forEach(field => {
        // Only validate if the field has a value
        if (formValues[field as keyof FormValues]) {
          const fieldValid = validateField(field, formValues[field as keyof FormValues] as string);
          if (!fieldValid) isValid = false;
        }
      });
      
      if (!isValid) {
        throw new Error('Please correct the validation errors');
      }

      const values = {
        ...formValues,
        subgroup: subgroup[0].value,
      };

      const route = isEDIT ? `/edit/account-master` : `/account-master`;
      console.log('Submitting form to:', `${constants.baseURL}${route}`);
      console.log('Form values:', values);

      const response = await fetch(`${constants.baseURL}${route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          ...values,
          gst: values.gstin, // Rename for API compatibility
        })
      });

      let data;
      try {
        // Try to parse JSON response if available
        const text = await response.text();
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        console.log('Non-JSON response received');
        data = {};
      }

      if (response.ok) {
        console.log('Form submitted successfully');
        // Show success toast
        setToast({
          visible: true,
          message: 'Account saved successfully!',
          type: 'success'
        });
        // Redirect to the correct URL after a short delay
        setTimeout(() => {
          navigate('/db/account-master');
        }, 1500);
      } else {
        console.error('API Error:', response.status, data);
        throw new Error(data?.message || `Error ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Submission failed:', error);
      setError(error instanceof Error ? error.message : 'Failed to submit form');
      setToast({
        visible: true,
        message: error instanceof Error ? error.message : 'Failed to submit form',
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getSubgroupValue = () => {
    // Check if user has exactly one subgroup
    if (!isAdmin && user && hasSingleSubgroup(user)) {
      const userSubgroups = getUserSubgroups(user);
      return { 
        label: userSubgroups[0]?.title || 'Unknown',
        value: userSubgroups[0]?.subgroupCode || ''
      };
    }
    
    if (!subgroup || !subgroup.length) {
      return null;
    }
    
    const option = group.find(option => 
      option && subgroup[0] && option.value === subgroup[0].value
    );
    
    if (option) {
      return option;
    }
    
    if (formValues.subgroup !== '') {
      const routeAccess = localStorage.getItem('routeAccess');
      if (routeAccess && !routeAccess.includes('Admin')) {
        return { label: SubName || 'Subgroup', value: formValues.subgroup };
      }
    }
    
    return null;
  };

  if (isLoading) {
    return (
      <div>
        <PageMeta
          title="Account Master | FMCG Vite Admin Template"
          description="Create Account in FMCG Vite Admin Template"
        />
        <PageBreadcrumb pageTitle="Account Master" />
        <FormSkeletonLoader />
      </div>
    );
  }

  return (
    <div>
      <PageMeta
        title="Account Master | FMCG Vite Admin Template"
        description="Account Master page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Account Master" />
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
        {error && (
          <div className="text-red-500 text-center p-4 mb-4">{error}</div>
        )}
        <FormComponent onSubmit={handleSubmit}>
          {/* First section - full width fields on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Autocomplete
                id="subgroup"
                label="Sub Group"
                options={group}
                onChange={handlePartyChange}
                defaultValue={getSubgroupValue()?.value ?? ''}
                disabled={Boolean(!isAdmin && user && hasSingleSubgroup(user))}
                autoComplete="off"
              />
              {!isAdmin && user && hasSingleSubgroup(user) && (
                <p className="text-xs text-gray-500 mt-1">
                  Subgroup is locked to your assigned subgroup
                </p>
              )}
              {!isAdmin && user && hasMultipleSubgroups(user) && (
                <p className="text-xs text-gray-500 mt-1">
                  You can only select from your assigned subgroups
                </p>
              )}
            </div>
            <div>
              <Input 
                id="achead" 
                label="A/C Head *" 
                value={formValues.achead}
                onChange={handleInputChange}
                variant="outlined"
                autoComplete="off"
                required
              />
            </div>
            <div>
              <Input 
                id="addressline1" 
                label="Address Line 1 *" 
                value={formValues.addressline1}
                onChange={handleInputChange}
                variant="outlined"
                autoComplete="off"
                required
              />
            </div>
            <div>
              <Input 
                id="addressline2" 
                label="Address Line 2" 
                value={formValues.addressline2}
                onChange={handleInputChange}
                variant="outlined"
                autoComplete="off"
              />
            </div>

          </div>

          {/* Second section - 2 columns on all devices for better use of space */}
          <div className="grid grid-cols-2 gap-6 mt-6">
          <div>
              <Input 
                id="place" 
                label="Place *" 
                value={formValues.place}
                onChange={handleInputChange}
                variant="outlined"
                autoComplete="off"
                required
              />
            </div>
            <div className="relative">
              <Input 
                id="gstin" 
                label="GSTN" 
                value={formValues.gstin}
                onChange={handleInputChange}
                onBlur={() => handleFieldBlur('gstin')}
                onFocus={() => handleFieldFocus('gstin')}
                variant="outlined"
                autoComplete="off"
                maxLength={15}
                fieldType="gstin"
                error={validationErrors.gstin}
              />
              {gstDetails.entityType && gstDetails.legalName && (
                <p className="text-xs text-green-500 mt-1">
                  {gstDetails.entityType === "Proprietorship" ? "Proprietor" : 
                   gstDetails.entityType}: {gstDetails.legalName}
                </p>
              )}
            </div>
            <div>
              <Input 
                id="pincode" 
                label="Pin Code *" 
                value={formValues.pincode}
                onChange={handleInputChange}
                onBlur={() => handleFieldBlur('pincode')}
                onFocus={() => handleFieldFocus('pincode')}
                variant="outlined"
                autoComplete="off"
                required
                type="tel"
                inputMode="numeric"
                maxLength={6}
                error={validationErrors.pincode}
              />
            </div>
            
            <div className="relative">
              <Input 
                id="pan" 
                label="PAN" 
                value={formValues.pan}
                onChange={handleInputChange}
                onBlur={() => handleFieldBlur('pan')}
                onFocus={() => handleFieldFocus('pan')}
                variant="outlined"
                autoComplete="off"
                maxLength={10}
                fieldType="pan"
                error={validationErrors.pan}
              />
            </div>
            <div className="relative">
              <Input 
                id="mobile" 
                label="Mobile *" 
                value={formValues.mobile}
                onChange={handleInputChange}
                onBlur={() => handleFieldBlur('mobile')}
                onFocus={() => handleFieldFocus('mobile')}
                variant="outlined"
                autoComplete="off"
                maxLength={10}
                type="tel"
                inputMode="numeric"
                required
                error={validationErrors.mobile}
              />
            </div>
            <div className="relative">
              <Input 
                id="aadhar" 
                label="AADHAR" 
                value={formValues.aadhar}
                onChange={handleInputChange}
                onBlur={() => handleFieldBlur('aadhar')}
                onFocus={() => handleFieldFocus('aadhar')}
                variant="outlined"
                autoComplete="off"
                maxLength={12}
                type="tel"
                inputMode="numeric"
                error={validationErrors.aadhar}
              />
            </div>
            
            <div>
              <Input 
                id="dlno" 
                label="DL No." 
                value={formValues.dlno}
                onChange={handleInputChange}
                variant="outlined"
                autoComplete="off"
              />
            </div>
            <div className="relative">
              <Input 
                id="fssaino" 
                label="FSSAI No." 
                value={formValues.fssaino}
                onChange={handleInputChange}
                onBlur={() => handleFieldBlur('fssaino')}
                onFocus={() => handleFieldFocus('fssaino')}
                variant="outlined"
                autoComplete="off"
                maxLength={14}
                type="tel"
                inputMode="numeric"
                error={validationErrors.fssaino}
              />
            </div>
            <div>
              <Input 
                id="email" 
                label="Email" 
                value={formValues.email}
                onChange={handleInputChange}
                variant="outlined"
                autoComplete="off"
              />
            </div>
            <div>
              <Autocomplete
                id="statecode"
                label="State"
                options={city}
                onChange={handleStateChange}
                defaultValue={formValues.statecode}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate('/db/account-master')}
              className="px-4 py-2 text-gray-500 rounded-md hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </FormComponent>
      </div>
      {toast.visible && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(prev => ({ ...prev, visible: false }))}
        />
      )}
    </div>
  );
};

export default AccountMaster; 