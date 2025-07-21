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
  narration: string;
}

const PrintBulkCashReceipts: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CashData[] | null>(null); // Handles multiple data items
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

  // Format date to British format (DD-MM-YYYY)
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  // Extract the query parameters
  const getQueryParams = () => {
    const queryParams = new URLSearchParams(window.location.search);
    const queryKey = queryParams.keys().next().value || '';
    let value = queryParams.get(queryKey);
    
    // Check if the value is an array (multiple values for same key) or comma-separated
    const allValues = queryParams.getAll(queryKey);
    if (allValues.length > 1) {
      // Use the first value if multiple exist, assuming it's the comma-separated string
      value = allValues[0];
      console.log('Multiple values found for', queryKey, 'using first value (potentially comma-separated):', value);
    } else if (value && value.includes(',')) {
      // Value is already a comma-separated string
      console.log('Comma-separated values found for', queryKey, ':', value);
    }
    
    return { queryKey, value };
  };

  const { queryKey, value } = getQueryParams();
  let isprinted = false;
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
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('Authentication required');
        }
        
        const ids = value.split(',').map(id => id.trim()).filter(id => id); // Split, trim, and filter empty IDs
        if (ids.length === 0) {
          setError('No valid identifiers provided');
          setLoading(false);
          showToast('No valid identifiers provided', 'error');
          return;
        }

        const fetchedDataArray: CashData[] = [];

        for (const id of ids) {
          const paramKey = queryKey === 'voucherNo' ? 'voucherNo' : 'ReceiptNo'; // Ensuring correct case for ReceiptNo
          const response = await fetch(`${constants.baseURL}/print?${paramKey}=${id}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (!response.ok) {
            throw new Error(`Failed to fetch data for ID: ${id}`);
          }
          const responseData = await response.json();
          fetchedDataArray.push(responseData); // Assuming API returns single object per ID
        }
        
        console.log('Fetched data for all IDs:', fetchedDataArray);
        setData(fetchedDataArray);
        setLoading(false);
        
        // Check if auto-print was requested
        const shouldAutoPrint = localStorage.getItem('autoPrint') == 'true';
        // check for query param ?autoprint=true
        const autoPrint = window.location.search.includes('autoprint');
        console.log("location:",window.location.search)
        setTimeout(() => {
        if (shouldAutoPrint || autoPrint) {
          localStorage.removeItem('autoPrint'); // Clean up flag
          // Delay auto-print to ensure the page is fully rendered
            console.log('Auto-printing triggered');
            // window.print();

            
            if(!isprinted) {
              isprinted = true;
              const printBtn = document.querySelector("button.bg-blue-500.transition-colors") as HTMLButtonElement;
              printBtn.click();
              
              setTimeout(() => {
                navigate('/cash-receipt');
              }, 2000);
            }
          }
        }, 2000);
      } catch (err) {
        console.error('Error fetching data:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load data';
        setError(errorMessage);
        setLoading(false);
        showToast(errorMessage, 'error');
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

    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 3000);
  };

  const handlePrint = () => {
    window.print();
    
    // Add event listener for after print
    const afterPrint = () => {
      console.log("print done")
      window.removeEventListener('afterprint', afterPrint);
      // Redirect to cash receipt page after print
      navigate('/cash-receipt');
    };
    
    window.addEventListener('afterprint', afterPrint);
  };

  const handleBack = () => {
    // Navigate back based on whether it was receipt or payment context
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
        <PageMeta title={`Error | Bulk Cash ${isReceipt ? 'Receipt' : 'Payment'} Print`} description={`Error loading bulk cash ${isReceipt ? 'receipt' : 'payment'} data`} />
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
    <div className="p-8 max-w-full mx-auto">
      <PageMeta title={`Bulk Cash ${isReceipt ? 'Receipt' : 'Payment'} Print`} description={`Print multiple cash ${isReceipt ? 'receipts' : 'payments'} details`} />
      
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
          Print All
        </button>
      </div>
      
      <div ref={printRef} className="bg-gray-900 text-white print:bg-white print:text-black overflow-hidden">
        {data && data.length > 0 && data.map((item, index) => (
          <div 
            key={item.id || index} 
            className={`receipt-container mb-4 print:mb-0 ${index > 0 && index % 3 === 0 ? 'print-page-break-before' : ''}`}
          >
            <div className="receipt">
              <header className="header">
                <h1 className="text-white print:text-black font-bold text-xxl">Ekta Enterprises</h1>
                <h2 className="text-white print:text-black text-xl">GSTIN: 23AJBPS6285R1ZF , Mob: 9179174888, 9169164888, 9826623188</h2>
                <p className="text-white print:text-black text-xl">Budhwari Bazar, Gn Road Seoni, Seoni</p>
              </header>
              <div className="content">
                <div className="details border-white print:border-black" style={{ margin: 0, padding: '10px 10px', fontSize: 'larger' }}>
                  <div>
                    Date: <span>{formatDate(item.date)}</span>
                  </div>
                  <div>
                    Mode: <span>Cash</span>
                  </div>
                  <div>
                    {isReceipt ? (
                      <span> Receipt No: {item.series}-{item.receiptNo}</span>
                    ) : (
                      <span> Voucher No: {item.voucherNo}</span>
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
                      <td className="text-white print:text-black">{item.C_NAME}</td>
                      <td className="text-white print:text-black">{item.party}</td>
                      <td id={`amount-${index}`} className="border-white print:border-black text-white print:text-black">{item.amount}</td>
                    </tr>
                    <tr>
                      <td className="text-white print:text-black" colSpan={2}>
                        {' '}
                        By {isReceipt ? 'R/no' : 'V/no'}: {item.narration}
                      </td>
                      <td id={`amount-narration-${index}`} className="border-white print:border-black text-white print:text-black"> </td>
                    </tr>
                  </tbody>
                </table>
                <div className="in-words border-white print:border-black text-white print:text-black">
                  In Words: <span>{item.AmountInWords}</span>
                </div>
              </div>
              <footer className="footer">
                <div className="text-white print:text-black">Passed By</div>
                <div className="text-white print:text-black">Cashier</div>
                <div className="text-white print:text-black">Authorised Signatory</div>
              </footer>
            </div>
          </div>
        ))}
      </div>
      
      <style>
{`
.receipt {
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  padding: 0;
  font-family: Arial, sans-serif;
  font-size: 0.7em;
}

.receipt-container + .receipt-container {
  margin-top: 0px; 
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
  min-height: 100px;
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 20px;
  table-layout: fixed;
}

table, th {
  border: 1px solid;
}

th, td {
  padding: 4px; 
  text-align: left;
  word-wrap: break-word;
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
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow-x: hidden;
  }
  
  .receipt {
    color: black;
    width: 100%;
    max-width: none;
    font-size: 0.6em !important;
  }

  .receipt .header h1 {
    margin: 0 !important;
    font-size: 1.2em !important;
  }
  
  .receipt .header h2 {
    margin: 1mm 0 !important;
    font-size: 0.9em !important;
  }
  
  .receipt .header p {
    margin: 1mm 0 !important; 
  }
  
  .receipt .content .details {
    margin: 1.5mm 0 !important;
    padding: 1.5mm !important;
  }
  
  .receipt table {
    margin-bottom: 1mm !important; 
  }
  
  .receipt th, .receipt td {
    padding: 2px !important;
    font-size: 1em !important;
  }
  
  .receipt .in-words {
    margin: 1mm 0 !important;
    padding: 1.5mm !important;
  }
  
  .receipt .footer {
    margin-top: 3mm !important; 
    padding-top: 1.5mm !important;
  }
  
  .details, table, th, .in-words {
    border-color: black;
  }
  
  td[id^="amount-"] { 
    border-left-color: black !important; 
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
    margin: 5mm;
  }

  .receipt-container {
    page-break-inside: avoid; 
    margin-bottom: 1mm !important;
    height: 95mm !important; /* Increased height to ensure only 3 fit */
    max-height: 95mm !important; 
    overflow: hidden !important; 
    box-sizing: border-box !important;
  }

  .print-page-break-before {
    page-break-before: always !important;
  }
  
  /* Force page break after every 3rd receipt */
  .receipt-container:nth-child(3n+1):not(:first-child) {
    page-break-before: always !important;
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

export default PrintBulkCashReceipts;