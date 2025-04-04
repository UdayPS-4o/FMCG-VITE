import React, { useState, useEffect, useRef, forwardRef } from 'react';
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../ui/table";
import constants from "../../constants";
import { toast } from 'react-toastify';
import './scrollbar.css'; // Import the scrollbar styles
import DeleteConfirmation from '../ui/DeleteConfirmation';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { TableSkeletonLoader } from '../ui/skeleton/SkeletonLoader';

// Add formatItemsDisplay helper function
const formatItemsDisplay = (items: any): string => {
  if (!items) return '0';
  if (typeof items === 'string' && items.includes('[object Object]')) {
    // Count occurrences of [object Object]
    const matches = items.match(/\[object Object\]/g);
    return matches ? matches.length.toString() : '0';
  }
  if (Array.isArray(items)) {
    return items.length.toString();
  }
  return '0';
};

interface DatabaseTableProps {
  endpoint?: string;
  tableId?: string; // Add a unique identifier for the table
  onSelectionChange?: (selectedRows: any[]) => void; // Add callback for selection changes
  hideButtons?: string[]; // Add prop to hide specific buttons
  hideApproveButton?: boolean; // Add prop to hide the approve button
  ref?: React.Ref<{ refreshData: () => Promise<void> }>; // Add a ref to access the refreshData method
}

// Convert to forwardRef to expose refreshData method
const DatabaseTable = forwardRef<{ refreshData: () => Promise<void> }, DatabaseTableProps>(
  ({ endpoint: propEndpoint, tableId, onSelectionChange, hideButtons = [], hideApproveButton = false }, ref) => {
  const [endpoint, setEndpoint] = useState<string>('');
  const [rows, setRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [orderBy, setOrderBy] = useState<string>('');
  const [page, setPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);
  const [search, setSearch] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  // Add tooltip state
  const [tooltipContent, setTooltipContent] = useState<{ content: any; position: { x: number; y: number } } | null>(null);
  // Add hidden columns state with initial loading from localStorage
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() => {
    try {
      // Generate key based on URL path if no tableId or endpoint yet
      const path = window.location.pathname;
      const pathSegments = path.split('/');
      const pathKey = pathSegments[pathSegments.length - 1].toLowerCase();
      
      // Try to get initial value from multiple possible keys
      const possibleKeys = [
        `table_${tableId}_hiddenColumns`,
        `table_${propEndpoint}_hiddenColumns`,
        `table_${pathKey}_hiddenColumns`
      ];
      
      for (const key of possibleKeys) {
        const stored = localStorage.getItem(key);
        if (stored) {
          console.log('Initial load from localStorage with key:', key);
          return JSON.parse(stored);
        }
      }
    } catch (e) {
      console.error('Failed to load initial hidden columns from localStorage:', e);
    }
    return [];
  });
  const [showColumnSelector, setShowColumnSelector] = useState<boolean>(false);
  
  // Add ref for column selector dropdown
  const columnSelectorRef = useRef<HTMLDivElement>(null);

  // Add event handler for clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (columnSelectorRef.current && !columnSelectorRef.current.contains(event.target as Node)) {
        setShowColumnSelector(false);
      }
    };

    if (showColumnSelector) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showColumnSelector]);

  // Generate a unique storage key for this table
  const getStorageKey = () => {
    // First try to use tableId if provided
    if (tableId) {
      return `table_${tableId}_hiddenColumns`;
    }
    
    // If no tableId, use endpoint
    if (endpoint) {
      return `table_${endpoint}_hiddenColumns`;
    }
    
    // If neither is available yet, use path as fallback
    const path = window.location.pathname;
    const pathSegments = path.split('/');
    const pathKey = pathSegments[pathSegments.length - 1].toLowerCase();
    return `table_${pathKey}_hiddenColumns`;
  };

  // Add state for table loading
  const [isTableLoading, setIsTableLoading] = useState<boolean>(true);

  // Add useAuth hook
  const { user, hasPower } = useAuth();

  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        let point = propEndpoint || '';
        
        if (!point) {
          const path = window.location.pathname;
          const pathSegments = path.split('/');
          point = pathSegments[pathSegments.length - 1].toLowerCase();
        }
        
        setEndpoint(point);
        
        // Check if user has permission to view this database section
        const endpointAccessMap: Record<string, string> = {
          'account-master': 'Account Master',
          'invoicing': 'Invoicing',
          'godown-transfer': 'Godown Transfer',
          'godown': 'Godown Transfer',
          'cash-receipts': 'Cash Receipts',
          'cash-payments': 'Cash Payments'
        };
        
        // For users other than admins, check if they have access to this endpoint
        if (user && !user.routeAccess.includes('Admin')) {
          const requiredAccess = endpointAccessMap[point];
          if (requiredAccess && !user.routeAccess.includes(requiredAccess)) {
            toast.error(`You don't have permission to access this database section`);
            // Redirect to first accessible route
            navigate('/');
            return;
          }
        }
        
        const data = await fetchProducts(point);
        setRows(data);
        
        if (data.length > 0) {
          const dataHeaders = Object.keys(data[0]);
          setHeaders(dataHeaders);
          // Set initial sorting to be by 'id' in descending order if the id field exists
          if (dataHeaders.includes('id')) {
            setOrderBy('id');
          } else {
            setOrderBy(dataHeaders[0]);
          }
          
          // We'll load hidden columns in a separate useEffect
        }
        // Set loading to false once data is loaded
        setIsTableLoading(false);
      } catch (error) {
        console.error('Failed to fetch data:', error);
        toast.error('Failed to load data');
        setIsTableLoading(false);
      }
    };
    
    fetchData();
  }, [propEndpoint, tableId, user, navigate]);

  // Save hidden columns to localStorage when they change
  useEffect(() => {
    // Only save if we have a valid endpoint or tableId and hiddenColumns has been initialized
    if ((endpoint || tableId) && hiddenColumns !== undefined) {
      const storageKey = getStorageKey();
      console.log('Saving hidden columns with key:', storageKey, hiddenColumns);
      
      if (hiddenColumns.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(hiddenColumns));
      } else {
        // If all columns are visible (none are hidden), clean up the localStorage entry
        localStorage.removeItem(storageKey);
      }
    }
  }, [hiddenColumns, endpoint, tableId]);

  // Load hidden columns from localStorage when endpoint/tableId changes
  useEffect(() => {
    // Ensure we have a valid endpoint or tableId before trying to load
    if (endpoint || tableId) {
      const storageKey = getStorageKey();
      console.log('Loading hidden columns with key:', storageKey);
      
      const storedHiddenColumns = localStorage.getItem(storageKey);
      if (storedHiddenColumns) {
        try {
          const parsedColumns = JSON.parse(storedHiddenColumns);
          console.log('Loaded hidden columns:', parsedColumns);
          
          // Only update if different from current state to avoid unnecessary renders
          if (JSON.stringify(parsedColumns) !== JSON.stringify(hiddenColumns)) {
            setHiddenColumns(parsedColumns);
          }
        } catch (e) {
          console.error('Failed to parse hidden columns from localStorage:', e);
        }
      }
    }
  }, [endpoint, tableId]);

  const fetchProducts = async (endpoint: string) => {
    // Check if user has access to the endpoint
    if (!user) return [];
    
    const endpointAccessMap: Record<string, string> = {
      'account-master': 'Account Master',
      'invoicing': 'Invoicing',
      'godown': 'Godown Transfer',
      'cash-receipts': 'Cash Receipts',
      'cash-payments': 'Cash Payments'
    };
    
    // For users other than admins, check if they have access to this endpoint
    if (!user.routeAccess.includes('Admin')) {
      const requiredAccess = endpointAccessMap[endpoint];
      if (requiredAccess && !user.routeAccess.includes(requiredAccess)) {
        toast.error(`You don't have access to the ${endpoint} database`);
        return [];
      }
    }
    
    // Get token from localStorage
    const token = localStorage.getItem('token');
    if (!token) {
      toast.error('Authentication required');
      return [];
    }
    
    // Check if this is an approved table by checking the tableId
    if (tableId && tableId.includes('approved')) {
      const response = await fetch(`${constants.baseURL}/approved/json/${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.status === 401) {
        toast.error('Authentication required');
        return [];
      }
      
      const data = await response.json();
      return data;
    } else {
      const response = await fetch(`${constants.baseURL}/json/${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.status === 401) {
        toast.error('Authentication required');
        return [];
      }
      
      const data = await response.json();
      return data;
    }
  };

  const handleRequestSort = (property: string) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const handleChangePage = (newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
    setPage(0);
  };

  // Add column visibility toggle handler
  const toggleColumnVisibility = (header: string) => {
    setHiddenColumns(prev => 
      prev.includes(header)
        ? prev.filter(col => col !== header)
        : [...prev, header]
    );
  };

  // Reset all hidden columns - this will also clear them from localStorage via useEffect
  const showAllColumns = () => {
    setHiddenColumns([]);
  };

  const filteredRows = rows.filter((row) =>
    headers.some((header) => 
      row[header]?.toString().toLowerCase().includes(search.toLowerCase())
    )
  );

  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!a[orderBy] || !b[orderBy]) return 0;
    
    if (order === 'asc') {
      return a[orderBy] < b[orderBy] ? -1 : 1;
    }
    return a[orderBy] > b[orderBy] ? -1 : 1;
  });

  // Get visible headers (excluding hidden columns)
  const visibleHeaders = headers.filter(header => !hiddenColumns.includes(header));

  const handlePrint = (id: string) => {
    if (!endpoint) {
      toast.error('Endpoint is required');
      return;
    }
    
    if (endpoint === 'cash-receipts') navigate(`/print?ReceiptNo=${id}`);
    if (endpoint === 'cash-payments') navigate(`/print?voucherNo=${id}`);
    if (endpoint === 'godown') navigate(`/printGodown?godownId=${id}`);
    if (endpoint === 'invoicing') navigate(`/printInvoice?id=${id}`);
    if (endpoint === 'account-master') navigate(`/printAccount?achead=${id}`);
  };

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

  const handleEdit = (row: Record<string, any>) => {
    if (!endpoint) {
      toast.error('Endpoint is required');
      return;
    }
    
    // Only check for Write power if user is not Admin
    if (!hasPower('Write')) {
      toast.error('You do not have permission to edit items');
      return;
    }
    
    // Add more debugging for all row data
    console.log('Full row data being edited:', row);
    
    const editUrl = generateEditUrl(endpoint, row);
    console.log('Navigating to edit URL:', editUrl);
    
    // Check if we have a valid ID in the URL 
    if (endpoint === 'cash-receipts' && editUrl.endsWith('edit/')) {
      toast.error('Cannot edit: Receipt ID not found');
      return;
    }
    
    if (endpoint === 'cash-payments' && editUrl.endsWith('edit/')) {
      toast.error('Cannot edit: Voucher ID not found');
      return;
    }
    
    navigate(editUrl);
  };

  const handleDelete = (id: string, event?: React.MouseEvent) => {
    // Only check for Delete power if user is not Admin
    if (!hasPower('Delete')) {
      toast.error('You do not have permission to delete items');
      return;
    }
    
    // Check if Alt+Shift is pressed
    if (event?.altKey && event?.shiftKey) {
      // Bypass confirmation and delete directly
      confirmDelete(id);
    } else {
      // Show confirmation dialog
      setDeleteItemId(id);
      setDeleteConfirmOpen(true);
    }
  };

  const confirmDelete = async (directId?: string) => {
    if (!endpoint) {
      toast.error('Endpoint is required');
      return;
    }
    
    // Use the direct ID if provided, otherwise use the state ID
    const idToDelete = directId || deleteItemId;
    if (!idToDelete) return;

    try {
      // Determine if we're dealing with approved records based on tableId
      const isApproved = tableId?.includes('approved');
      const deleteEndpoint = isApproved ? `/delete/approved/${endpoint}/${idToDelete}` : `/delete/${endpoint}/${idToDelete}`;
      
      console.log(`Attempting to delete ${isApproved ? 'approved' : ''} ${endpoint} record with ID: ${idToDelete}`);
      console.log(`Using endpoint: ${deleteEndpoint}`);
      
      // Get token from localStorage
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('Authentication required');
        return;
      }
      
      const response = await fetch(`${constants.baseURL}${deleteEndpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();

      if (response.ok) {
        toast.success(data.message || 'Item deleted successfully');
        
        // More robust state update with better error handling
        try {
          // Get fresh data instead of relying on local filtering
          const updatedData = await fetchProducts(endpoint);
          setRows(updatedData);
        } catch (fetchError) {
          console.error('Error fetching updated data:', fetchError);
          // Fall back to local filtering if fetch fails
          setRows(prevRows => prevRows.filter(row => {
            try {
              return getRowId(row) !== idToDelete;
            } catch (rowError) {
              console.error('Error filtering row:', rowError);
              return true; // Keep the row if we can't determine its ID
            }
          }));
        }
      } else {
        // Handle specific error cases
        if (response.status === 404) {
          toast.error(data.error || 'Record not found');
        } else if (response.status === 400) {
          toast.error(data.error || 'Invalid request');
        } else {
          toast.error(data.error || 'Failed to delete item');
        }
        console.error('Delete failed:', data.error);
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error('An error occurred while deleting the item. Please try again.');
    } finally {
      setDeleteConfirmOpen(false);
      setDeleteItemId(null);
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmOpen(false);
    setDeleteItemId(null);
  };

  const handleSelectItem = (id: string) => {
    const selectedIndex = selectedItems.indexOf(id);
    let newSelected: string[] = [];

    if (selectedIndex === -1) {
      newSelected = [...selectedItems, id];
    } else {
      newSelected = selectedItems.filter((itemId) => itemId !== id);
    }

    setSelectedItems(newSelected);
  };

  // Fix the select all function to properly work with the current page items
  const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      // Get all IDs from current page items
      const currentPageIds = paginatedRows.map(row => getRowId(row));
      
      setSelectedItems(currentPageIds);
    } else {
      setSelectedItems([]);
    }
  };

  const isAllSelected = () => {
    if (paginatedRows.length === 0) return false;
    // Check if all items on the current page are selected
    return paginatedRows.every(row => selectedItems.includes(getRowId(row)));
  };

  const isSomeSelected = () => {
    // Check if some (but not all) items on the current page are selected
    return selectedItems.length > 0 && 
      paginatedRows.some(row => selectedItems.includes(getRowId(row))) &&
      !paginatedRows.every(row => selectedItems.includes(getRowId(row)));
  };

  const handleApprove = async () => {
    if (selectedItems.length === 0) {
      toast.error('No items selected');
      return;
    }

    // Check if user is Admin
    const isAdmin = user?.routeAccess.includes('Admin');
    if (!isAdmin) {
      toast.error('Only administrators can approve items');
      return;
    }

    try {
      // Updated to match the implementation in FMCG_REACT/src/components/pages/Database/accountMasterTable.js
      // Get token from localStorage
      const token = localStorage.getItem('token');
      if (!token) {
        toast.error('Authentication required');
        return;
      }
      
      const response = await fetch(`${constants.baseURL}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          endpoint,
          approved: selectedItems
        })
      });

      if (response.ok) {
        toast.success('Items approved successfully');
        // Refresh data
        const data = await fetchProducts(endpoint);
        setRows(data);
        setSelectedItems([]);
      } else {
        toast.error('Failed to approve items');
      }
    } catch (error) {
      console.error('Error approving items:', error);
      toast.error('An error occurred while approving items');
    }
  };

  // Calculate pagination
  const paginatedRows = sortedRows.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  // Add tooltip handlers
  const handleItemsHover = (event: React.MouseEvent<HTMLTableCellElement>, items: any) => {
    if (!items) return;
    
    let content;
    if (typeof items === 'string' && items.includes('[object Object]')) {
      content = 'Items available';
    } else if (Array.isArray(items)) {
      content = (
        <div className="p-2">
          <h4 className="font-medium mb-1">Items ({items.length})</h4>
          <div className="max-h-60 overflow-y-auto pr-2">
            <ul className="list-disc pl-4">
              {items.map((item: any, idx: number) => (
                <li key={idx} className="mb-1 text-sm">
                  {item.name || item.description || JSON.stringify(item).substring(0, 30)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    } else {
      content = 'No items';
    }
    
    setTooltipContent({
      content,
      position: { x: event.clientX, y: event.clientY - 10 }
    });
  };

  const handleItemsLeave = () => {
    setTooltipContent(null);
  };

  // Memoize the getRowId function
  const getRowId = React.useCallback((row: any): string => {
    if (!row) return 'unknown';
    
    // For specific endpoints, use known ID fields
    if (endpoint === 'cash-receipts' && row.receiptNo) return String(row.receiptNo);
    if (endpoint === 'cash-payments' && row.voucherNo) return String(row.voucherNo);
    if (endpoint === 'account-master' && row.subgroup) return String(row.subgroup);
    
    // First try standard ID fields
    if (row.id) return String(row.id);
    if (row._id) return String(row._id);
    
    // For Account Master, often uses these fields
    if (row.achead) return String(row.achead);
    if (row.Achead) return String(row.Achead);
    
    // Try to find any field with 'id' in it (case insensitive)
    const idField = Object.keys(row).find(key => 
      key.toLowerCase().includes('id') && row[key] && typeof row[key] !== 'object'
    );
    if (idField) return String(row[idField]);
    
    // Try to find any key that looks like a typical ID field
    const keyPatterns = ['code', 'key', 'no', 'number', 'ref'];
    for (const pattern of keyPatterns) {
      const matchingKey = Object.keys(row).find(key => 
        key.toLowerCase().includes(pattern) && row[key] && typeof row[key] !== 'object'
      );
      if (matchingKey) return String(row[matchingKey]);
    }
    
    // Last resort - use the first field's value if it's a string or number
    const firstField = Object.keys(row)[0];
    if (firstField && (typeof row[firstField] === 'string' || typeof row[firstField] === 'number')) {
      return String(row[firstField]);
    }
    
    // If all else fails, use a hash of the row
    return JSON.stringify(row).slice(0, 50);
  }, [endpoint]); // Only recreate if endpoint changes

  // Memoize the selected rows calculation to prevent recalculation on every render
  const selectedRowsData = React.useMemo(() => {
    if (selectedItems.length === 0) return [];
    
    return rows.filter(row => {
      const rowId = getRowId(row);
      return selectedItems.includes(rowId);
    });
  }, [selectedItems, rows, getRowId]);

  // Update selected rows when selection changes - with improved dependency control
  useEffect(() => {
    // Only call onSelectionChange if it exists and if selectedRowsData has changed
    if (onSelectionChange) {
      onSelectionChange(selectedRowsData);
    }
    // Intentionally NOT including onSelectionChange in dependencies
    // This prevents the loop from happening when parent component updates
  }, [selectedRowsData]);

  // Fix the edit button URL for account-master
  const generateEditUrl = (endpoint: string, selectedRow: Record<string, any>) => {
    // Add debugging to understand what's happening
    console.log('Generating edit URL for endpoint:', endpoint);
    console.log('Selected row:', selectedRow);

    // Log all available row data for debugging
    console.log(`Full row data for ${endpoint}:`, JSON.stringify(selectedRow, null, 2));

    // Handle endpoints with path parameters instead of query parameters
    switch (endpoint) {
      case 'account-master':
        const subgroup = selectedRow.subgroup || selectedRow.Subgroup || '';
        console.log('Using subgroup for account-master:', subgroup);
        return `/account-master/edit/${subgroup}`;
        
      case 'invoicing':
        const id = selectedRow.id || selectedRow._id || '';
        console.log('Using id for invoicing:', id);
        return `/invoicing/edit/${id}`;
        
      case 'cash-receipts':
        // Add more fields to try for cash-receipts
        const receiptId = selectedRow.receiptNo || selectedRow.receipt_no || selectedRow.ReceiptNo || 
                       selectedRow.receipt || selectedRow.id || selectedRow._id || '';
        console.log('Using receipt id for cash-receipts:', receiptId);
        return `/cash-receipts/edit/${receiptId}`;
        
      case 'cash-payments':
        // Add more fields to try for cash-payments
        const paymentId = selectedRow.voucherNo || selectedRow.voucher_no || selectedRow.VoucherNo || 
                       selectedRow.voucher || selectedRow.id || selectedRow._id || '';
        console.log('Using payment id for cash-payments:', paymentId);
        return `/cash-payments/edit/${paymentId}`;
        
      case 'godown-transfer':
      case 'godown':
        return `/godown-transfer/edit/${selectedRow.id || selectedRow._id || ''}`;
        
      case 'products':
        return `/create-product/edit/${selectedRow.CODE || ''}`;
        
      case 'groups':
        return `/create-group/edit/${selectedRow.groupCode || ''}`;
        
      case 'ledger':
        return `/ledger/edit/${selectedRow.CODE || ''}`;
        
      case 'schedule':
        return `/schedule/edit/${selectedRow.CODE || ''}`;
        
      case 'branch':
        return `/branch/edit/${selectedRow.BR_CODE || ''}`;
        
      case 'scdno':
        return `/scdno/edit/${selectedRow.SCDNO || ''}`;
        
      case 'hsn':
        return `/hsn/edit/${selectedRow.CODE || ''}`;
        
      case 'sub-groups':
        return `/create-sub-group/edit/${selectedRow.subgroupCode || ''}`;
        
      case 'employee':
        return `/create-employee/edit/${selectedRow.CODE || ''}`;
        
      default:
        const defaultId = selectedRow.id || selectedRow._id || '';
        return `/${endpoint}/edit/${defaultId}`;
    }
  };

  // Add a method to refresh data
  const refreshData = async () => {
    try {
      const data = await fetchProducts(endpoint);
      setRows(data);
      setSelectedItems([]);
    } catch (error) {
      console.error('Failed to refresh data:', error);
      toast.error('Failed to refresh data');
    }
  };

  // Expose the refreshData method via ref
  React.useImperativeHandle(ref, () => ({
    refreshData
  }));

  // Main render
  return (
    <>
      <DeleteConfirmation 
        isOpen={deleteConfirmOpen}
        title="Confirm Delete"
        message="Are you sure you want to delete this item? This action cannot be undone."
        onConfirm={() => confirmDelete()}
        onCancel={cancelDelete}
      />
      
      {isTableLoading ? (
        <TableSkeletonLoader />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm w-full overflow-hidden max-w-[95vw] mx-auto custom-scrollbar">
          {/* Toolbar */}
          <div className="p-4 flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-gray-200 dark:border-gray-700">
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={handleSearch}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-400"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Column Selector Button */}
              <div className="relative" ref={columnSelectorRef}>
                <button
                  onClick={() => setShowColumnSelector(!showColumnSelector)}
                  className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center gap-1 text-sm"
                  title="Show/Hide Columns"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3h18v18H3z"></path>
                    <path d="M9 3v18"></path>
                    <path d="M15 3v18"></path>
                  </svg>
                  Columns {hiddenColumns.length > 0 && <span className="ml-1 text-xs bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded-full">{hiddenColumns.length}</span>}
                </button>
              </div>
              
              {/* Only show Approve button to Admin users and if not hidden */}
              {user?.routeAccess.includes('Admin') && !hideApproveButton && (
                <button
                  onClick={handleApprove}
                  disabled={selectedItems.length === 0}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    selectedItems.length === 0
                      ? 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 cursor-not-allowed'
                      : 'bg-green-500 text-white hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700'
                  }`}
                >
                  Approve Selected
                </button>
              )}
            </div>
          </div>

          {/* Tooltip content */}
          {tooltipContent && (
            <div 
              className="fixed bg-white dark:bg-gray-800 shadow-lg rounded-md z-50 max-w-xs border border-gray-200 dark:border-gray-700"
              style={{ 
                top: `${tooltipContent.position.y - 100}px`, 
                left: `${tooltipContent.position.x}px`,
                transform: 'translateX(-50%)',
                maxHeight: '300px',
                overflowY: 'auto'
              }}
            >
              {tooltipContent.content}
            </div>
          )}
          
          {/* Table Container with horizontal scroll */}
          <div className="w-full">
            <div className="overflow-x-auto custom-scrollbar" style={{ maxWidth: '100%' }}>
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-white dark:bg-gray-800">
                  <TableRow>
                    <TableCell className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isAllSelected()}
                        ref={(input) => {
                          if (input) {
                            input.indeterminate = isSomeSelected();
                          }
                        }}
                        onChange={handleSelectAllClick}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-brand-400"
                      />
                    </TableCell>
                    
                    {visibleHeaders.map((header) => (
                      <TableCell 
                        key={header}
                        className="px-4 py-3 font-medium text-sm text-gray-900 dark:text-gray-100 cursor-pointer"
                      >
                        <div 
                          className="flex items-center gap-1"
                          onClick={() => handleRequestSort(header)}
                        >
                          {header.charAt(0).toUpperCase() + header.slice(1).replace(/_/g, ' ')}
                          {orderBy === header && (
                            <span className="text-gray-500 dark:text-gray-400">
                              {order === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    ))}
                    
                    <TableCell className="px-4 py-3 text-right font-medium text-sm text-gray-900 dark:text-gray-100">Actions</TableCell>
                  </TableRow>
                </TableHeader>
                
                <TableBody>
                  {paginatedRows.length > 0 ? (
                    paginatedRows.map((row, rowIndex) => {
                      const rowId = getRowId(row);
                      return (
                        <TableRow 
                          key={`row-${rowId}-${rowIndex}`}
                          className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          <TableCell className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedItems.includes(rowId)}
                              onChange={() => handleSelectItem(rowId)}
                              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-brand-400"
                            />
                          </TableCell>
                          
                          {visibleHeaders.map((header) => {
                            // Create a cell with or without hover handlers
                            if (header === 'items') {
                              return (
                                <TableCell 
                                  key={`${rowIndex}-${header}`}
                                  className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300"
                                >
                                  <div 
                                    onMouseEnter={(e) => handleItemsHover(e as React.MouseEvent<HTMLTableCellElement>, row[header])}
                                    onMouseLeave={handleItemsLeave}
                                  >
                                    {formatItemsDisplay(row[header])}
                                  </div>
                                </TableCell>
                              );
                            }
                            
                            return (
                              <TableCell 
                                key={`${rowIndex}-${header}`}
                                className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300"
                              >
                                {row[header]?.toString() || ''}
                              </TableCell>
                            );
                          })}
                          
                          <TableCell className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              {/* Only show print button if endpoint is not account-master and not hidden */}
                              {endpoint !== 'account-master' && hasPower('Read') && !hideButtons.includes('print') && (
                                <button
                                  onClick={() => handlePrint(getRowId(row))}
                                  className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                  title="Print"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="6 9 6 2 18 2 18 9"></polyline>
                                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                                    <rect x="6" y="14" width="12" height="8"></rect>
                                  </svg>
                                </button>
                              )}
                              
                              {/* Only show edit button if not hidden */}
                              {hasPower('Write') && !hideButtons.includes('edit') && (
                                <button
                                  onClick={() => handleEdit(row)}
                                  className="p-1 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                                  title="Edit"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                  </svg>
                                </button>
                              )}
                              
                              {/* Only show delete button if not hidden */}
                              {hasPower('Delete') && !hideButtons.includes('delete') && (
                                <button
                                  onClick={(e) => handleDelete(getRowId(row), e)}
                                  className="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                  title="Delete (Hold Alt+Shift to delete without confirmation)"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 6h18"></path>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    <line x1="10" y1="11" x2="10" y2="17"></line>
                                    <line x1="14" y1="11" x2="14" y2="17"></line>
                                  </svg>
                                </button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell className="px-4 py-8 text-center text-gray-500 dark:text-gray-400" colSpan={visibleHeaders.length + 2}>
                        {search ? 'No results found' : 'No data available'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Pagination */}
          <div className="px-4 py-3 flex flex-col sm:flex-row justify-between items-center border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-4 sm:mb-0">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Rows per page:
              </span>
              <select
                value={rowsPerPage}
                onChange={handleChangeRowsPerPage}
                className="border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-400"
              >
                {[5, 10, 25, 50].map((option) => (
                  <option key={option} value={option} className="bg-white dark:bg-gray-700">
                    {option}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleChangePage(page - 1)}
                disabled={page === 0}
                className={`p-2 rounded-md ${
                  page === 0
                    ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
              
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Page {page + 1} of {Math.max(1, Math.ceil(filteredRows.length / rowsPerPage))}
              </span>
              
              <button
                onClick={() => handleChangePage(page + 1)}
                disabled={page >= Math.ceil(filteredRows.length / rowsPerPage) - 1}
                className={`p-2 rounded-md ${
                  page >= Math.ceil(filteredRows.length / rowsPerPage) - 1
                    ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default DatabaseTable; 