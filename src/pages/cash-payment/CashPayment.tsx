import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Input from "../../components/form/input/Input";
import Autocomplete from "../../components/form/input/Autocomplete";
import FormComponent from "../../components/form/Form";
import constants from "../../constants";
import Toast from '../../components/ui/toast/Toast';
import apiCache from '../../utils/apiCache';

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
    date: new Date().toISOString().split('T')[0],
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
  const [user, setUser] = useState<any>(null);

  const navigate = useNavigate();

  // Fetch user data first
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await fetch(`${constants.baseURL}/api/checkIsAuth`, {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.authenticated && data.user) {
            setUser(data.user);
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchUserData();
  }, []);

  useEffect(() => {
    const fetchEditData = async () => {
      try {
        const res = await fetch(constants.baseURL + '/json/cash-payments', {
          credentials: 'include'
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
          date: paymentToEdit.date,
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
        
        if (!isAdmin && user && user.subgroup && user.subgroup.subgroupCode) {
          const subgroupPrefix = user.subgroup.subgroupCode.substring(0, 2).toUpperCase();
          console.log(`Filtering parties by subgroup prefix: ${subgroupPrefix}`);
          
          filteredPartyData = filteredPartyData.filter((party: any) => {
            const partyPrefix = party.C_CODE.substring(0, 2).toUpperCase();
            return partyPrefix === subgroupPrefix;
          });
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
            label: hasNonZeroBalance
              ? `${party.C_NAME} | ${party.C_CODE} / ${balance}`
              : `${party.C_NAME} | ${party.C_CODE}`,
          };
        });

        setPartyOptions(partyList);
        setParty(partyList.find((p: PartyOption) => p.value === paymentToEdit.party));
      } catch (error) {
        console.error('Failed to fetch data for edit:', error);
        setToastMessage('Failed to load payment details');
        setToastType('error');
        setShowToast(true);
      }
    };

    const fetchNewData = async () => {
      try {
        const resVoucher = await fetch(constants.baseURL + '/slink/cash-payments', {
          credentials: 'include'
        });
        const dataVoucher = await resVoucher.json();
        setVoucherNo(dataVoucher.nextVoucherNo);

        // Use apiCache for CMPL data
        const dataParty = await apiCache.fetchWithCache(`${constants.baseURL}/cmpl`);
        
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
        let filteredPartyData = dataParty.filter((party: any) => !party.C_CODE.endsWith('000'));
        
        if (!isAdmin && user && user.subgroup && user.subgroup.subgroupCode) {
          const subgroupPrefix = user.subgroup.subgroupCode.substring(0, 2).toUpperCase();
          console.log(`Filtering parties by subgroup prefix: ${subgroupPrefix}`);
          
          filteredPartyData = filteredPartyData.filter((party: any) => {
            const partyPrefix = party.C_CODE.substring(0, 2).toUpperCase();
            return partyPrefix === subgroupPrefix;
          });
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
            label: hasNonZeroBalance
              ? `${party.C_NAME} | ${party.C_CODE} / ${balance}`
              : `${party.C_NAME} | ${party.C_CODE}`,
          };
        });

        setPartyOptions(partyList);
        
        // Clear expired cache entries
        apiCache.clearExpiredCache();
      } catch (error) {
        setToastMessage('Failed to fetch data for new entry');
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
    const selectedParty = partyOptions.find(p => p.value === value);
    setParty(selectedParty || null);
  };

  // New handler for input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    // Auto-capitalize series input
    if (name === 'series') {
      setFormValues(prev => ({
        ...prev,
        [name]: value.toUpperCase()
      }));
    } else {
      setFormValues(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const formData = new FormData(e.currentTarget);
    const formValues: FormValues = {
      date: formData.get('date') as string,
      series: formData.get('series') as string,
      amount: formData.get('amount') as string,
      discount: formData.get('discount') as string,
      voucherNo: formData.get('voucherNo') as string,
      narration: formData.get('narration') as string,
      party: party?.value
    };

    try {
      const route = isEditMode ? `/slink/editCashPayment` : `/cash-payments`;
      const response = await fetch(constants.baseURL + route, {
        method: 'POST',
        body: JSON.stringify(formValues),
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include'
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
                    type="date"
                    label="Date"
                    value={formValues.date}
                    onChange={handleInputChange}
                    required
                    className="w-full"
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
                      onChange={handleInputChange}
                      required
                      maxLength={1}
                      className="w-full uppercase"
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
            
            <div className="mt-6 flex justify-end gap-3">
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
          onClose={() => setShowToast(false)}
        />
      )}
    </div>
  );
};

export default CashPayment; 