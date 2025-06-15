import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import constants from '../../constants';

const DbfPrint: React.FC = () => {
  const [series, setSeries] = useState('');
  const [billNo, setBillNo] = useState('');
  const navigate = useNavigate();

  const handlePrint = () => {
    if (series && billNo) {
      const url = `https://ekta-enterprises.com/proxy/api/generate-pdf/dbf-invoice/${series}/${billNo}`;
      
      window.open(url, '_blank'); // Open in a new tab
    } else {
      alert('Please enter both Series and Bill Number.');
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Print DBF Invoice</h1>
      <div className="space-y-4">
        <div>
          <label htmlFor="series" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Series
          </label>
          <input
            type="text"
            id="series"
            value={series}
            onChange={(e) => setSeries(e.target.value.toUpperCase())}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
            placeholder="Enter Series (e.g., B)"
          />
        </div>
        <div>
          <label htmlFor="billNo" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Bill Number
          </label>
          <input
            type="text"
            id="billNo"
            value={billNo}
            onChange={(e) => setBillNo(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
            placeholder="Enter Bill Number (e.g., 1)"
          />
        </div>
        <button
          onClick={handlePrint}
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Print Invoice
        </button>
      </div>
    </div>
  );
};

export default DbfPrint; 