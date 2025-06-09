import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css'; // optional
import { useAuth } from '../contexts/AuthContext';
import constants from '../constants';
import BillPreview from '../components/BillPreview';

// Define the structure of a bill item
interface Bill {
  SERIES: string;
  BILL: number;
  C_NAME: string;
  C_PLACE: "SEONI" | "NAGPUR" | "JABALPUR";
  TRUCK_NO: string;
  DATE: string; 
  BILLSTATUS: 'BILLED' | 'PICKED' | 'DELIVERED' | string | null; // Allow for other statuses and null
  statusDate?: string | null;
}

// Define the props for the BillCard component
interface BillCardProps {
  bill: Bill;
  onMoveForward?: () => void;
  onMoveBackward?: () => void;
}

const BillCard: React.FC<BillCardProps> = ({ bill, onMoveForward, onMoveBackward }) => {
  const date = new Date(bill.DATE);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const formattedDate = `${day}-${month}-${year}`;

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md mb-4 flex items-center">
      <div className="flex-grow">
        <p className="font-bold text-gray-900 dark:text-white">{bill.C_NAME}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{bill.C_PLACE}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300">{formattedDate}</p>
        <Tippy
          content={<BillPreview series={bill.SERIES} billNo={bill.BILL} />}
          interactive={true}
          placement="right"
        >
          <p className="text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
            {bill.SERIES}-{bill.BILL}
          </p>
        </Tippy>
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

  const billed = allBills.filter(b => !['PICKED', 'DELIVERED'].includes(b.BILLSTATUS || ''));
  const picked = allBills.filter(b => b.BILLSTATUS === 'PICKED');
  const delivered = allBills.filter(b => b.BILLSTATUS === 'DELIVERED');

  const formatDate = (date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

      const [billsResponse, statusesResponse] = await Promise.all([
        fetch(`${constants.baseURL}/api/bills`, { headers }),
        fetch(`${constants.baseURL}/api/bills-delivery-status`, { headers })
      ]);

      if (!billsResponse.ok) throw new Error('Network response for bills was not ok');
      if (!statusesResponse.ok) throw new Error('Network response for statuses was not ok');

      const billsData: Bill[] = await billsResponse.json();
      const statusesData: { key: string, status: string, delivered_date?: string, picked_date?: string }[] = await statusesResponse.json();

      const statusMap = new Map(statusesData.map(s => [
        s.key,
        { status: s.status, date: s.status === 'DELIVERED' ? s.delivered_date : s.picked_date }
      ]));

      let mergedData = billsData.map(bill => {
        const key = `${bill.SERIES}-${bill.BILL}`;
        const statusInfo = statusMap.get(key);
        if (statusInfo) {
          return { ...bill, BILLSTATUS: statusInfo.status, statusDate: statusInfo.date };
        }
        return { ...bill, BILLSTATUS: bill.BILLSTATUS || 'BILLED', statusDate: null };
      });

      const yesterday = new Date();
      yesterday.setHours(0, 0, 0, 0);
      yesterday.setDate(yesterday.getDate() - 1);

      const parseDate = (dateStr: string) => {
        const [day, month, year] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
      }

      let filteredData = mergedData.filter(bill => {
        if (bill.BILLSTATUS === 'DELIVERED') {
          if (bill.statusDate) {
            const deliveredDate = parseDate(bill.statusDate);
            return deliveredDate >= yesterday;
          }
          return false;
        }
        return true;
      });

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
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data. Please check the server.');
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const moveBill = async (bill: Bill, newStatus: Bill['BILLSTATUS']) => {
    const originalStatus = bill.BILLSTATUS;
    const originalStatusDate = bill.statusDate;

    // Optimistically update the UI
    setAllBills(currentBills =>
      currentBills.map(b =>
        (b.BILL === bill.BILL && b.SERIES === bill.SERIES)
          ? { ...b, BILLSTATUS: newStatus, statusDate: formatDate(new Date()) }
          : b
      )
    );

    try {
      const token = localStorage.getItem('token');
      const key = `${bill.SERIES}-${bill.BILL}`;
      const response = await fetch(`${constants.baseURL}/api/update-bill-delivery-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ key, status: newStatus })
      });

      if (response.ok) {
        toast.success(`Bill ${key} moved to ${newStatus}.`);
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || 'Failed to update bill status.');
        // Revert on failure
        setAllBills(currentBills =>
          currentBills.map(b =>
            (b.BILL === bill.BILL && b.SERIES === bill.SERIES)
              ? { ...b, BILLSTATUS: originalStatus, statusDate: originalStatusDate }
              : b
          )
        );
      }
    } catch (error) {
      console.error('Error updating bill status:', error);
      toast.error('An error occurred while updating bill status.');
      // Revert on failure
      setAllBills(currentBills =>
        currentBills.map(b =>
          (b.BILL === bill.BILL && b.SERIES === bill.SERIES)
            ? { ...b, BILLSTATUS: originalStatus, statusDate: originalStatusDate }
            : b
        )
      );
    }
  };

  const moveFromBilledToPicked = (bill: Bill) => moveBill(bill, 'PICKED');
  const moveFromPickedToBilled = (bill: Bill) => moveBill(bill, 'BILLED');
  const moveFromPickedToDelivered = (bill: Bill) => moveBill(bill, 'DELIVERED');
  const moveFromDeliveredToPicked = (bill: Bill) => moveBill(bill, 'PICKED');

  const renderColumn = (title: string, data: Bill[], columnKey: 'billed' | 'picked' | 'delivered') => (
    <div className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
      </div>
      <div>
        {data.map((bill) => {
          const key = `${bill.SERIES}-${bill.BILL}`;
          return (
            <BillCard
              key={key}
              bill={bill}
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
        {renderColumn('Billed', billed, 'billed')}
        {renderColumn('Picked', picked, 'picked')}
        {renderColumn('Delivered', delivered, 'delivered')}
      </div>
    </div>
  );
};

export default BillsDeliveryRegister; 