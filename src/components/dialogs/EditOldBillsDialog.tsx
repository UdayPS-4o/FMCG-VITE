import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../ui/modal';
import Button from '../ui/button/Button';
import { Table, TableHeader, TableBody, TableRow, TableCell, TableHead } from '../ui/table';
import { useNavigate } from 'react-router-dom';
import { Search, Calendar, User, DollarSign, CreditCard } from 'lucide-react';
import constants from '../../constants';

interface SearchFilters {
  fromDate: string;
  toDate: string;
  partyName: string;
  amount: string;
  type: 'All' | 'Cash' | 'Credit';
}

interface BillData {
  billNo: string;
  date: string;
  partyName: string;
  amount: number;
  type: 'Cash' | 'Credit';
  id: string;
  series: string;
  billNumber: string;
  partyCode: string;
}

interface EditOldBillsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const EditOldBillsDialog: React.FC<EditOldBillsDialogProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<SearchFilters>({
    fromDate: '',
    toDate: '',
    partyName: '',
    amount: '',
    type: 'All'
  });
  
  const [searchResults, setSearchResults] = useState<BillData[]>([]);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [directBill, setDirectBill] = useState<string>('');
  const [directBillError, setDirectBillError] = useState<string>('');
  
  const tableRef = useRef<HTMLTableElement>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setFilters({
        fromDate: '',
        toDate: '',
        partyName: '',
        amount: '',
        type: 'All'
      });
      setSearchResults([]);
      setSelectedRowIndex(-1);
      setHasSearched(false);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen || searchResults.length === 0) return;

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          setSelectedRowIndex(prev => {
            const newIndex = prev > 0 ? prev - 1 : searchResults.length - 1;
            scrollToRow(newIndex);
            return newIndex;
          });
          break;
        case 'ArrowDown':
          event.preventDefault();
          setSelectedRowIndex(prev => {
            const newIndex = prev < searchResults.length - 1 ? prev + 1 : 0;
            scrollToRow(newIndex);
            return newIndex;
          });
          break;
        case 'Enter':
          event.preventDefault();
          if (selectedRowIndex >= 0) {
            handleRowSelect(searchResults[selectedRowIndex]);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, searchResults, selectedRowIndex]);

  const scrollToRow = (index: number) => {
    if (rowRefs.current[index]) {
      rowRefs.current[index]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  };

  const handleInputChange = (field: keyof SearchFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSearch = async () => {
    setIsLoading(true);
    setHasSearched(true);
    setSelectedRowIndex(-1);
    
    try {
      // Build query parameters
      const queryParams = new URLSearchParams();
      if (filters.fromDate) queryParams.append('fromDate', filters.fromDate);
      if (filters.toDate) queryParams.append('toDate', filters.toDate);
      if (filters.partyName) queryParams.append('partyName', filters.partyName);
      if (filters.amount) queryParams.append('amount', filters.amount);
      if (filters.type !== 'All') queryParams.append('type', filters.type);

      const response = await fetch(`${constants.baseURL}/api/search?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to search bills');
      }
      
      const data = await response.json();
      setSearchResults(data.bills || []);
      
      // Auto-select first row if results exist
      if (data.bills && data.bills.length > 0) {
        setSelectedRowIndex(0);
      }
    } catch (error) {
      console.error('Error searching bills:', error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRowSelect = (bill: BillData) => {
    // Navigate to EditInvoicing with old bill mode parameters
    navigate(`/invoicing/edit/${bill.id}?mode=old&series=${bill.series}&billNumber=${bill.billNumber}`);
    onClose();
  };

  const submitDirectBill = () => {
    const raw = (directBill || '').trim().toUpperCase();
    const match = raw.match(/^([A-Z])[-\s]?(\d{1,6})$/);
    if (!match) {
      setDirectBillError('Enter like A-456');
      return;
    }
    const series = match[1];
    const billNumber = match[2];
    setDirectBillError('');
    const id = `${series}-${billNumber}`;
    navigate(`/invoicing/edit/${id}?mode=old&series=${series}&billNumber=${billNumber}`);
    onClose();
  };

  const handleRowClick = (index: number) => {
    setSelectedRowIndex(index);
    handleRowSelect(searchResults[index]);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB'); // DD/MM/YYYY format
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose}
      className="max-w-6xl max-h-[90vh] overflow-hidden"
    >
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
            Edit Old Bills
          </h2>
        </div>

        {/* Search Form */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6">
          <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <strong>Tip:</strong> You can search by date criteria alone to view all bills for the specified period, 
              or add party name to filter specific customers.
            </p>
          </div>
          {/* Direct Bill Entry */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Enter Bill No with Series
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={directBill}
                  onChange={(e) => setDirectBill(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitDirectBill(); } }}
                  placeholder="A-456"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <Button onClick={submitDirectBill} startIcon={<Search className="w-4 h-4" />}>
                  Edit
                </Button>
              </div>
              {directBillError && (
                <p className="mt-1 text-xs text-red-500">{directBillError}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {/* From Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Calendar className="inline w-4 h-4 mr-1" />
                From Date
              </label>
              <input
                type="date"
                value={filters.fromDate}
                onChange={(e) => handleInputChange('fromDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>

            {/* To Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Calendar className="inline w-4 h-4 mr-1" />
                To Date
              </label>
              <input
                type="date"
                value={filters.toDate}
                onChange={(e) => handleInputChange('toDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>

            {/* Party Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <User className="inline w-4 h-4 mr-1" />
                Party Name <span className="text-xs text-gray-500">(optional)</span>
              </label>
              <input
                type="text"
                value={filters.partyName}
                onChange={(e) => handleInputChange('partyName', e.target.value)}
                placeholder="Enter party name or leave empty for all parties"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <DollarSign className="inline w-4 h-4 mr-1" />
                Amount
              </label>
              <input
                type="number"
                value={filters.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                placeholder="Enter amount"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <CreditCard className="inline w-4 h-4 mr-1" />
                Type
              </label>
              <select
                value={filters.type}
                onChange={(e) => handleInputChange('type', e.target.value as SearchFilters['type'])}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                <option value="All">All</option>
                <option value="Cash">Cash</option>
                <option value="Credit">Credit</option>
              </select>
            </div>

            {/* Search Button */}
            <div className="flex items-end">
              <Button
                onClick={handleSearch}
                disabled={isLoading}
                className="w-full"
                startIcon={<Search className="w-4 h-4" />}
              >
                {isLoading ? 'Searching...' : 'Search'}
              </Button>
            </div>
          </div>
        </div>

        {/* Search Results */}
        {hasSearched && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Search Results ({searchResults.length} bills found)
                {!filters.partyName && searchResults.length > 0 && (
                  <span className="text-xs text-blue-600 dark:text-blue-400 ml-2">
                    - showing all parties
                  </span>
                )}
              </h3>
              {searchResults.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Use ↑↓ arrow keys to navigate, Enter or double-click to edit
                </p>
              )}
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {searchResults.length > 0 ? (
                <Table className="w-full">
                  <TableHeader>
                    <TableRow className="bg-gray-50 dark:bg-gray-800">
                      <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Bill No
                      </TableHead>
                      <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Date
                      </TableHead>
                      <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Party Name
                      </TableHead>
                      <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Amount
                      </TableHead>
                      <TableHead className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Type
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchResults.map((bill, index) => (
                      <TableRow
                        key={bill.id}
                        ref={el => { rowRefs.current[index] = el }}
                        className={`cursor-pointer transition-colors ${
                          selectedRowIndex === index
                            ? 'bg-brand-50 dark:bg-brand-900/20 border-l-4 border-brand-500'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                        onClick={() => handleRowClick(index)}
                        onDoubleClick={() => handleRowSelect(bill)}
                      >
                        <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                          {bill.billNo}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                          {formatDate(bill.date)}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                          {bill.partyName}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                          {formatAmount(bill.amount)}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            bill.type === 'Cash' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                          }`}>
                            {bill.type}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-8 text-center">
                  <div className="text-gray-400 dark:text-gray-500 mb-2">
                    <Search className="w-12 h-12 mx-auto" />
                  </div>
                  <p className="text-gray-500 dark:text-gray-400">
                    No bills found matching your search criteria
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button
            variant="outline"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default EditOldBillsDialog;
