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
  gst: string;
  dlno: string;
  fssaino: string;
  email: string;
  statecode: string;
  subgroup: string;
}

const AccountMaster: React.FC = () => {
  const [group, setGroup] = useState<Option[]>([]);
  const [subgroup, setSubgroup] = useState<Option[]>([]);
  const [city, setCity] = useState<Option[]>([]);
  const [isEDIT, setIsEDIT] = useState<boolean>(false);
  const [SubName, setSubName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<FormValues>({
    achead: '',
    addressline1: '',
    addressline2: '',
    place: '',
    pincode: '',
    mobile: '',
    pan: '',
    aadhar: '',
    gst: '',
    dlno: '',
    fssaino: '',
    email: '',
    statecode: '',
    subgroup: '',
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
    'gst',
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
          const data = await apiCache.fetchWithCache(`${constants.baseURL}/json/account-master`);
          console.log('Account data:', data);

          const account = data.find((account: any) => account.subgroup === subgroup);
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
              gst: account.gst || '',
              dlno: account.dlno || '',
              fssaino: account.fssaino || '',
              email: account.email || '',
              statecode: account.statecode || '',
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
          const data = await response.json();
          
          // Get all available subgroups
          const allSubgroups = data.map((party: any) => ({
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
            
            // If user has only one subgroup, pre-select it
            if (hasSingleSubgroup(user)) {
              const userSubgroups = getUserSubgroups(user);
              const subgroupOption = {
                label: userSubgroups[0]?.title || 'Unknown',
                value: userSubgroups[0]?.subgroupCode || ''
              };
              
              setSubgroup([subgroupOption]);
              
              setFormValues({
                ...formValues,
                subgroup: userSubgroups[0]?.subgroupCode || ''
              });
            }
          } else {
            // For admin users, show all subgroups
            setGroup(allSubgroups);
          }
        }

        // Fetch state data with caching
        const stateData = await apiCache.fetchWithCache(`${constants.baseURL}/api/dbf/state.json`);
        
        const stateList = stateData.map((state: any) => ({
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    
    if (id === 'pan') {
      // Format PAN: 5 characters + 4 numbers + 1 character
      const panRegex = /^[A-Z]{0,5}[0-9]{0,4}[A-Z]{0,1}$/;
      if (value === '' || panRegex.test(value.toUpperCase())) {
        setFormValues({
          ...formValues,
          [id]: value.toUpperCase(),
        });
      }
    } else if (id === 'mobile') {
      // Format mobile: 10 digits
      const mobileRegex = /^[0-9]{0,10}$/;
      if (value === '' || mobileRegex.test(value)) {
        setFormValues({
          ...formValues,
          [id]: value,
        });
      }
    } else if (id === 'aadhar') {
      // Remove any existing dashes for processing
      const cleanValue = value.replace(/-/g, '');
      const aadharRegex = /^[0-9]{0,12}$/;
      
      if (cleanValue === '' || aadharRegex.test(cleanValue)) {
        // Store raw value (without dashes)
        setFormValues({
          ...formValues,
          [id]: cleanValue,
        });
      }
    } else {
      setFormValues({
        ...formValues,
        [id]: value,
      });
    }
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
        body: JSON.stringify(values)
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

  // Format Aadhar for display
  const formatAadhar = (value: string) => {
    // Add dashes after every 4 digits for display
    if (!value) return '';
    const cleanValue = value.replace(/-/g, '');
    const parts = [];
    for (let i = 0; i < cleanValue.length; i += 4) {
      parts.push(cleanValue.substring(i, i + 4));
    }
    return parts.join('-');
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
            <div>
              <Input 
                id="pincode" 
                label="Pin Code *" 
                value={formValues.pincode}
                onChange={handleInputChange}
                variant="outlined"
                autoComplete="off"
                required
              />
            </div>
            <div>
              <Input 
                id="mobile" 
                label="Mobile *" 
                value={formValues.mobile}
                onChange={handleInputChange}
                variant="outlined"
                autoComplete="off"
                maxLength={10}
              />
            </div>
            <div>
              <Input 
                id="pan" 
                label="PAN" 
                value={formValues.pan}
                onChange={handleInputChange}
                variant="outlined"
                autoComplete="off"
                maxLength={10}
              />
            </div>
            <div>
              <Input 
                id="aadhar" 
                label="AADHAR" 
                value={formatAadhar(formValues.aadhar)}
                onChange={handleInputChange}
                variant="outlined"
                autoComplete="off"
                maxLength={14}
              />
            </div>
            <div>
              <Input 
                id="gst" 
                label="GST" 
                value={formValues.gst}
                onChange={handleInputChange}
                variant="outlined"
                autoComplete="off"
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
            <div>
              <Input 
                id="fssaino" 
                label="FSSAI No." 
                value={formValues.fssaino}
                onChange={handleInputChange}
                variant="outlined"
                autoComplete="off"
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