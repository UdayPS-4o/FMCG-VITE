import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import constants from '../../constants';
import PageMeta from '../../components/common/PageMeta';
import Toast from '../../components/ui/toast/Toast';

interface CashPaymentData {
  id: number;
  date: string;
  series: string;
  voucherNo: string;
  party: string;
  partyName: string;
  amount: string;
  discount: string;
}

const PrintCashPayment: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentData, setPaymentData] = useState<CashPaymentData | null>(null);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    visible: false,
    message: '',
    type: 'info'
  });

  // Extract the payment ID from the URL query parameters
  const getPaymentId = () => {
    const queryParams = new URLSearchParams(window.location.search);
    return queryParams.get('id') || '';
  };

  const paymentId = getPaymentId();

  useEffect(() => {
    const validatePayment = async () => {
      if (!paymentId) {
        setError('No payment ID provided');
        setLoading(false);
        showToast('No payment ID provided', 'error');
        return;
      }

      try {
        const response = await fetch(`${constants.baseURL}/json/cash-payments`);
        if (!response.ok) {
          throw new Error('Failed to fetch payment data');
        }

        const payments = await response.json();
        const payment = payments.find((p: any) => p.id === parseInt(paymentId));

        if (!payment) {
          setError('Payment not found');
          setLoading(false);
          showToast('Payment not found', 'error');
          return;
        }

        // Fetch party details
        const partyResponse = await fetch(`${constants.baseURL}/cmpl`);
        if (!partyResponse.ok) {
          throw new Error('Failed to fetch party data');
        }

        const parties = await partyResponse.json();
        const party = parties.find((p: any) => p.C_CODE === payment.party);

        setPaymentData({
          ...payment,
          partyName: party ? party.C_NAME : 'Unknown Party'
        });
        setLoading(false);
      } catch (err) {
        console.error('Error fetching payment data:', err);
        setError('Failed to load payment data');
        setLoading(false);
        showToast('Failed to load payment data', 'error');
      }
    };

    validatePayment();
  }, [paymentId]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({
      visible: true,
      message,
      type
    });

    // Auto-hide toast after 3 seconds
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 3000);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleBack = () => {
    navigate('/db/cash-payments');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <PageMeta title="Error | Cash Payment Print" description="Error loading cash payment data" />
        <div className="text-red-500 text-xl mb-4">{error}</div>
        <button
          onClick={handleBack}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Back to Cash Payments
        </button>
        {toast.visible && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(prev => ({ ...prev, visible: false }))}
            isVisible={toast.visible}
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <PageMeta title="Cash Payment Print" description="Print cash payment details" />
      
      {/* Print controls - hidden when printing */}
      <div className="print:hidden mb-6 flex justify-between">
        <button
          onClick={handleBack}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
        >
          Back
        </button>
        <button
          onClick={handlePrint}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Print
        </button>
      </div>
      
      {/* Payment content */}
      <div className="border border-gray-300 p-8 rounded-lg">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">Cash Payment</h1>
          <p className="text-gray-600">Voucher #{paymentData?.voucherNo}</p>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <p><span className="font-semibold">Date:</span> {paymentData?.date}</p>
            <p><span className="font-semibold">Series:</span> {paymentData?.series}</p>
          </div>
          <div>
            <p><span className="font-semibold">Voucher No:</span> {paymentData?.voucherNo}</p>
            <p><span className="font-semibold">Party:</span> {paymentData?.partyName}</p>
          </div>
        </div>
        
        <div className="border-t border-gray-300 pt-4 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p><span className="font-semibold">Amount:</span> ₹{paymentData?.amount}</p>
            </div>
            <div>
              <p><span className="font-semibold">Discount:</span> ₹{paymentData?.discount}</p>
            </div>
          </div>
        </div>
        
        <div className="border-t border-gray-300 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p><span className="font-semibold">Net Amount:</span> ₹{
                parseFloat(paymentData?.amount || '0') - parseFloat(paymentData?.discount || '0')
              }</p>
            </div>
          </div>
        </div>
        
        <div className="mt-12 grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="border-t border-gray-300 pt-2 inline-block">Authorized Signature</p>
          </div>
          <div className="text-center">
            <p className="border-t border-gray-300 pt-2 inline-block">Receiver's Signature</p>
          </div>
        </div>
      </div>
      
      {toast.visible && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(prev => ({ ...prev, visible: false }))}
          isVisible={toast.visible}
        />
      )}
    </div>
  );
};

export default PrintCashPayment; 