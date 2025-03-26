import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import constants from '../../constants';
import PageMeta from "../../components/common/PageMeta";

const itemsPerPage = 30;

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
  const navigate = useNavigate();

  useEffect(() => {
    if (!godownId) {
      setError('No godown ID provided');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetch(`${constants.baseURL}/slink/printGodown?retreat=${godownId}`, {
      credentials: 'include'
    })
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
    window.print();
  };

  const handleBack = () => {
    navigate('/db/godown-transfer');
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
      
      <div className="mb-6 flex justify-between items-center print:hidden">
        <div className="flex items-center gap-4">
          <button 
            onClick={handleBack}
            className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700"
          >
            Back
          </button>
          <h1 className="text-2xl font-semibold dark:text-white">Print Godown Transfer</h1>
        </div>
        <button 
          onClick={handlePrint}
          className="px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-700"
        >
          Print
        </button>
      </div>
      
      <div ref={printRef} className="print-container w-full">
        {pages.map((pageItems, index) => (
          <div key={index} className="page-break flex justify-center print:break-after-page">
            <div className="flex justify-center w-full">
              <TransferGodownData 
                transferData={{ ...godownData, items: pageItems }} 
                totalItems={godownData.items.length}
                totalQuantity={godownData.items.reduce((acc, item) => acc + parseInt(item.qty || '0'), 0)}
                currentPage={index + 1}
                totalPages={pages.length}
              />
              <TransferGodownData 
                transferData={{ ...godownData, items: pageItems }}
                totalItems={godownData.items.length}
                totalQuantity={godownData.items.reduce((acc, item) => acc + parseInt(item.qty || '0'), 0)}
                currentPage={index + 1}
                totalPages={pages.length}
              />
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          body {
            background-color: white;
            color: black;
            margin: 0;
            padding: 0;
          }
          
          .print\\:hidden {
            display: none !important;
          }
          
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          
          .print\\:text-black {
            color: black !important;
          }
          
          .print\\:border-black {
            border-color: black !important;
          }
          
          table + table {
            page-break-before: always;
          }
          
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
        }
      `}</style>


    </div>
  );
}

const TransferGodownData: React.FC<{ 
  transferData: GodownData,
  totalItems?: number,
  totalQuantity?: number,
  currentPage?: number,
  totalPages?: number
}> = ({ 
  transferData, 
  totalItems, 
  totalQuantity,
  currentPage = 1,
  totalPages = 1
}) => {
  const { date, fromGodown, toGodown, id, items } = transferData;

  return (
    <div className="w-[49%] max-w-[49%] border border-black text-[10px] mx-0.5 my-0">
      <header className="border-b border-black">
        <div className="flex justify-between px-2 py-1">
          <div className="font-bold text-sm">Ekta Enterprises</div>
          <div className="text-right">
            <div>Phone: 9179174888</div>
            <div>Mobile: 9826623188</div>
            <div>GSTN: 23AJBPS6285R1ZF</div>
          </div>
        </div>
        <div className="text-center border-t border-black py-1 text-[10px]">
          BUDHWARI BAZAR, GN ROAD SEONI, SEONI
        </div>
      </header>
      
      <div className="flex justify-between text-[10px] px-2 py-1 border-b border-black">
        <div>
          <div>ID: <strong>{id}</strong></div>
          <div>Date: <strong>{date}</strong></div>
        </div>
        <div className="text-right">
          <div>From Godown: <strong>{fromGodown}</strong></div>
          <div>To Godown: <strong>{toGodown}</strong></div>
        </div>
      </div>

      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-b border-black">
            <th className="w-[15%] border border-black px-1 py-0.5 text-left">Code</th>
            <th className="w-[35%] border border-black px-1 py-0.5 text-left">Particular</th>
            <th className="w-[15%] border border-black px-1 py-0.5 text-center">Pack</th>
            <th className="w-[10%] border border-black px-1 py-0.5 text-center">Unit</th>
            <th className="w-[15%] border border-black px-1 py-0.5 text-center">Qty</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} className="border-b border-black">
              <td className="border-r border-black px-1 py-0.5">{item.code}</td>
              <td className="border-r border-black px-1 py-0.5 text-[9px]">{item.particular}</td>
              <td className="border-r border-black px-1 py-0.5 text-center">{item.pack}</td>
              <td className="border-r border-black px-1 py-0.5 text-center">{item.unit}</td>
              <td className="px-1 py-0.5 text-center">{item.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-between border-t border-black px-2 py-1 text-[10px]">
        <div>
          Total Items: <strong>
            {totalItems === items.length ? 
              items.length : 
              `${items.length} / ${totalItems || items.length}`
            }
          </strong>
        </div>
        <div className="flex justify-between gap-4">
          <div>
            Total Quantity: <strong>
              {(() => {
                const pageQty = items.reduce((acc, item) => acc + parseInt(item.qty || '0'), 0);
                const totalQty = totalQuantity || pageQty;
                return pageQty === totalQty ? 
                  pageQty : 
                  `${pageQty} / ${totalQty}`;
              })()}
            </strong>
          </div>
          {totalPages > 1 && <div>Page: <strong>{currentPage}/{totalPages}</strong></div>}
        </div>
      </div>
    </div>
  );
};