import React, { useState, useEffect } from 'react';
import constants from '../constants';

interface BillDetail {
  SERIES: string;
  BILL: number;
  PRODUCT: string;
  QTY: number;
  UNIT: string;
  RATE: number;
  GST: number;
  // Add other relevant fields from BILLDTL.json
}

interface BillPreviewProps {
  series: string;
  billNo: number;
}

const BillPreview: React.FC<BillPreviewProps> = ({ series, billNo }) => {
  const [billDetails, setBillDetails] = useState<BillDetail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBillDetails = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };
        const response = await fetch(`${constants.baseURL}/api/bill-details/${series}/${billNo}`, { headers });
        if (!response.ok) {
          throw new Error('Failed to fetch bill details');
        }
        const data: BillDetail[] = await response.json();
        setBillDetails(data);
      } catch (error) {
        console.error('Error fetching bill details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBillDetails();
  }, [series, billNo]);

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  if (!billDetails.length) {
    return <div className="p-4">No details found for this bill.</div>;
  }

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 min-w-max">
      <h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">
        Bill Preview: {series}-{billNo}
      </h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Product
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Qty
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                Rate
              </th>
               <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                GST %
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {billDetails.map((item, index) => (
              <tr key={index}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                  {item.PRODUCT}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                  {item.QTY} ({item.UNIT})
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                  {item.RATE.toFixed(2)}
                </td>
                 <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                  {item.GST}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BillPreview; 