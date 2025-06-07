import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import constants from '../constants';

// Define the structure of a bill item
interface Bill {
  SERIES: string;
  BILL: number;
  C_NAME: string;
  C_PLACE: "SEONI" | "NAGPUR" | "JABALPUR";
  TRUCK_NO: string;
  DATE: string; 
  BILLSTATUS: 'BILLED' | 'PICKED' | 'DELIVERED' | string | null; // Allow for other statuses and null
}

// Define the props for the BillCard component
interface BillCardProps {
  bill: Bill;
  onMoveForward?: () => void;
  onMoveBackward?: () => void;
  isSelected: boolean;
  onSelect: () => void;
}

const BillCard: React.FC<BillCardProps> = ({ bill, onMoveForward, onMoveBackward, isSelected, onSelect }) => {
  const date = new Date(bill.DATE);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const formattedDate = `${day}-${month}-${year}`;

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md mb-4 flex items-center">
      <input 
        type="checkbox" 
        checked={isSelected} 
        onChange={onSelect} 
        className="h-4 w-4 mr-4 rounded text-brand-600 focus:ring-brand-500 self-start mt-1"
      />
      <div className="flex-grow">
        <p className="font-bold text-gray-900 dark:text-white">{bill.C_NAME}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{bill.C_PLACE}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{formattedDate}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {bill.SERIES}-{bill.BILL}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{bill.TRUCK_NO}</p>
      </div>
      <div className="flex flex-col space-y-2">
        {onMoveBackward && (
          <button
            onClick={onMoveBackward}
            className="p-2 bg-gray-200 dark:bg-gray-700 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
        )}
        {onMoveForward && (
          <button
            onClick={onMoveForward}
            className="p-2 bg-gray-200 dark:bg-gray-700 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

const BillsDeliveryRegister = () => {
  const { user } = useAuth();
  const [allBills, setAllBills] = useState<Bill[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  
  const [selectedBilled, setSelectedBilled] = useState(new Set<string>());
  const [selectedPicked, setSelectedPicked] = useState(new Set<string>());
  const [selectedDelivered, setSelectedDelivered] = useState(new Set<string>());

  const billed = allBills.filter(b => !['PICKED', 'DELIVERED'].includes(b.BILLSTATUS || ''));
  const picked = allBills.filter(b => b.BILLSTATUS === 'PICKED');
  const delivered = allBills.filter(b => b.BILLSTATUS === 'DELIVERED');

  const fetchData = () => {
    fetch(`/bill.json`)
      .then((response) => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
      })
      .then((data: Bill[]) => {
        let filteredData = data.filter(bill => bill.BILLSTATUS !== 'DELIVERED');
        if (user) {
          if (user.canSelectSeries === false) {
            if (user.defaultSeries?.billing) {
              filteredData = filteredData.filter(b => b.SERIES === user.defaultSeries.billing);
            } else {
              filteredData = [];
            }
          }
        }
        setAllBills(filteredData);
      })
      .catch((error) => {
        console.error('Error fetching bill data:', error);
        toast.error('Failed to fetch bill data. Please check the file path and server configuration.');
      });
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const handleSelection = (key: string, column: 'billed' | 'picked' | 'delivered') => {
    const updaters = {
      billed: setSelectedBilled,
      picked: setSelectedPicked,
      delivered: setSelectedDelivered,
    };
    updaters[column](prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) newSet.delete(key);
      else newSet.add(key);
      return newSet;
    });
  };

  const handleSelectAll = (column: 'billed' | 'picked' | 'delivered', isChecked: boolean) => {
    const columnData = { billed, picked, delivered }[column];
    const updater = { billed: setSelectedBilled, picked: setSelectedPicked, delivered: setSelectedDelivered }[column];
    if (isChecked) {
      updater(new Set(columnData.map(b => `${b.SERIES}-${b.BILL}`)));
    } else {
      updater(new Set());
    }
  };

  const moveBill = (bill: Bill, newStatus: Bill['BILLSTATUS']) => {
    setAllBills(currentBills =>
      currentBills.map(b =>
        (b.BILL === bill.BILL && b.SERIES === bill.SERIES)
          ? { ...b, BILLSTATUS: newStatus }
          : b
      )
    );
  };

  const moveFromBilledToPicked = (bill: Bill) => moveBill(bill, 'PICKED');
  const moveFromPickedToBilled = (bill: Bill) => moveBill(bill, 'BILLED');
  const moveFromPickedToDelivered = (bill: Bill) => moveBill(bill, 'DELIVERED');
  const moveFromDeliveredToPicked = (bill: Bill) => moveBill(bill, 'PICKED');

  const handleUpdateBillStatus = async () => {
    const selectedKeys = new Set([...selectedBilled, ...selectedPicked, ...selectedDelivered]);
    if (selectedKeys.size === 0) {
      toast.warning('Please select at least one bill to update.');
      return;
    }

    const billsToUpdate = allBills.filter(b => selectedKeys.has(`${b.SERIES}-${b.BILL}`));
    setIsUpdating(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${constants.baseURL}/api/update-bill-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ bills: billsToUpdate })
      });

      if (response.ok) {
        toast.success('Bill statuses updated successfully!');
        const deliveredKeys = new Set(billsToUpdate.filter(b => b.BILLSTATUS === 'DELIVERED').map(b => `${b.SERIES}-${b.BILL}`));
        if (deliveredKeys.size > 0) {
          setAllBills(currentBills => currentBills.filter(b => !deliveredKeys.has(`${b.SERIES}-${b.BILL}`)));
        }
        setSelectedBilled(new Set());
        setSelectedPicked(new Set());
        setSelectedDelivered(new Set());
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || 'Failed to update bill statuses.');
      }
    } catch (error) {
      console.error('Error updating bill statuses:', error);
      toast.error('An error occurred while updating bill statuses.');
    } finally {
      setIsUpdating(false);
    }
  };

  const renderColumn = (title: string, data: Bill[], selectedSet: Set<string>, columnKey: 'billed' | 'picked' | 'delivered') => (
    <div className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
        <div className="flex items-center">
          <input
            type="checkbox"
            className="h-4 w-4 rounded text-brand-600 focus:ring-brand-500"
            onChange={(e) => handleSelectAll(columnKey, e.target.checked)}
            checked={data.length > 0 && selectedSet.size === data.length}
            ref={el => { if (el) el.indeterminate = selectedSet.size > 0 && selectedSet.size < data.length; }}
          />
          <label className="ml-2 text-sm text-gray-600 dark:text-gray-300">Select All</label>
        </div>
      </div>
      <div>
        {data.map((bill) => {
          const key = `${bill.SERIES}-${bill.BILL}`;
          return (
            <BillCard
              key={key}
              bill={bill}
              isSelected={selectedSet.has(key)}
              onSelect={() => handleSelection(key, columnKey)}
              onMoveForward={
                columnKey === 'billed' ? () => moveFromBilledToPicked(bill) :
                columnKey === 'picked' ? () => moveFromPickedToDelivered(bill) : undefined
              }
              onMoveBackward={
                columnKey === 'picked' ? () => moveFromPickedToBilled(bill) :
                columnKey === 'delivered' ? () => moveFromDeliveredToPicked(bill) : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <h1 className="text-3xl font-bold mb-8 text-gray-900 dark:text-white">
        Bills Delivery Register
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {renderColumn('Billed', billed, selectedBilled, 'billed')}
        {renderColumn('Picked', picked, selectedPicked, 'picked')}
        {renderColumn('Delivered', delivered, selectedDelivered, 'delivered')}
      </div>
      <div className="mt-8 text-center">
        <button
          onClick={handleUpdateBillStatus}
          disabled={isUpdating}
          className={`px-6 py-3 rounded-md text-white font-semibold ${
            isUpdating ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {isUpdating ? 'Updating...' : 'Update'}
        </button>
      </div>
    </div>
  );
};

export default BillsDeliveryRegister; 