import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Input from "../../components/form/input/Input";
import Autocomplete from "../../components/form/input/Autocomplete";
import FormComponent from "../../components/form/Form";
import constants from "../../constants";
import useAuth from "../../hooks/useAuth";

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

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const currentUrl = window.location.href;
        
        if (currentUrl.includes('edit')) {
          setIsEDIT(true);
          const subgroup = currentUrl.split('?sub=').pop() || '';

          const response = await fetch(`${constants.baseURL}/json/account-master`);
          if (!response.ok) {
            throw new Error('Failed to fetch account data');
          }
          const data = await response.json();

          const account = data.find((account: any) => account.subgroup === subgroup);
          if (account) {
            setGroup([{ label: account.subgroup, value: account.subgroup }]);
            setSubgroup([{ label: account.subgroup, value: account.subgroup }]);
            setFormValues({
              subgroup: account.subgroup,
              achead: account.achead,
              addressline1: account.addressline1,
              addressline2: account.addressline2,
              place: account.place,
              pincode: account.pincode,
              mobile: account.mobile,
              pan: account.pan,
              aadhar: account.aadhar,
              gst: account.gst,
              dlno: account.dlno,
              fssaino: account.fssaino,
              email: account.email,
              statecode: account.statecode,
            });
          } else {
            throw new Error('Subgroup not found');
          }
        } else {
          setIsEDIT(false);
          const response = await fetch(`${constants.baseURL}/slink/subgrp`);
          if (!response.ok) {
            throw new Error('Failed to fetch subgroup data');
          }
          const data = await response.json();
          setGroup(
            data.map((party: any) => ({
              label: party.title,
              value: party.subgroupCode,
            }))
          );
        }

        // Fetch state data in both cases
        const stateResponse = await fetch(`${constants.baseURL}/api/dbf/state.json`);
        if (!stateResponse.ok) {
          throw new Error('Failed to fetch state data');
        }
        const stateData = await stateResponse.json();
        const stateList = stateData.map((state: any) => ({
          value: state.ST_CODE,
          label: state.ST_NAME,
        }));
        setCity(stateList);

      } catch (error) {
        console.error('Error:', error);
        setError(error instanceof Error ? error.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

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
    setFormValues({
      ...formValues,
      [id]: value,
    });
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

      const response = await fetch(`${constants.baseURL}${route}`, {
        method: 'POST',
        body: JSON.stringify(values),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      let data;
      if (response.status !== 204) {
        data = await response.json();
      }

      if (response.ok) {
        navigate('/account-master/approved');
      } else {
        throw new Error(data?.message || 'An error occurred while saving');
      }
    } catch (error) {
      console.error('Submission failed:', error);
      setError(error instanceof Error ? error.message : 'Failed to submit form');
    } finally {
      setIsLoading(false);
    }
  };

  const getSubgroupValue = () => {
    if (user && user.subgroup) {
      return { label: user.subgroup.title, value: user.subgroup.subgroupCode };
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

  return (
    <div>
      <PageMeta
        title="Account Master | FMCG Vite Admin Template"
        description="Account Master page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Account Master" />
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
          </div>
        ) : error ? (
          <div className="text-red-500 text-center p-4">{error}</div>
        ) : (
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
                />
              </div>
              <div>
                <Input 
                  id="achead" 
                  label="A/C Head" 
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
                  label="Address Line 1" 
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
                  label="Place" 
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
                  label="Pin Code" 
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
                  label="Mobile" 
                  value={formValues.mobile}
                  onChange={handleInputChange}
                  variant="outlined"
                  autoComplete="off"
                  required
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
                  required
                />
              </div>
              <div>
                <Input 
                  id="aadhar" 
                  label="AADHAR" 
                  value={formValues.aadhar}
                  onChange={handleInputChange}
                  variant="outlined"
                  autoComplete="off"
                />
              </div>
              <div>
                <Input 
                  id="gst" 
                  label="GSTIN" 
                  value={formValues.gst}
                  onChange={handleInputChange}
                  variant="outlined"
                  autoComplete="off"
                />
              </div>
              <div>
                <Input 
                  id="dlno" 
                  label="DL NO." 
                  value={formValues.dlno}
                  onChange={handleInputChange}
                  variant="outlined"
                  autoComplete="off"
                />
              </div>
              <div>
                <Input 
                  id="fssaino" 
                  label="FSSAI NO." 
                  value={formValues.fssaino}
                  onChange={handleInputChange}
                  variant="outlined"
                  autoComplete="off"
                />
              </div>
              <div>
                <Input 
                  id="email" 
                  label="Email ID" 
                  type="email"
                  value={formValues.email}
                  onChange={handleInputChange}
                  variant="outlined"
                  autoComplete="off"
                />
              </div>
              <div>
                <Autocomplete
                  id="statecode"
                  label="State Code"
                  options={city}
                  onChange={handleStateChange}
                  defaultValue={formValues.statecode}
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-4">
              <button 
                type="submit" 
                className="px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
                disabled={isLoading}
              >
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>
              <button 
                type="button" 
                className="px-4 py-2 text-gray-500 rounded-md hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                onClick={() => navigate('/db/account-master')}
                disabled={isLoading}
              >
                Cancel
              </button>
            </div>
          </FormComponent>
        )}
      </div>
    </div>
  );
};

export default AccountMaster; 