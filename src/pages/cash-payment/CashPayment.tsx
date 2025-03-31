import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Input from "../../components/form/input/Input";
import Autocomplete from "../../components/form/input/Autocomplete";
import FormComponent from "../../components/form/Form";
import constants from "../../constants";
import Toast from '../../components/ui/toast/Toast';
import apiCache from '../../utils/apiCache';
import useAuth from "../../hooks/useAuth";

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
}

const CashPayment: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [party, setParty] = useState<PartyOption | null>(null);
  const [partyOptions, setPartyOptions] = useState<PartyOption[]>([]);
  const [voucherNo, setVoucherNo] = useState<string | null>(null);
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
    'date',
    'series',
    'voucherNo',
    'amount',
    'discount',
    'narration'
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

  // Apply default series from user settings
  useEffect(() => {
    if (user && user.defaultSeries && user.defaultSeries.cashPayment && !isEditMode && !formValues.series) {
      setFormValues(prev => ({
        ...prev,
        series: user.defaultSeries.cashPayment
      }));
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
          const data = await res.json();
          console.log('data', data);

          const voucher = id;

          const paymentToEdit = data.find((payment: any) => payment.voucherNo === voucher);

          if (!paymentToEdit) {
            setToastMessage('Payment record not found');
            setToastType('error');
            setShowToast(true);
            return;
          }

          setVoucherNo(paymentToEdit.voucherNo);

          setFormValues({
            date: formatDateForDisplay(paymentToEdit.date),
            series: paymentToEdit.series,
            amount: paymentToEdit.amount,
            discount: paymentToEdit.discount,
            voucherNo: paymentToEdit.voucherNo,
            narration: paymentToEdit.narration,
          });

          // Use apiCache for CMPL data
          const partyData = await apiCache.fetchWithCache(`${constants.baseURL}/cmpl`);
          
          // Use apiCache for balance data
          const balanceData = await apiCache.fetchWithCache(`${constants.baseURL}/json/balance`);

          // Create a balance lookup map
          const balanceMap = new Map();
          if (balanceData && Array.isArray(balanceData.data)) {
            balanceData.data.forEach((item: any) => {
              balanceMap.set(item.partycode, item.result);
            });
          }

          // Check if user is admin
          const isAdmin = user && user.routeAccess && user.routeAccess.includes('Admin');

          // Filter parties based on user's subgroup if applicable and exclude C_CODE ending with "000"
          let filteredPartyData = partyData.filter((party: any) => !party.C_CODE.endsWith('000'));
          
          if (!isAdmin && user && user.subgroups && user.subgroups.length > 0) {
            console.log(`Filtering parties by user's assigned subgroups`);
            
            // Get all subgroup prefixes from user's assigned subgroups
            const subgroupPrefixes = user.subgroups.map((sg: any) => 
              sg.subgroupCode.substring(0, 2).toUpperCase()
            );
            
            console.log(`User's subgroup prefixes: ${subgroupPrefixes.join(', ')}`);
            
            // Filter parties where C_CODE starts with any of the user's subgroup prefixes
            filteredPartyData = filteredPartyData.filter((party: any) => {
              const partyPrefix = party.C_CODE.substring(0, 2).toUpperCase();
              return subgroupPrefixes.includes(partyPrefix);
            });
            
            console.log(`Filtered to ${filteredPartyData.length} parties based on user's subgroups`);
          } else if (isAdmin) {
            console.log('User is admin - showing all parties without filtering');
          }

          const partyList = filteredPartyData.map((party: any) => {
            // Get balance for this party
            const balance = balanceMap.get(party.C_CODE);
            
            // Check if balance is non-zero (either greater or in negative)
            const hasNonZeroBalance = balance && balance.trim() !== '0 CR' && balance.trim() !== '0 DR';
            
            return {
              value: party.C_CODE,
              label: `${party.C_NAME} | ${party.C_CODE}`,
            };
          });

          setPartyOptions(partyList);
          
          setParty(partyList.find((p: PartyOption) => p.value === paymentToEdit.party));
        } catch (error) {
          console.error('Error fetching edit data:', error);
          setToastMessage('Failed to load payment details');
          setToastType('error');
          setShowToast(true);
        }
      };
      fetchEditData();
    } else {
      // Fetch party data for new payment
      const fetchPartyData = async () => {
        try {
          // Use apiCache for CMPL data
          const partyData = await apiCache.fetchWithCache(`${constants.baseURL}/cmpl`);
          
          // Use apiCache for balance data
          const balanceData = await apiCache.fetchWithCache(`${constants.baseURL}/json/balance`);

          // Create a balance lookup map
          const balanceMap = new Map();
          if (balanceData && Array.isArray(balanceData.data)) {
            balanceData.data.forEach((item: any) => {
              balanceMap.set(item.partycode, item.result);
            });
          }

          // Check if user is admin
          const isAdmin = user && user.routeAccess && user.routeAccess.includes('Admin');

          // Filter parties based on user's subgroup if applicable and exclude C_CODE ending with "000"
          let filteredPartyData = partyData.filter((party: any) => !party.C_CODE.endsWith('000'));
          
          if (!isAdmin && user && user.subgroups && user.subgroups.length > 0) {
            console.log(`Filtering parties by user's assigned subgroups`);
            
            // Get all subgroup prefixes from user's assigned subgroups
            const subgroupPrefixes = user.subgroups.map((sg: any) => 
              sg.subgroupCode.substring(0, 2).toUpperCase()
            );
            
            console.log(`User's subgroup prefixes: ${subgroupPrefixes.join(', ')}`);
            
            // Filter parties where C_CODE starts with any of the user's subgroup prefixes
            filteredPartyData = filteredPartyData.filter((party: any) => {
              const partyPrefix = party.C_CODE.substring(0, 2).toUpperCase();
              return subgroupPrefixes.includes(partyPrefix);
            });
            
            console.log(`Filtered to ${filteredPartyData.length} parties based on user's subgroups`);
          } else if (isAdmin) {
            console.log('User is admin - showing all parties without filtering');
          }

          const partyList = filteredPartyData.map((party: any) => {
            // Get balance for this party
            const balance = balanceMap.get(party.C_CODE);
            
            // Check if balance is non-zero (either greater or in negative)
            const hasNonZeroBalance = balance && balance.trim() !== '0 CR' && balance.trim() !== '0 DR';
            
            return {
              value: party.C_CODE,
              label: `${party.C_NAME} | ${party.C_CODE}`,
            };
          });

          setPartyOptions(partyList);
          
          // Clear expired cache entries
          apiCache.clearExpiredCache();
        } catch (error) {
          setToastMessage('Failed to fetch party data');
          setToastType('error');
          setShowToast(true);
        }
      };
      
      fetchPartyData();
    }
  }, [id, user]);

  // Handle fetch next voucher number
  useEffect(() => {
    const fetchNextVoucherNo = async () => {
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
          setFormValues(prev => ({
            ...prev,
            series: user.defaultSeries.cashPayment,
            voucherNo: data.nextReceiptNo.toString()
          }));
        } else {
          setFormValues(prev => ({
            ...prev,
            voucherNo: data.nextReceiptNo.toString()
          }));
        }
      } catch (error) {
        console.error('Error fetching next voucher number:', error);
      }
    };

    if (!isEditMode) {
      fetchNextVoucherNo();
    }
  }, [isEditMode, user]);

  const handlePartyChange = (value: string) => {
    const selectedParty = partyOptions.find(p => p.value === value);
    setParty(selectedParty || null);
  };

  // New handler for input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    // Simply set the value directly, Input component's seriesMode will handle capitalization
    setFormValues(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Add a simple function to ensure uppercase series input
  const handleSeriesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow alphabetic characters and convert to uppercase
    const alphabeticValue = value.replace(/[^A-Za-z]/g, '');
    const uppercaseValue = alphabeticValue.toUpperCase();
    
    setFormValues(prev => ({
      ...prev,
      series: uppercaseValue
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const formData = new FormData(e.currentTarget);
    const formValues: FormValues = {
      date: formatDateForAPI(formData.get('date') as string),
      series: formData.get('series') as string,
      amount: formData.get('amount') as string,
      discount: formData.get('discount') as string,
      voucherNo: formData.get('voucherNo') as string,
      narration: formData.get('narration') as string,
      party: party?.value
    };

    try {
      const route = isEditMode ? `/edit/cash-payments` : `/cash-payments`;
      const response = await fetch(constants.baseURL + route, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(formValues)
      });

      if (!response.ok) {
        const errorMessage = await response.text();
        setToastMessage(`Error: ${errorMessage}`);
        setToastType('error');
        setShowToast(true);
        return;
      }

      setToastMessage('Data saved successfully!');
      setToastType('success');
      setShowToast(true);
      navigate('/db/cash-payments');
    } catch (error) {
      console.error('Network error:', error);
      setToastMessage('Network error. Please try again later.');
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-900">
      <PageMeta title="Cash Payments" description="Cash Payments Form" />
      <PageBreadcrumb pageTitle="Cash Payments" />
      
      <div className="container mx-auto px-0 py-4 md:max-w-3xl">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">Cash Payment Form</h2>
          
          <FormComponent onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-1">
                <Autocomplete
                  id="party-select"
                  label="Party"
                  options={partyOptions}
                  onChange={handlePartyChange}
                  defaultValue={party?.value}
                />
                
                <div className="mt-4">
                  <Input
                    id="date"
                    name="date"
                    type="text"
                    label="Date (dd-mm-yyyy)"
                    value={formValues.date}
                    onChange={handleInputChange}
                    required
                    className="w-full"
                    placeholder="DD-MM-YYYY"
                  />
                </div>
              </div>
              
              <div className="col-span-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-1">
                    <Input 
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
                type="submit"
                className="px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Save'}
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