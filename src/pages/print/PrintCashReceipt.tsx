import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import constants from '../../constants';
import PageMeta from '../../components/common/PageMeta';
import Toast from '../../components/ui/toast/Toast';

interface CashData {
  id: number;
  date: string;
  series: string;
  receiptNo?: string;
  voucherNo?: string;
  party: string;
  partyName: string;
  amount: string;
  discount: string;
  M_NAME?: string;
  C_CODE?: string;
  C_NAME?: string;
  AmountInWords?: string;
}

const PrintCashReceipt: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CashData | null>(null);
  const [isReceipt, setIsReceipt] = useState<boolean>(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    visible: false,
    message: '',
    type: 'info'
  });
  const printRef = useRef<HTMLDivElement>(null);

  // Extract the query parameters
  const getQueryParams = () => {
    const queryParams = new URLSearchParams(window.location.search);
    const queryKey = queryParams.keys().next().value || '';
    let value = queryParams.get(queryKey);
    
    // Check if the value is an array (multiple values for same key)
    const allValues = queryParams.getAll(queryKey);
    if (allValues.length > 1) {
      // Use the first value if multiple exist
      value = allValues[0];
      console.log('Multiple values found for', queryKey, 'using first value:', value);
    }
    
    return { queryKey, value };
  };

  const { queryKey, value } = getQueryParams();

  useEffect(() => {
    // Determine if this is a receipt or payment based on the query key
    setIsReceipt(queryKey !== 'voucherNo');
    
    const fetchData = async () => {
      if (!value || !queryKey) {
        setError('No identifier provided');
        setLoading(false);
        showToast('No identifier provided', 'error');
        return;
      }

      try {
        // Make the API call using the exact same pattern as the React version
        const response = await fetch(`${constants.baseURL}/print?${queryKey}=${value}`);
        if (!response.ok) {
          throw new Error('Failed to fetch data');
        }

        const responseData = await response.json();
        console.log('Fetched data:', responseData); // Log the response for debugging
        setData(responseData);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load data');
        setLoading(false);
        showToast('Failed to load data', 'error');
      }
    };

    fetchData();
  }, [queryKey, value]);

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
    navigate(isReceipt ? '/db/cash-receipts' : '/db/cash-payments');
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
        <PageMeta title={`Error | Cash ${isReceipt ? 'Receipt' : 'Payment'} Print`} description={`Error loading cash ${isReceipt ? 'receipt' : 'payment'} data`} />
        <div className="text-red-500 text-xl mb-4">{error}</div>
        <button
          onClick={handleBack}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Back to Cash {isReceipt ? 'Receipts' : 'Payments'}
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
      <PageMeta title={`Cash ${isReceipt ? 'Receipt' : 'Payment'} Print`} description={`Print cash ${isReceipt ? 'receipt' : 'payment'} details`} />
      
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
      
      {/* Content */}
      <div ref={printRef} className="bg-gray-900 text-white print:bg-white print:text-black">
        {data && (
          <div className="receipt">
            <header className="header">
              <h1 className="text-white print:text-black">Ekta Enterprises</h1>
              <p className="text-white print:text-black">Budhwari Bazar, Gn Road Seoni, Seoni</p>
            </header>
            <div className="content">
              <div className="details border-white print:border-black" style={{ margin: 0, padding: '30px 10px', fontSize: 'larger' }}>
                <div>
                  Date: <span>{data.date}</span>
                </div>
                <div>
                  Mode: <span>Cash</span>
                </div>
                <div>
                  {isReceipt ? (
                    <span> Receipt No: {data.receiptNo}</span>
                  ) : (
                    <span> Voucher No: {data.voucherNo}</span>
                  )}
                </div>
              </div>
              <table className="border-white print:border-black">
                <thead>
                  <tr>
                    <th className="border-white print:border-black text-white print:text-black"> Name of A/c Head </th>
                    <th className="border-white print:border-black text-white print:text-black">Code</th>
                    <th className="border-white print:border-black text-white print:text-black">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="text-white print:text-black">{data.C_NAME}</td>
                    <td className="text-white print:text-black">{data.party}</td>
                    <td id="amount" className="border-white print:border-black text-white print:text-black">{data.amount}</td>
                  </tr>
                  <tr>
                    <td className="text-white print:text-black">
                      {' '}
                      By {isReceipt ? 'R/no' : 'V/no'} {data.M_NAME} {data.C_CODE}
                    </td>
                    <td className="text-white print:text-black"> </td>
                    <td id="amount" className="border-white print:border-black text-white print:text-black"> </td>
                  </tr>
                </tbody>
              </table>
              <div className="in-words border-white print:border-black text-white print:text-black">
                In Words: <span>{data.AmountInWords}</span>
              </div>
            </div>
            <footer className="footer">
              <div className="text-white print:text-black">Passed By</div>
              <div className="text-white print:text-black">Cashier</div>
              <div className="text-white print:text-black">Authorised Signatory</div>
            </footer>
          </div>
        )}
      </div>
      
      <style>
        {`
        .receipt {
          width: 80%;
          margin: 20px auto;
          display: flex;
          flex-direction: column;
          gap: 50px;
          padding: 20px;
          font-family: Arial, sans-serif;
        }

        .header h1 {
          margin: 0;
        }

        .header p {
          margin: 10px 0;
        }
        
        .content .details {
          display: flex;
          justify-content: space-between;
          margin: 20px 0;
        }

        .content .details div span {
          font-weight: bold;
        }
        
        .details {
          height: 100%;
          margin: 0;
          border: 1px solid;
        }
        
        table {
          min-height: 200px;
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }

        table, th {
          border: 1px solid;
        }

        th, td {
          padding: 8px;
          text-align: left;
        }

        #amount {
          border-left: 1px solid;
        }     
        
        .in-words {
          font-weight: bold;
          border-bottom: 1px solid;
        }

        .footer {
          display: flex;
          justify-content: space-between;
          padding-top: 10px;
          margin-top: 50px;
        }

        @media print {
          body {
            background-color: white;
            color: black;
          }
          
          .receipt {
            color: black;
          }
          
          .details, table, th, #amount, .in-words {
            border-color: black;
          }
          
          .print\\:hidden {
            display: none !important;
          }
          
          .print\\:bg-white {
            background-color: white !important;
          }
          
          .print\\:text-black {
            color: black !important;
          }
          
          .print\\:border-black {
            border-color: black !important;
          }
          
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
        `}
      </style>
      
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

export default PrintCashReceipt; 