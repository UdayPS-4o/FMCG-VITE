import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import constants from '../../constants';
import PageMeta from '../../components/common/PageMeta';
import Toast from '../../components/ui/toast/Toast';
import { PulseLoadAnimation } from '../../components/ui/loading';

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
  const [data, setData] = useState<CashData[] | null>(null);
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

    const allValues = queryParams.getAll(queryKey);
    if (allValues.length > 1) {
      value = allValues[0];
    } else if (value && value.includes(',')) {
      // already comma-separated
    }

    return { queryKey, value };
  };

  const { queryKey, value } = getQueryParams();
  let isprinted = false;

  useEffect(() => {
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
        if (!token) throw new Error('Authentication required');

        const ids = value.split(',').map(id => id.trim()).filter(id => id);
        if (ids.length === 0) {
          setError('No valid identifiers provided');
          setLoading(false);
          showToast('No valid identifiers provided', 'error');
          return;
        }

        const fetchedDataArray: CashData[] = [];

        for (const id of ids) {
          const paramKey = queryKey === 'voucherNo' ? 'voucherNo' : 'ReceiptNo';
          const response = await fetch(`${constants.baseURL}/print?${paramKey}=${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!response.ok) throw new Error(`Failed to fetch data for ID: ${id}`);
          const responseData = await response.json();
          fetchedDataArray.push(responseData);
        }

        setData(fetchedDataArray);
        setLoading(false);

        const shouldAutoPrint = localStorage.getItem('autoPrint') == 'true';
        const autoPrint = window.location.search.includes('autoprint');
        if (shouldAutoPrint || autoPrint) {
          localStorage.removeItem('autoPrint');
          if (!isprinted) {
            window.print();
            setTimeout(() => { navigate('/cash-receipt'); }, 2000);
          }
          isprinted = true;
        }

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load data';
        setError(errorMessage);
        setLoading(false);
        showToast(errorMessage, 'error');
      }
    };

    fetchData();
  }, [queryKey, value]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ visible: true, message, type });
    setTimeout(() => { setToast(prev => ({ ...prev, visible: false })); }, 3000);
  };

  const handlePrint = () => {
    window.print();
    const afterPrint = () => {
      window.removeEventListener('afterprint', afterPrint);
      navigate('/cash-receipt');
    };
    window.addEventListener('afterprint', afterPrint);
  };

  const handleBack = () => {
    navigate(isReceipt ? '/db/cash-receipts' : '/db/cash-payments');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <PulseLoadAnimation size="md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <PageMeta title={`Error | Bulk Cash ${isReceipt ? 'Receipt' : 'Payment'} Print`} description="" />
        <div className="text-red-500 text-xl mb-4">{error}</div>
        <button onClick={handleBack} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
          Back to Cash {isReceipt ? 'Receipts' : 'Payments'}
        </button>
        {toast.visible && (
          <Toast message={toast.message} type={toast.type}
            onClose={() => setToast(prev => ({ ...prev, visible: false }))}
            isVisible={toast.visible} />
        )}
      </div>
    );
  }

  return (
    <div className="p-4 max-w-full mx-auto">
      <PageMeta
        title={`Bulk Cash ${isReceipt ? 'Receipt' : 'Payment'} Print`}
        description={`Print multiple cash ${isReceipt ? 'receipts' : 'payments'} details`}
      />

      {/* ── Screen-only toolbar ── */}
      <div className="print:hidden mb-4 flex justify-between items-center gap-4">
        <button
          onClick={handleBack}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
        >
          Back
        </button>

        <div className="text-sm text-gray-600 dark:text-gray-300 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded px-3 py-1">
          💡 Set <strong>Pages per sheet = 1</strong> in the print dialog for best results
        </div>

        <button
          onClick={handlePrint}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Print All
        </button>
      </div>

      {/* ── 2-column receipt grid ── */}
      <div ref={printRef} className="receipts-grid">
        {data && data.length > 0 && data.map((item, index) => (
          <div key={item.id || index} className="receipt-container">
            <div className="receipt">

              <header className="receipt-header">
                <div className="header-band">
                  <h1>Ekta Enterprises</h1>
                  <span className="receipt-label">{isReceipt ? 'CASH RECEIPT' : 'CASH PAYMENT'}</span>
                </div>
                <div className="header-sub">
                  <span>GSTIN: <strong>23AJBPS6285R1ZF</strong></span>
                  <span>Mob: <strong>9179174888 / 9169164888 / 9826623188</strong></span>
                </div>
                <div className="header-addr">Budhwari Bazar, Gn Road Seoni, Seoni (M.P.)</div>
              </header>

              <div className="receipt-content">
                <div className="details">
                  <div className="detail-item"><span className="detail-label">Date</span><span className="detail-value">{formatDate(item.date)}</span></div>
                  <div className="detail-item"><span className="detail-label">Mode</span><span className="detail-value">Cash</span></div>
                  <div className="detail-item">
                    <span className="detail-label">{isReceipt ? 'Receipt No' : 'Voucher No'}</span>
                    <span className="detail-value receipt-no">
                      {isReceipt ? `${item.series}-${item.receiptNo}` : item.voucherNo}
                    </span>
                  </div>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th>Name of A/c Head</th>
                      <th>Code</th>
                      <th>Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="td-name">{item.C_NAME}</td>
                      <td>{item.party}</td>
                      <td id={`amount-${index}`} className="td-amount">{item.amount}</td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="td-narration">By {isReceipt ? 'R/no' : 'V/no'}: {item.narration}</td>
                      <td id={`amount-narration-${index}`}>&nbsp;</td>
                    </tr>
                  </tbody>
                </table>

                <div className="in-words">
                  <span className="iw-label">In Words:</span> <span className="iw-text">{item.AmountInWords}</span>
                </div>
              </div>

              <footer className="receipt-footer">
                <div className="sig-block"><div className="sig-line"></div><div>Passed By</div></div>
                <div className="sig-block"><div className="sig-line"></div><div>Cashier</div></div>
                <div className="sig-block"><div className="sig-line"></div><div>Authorised Signatory</div></div>
              </footer>

            </div>
          </div>
        ))}
      </div>

      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');

/* ══════════════════════════════════════════════
   SCREEN — 2-column beautiful preview
══════════════════════════════════════════════ */
.receipts-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding: 16px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  min-height: 100vh;
}

.receipt-container {
  background: #ffffff;
  border: none;
  border-radius: 10px;
  padding: 0;
  box-sizing: border-box;
  box-shadow: 0 4px 20px rgba(0,0,0,0.35);
  overflow: hidden;
}

.receipt {
  display: flex;
  flex-direction: column;
  font-family: 'Inter', Arial, sans-serif;
  font-size: 0.88em;
  color: #111;
}

/* ── Header band ── */
.header-band {
  background: linear-gradient(135deg, #1a5c2e 0%, #2e7d47 100%);
  padding: 10px 14px 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-band h1 {
  margin: 0;
  font-size: 1.45em;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.5px;
  text-shadow: 0 1px 3px rgba(0,0,0,0.4);
}

.receipt-label {
  background: rgba(255,255,255,0.2);
  color: #fff;
  font-size: 0.72em;
  font-weight: 700;
  letter-spacing: 1.5px;
  padding: 3px 9px;
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.4);
  white-space: nowrap;
}

.header-sub {
  background: #f0fdf4;
  display: flex;
  justify-content: space-between;
  padding: 5px 14px;
  font-size: 0.82em;
  color: #374151;
  border-bottom: 1px solid #d1fae5;
  gap: 8px;
}

.header-addr {
  background: #f9fafb;
  padding: 3px 14px 6px;
  font-size: 0.8em;
  color: #6b7280;
  border-bottom: 2px solid #2e7d47;
}

/* ── Details bar ── */
.receipt-content {
  padding: 10px 14px;
}

.details {
  display: flex;
  justify-content: space-between;
  background: #f8fafc;
  border: 1.5px solid #1a5c2e;
  border-radius: 6px;
  padding: 7px 12px;
  margin: 0 0 10px;
  gap: 6px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.detail-label {
  font-size: 0.72em;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  font-size: 0.95em;
  font-weight: 700;
  color: #111827;
  margin-top: 1px;
}

.receipt-no {
  color: #1a5c2e;
  font-size: 1.0em;
}

/* ── Table ── */
table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 0;
  table-layout: fixed;
  min-height: 64px;
  border-radius: 6px;
  overflow: hidden;
}

table thead tr {
  background: #1a5c2e;
}

th {
  color: #fff;
  font-weight: 700;
  font-size: 0.82em;
  padding: 6px 8px;
  text-align: left;
  border: none;
  letter-spacing: 0.3px;
}

td {
  padding: 6px 8px;
  text-align: left;
  word-wrap: break-word;
  font-size: 0.88em;
  border-bottom: 1px solid #e5e7eb;
  color: #1f2937;
}

tbody tr:nth-child(even) { background: #f9fafb; }

.td-name  { font-weight: 600; color: #111827; }
.td-amount { font-weight: 700; color: #1a5c2e; font-size: 0.95em; }
.td-narration { color: #4b5563; font-size: 0.84em; font-style: italic; }

/* ── In Words ── */
.in-words {
  background: #f0fdf4;
  border: 1.5px solid #1a5c2e;
  border-radius: 6px;
  padding: 6px 10px;
  margin-top: 8px;
  font-size: 0.88em;
}

.iw-label {
  font-weight: 700;
  color: #1a5c2e;
  margin-right: 4px;
}

.iw-text {
  font-weight: 600;
  color: #111827;
  font-style: italic;
}

/* ── Footer ── */
.receipt-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 14px;
  padding: 8px 14px 12px;
  border-top: 1px dashed #d1d5db;
  font-size: 0.8em;
  color: #6b7280;
}

.sig-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 70px;
  font-weight: 600;
  text-align: center;
}

.sig-line {
  width: 80px;
  height: 1px;
  background: #9ca3af;
  margin-bottom: 2px;
}

/* ══════════════════════════════════════════════
   PRINT — same 2-column grid, clean & bold
   Keep "Pages per sheet = 1" in dialog!
══════════════════════════════════════════════ */
@media print {
  html, body {
    background: white !important;
    color: black !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  @page {
    size: A4 portrait;
    margin: 5mm;
  }

  .receipts-grid {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 3mm !important;
    padding: 0 !important;
    background: white !important;
    width: 100% !important;
    box-sizing: border-box !important;
    min-height: unset !important;
  }

  .receipt-container {
    break-inside: avoid !important;
    page-break-inside: avoid !important;
    border: 0.4mm solid #555 !important;
    border-radius: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    box-sizing: border-box !important;
    background: white !important;
    box-shadow: none !important;
  }

  .receipt { font-size: 0.78em !important; color: black !important; }

  /* Header band — keep green for colour printers, graceful on B&W */
  .header-band {
    background: #1a5c2e !important;
    print-color-adjust: exact !important;
    -webkit-print-color-adjust: exact !important;
    padding: 5px 8px 4px !important;
  }

  .header-band h1 { font-size: 1.3em !important; color: #fff !important; }
  .receipt-label  { font-size: 0.68em !important; }

  .header-sub  { padding: 3px 8px !important; font-size: 0.78em !important; background: #f0fdf4 !important; print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
  .header-addr { padding: 2px 8px 4px !important; font-size: 0.76em !important; }

  .receipt-content { padding: 5px 8px !important; }

  .details {
    padding: 4px 6px !important;
    margin: 0 0 5px !important;
    border-color: #1a5c2e !important;
    print-color-adjust: exact !important;
    -webkit-print-color-adjust: exact !important;
  }

  .detail-label { font-size: 0.68em !important; }
  .detail-value { font-size: 0.88em !important; }
  .receipt-no   { font-size: 0.92em !important; }

  table    { min-height: 36px !important; }
  table thead tr { print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }

  th { padding: 4px 6px !important; font-size: 0.78em !important; }
  td { padding: 4px 6px !important; font-size: 0.84em !important; }

  .in-words {
    padding: 4px 6px !important;
    margin-top: 4px !important;
    font-size: 0.82em !important;
    border-color: #1a5c2e !important;
    print-color-adjust: exact !important;
    -webkit-print-color-adjust: exact !important;
  }

  .receipt-footer {
    margin-top: 4mm !important;
    padding: 3px 8px 5px !important;
    font-size: 0.76em !important;
  }

  .sig-line { width: 60px !important; }

  .print\\:hidden { display: none !important; }
}
`}</style>

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