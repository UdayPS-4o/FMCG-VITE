import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import constants from '../../constants';
import PageMeta from '../../components/common/PageMeta';
import Toast from '../../components/ui/toast/Toast';

const PrintInvoicing: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    visible: false,
    message: '',
    type: 'info'
  });

  // Extract the invoice ID from the URL query parameters
  const getInvoiceId = () => {
    const queryParams = new URLSearchParams(window.location.search);
    return queryParams.get('id') || '';
  };

  const invoiceId = getInvoiceId();

  useEffect(() => {
    const validateInvoice = async () => {
      if (!invoiceId) {
        setError('No invoice ID provided');
        setLoading(false);
        return;
      }

      try {
        // First verify the invoice exists
        let invoiceData;
        try {
          const res = await fetch(`${constants.baseURL}/edit/invoicing/${invoiceId}`);
          if (!res.ok) throw new Error('Primary endpoint failed');
          invoiceData = await res.json();
        } catch {
          const res = await fetch(`${constants.baseURL}/invoicing/${invoiceId}`);
          if (!res.ok) throw new Error('Invoice not found');
          invoiceData = await res.json();
        }

        // Verify the print endpoint is accessible
        const printRes = await fetch(`${constants.baseURL}/print/invoicing/${invoiceId}`);
        if (!printRes.ok) {
          throw new Error('Print service unavailable');
        }

        setLoading(false);
      } catch (err) {
        console.error('Failed to validate invoice:', err);
        setError(err instanceof Error ? err.message : 'Failed to load invoice');
        setToast({
          visible: true,
          message: 'Failed to load invoice',
          type: 'error'
        });
        setLoading(false);
      }
    };

    validateInvoice();
  }, [invoiceId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-lg text-gray-600 dark:text-gray-300">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center gap-4">
        <div className="text-lg text-red-600 dark:text-red-400">{error}</div>
        <button
          onClick={() => navigate('/db/invoicing')}
          className="px-4 py-2 text-gray-500 rounded-md hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          Back to Invoicing
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta
        title="Print Invoice | FMCG Vite Admin Template"
        description="Print Invoice page in FMCG Vite Admin Template"
      />
      
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.visible}
        onClose={() => setToast({ ...toast, visible: false })}
      />
      
      <div className="container mx-auto px-4 py-6 overflow-hidden">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-semibold dark:text-white">Print Invoice</h1>
            <button
              onClick={() => navigate('/db/invoicing')}
              className="px-4 py-2 text-gray-500 rounded-md hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Back to Invoicing
            </button>
          </div>
          
          <iframe 
            src={`${constants.baseURL}/print/invoicing/${invoiceId}`}
            height="800" 
            width="100%"
            className="border-0"
            title="Invoice Print"
          />
        </div>
      </div>
    </div>
  );
};

export default PrintInvoicing; 