import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Input from "../../components/form/input/Input";
import Autocomplete from "../../components/form/input/Autocomplete";
import MultiSelect from "../../components/form/MultiSelect";
import FormComponent from "../../components/form/Form";
import constants from "../../constants";
import useAuth from "../../hooks/useAuth";
import UserTable from './UserTable';
import { FormSkeletonLoader } from "../../components/ui/skeleton/SkeletonLoader";

interface User {
  id?: number;
  name: string;
  number: string;
  password: string;
  routeAccess: string[];
  powers: string[];
  subgroups: SubGroup[];
  username?: string;
  smCode?: string;
  subgroup?: SubGroup | SubGroup[];
  defaultSeries?: {
    billing?: string;
    cashReceipt?: string;
    cashPayment?: string;
    godown?: string;
    reports?: string;
  };
  godownAccess?: string[];
  canSelectSeries?: boolean;
  allowPastDateEntries?: boolean;
}

interface SubGroup {
  title: string;
  subgroupCode: string;
}

interface SmOption {
  value: string;
  label: string;
}

const AddUser: React.FC = () => {
  const [routeAccessOptions] = useState<string[]>([
    'Admin',
    'Dashboard',
    'Account Master',
    'Invoicing',
    'Purchases',
    'Cash Receipts',
    'Godown Transfer',
    'Database',
    'Add User',
    'Approved',
    'Cash Payments',
    'Reports',
  ]);
  
  const [powersOptions] = useState<string[]>(['Read', 'Write', 'Delete']);
  const [subgroupOptions, setSubgroupOptions] = useState<SubGroup[]>([]);
  const [smOptions, setSmOptions] = useState<SmOption[]>([]);
  const [userData, setUserData] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isEdit, setIsEdit] = useState<boolean>(false);
  const [godownOptions, setGodownOptions] = useState<any[]>([]);
  
  // Form state
  const [name, setName] = useState<string>('');
  const [number, setNumber] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [routeAccess, setRouteAccess] = useState<string[]>([]);
  const [powers, setPowers] = useState<string[]>([]);
  const [subgroups, setSubgroups] = useState<SubGroup[]>([]);
  const [smCode, setSmCode] = useState<string>('');
  const [userId, setUserId] = useState<number | null>(null);
  const [formKey, setFormKey] = useState<number>(0);
  
  // New state for default series
  const [defaultBillingSeries, setDefaultBillingSeries] = useState<string>('');
  const [defaultCashReceiptSeries, setDefaultCashReceiptSeries] = useState<string>('');
  const [defaultCashPaymentSeries, setDefaultCashPaymentSeries] = useState<string>('');
  const [defaultGodownSeries, setDefaultGodownSeries] = useState<string>('');
  const [defaultReportsSeries, setDefaultReportsSeries] = useState<string>('');
  const [canSelectSeries, setCanSelectSeries] = useState<boolean>(false);
  const [godownAccess, setGodownAccess] = useState<string[]>([]);
  const [allowPastDateEntries, setAllowPastDateEntries] = useState<boolean>(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refreshUser } = useAuth();

  // Function to load user data when id parameter is present
  const loadUserData = useCallback(async (userId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Find the user in already loaded userData
      const userToEdit = userData.find((user: any) => user.id === Number(userId));
      
      if (userToEdit) {
        setIsEdit(true);
        setUserId(userToEdit.id);
        setName(userToEdit.name);
        setNumber(userToEdit.number);
        setPassword(userToEdit.password);
        setRouteAccess(Array.isArray(userToEdit.routeAccess) 
          ? userToEdit.routeAccess 
          : [userToEdit.routeAccess]);
        setPowers(Array.isArray(userToEdit.powers) 
          ? userToEdit.powers 
          : [userToEdit.powers]);
        
        // Set SM code if available
        if (userToEdit.smCode) {
          setSmCode(userToEdit.smCode);
        }
        
        // Handle default series settings
        if (userToEdit.defaultSeries) {
          setDefaultBillingSeries(userToEdit.defaultSeries.billing || '');
          setDefaultCashReceiptSeries(userToEdit.defaultSeries.cashReceipt || '');
          setDefaultCashPaymentSeries(userToEdit.defaultSeries.cashPayment || '');
          setDefaultGodownSeries(userToEdit.defaultSeries.godown || '');
          setDefaultReportsSeries(userToEdit.defaultSeries.reports || '');
        }
        
        // Handle series selection permission
        setCanSelectSeries(userToEdit.canSelectSeries !== false);
        
        // Handle past date entries permission
        setAllowPastDateEntries(userToEdit.allowPastDateEntries === true);
        
        // Handle godown access rights
        if (userToEdit.godownAccess) {
          setGodownAccess(userToEdit.godownAccess);
        }
        
        // Handle subgroups (can be either old format with single subgroup or new format with array)
        if (userToEdit.subgroups) {
          // New format - array of subgroups
          setSubgroups(userToEdit.subgroups);
        } else if (userToEdit.subgroup) {
          // Old format - single subgroup
          // Convert to array format
          if (Array.isArray(userToEdit.subgroup)) {
            setSubgroups(userToEdit.subgroup);
          } else {
            setSubgroups(userToEdit.subgroup ? [userToEdit.subgroup] : []);
          }
        } else {
          setSubgroups([]);
        }
      } else {
        setError('User not found');
      }
    } catch (err) {
      console.error('Failed to load user data:', err);
      setError('Failed to load user details');
    } finally {
      setIsLoading(false);
    }
  }, [userData]);

  // Listen for URL parameter changes to load user data
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    
    if (id && userData.length) {
      loadUserData(id);
    } else if (!id) {
      // Reset form if no ID in URL
      handleClearForm();
    }
  }, [location.search, userData, loadUserData]);

  useEffect(() => {
    const fetchUserData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const url = `${constants.baseURL}/slink/json/users`;
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch user data');
        }
        
        const users = await response.json();
        setUserData(users);
      } catch (err) {
        console.error('Failed to fetch user data:', err);
        setError('Failed to load user details');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchUserData();
  }, []);
  
  // Fetch subgroups and salesman data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch subgroup data
        const subgroupUrl = `${constants.baseURL}/slink/subgrp`;
        const subgroupResponse = await fetch(subgroupUrl, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (!subgroupResponse.ok) {
          throw new Error('Failed to fetch subgroup data');
        }
        
        const subgroups = await subgroupResponse.json();
        setSubgroupOptions(subgroups);

        // Fetch salesman data - codes that start with SM
        const salesmanUrl = `${constants.baseURL}/cmpl`;
        const salesmanResponse = await fetch(salesmanUrl, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (!salesmanResponse.ok) {
          throw new Error('Failed to fetch salesman data');
        }
        
        const salesmanData = await salesmanResponse.json();
        
        // Filter for entries where code starts with 'SM' and not ending with '000'
        const smData = salesmanData.filter((sm: any) => 
          sm.C_CODE.startsWith('SM') && !sm.C_CODE.endsWith('000')
        );
        
        // Map to the required format
        const formattedSmOptions = smData.map((sm: any) => ({
          value: sm.C_CODE,
          label: `${sm.C_NAME} | ${sm.C_CODE}`
        }));
        
        setSmOptions(formattedSmOptions);

        // If editing a user, find and select the matching SM
        if (isEdit && smCode && formattedSmOptions.length > 0) {
          // Already handled in separate effect
        }
        
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError('Failed to load data');
      }
    };
    
    fetchData();
  }, []);

  // Update SM selection when smOptions changes and we're in edit mode
  useEffect(() => {
    if (isEdit && smCode && smOptions.length > 0) {
      // Auto-select SM when editing
      const matchedSm = smOptions.find(
        sm => sm.value === smCode
      );
      
      if (matchedSm) {
        // SM is already set by ID, no need to update state again
      }
    }
  }, [smOptions, isEdit, smCode]);

  // Update subgroups when subgroupOptions changes and we're in edit mode
  useEffect(() => {
    if (isEdit && subgroups.length > 0 && subgroupOptions.length > 0) {
      // Try to find matching subgroups in the loaded options
      const updatedSubgroups = subgroups.map(subgroup => {
        const matchedSubgroup = subgroupOptions.find(
          sg => sg.title === subgroup.title || sg.subgroupCode === subgroup.subgroupCode
        );
        return matchedSubgroup || subgroup;
      });
      
      setSubgroups(updatedSubgroups);
    }
  }, [subgroupOptions, isEdit, subgroups]);

  // Fetch godown data
  useEffect(() => {
    const fetchGodowns = async () => {
      try {
        const godownUrl = `${constants.baseURL}/api/dbf/godown.json`;
        const response = await fetch(godownUrl, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch godown data');
        }
        
        const godowns = await response.json();
        setGodownOptions(godowns);
      } catch (err) {
        console.error('Failed to fetch godown data:', err);
      }
    };
    
    fetchGodowns();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      const payload: User = {
        name,
        number,
        password,
        routeAccess,
        powers,
        username: 'admin',
        subgroups,
        smCode: smCode || undefined,
        defaultSeries: {
          billing: defaultBillingSeries || undefined,
          cashReceipt: defaultCashReceiptSeries || undefined,
          cashPayment: defaultCashPaymentSeries || undefined,
          godown: defaultGodownSeries || undefined,
          reports: defaultReportsSeries || undefined,
        },
        canSelectSeries,
        godownAccess,
        allowPastDateEntries
      };
      
      if (isEdit && userId) {
        payload.id = userId;
      }
      
      const url = isEdit 
        ? `${constants.baseURL}/slink/editUser` 
        : `${constants.baseURL}/slink/addUser`;
        
      const method = 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save user data');
      }
      
      const result = await response.json();
      
      // Update user list after successful operation
      const updatedUsers = isEdit 
        ? userData.map(user => user.id === userId ? { ...payload, id: userId } : user)
        : [...userData, { ...payload, id: result.id }];
      
      setUserData(updatedUsers);
      
      // If the currently logged in user is being edited, refresh their data
      if (isEdit && user && user.id === userId) {
        // Refresh the user data to reflect new permissions immediately
        await refreshUser();
      }
      
      // Reset form completely
      const originalFormKey = formKey;
      handleClearForm();
      
      // Ensure formKey is different to force complete re-render
      if (formKey === originalFormKey) {
        setFormKey(prev => prev + 1);
      }
      
      // Update URL without a full page reload if in edit mode
      if (isEdit) {
        navigate('/add-user', { replace: true });
      }
      
    } catch (err) {
      console.error('Error saving user:', err);
      setError(err instanceof Error ? err.message : 'Failed to save user data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserDeleted = (deletedId: number) => {
    // Update user data after a user is deleted
    setUserData(userData.filter(user => user.id !== deletedId));
  };

  // Function to clear the form
  const handleClearForm = () => {
    setName('');
    setNumber('');
    setPassword('');
    setRouteAccess([]);
    setPowers([]);
    setSubgroups([]);
    setSmCode('');
    setDefaultBillingSeries('');
    setDefaultCashReceiptSeries('');
    setDefaultCashPaymentSeries('');
    setDefaultGodownSeries('');
    setDefaultReportsSeries('');
    setCanSelectSeries(false);
    setGodownAccess([]);
    setAllowPastDateEntries(false);
    setIsEdit(false);
    setUserId(null);
    setFormKey(prevKey => prevKey + 1);
  };
  
  // Handle SM change
  const handleSmChange = (value: string) => {
    setSmCode(value);
  };

  // Handle series input change - single digit, auto capitalize, auto-fill others if empty
  // This function ensures series inputs are single character, uppercase, and populates other series fields
  // when the billing series changes and other fields are empty
  const handleSeriesChange = (e: React.ChangeEvent<HTMLInputElement>, setterFunction: React.Dispatch<React.SetStateAction<string>>) => {
    const { name, value } = e.target;
    
    // Take only the last character and uppercase it
    const newValue = value.length > 0 ? value.charAt(value.length - 1).toUpperCase() : '';
    
    // Update the current field
    setterFunction(newValue);
    
    // If it's the billing series and has a value, auto-fill all other empty fields
    if (name === 'defaultBillingSeries' && newValue) {
      if (defaultCashReceiptSeries === '') {
        setDefaultCashReceiptSeries(newValue);
      }
      if (defaultCashPaymentSeries === '') {
        setDefaultCashPaymentSeries(newValue);
      }
      if (defaultGodownSeries === '') {
        setDefaultGodownSeries(newValue);
      }
    }
  };

  // Add loading state check to render the skeleton loader
  if (isLoading) {
    return (
      <div>
        <PageMeta
          title="Add User | FMCG Vite Admin Template"
          description="Add or Edit Users in FMCG Vite Admin Template"
        />
        <PageBreadcrumb pageTitle={isEdit ? "Edit User" : "Add User"} />
        <FormSkeletonLoader />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta
        title="Add User | FMCG Vite Admin Template"
        description="Add User page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Add User" />
      
      <div className="container mx-auto px-4 py-6 max-w-full">
        {/* User Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6 w-full">
          <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">
            {isEdit ? 'Edit User' : 'Create New User'}
          </h2>
          
          {error ? (
            <div className="text-red-500 p-4 mb-4 bg-red-50 dark:bg-red-900/20 rounded">
              {error}
            </div>
          ) : (
            <FormComponent key={formKey} onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Input
                    id="name"
                    label="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    variant="outlined"
                    autoComplete="off"
                    required
                  />
                </div>
                <div>
                  <Input
                    id="number"
                    label="Phone Number"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    variant="outlined"
                    autoComplete="off"
                    required
                  />
                </div>
                <div>
                  <Input
                    id="password"
                    label="Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    variant="outlined"
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="relative">
                  <Autocomplete
                    id="smCode"
                    label="S/M"
                    options={smOptions}
                    onChange={handleSmChange}
                    defaultValue={smCode}
                    value={smCode}
                    autoComplete="off"
                  />
                </div>
                <div className="relative">
                  <MultiSelect
                    key={`subgroups-${formKey}`}
                    label="Sub Groups"
                    options={subgroupOptions.map(sg => ({
                      text: sg.title,
                      value: sg.subgroupCode
                    }))}
                    value={subgroups.map(sg => sg.subgroupCode)}
                    onChange={(values) => {
                      // Convert selected values back to SubGroup objects
                      const selectedSubgroups = values.map(value => {
                        const selected = subgroupOptions.find(sg => sg.subgroupCode === value);
                        return selected || { title: value, subgroupCode: value };
                      });
                      setSubgroups(selectedSubgroups);
                    }}
                    allowFiltering={true}
                    selectOnEnter={true}
                    matchThreshold={3}
                  />
                </div>
                <div className="relative">
                  <MultiSelect
                    label="Route Access"
                    options={routeAccessOptions.map(ra => ({
                      text: ra,
                      value: ra
                    }))}
                    value={routeAccess}
                    onChange={(values) => {
                      setRouteAccess(values);
                    }}
                    allowFiltering={true}
                    selectOnEnter={true}
                    matchThreshold={3}
                  />
                </div>
                <div className="relative">
                  <MultiSelect
                    label="Powers"
                    options={powersOptions.map(po => ({
                      text: po,
                      value: po
                    }))}
                    value={powers}
                    onChange={(values) => {
                      setPowers(values);
                    }}
                    allowFiltering={true}
                    selectOnEnter={true}
                    matchThreshold={3}
                  />
                </div>
                <div className="relative">
                  <MultiSelect
                    key={`godownAccess-${formKey}`}
                    label="Godown Access"
                    options={godownOptions.map(godown => ({
                      text: `${godown.GDN_NAME} (${godown.GDN_CODE})`,
                      value: godown.GDN_CODE
                    }))}
                    value={godownAccess}
                    onChange={(values) => {
                      setGodownAccess(values);
                    }}
                    allowFiltering={true}
                    selectOnEnter={true}
                    matchThreshold={3}
                  />
                </div>
              </div>

              {/* Default Series Section */}
              <div className="mt-6 mb-4">
                <div className="flex items-start space-x-4">
                  <div className="flex-1">
                    <Input
                      id="defaultBillingSeries"
                      label="Series (Billing)"
                      value={defaultBillingSeries}
                      onChange={(e) => handleSeriesChange(e, setDefaultBillingSeries)}
                      maxLength={1}
                      className="uppercase"
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      id="defaultCashReceiptSeries"
                      label="Series (Cash Receipts)"
                      value={defaultCashReceiptSeries}
                      onChange={(e) => handleSeriesChange(e, setDefaultCashReceiptSeries)}
                      maxLength={1}
                      className="uppercase"
                    />
                  </div>
                </div>
                <div className="flex items-start space-x-4 mt-4">
                  <div className="flex-1">
                    <Input
                      id="defaultCashPaymentSeries"
                      label="Series (Cash Payments)"
                      value={defaultCashPaymentSeries}
                      onChange={(e) => handleSeriesChange(e, setDefaultCashPaymentSeries)}
                      maxLength={1}
                      className="uppercase"
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      id="defaultGodownSeries"
                      label="Series (Godown)"
                      value={defaultGodownSeries}
                      onChange={(e) => handleSeriesChange(e, setDefaultGodownSeries)}
                      maxLength={1}
                      className="uppercase"
                    />
                  </div>
                </div>
                <div className="flex items-start space-x-4 mt-4">
                  <div className="flex-1">
                    <Input
                      id="defaultReportsSeries"
                      label="Series (Reports)"
                      value={defaultReportsSeries}
                      onChange={(e) => handleSeriesChange(e, setDefaultReportsSeries)}
                      maxLength={1}
                      className="uppercase"
                    />
                  </div>
                  <div className="flex-1"></div>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center space-x-2 mb-4">
                  <input
                    type="checkbox"
                    id="canSelectSeries"
                    checked={canSelectSeries}
                    onChange={(e) => setCanSelectSeries(e.target.checked)}
                    className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500"
                  />
                  <label htmlFor="canSelectSeries" className="text-gray-700 dark:text-gray-300">
                    Allow selecting different series
                  </label>
                </div>
                <div className="flex items-center space-x-2 mb-4">
                  <input
                    type="checkbox"
                    id="allowPastDateEntries"
                    checked={allowPastDateEntries}
                    onChange={(e) => setAllowPastDateEntries(e.target.checked)}
                    className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500"
                  />
                  <label htmlFor="allowPastDateEntries" className="text-gray-700 dark:text-gray-300">
                    Add past date entries
                  </label>
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-4">
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
                  disabled={isLoading}
                >
                  {isLoading ? 'Saving...' : isEdit ? 'Update User' : 'Add User'}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-gray-500 rounded-md hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                  onClick={handleClearForm}
                  disabled={isLoading}
                >
                  Cancel
                </button>
              </div>
              
            </FormComponent>
          )}
        </div>
        
        {/* User Table */}
        {userData.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full">
            <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">User List</h2>
            <UserTable data={userData} onUserDeleted={handleUserDeleted} baseURL={constants.baseURL} />
          </div>
        )}
      </div>
    </div>
  );
};

export default AddUser;