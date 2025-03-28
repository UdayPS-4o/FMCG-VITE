import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  subgroup: any | null;
  username?: string;
  smCode?: string;
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
    'Account Master',
    'Invoicing',
    'Cash Receipts',
    'Godown Transfer',
    'Database',
    'Add User',
    'Approved',
    'Cash Payments',
  ]);
  
  const [powersOptions] = useState<string[]>(['Read', 'Write', 'Delete']);
  const [subgroupOptions, setSubgroupOptions] = useState<SubGroup[]>([]);
  const [smOptions, setSmOptions] = useState<SmOption[]>([]);
  const [userData, setUserData] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isEdit, setIsEdit] = useState<boolean>(false);
  
  // Form state
  const [name, setName] = useState<string>('');
  const [number, setNumber] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [routeAccess, setRouteAccess] = useState<string[]>([]);
  const [powers, setPowers] = useState<string[]>([]);
  const [subgroup, setSubgroup] = useState<SubGroup | null>(null);
  const [smCode, setSmCode] = useState<string>('');
  const [userId, setUserId] = useState<number | null>(null);
  
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  useEffect(() => {
    const fetchUserData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const url = `${constants.baseURL}/slink/json/users`;
        const response = await fetch(url, {
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch user data');
        }
        
        const users = await response.json();
        setUserData(users);
        
        // Check if we're in edit mode
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');
        
        if (id && users.length) {
          const userToEdit = users.find((user: any) => user.id === Number(id));
          
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
            
            // Make sure to set the subgroup correctly
            if (userToEdit.subgroup) {
              // Wait for subgroupOptions to be loaded
              if (subgroupOptions.length > 0) {
                const matchedSubgroup = subgroupOptions.find(
                  sg => sg.title === userToEdit.subgroup.title || 
                       sg.subgroupCode === userToEdit.subgroup.subgroupCode
                );
                setSubgroup(matchedSubgroup || userToEdit.subgroup);
              } else {
                // Store the subgroup to be matched when subgroupOptions loads
                setSubgroup(userToEdit.subgroup);
              }
            } else {
              setSubgroup(null);
            }
          } else {
            setError('User not found');
          }
        }
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
          credentials: 'include'
        });
        
        if (!subgroupResponse.ok) {
          throw new Error('Failed to fetch subgroup data');
        }
        
        const subgroups = await subgroupResponse.json();
        setSubgroupOptions(subgroups);

        // Fetch salesman data - codes that start with SM
        const salesmanUrl = `${constants.baseURL}/cmpl`;
        const salesmanResponse = await fetch(salesmanUrl, {
          credentials: 'include'
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

  // Update subgroup when subgroupOptions changes and we're in edit mode
  useEffect(() => {
    if (isEdit && subgroup && subgroupOptions.length > 0) {
      // Try to find a matching subgroup in the loaded options
      const matchedSubgroup = subgroupOptions.find(
        sg => sg.title === subgroup.title || sg.subgroupCode === subgroup.subgroupCode
      );
      
      if (matchedSubgroup) {
        setSubgroup(matchedSubgroup);
      }
    }
  }, [subgroupOptions, isEdit, subgroup]);

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
        subgroup: subgroup ? subgroup : null,
        smCode: smCode || undefined,
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
        },
        body: JSON.stringify(payload),
        credentials: 'include'
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
      
      // Reset form after save
      handleClearForm();
      
      // Redirect to add-user page after successful update if in edit mode
      if (isEdit) {
        navigate('/add-user');
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
    setSubgroup(null);
    setSmCode('');
    setIsEdit(false);
    setUserId(null);
  };
  
  // Handle SM change
  const handleSmChange = (value: string) => {
    setSmCode(value);
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
            <FormComponent onSubmit={handleSubmit}>
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
                    id="subgroup"
                    label="Sub Group"
                    options={subgroupOptions.map(sg => ({
                      label: sg.title,
                      value: sg.subgroupCode
                    }))}
                    onChange={(value) => {
                      const selected = subgroupOptions.find(sg => sg.subgroupCode === value);
                      setSubgroup(selected || null);
                    }}
                    defaultValue={subgroup?.subgroupCode ?? ''}
                    value={subgroup?.subgroupCode ?? ''}
                    autoComplete="off"
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
                    label="Route Access"
                    options={routeAccessOptions.map(ra => ({
                      text: ra,
                      value: ra
                    }))}
                    defaultSelected={routeAccess}
                    onChange={(values) => {
                      setRouteAccess(values);
                    }}
                  />
                </div>
                <div className="relative">
                  <MultiSelect
                    label="Powers"
                    options={powersOptions.map(po => ({
                      text: po,
                      value: po
                    }))}
                    defaultSelected={powers}
                    onChange={(values) => {
                      setPowers(values);
                    }}
                  />
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