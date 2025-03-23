import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import constants from '../../constants';
import PageMeta from "../../components/common/PageMeta";

const itemsPerPage = 12;

interface GodownItem {
  code: string;
  particular: string;
  pack: string;
  gst: string;
  unit: string;
  qty: string;
}

interface GodownData {
  date: string;
  fromGodown: string;
  toGodown: string;
  id: string;
  items: GodownItem[];
}

export default function PrintGodown() {
  const printRef = useRef<HTMLDivElement>(null);
  const [godownData, setGodownData] = useState<GodownData | null>(null);
  const [searchParams] = useSearchParams();
  const godownId = searchParams.get('godownId');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!godownId) {
      setError('No godown ID provided');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetch(`${constants.baseURL}/slink/printGodown?retreat=${godownId}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch data: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setGodownData(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching godown data:', err);
        setError(err.message || 'Failed to load godown data');
        setIsLoading(false);
      });
  }, [godownId]);

  const handlePrint = () => {
    if (!printRef.current) return;
    
    const printContent = printRef.current;
    const winPrint = window.open('', '', 'width=1000');
    
    if (!winPrint) {
      alert('Please allow pop-ups to print');
      return;
    }
    
    winPrint.document.write('<html><head><title>Godown Transfer</title>');
    winPrint.document.write('<style>');
    winPrint.document.write(`
      body { margin: 0; padding: 0; }
      .print-page { page-break-after: always; }
      .godownId {
          width: 80%;
          margin: 20px auto;
          display: flex;
          flex-direction: column;
          padding: 20px;
          font-family: Arial, sans-serif;
          font-size: 12px;
          border: 1px solid black;
      }

      .header h1 {
          margin: 0;
          text-align: center;
      }

      .header p {
          text-align: center;
          margin: 5px 0;
      }

      #address {
          text-align: center;
          margin: 10px 0;
      }

      .details {
          display: flex;
          gap: 10px;
          border-top: 1px solid black;
          padding-top: 3px;
          padding-bottom: 10px;
      }

      table {
          width: 100%;
          border-collapse: collapse;
      }

      table thead th {
          border: 1px solid black;
      }

      th, td {
          padding: 8px;
          text-align: left;
      }

      td {
          border-right: 1px solid black;
          border-bottom: 1px solid black;
      }

      td:first-child {
          border-left: 1px solid black;
      }

      .footer {
          display: flex;
          justify-content: space-between;
          border-top: 1px solid black;
          padding-top: 10px;
          margin-top: 20px;
      }

      .page-break {
          page-break-before: always;
      }

      @media print {
          .godownId {
              font-size: 10px;
          }

          .header h1 {
              font-size: 14px;
          }

          .header p, .details div, .footer div {
              font-size: 10px;
          }

          th, td {
              font-size: 10px;
          }

          .page-break {
              page-break-before: always;
          }
      }
    `);
    winPrint.document.write('</style></head><body>');
    winPrint.document.write(printContent.innerHTML);
    winPrint.document.write('</body></html>');
    winPrint.document.close();
    winPrint.focus();
    winPrint.print();
    setTimeout(() => {
      winPrint.close();
    }, 1000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-red-500 text-xl">{error}</div>
      </div>
    );
  }

  if (!godownData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500 text-xl">No data found</div>
      </div>
    );
  }

  // Calculate pages for print
  const pages = [];
  for (let i = 0; i < godownData.items.length; i += itemsPerPage) {
    pages.push(godownData.items.slice(i, i + itemsPerPage));
  }

  return (
    <div className="p-6">
      <PageMeta
        title="Print Godown Transfer" 
        description="Print Godown Transfer details" 
      />
      
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-semibold dark:text-white">Print Godown Transfer</h1>
        <button 
          onClick={handlePrint}
          className="px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
        >
          Print
        </button>
      </div>
      
      <div ref={printRef} className="print-container">
        {pages.map((pageItems, index) => (
          <div key={index} className="print-page" style={{ breakAfter: 'page', display: 'flex' }}>
            <TransferGodownData transferData={{ ...godownData, items: pageItems }} />
            <TransferGodownData transferData={{ ...godownData, items: pageItems }} />
          </div>
        ))}
      </div>
    </div>
  );
}

const TransferGodownData: React.FC<{ transferData: GodownData }> = ({ transferData }) => {
  const { date, fromGodown, toGodown, id, items } = transferData;

  return (
    <>
      <div className="godownId">
        <header className="header" style={headerStyles}>
          <div>
            <h1>Ekta Enterprises</h1>
          </div>
          <div>
            <p>Phone: 9179174888</p>
            <p>Mobile: 9826623188</p>
            <p>GSTN: 23AJBPS6285R1ZF</p>
          </div>
        </header>
        <p id="address">BUDHWARI BAZAR, GN ROAD SEONI,, SEONI</p>
        <div
          className="details"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div>
              ID: <strong>{id}</strong>
            </div>
            <div>
              Date: <strong>{date}</strong>
            </div>
          </div>
          <div>
            <div>
              From Godown: <strong>{fromGodown}</strong>
            </div>
            <div>
              To Godown: <strong>{toGodown}</strong>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Particular</th>
              <th>Pack</th>
              <th>GST %</th>
              <th>Unit</th>
              <th>Qty</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index} className={index % 20 === 0 ? 'page-break' : ''}>
                <td>{item.code}</td>
                <td>{item.particular}</td>
                <td>{item.pack}</td>
                <td>{item.gst}</td>
                <td>{item.unit}</td>
                <td>{item.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="footer">
          <div>
            Total Items: <strong>{items.length}</strong>
          </div>
          <div>
            Total Quantity:{' '}
            <strong>{items.reduce((acc, item) => acc + parseInt(item.qty), 0)}</strong>
          </div>
        </footer>
      </div>
    </>
  );
};

const headerStyles = {
  display: 'flex',
  flexDirection: 'row' as 'row',
  gap: '2px',
  padding: '20px',
}; 