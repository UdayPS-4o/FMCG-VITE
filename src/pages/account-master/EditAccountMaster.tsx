import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Input from "../../components/form/input/Input";
import Autocomplete from "../../components/form/input/Autocomplete";
import FormComponent from "../../components/form/Form";
import constants from "../../constants";
import { FormSkeletonLoader } from "../../components/ui/skeleton/SkeletonLoader";
import Toast from '../../components/ui/toast/Toast';
import useAuth from '../../hooks/useAuth';
import apiCache from '../../utils/apiCache';

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

const EditAccountMaster: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  
  const [group, setGroup] = useState<Option[]>([]);
  const [subgroup, setSubgroup] = useState<Option[]>([]);
  const [city, setCity] = useState<Option[]>([]);
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

  const { user } = useAuth();
  
  // Check if user is admin
  const isAdmin = user && user.routeAccess && user.routeAccess.includes('Admin');

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
        setIsLoading(true);
        setError(null);
        
        // Use the id from path parameters instead of query
        const subgroupParam = id;
        
        if (!subgroupParam) {
          throw new Error('No subgroup parameter provided');
        }
        
        // If user is not admin and has a subgroup, check if they're allowed to edit this subgroup
        if (!isAdmin && user && user.subgroup && user.subgroup.subgroupCode) {
          const userSubgroupPrefix = user.subgroup.subgroupCode.substring(0, 2).toUpperCase();
          const editSubgroupPrefix = subgroupParam.substring(0, 2).toUpperCase();
          
          if (userSubgroupPrefix !== editSubgroupPrefix) {
            throw new Error('You do not have permission to edit accounts outside your subgroup');
          }
        }
        
        console.log('Fetching account data for subgroup:', subgroupParam);

        // Fetch account data with caching
        const data = await apiCache.fetchWithCache(`${constants.baseURL}/json/account-master`);
        console.log('Account data:', data);

        // Find the account with matching subgroup
        const account = data.find((account: any) => account.subgroup === subgroupParam);
        
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
          console.error('Account not found for subgroup:', subgroupParam);
          throw new Error(`Subgroup "${subgroupParam}" not found in account data`);
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
        setToast({
          visible: true,
          message: error instanceof Error ? error.message : 'Failed to load account details',
          type: 'error',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id, user, isAdmin]);

  const handlePartyChange = (value: string) => {
    // Only allow changes if user is admin
    if (isAdmin) {
      const selectedOption = group.find(option => option.value === value);
      if (selectedOption) {
        setSubgroup([selectedOption]);
        setFormValues({
          ...formValues,
          subgroup: value,
        });
      }
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

      console.log('Submitting form to:', `${constants.baseURL}/edit/account-master`);
      console.log('Form values:', values);

      const response = await fetch(`${constants.baseURL}/edit/account-master`, {
        method: 'POST',
        body: JSON.stringify(values),
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
      });

      let data;
      try {
        const text = await response.text();
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        console.log('Non-JSON response received');
        data = {};
      }

      if (response.ok) {
        console.log('Form submitted successfully');
        setToast({
          visible: true,
          message: 'Account updated successfully',
          type: 'success',
        });
        
        // Redirect after a short delay
        setTimeout(() => {
          navigate('/db/account-master');
        }, 2000);
      } else {
        console.error('API Error:', response.status, data);
        throw new Error(data?.message || `Error ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Submission failed:', error);
      setError(error instanceof Error ? error.message : 'Failed to submit form');
      setToast({
        visible: true,
        message: error instanceof Error ? error.message : 'Failed to update account',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getSubgroupValue = () => {
    if (!subgroup || !subgroup.length) {
      return null;
    }
    
    return subgroup[0];
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
          title="Edit Account | FMCG Vite Admin Template"
          description="Edit Account in FMCG Vite Admin Template"
        />
        <PageBreadcrumb pageTitle="Edit Account" />
        <FormSkeletonLoader />
      </div>
    );
  }

  return (
    <div>
      <PageMeta
        title="Edit Account | FMCG Vite Admin Template"
        description="Edit Account in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Edit Account" />
      
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
                autoComplete="off"
                disabled={true} // Always disable subgroup in edit mode
              />
              <p className="text-xs text-gray-500 mt-1">
                Subgroup cannot be changed when editing an account
              </p>
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
                required
                maxLength={10}
                placeholder="10 digit number"
              />
            </div>
            <div>
              <Input 
                id="pan" 
                label="PAN *" 
                value={formValues.pan}
                onChange={handleInputChange}
                variant="outlined"
                autoComplete="off"
                required
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
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Update'}
            </button>
          </div>
        </FormComponent>
      </div>
      {toast.visible && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ ...toast, visible: false })}
        />
      )}
    </div>
  );
};

export default EditAccountMaster; 