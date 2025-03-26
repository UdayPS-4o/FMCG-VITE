import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import Input from "../../components/form/input/Input";
import Autocomplete from "../../components/form/input/Autocomplete";
import FormComponent from "../../components/form/Form";
import constants from "../../constants";
import Toast from '../../components/ui/toast/Toast';

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
  });
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  const navigate = useNavigate();

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
        });

        const resParty = await fetch(constants.baseURL + '/cmpl', {
          credentials: 'include'
        });
        const partyData = await resParty.json();
        const balanceRes = await fetch(constants.baseURL + '/json/balance', {
          credentials: 'include'
        });
        const balanceData = await balanceRes.json();

        const getBalance = (C_CODE: string) =>
          balanceData.data.find((user: any) => user.partycode === C_CODE)?.result || 0;

        const partyList = partyData.map((user: any) => ({
          value: user.C_CODE,
          label: `${user.C_NAME} | ${getBalance(user.C_CODE)}`,
        }));

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

        const resParty = await fetch(constants.baseURL + '/cmpl', {
          credentials: 'include'
        });
        const dataParty = await resParty.json();
        const balanceRes = await fetch(constants.baseURL + '/json/balance', {
          credentials: 'include'
        });
        const balanceData = await balanceRes.json();

        const getBalance = (C_CODE: string) =>
          balanceData.data.find((user: any) => user.partycode === C_CODE)?.result || 0;

        const partyList = dataParty.map((user: any) => ({
          value: user.C_CODE,
          label: `${user.C_NAME} | ${getBalance(user.C_CODE)}`,
        }));

        setPartyOptions(partyList);
      } catch (error) {
        setToastMessage('Failed to fetch data for new entry');
        setToastType('error');
        setShowToast(true);
      }
    };

    if (id) {
      setIsEditMode(true);
      fetchEditData();
    } else {
      fetchNewData();
    }
  }, [id]);

  const handlePartyChange = (value: string) => {
    const selectedParty = partyOptions.find(p => p.value === value);
    setParty(selectedParty || null);
  };

  // New handler for input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({
      ...prev,
      [name]: value
    }));
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
      party: party?.value
    };

    try {
      const route = isEditMode ? `/slink/editCashPayment` : `/cash-payments`;
      const response = await fetch(constants.baseURL + route, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formValues),
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
      
      <div className="container mx-auto px-4 py-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold mb-6 text-gray-800 dark:text-white">Cash Payment Form</h2>
          
          <FormComponent onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  label="Date"
                  value={formValues.date}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div>
                <Input
                  id="voucherNo"
                  name="voucherNo"
                  label="Voucher No."
                  type="text"
                  value={voucherNo || formValues.voucherNo || ''}
                  onChange={handleInputChange}
                />
              </div>
              
              <div>
                <Autocomplete
                  id="party-select"
                  label="Party"
                  options={partyOptions}
                  onChange={handlePartyChange}
                  defaultValue={party?.value}
                />
              </div>
              
              <div>
                <Input 
                  id="series"
                  name="series" 
                  label="Series" 
                  value={formValues.series}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div>
                <Input 
                  id="amount"
                  name="amount" 
                  type="number"
                  label="Amount" 
                  value={formValues.amount}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div>
                <Input
                  id="discount"
                  name="discount"
                  type="number"
                  label="Discount"
                  value={formValues.discount}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>
            
            <div className="flex justify-end mt-8 space-x-4">
              <button
                type="button"
                onClick={() => navigate('/db/cash-payments')}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-blue-700 dark:hover:bg-blue-800"
              >
                {isSubmitting ? 'Saving...' : isEditMode ? 'Update Payment' : 'Save Payment'}
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
          isVisible={showToast}
        />
      )}
    </div>
  );
};

export default CashPayment; 