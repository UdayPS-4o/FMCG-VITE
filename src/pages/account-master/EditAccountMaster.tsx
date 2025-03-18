import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import FormComponent from "../../components/form/Form";
import Input from "../../components/form/input/Input";
import Autocomplete from "../../components/form/input/Autocomplete";
import constants from "../../constants";
import Toast from '../../components/ui/toast/Toast';

interface Option {
  label: string;
  value: string;
}

interface FormValues {
  name: string;
  code: string;
  gstno: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  subgroup: string;
  subgroupName: string;
  balance: string;
  approvalStatus: string;
}

const EditAccountMaster: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  
  const [formValues, setFormValues] = useState<FormValues>({
    name: '',
    code: id || '',
    gstno: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    email: '',
    subgroup: '',
    subgroupName: '',
    balance: '0',
    approvalStatus: 'Pending',
  });
  
  const [subGroupOptions, setSubGroupOptions] = useState<Option[]>([]);
  const [stateOptions, setStateOptions] = useState<Option[]>([]);
  const [selectedSubGroup, setSelectedSubGroup] = useState<Option | null>(null);
  const [selectedState, setSelectedState] = useState<Option | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    visible: false,
    message: '',
    type: 'info',
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch account data
        console.log('Fetching account data for:', id);
        
        // Extract subgroup from URL if available
        const urlParams = new URLSearchParams(window.location.search);
        const subgroupFromUrl = urlParams.get('subgroup');
        
        // Check if we're editing an approved record
        const isApproved = urlParams.get('approved') === 'true';
        const editEndpoint = isApproved ? 
          `${constants.baseURL}/edit/approved/account-master/${id}` : 
          `${constants.baseURL}/edit/account-master/${id}`;
          
        console.log(`Using ${isApproved ? 'approved' : 'regular'} endpoint: ${editEndpoint}`);
        
        const response = await fetch(editEndpoint);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch account data: ${response.status}`);
        }
        
        const accountData = await response.json();
        console.log('Fetched account data:', accountData);
        
        if (!accountData || Object.keys(accountData).length === 0) {
          throw new Error('Empty or invalid account data received');
        }
        
        // Map API field names to our form field names
        setFormValues({
          name: accountData.achead || '',
          code: id || '',
          gstno: accountData.gst || '',
          address: `${accountData.addressline1 || ''} ${accountData.addressline2 ? accountData.addressline2 : ''}`.trim(),
          city: accountData.place || '',
          state: accountData.statecode || '',
          pincode: accountData.pincode || '',
          phone: accountData.mobile || '',
          email: accountData.email || '',
          // Use subgroup from URL if available, otherwise use from account data
          subgroup: subgroupFromUrl || accountData.subgroup || '',
          subgroupName: '',
          balance: '0', // Not in the API response
          approvalStatus: 'Pending', // Not in the API response
        });
        
        console.log('Set form values:', {
          name: accountData.achead || '',
          subgroup: subgroupFromUrl || accountData.subgroup || '',
          state: accountData.statecode || ''
        });
        
        // Set selected options for dropdowns
        const subgroupToUse = subgroupFromUrl || accountData.subgroup;
        if (subgroupToUse) {
          console.log('Setting initial subgroup from URL or API data:', subgroupToUse);
          // Store just the code initially - we'll update with proper label once options are loaded
          setFormValues(prev => ({
            ...prev,
            subgroup: subgroupToUse
          }));
          
          // Set a placeholder subgroup until we load the real options
          setSelectedSubGroup({
            value: subgroupToUse,
            label: subgroupToUse, // This will be updated when subgroup options load
          });
        }
        
        if (accountData.statecode) {
          console.log('Setting selected state from API data:', accountData.statecode);
          setSelectedState({
            label: accountData.statecode,
            value: accountData.statecode,
          });
        }
        
        // Fetch dropdown options
        await fetchOptions();
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching account data:', error);
        setToast({
          visible: true,
          message: 'Failed to load account data',
          type: 'error',
        });
        setIsLoading(false);
      }
    };
    
    const fetchOptions = async () => {
      try {
        // Fetch subgroup options
        const subgroupResponse = await fetch(`${constants.baseURL}/options/subgroup`);
        if (subgroupResponse.ok) {
          const data = await subgroupResponse.json();
          console.log('Raw subgroup data from API:', data);
          
          const options = data.map((item: any) => {
            // Ensure we always have code as the value and name as the label
            const value = item.code || '';
            const label = item.name || value;
            return { label, value };
          });
          
          setSubGroupOptions(options);
          console.log('Processed subgroup options:', options);
          
          // Update subgroupName if subgroup is set
          if (formValues.subgroup) {
            console.log('Looking for subgroup match for code:', formValues.subgroup);
            
            // Find option by value (which is the code)
            const subgroupOption = options.find((option: Option) => option.value === formValues.subgroup);
            
            if (subgroupOption) {
              console.log('Found matching subgroup option:', subgroupOption);
              setFormValues(prev => ({
                ...prev,
                subgroupName: subgroupOption.label
              }));
              setSelectedSubGroup(subgroupOption);
            } else {
              console.log('No matching subgroup found, using raw value');
              // If no matching option found, use the raw value
              const fallbackOption = {
                label: formValues.subgroup,
                value: formValues.subgroup
              };
              setSelectedSubGroup(fallbackOption);
            }
          }
        } else {
          console.error('Failed to fetch subgroup options:', subgroupResponse.status);
        }
        
        // Fetch state options
        const stateResponse = await fetch(`${constants.baseURL}/options/state`);
        if (stateResponse.ok) {
          const data = await stateResponse.json();
          const options = data.map((item: any) => {
            const value = typeof item === 'string' ? item : item.code || '';
            const label = typeof item === 'string' ? item : item.name || value;
            return { label, value };
          });
          setStateOptions(options);
          
          // Update selected state if state is set
          if (formValues.state) {
            console.log('Looking for state match for:', formValues.state);
            console.log('Available state options:', options);
            
            const stateOption = options.find((option: Option) => option.value === formValues.state);
            if (stateOption) {
              console.log('Found matching state:', stateOption);
              setSelectedState(stateOption);
            } else {
              console.log('No matching state found, using raw value');
              // If no matching option found, use the raw value
              const fallbackOption = {
                label: formValues.state,
                value: formValues.state
              };
              setSelectedState(fallbackOption);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching options:', error);
      }
    };
    
    fetchData();
  }, [id]);

  useEffect(() => {
    console.log('Selected SubGroup updated:', selectedSubGroup);
  }, [selectedSubGroup]);

  useEffect(() => {
    console.log('Selected State updated:', selectedState);
  }, [selectedState]);

  useEffect(() => {
    console.log('SubGroup Options updated:', subGroupOptions);
    // If we have the subgroup options and a selected subgroup value, but no selected subgroup object
    if (subGroupOptions.length > 0 && formValues.subgroup && !selectedSubGroup) {
      const subgroupOption = subGroupOptions.find(option => option.value === formValues.subgroup);
      if (subgroupOption) {
        console.log('Setting selected subgroup after options loaded:', subgroupOption);
        setSelectedSubGroup(subgroupOption);
        
        // Also update the subgroupName in formValues
        setFormValues(prev => ({
          ...prev,
          subgroupName: subgroupOption.label
        }));
      }
    }
  }, [subGroupOptions, formValues.subgroup, selectedSubGroup]);

  useEffect(() => {
    console.log('State Options updated:', stateOptions);
    // If we have the state options and a selected state value, but no selected state object
    if (stateOptions.length > 0 && formValues.state && !selectedState) {
      const stateOption = stateOptions.find(option => option.value === formValues.state);
      if (stateOption) {
        console.log('Setting selected state after options loaded:', stateOption);
        setSelectedState(stateOption);
      }
    }
  }, [stateOptions, formValues.state, selectedState]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    console.log(`Input changed - ${name}:`, value);
    setFormValues(prev => ({ ...prev, [name]: value }));
  };

  const handleSubGroupChange = (value: string) => {
    console.log('SubGroup change called with value:', value);
    
    // Find the selected option based on the value (code)
    const selected = subGroupOptions.find(option => option.value === value);
    console.log('Selected subgroup option:', selected);
    
    // Set the selected subgroup object
    setSelectedSubGroup(selected || null);
    
    // Update form values with both the code and name
    setFormValues(prev => ({
      ...prev,
      // Store the code in the subgroup field
      subgroup: value,
      // Store the display name in the subgroupName field
      subgroupName: selected?.label || '',
    }));
  };

  const handleStateChange = (value: string) => {
    console.log('State change called with value:', value);
    const selected = stateOptions.find(option => option.value === value);
    console.log('Selected state:', selected);
    setSelectedState(selected || null);
    
    setFormValues(prev => ({
      ...prev,
      state: value,
    }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formValues.name.trim()) {
      newErrors.name = 'Name is required';
    }
    
    if (!formValues.code.trim()) {
      newErrors.code = 'Code is required';
    }
    
    if (!formValues.subgroup.trim()) {
      newErrors.subgroup = 'Subgroup is required';
    }
    
    // Simple email validation
    if (formValues.email && !/^\S+@\S+\.\S+$/.test(formValues.email)) {
      newErrors.email = 'Invalid email format';
    }
    
    // Simple phone validation
    if (formValues.phone && !/^\d{10}$/.test(formValues.phone)) {
      newErrors.phone = 'Phone number should be 10 digits';
    }
    
    // Simple pincode validation
    if (formValues.pincode && !/^\d{6}$/.test(formValues.pincode)) {
      newErrors.pincode = 'Pincode should be 6 digits';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    console.log('Form submission started with values:', formValues);
    console.log('Selected subgroup:', selectedSubGroup);
    console.log('Selected state:', selectedState);
    
    if (!validateForm()) {
      setToast({
        visible: true,
        message: 'Please fill all required fields correctly',
        type: 'error',
      });
      return;
    }
    
    try {
      // Transform formValues back to the API expected format
      const apiData = {
        achead: formValues.name,
        // Split address into two lines if necessary
        addressline1: formValues.address.split('\n')[0] || '',
        addressline2: formValues.address.split('\n')[1] || '',
        place: formValues.city,
        pincode: formValues.pincode,
        mobile: formValues.phone,
        email: formValues.email,
        gst: formValues.gstno,
        statecode: formValues.state,
        // Ensure we send the subgroup CODE
        subgroup: selectedSubGroup?.value || formValues.subgroup || '',
        // Include these fields to prevent them from being cleared
        pan: '', 
        aadhar: '',
        dlno: '',
        fssaino: ''
      };
      
      console.log('Submitting data to API:', apiData);
      
      // Check if we're editing an approved record
      const urlParams = new URLSearchParams(window.location.search);
      const isApproved = urlParams.get('approved') === 'true';
      
      // Use different endpoint based on whether it's approved
      const saveEndpoint = isApproved
        ? `${constants.baseURL}/edit/approved/account-master`
        : `${constants.baseURL}/edit/account-master`;
      
      console.log(`Saving to ${isApproved ? 'approved' : 'regular'} endpoint: ${saveEndpoint}`);
      
      const response = await fetch(saveEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiData),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update account: ${response.status} - ${errorText}`);
      }
      
      setToast({
        visible: true,
        message: 'Account updated successfully',
        type: 'success',
      });
      
      // Redirect to appropriate page after successful update
      setTimeout(() => {
        navigate(isApproved ? '/approved/account-master' : '/db/account-master');
      }, 2000);
      
    } catch (error) {
      console.error('Error updating account:', error);
      setToast({
        visible: true,
        message: 'Failed to update account',
        type: 'error',
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta
        title="Edit Account | FMCG Vite Admin Template"
        description="Edit Account in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Edit Account" />
      
      {toast.visible && (
        <Toast 
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(prev => ({ ...prev, visible: false }))}
          isVisible={toast.visible}
        />
      )}
      
      <div className="container mx-auto px-4 py-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">Edit Account</h2>
          
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : (
            <FormComponent onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Input
                    id="name"
                    name="name"
                    label="Name"
                    value={formValues.name}
                    onChange={handleInputChange}
                    error={errors.name ? true : undefined}
                    variant="outlined"
                    required
                  />
                  {errors.name && (
                    <div className="text-red-500 text-sm mt-1">{errors.name}</div>
                  )}
                </div>
                
                <div>
                  <Input
                    id="code"
                    name="code"
                    label="Code"
                    value={formValues.code}
                    onChange={handleInputChange}
                    error={errors.code ? true : undefined}
                    variant="outlined"
                    required
                    disabled={!!id}
                  />
                  {errors.code && (
                    <div className="text-red-500 text-sm mt-1">{errors.code}</div>
                  )}
                </div>
                
                <div>
                  <Autocomplete
                    id="subgroup"
                    label="Subgroup"
                    options={subGroupOptions}
                    onChange={handleSubGroupChange}
                    defaultValue={selectedSubGroup?.value || formValues.subgroup || ''}
                    autoComplete="off"
                  />
                  {errors.subgroup && (
                    <div className="text-red-500 text-sm mt-1">{errors.subgroup}</div>
                  )}
                </div>
                
                <div>
                  <Input
                    id="gstno"
                    name="gstno"
                    label="GST Number"
                    value={formValues.gstno}
                    onChange={handleInputChange}
                    variant="outlined"
                  />
                </div>
                
                <div>
                  <Input
                    id="address"
                    name="address"
                    label="Address"
                    value={formValues.address}
                    onChange={handleInputChange}
                    variant="outlined"
                  />
                </div>
                
                <div>
                  <Input
                    id="city"
                    name="city"
                    label="City"
                    value={formValues.city}
                    onChange={handleInputChange}
                    variant="outlined"
                  />
                </div>
                
                <div>
                  <Autocomplete
                    id="state"
                    label="State"
                    options={stateOptions}
                    onChange={handleStateChange}
                    defaultValue={selectedState?.value || formValues.state || ''}
                    autoComplete="off"
                  />
                </div>
                
                <div>
                  <Input
                    id="pincode"
                    name="pincode"
                    label="Pincode"
                    value={formValues.pincode}
                    onChange={handleInputChange}
                    error={errors.pincode ? true : undefined}
                    variant="outlined"
                  />
                  {errors.pincode && (
                    <div className="text-red-500 text-sm mt-1">{errors.pincode}</div>
                  )}
                </div>
                
                <div>
                  <Input
                    id="phone"
                    name="phone"
                    label="Phone"
                    value={formValues.phone}
                    onChange={handleInputChange}
                    error={errors.phone ? true : undefined}
                    variant="outlined"
                  />
                  {errors.phone && (
                    <div className="text-red-500 text-sm mt-1">{errors.phone}</div>
                  )}
                </div>
                
                <div>
                  <Input
                    id="email"
                    name="email"
                    label="Email"
                    value={formValues.email}
                    onChange={handleInputChange}
                    error={errors.email ? true : undefined}
                    variant="outlined"
                  />
                  {errors.email && (
                    <div className="text-red-500 text-sm mt-1">{errors.email}</div>
                  )}
                </div>
                
                <div>
                  <Input
                    label="Balance"
                    name="balance"
                    value={formValues.balance}
                    onChange={handleInputChange}
                    disabled
                  />
                </div>
              </div>
              
              <div className="mt-6 flex justify-end space-x-4">
                <button
                  type="button"
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  onClick={() => navigate('/db/account-master')}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Update Account
                </button>
              </div>
            </FormComponent>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditAccountMaster; 