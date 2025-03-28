import React, { useState, useEffect } from 'react';

interface User {
  id?: number;
  name: string;
  number: string;
  password: string;
  routeAccess: string[];
  powers: string[];
  subgroup: any | null;
  smCode?: string;
}

interface UserTableProps {
  data: User[];
  onUserDeleted: (id: number) => void;
  baseURL: string;
}

const UserTable: React.FC<UserTableProps> = ({ data, onUserDeleted, baseURL }) => {
  const [rows, setRows] = useState<User[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<number | null>(null);
  
  useEffect(() => {
    // Sort data by ID in descending order
    const sortedData = [...data].sort((a, b) => {
      // Handle case where id is undefined
      const idA = a.id || 0;
      const idB = b.id || 0;
      return idB - idA; // Descending order (latest first)
    });
    setRows(sortedData);
  }, [data]);
  
  const headers = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'number', label: 'Phone Number' },
    { key: 'routeAccess', label: 'Route Access' },
    { key: 'powers', label: 'Powers' },
    { key: 'subgroup', label: 'Subgroup' },
    { key: 'smCode', label: 'S/M Code' },
  ];
  
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
  
  const filteredRows = rows.filter(row => 
    Object.values(row).some(value => 
      value !== null && 
      value !== undefined && 
      (typeof value === 'string' 
        ? value.toLowerCase().includes(search.toLowerCase())
        : Array.isArray(value)
          ? value.some(v => v.toLowerCase().includes(search.toLowerCase()))
          : value && typeof value === 'object' && value.title
            ? value.title.toLowerCase().includes(search.toLowerCase())
            : false
      )
    )
  );
  
  const paginatedRows = filteredRows.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );
  
  const handleDelete = async (id: number) => {
    setUserToDelete(id);
    setDeleteConfirmOpen(true);
  };
  
  const confirmDelete = async () => {
    if (!userToDelete) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`${baseURL}/slink/deleteUser/?id=${userToDelete}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete user');
      }
      
      // Notify parent component of deletion
      onUserDeleted(userToDelete);
      
      // Close the dialog
      setDeleteConfirmOpen(false);
      setUserToDelete(null);
      
    } catch (error) {
      console.error('Error deleting user:', error);
      // Error toast would be displayed in parent component
    } finally {
      setIsLoading(false);
    }
  };
  
  const cancelDelete = () => {
    setDeleteConfirmOpen(false);
    setUserToDelete(null);
  };
  
  const handleEdit = (id: number) => {
    if (!id) return;
    window.location.href = `/add-user?id=${id}`;
  };
  
  const formatCellValue = (row: User, header: { key: string; label: string }) => {
    const value = row[header.key as keyof User];
    
    if (value === null || value === undefined) {
      return '-';
    }
    
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    
    if (header.key === 'subgroup' && value && typeof value === 'object') {
      return value.title || '';
    }
    
    return value;
  };
  
  return (
    <div>
      {/* Delete confirmation dialog */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
              Confirm Delete
            </h3>
            <p className="text-gray-700 dark:text-gray-300 mb-6">
              Are you sure you want to delete this user? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                disabled={isLoading}
              >
                {isLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Search */}
      <div className="mb-4 relative">
        <div className="relative">
          <input
            type="text"
            className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md w-full bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
            placeholder="Search users..."
            value={search}
            onChange={handleSearch}
          />
          <div className="absolute left-3 top-2.5 text-gray-400">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
            </svg>
          </div>
        </div>
      </div>
      
      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {headers.map((header) => (
                <th
                  key={header.key}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  {header.label}
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {paginatedRows.length > 0 ? (
              paginatedRows.map((row) => (
                <tr 
                  key={row.id} 
                  className="hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  {headers.map((header) => (
                    <td 
                      key={`${row.id}-${header.key}`}
                      className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400"
                    >
                      {formatCellValue(row, header)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => row.id && handleEdit(row.id)}
                        className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        disabled={isLoading}
                      >
                        <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                          <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        onClick={() => row.id && handleDelete(row.id)}
                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        disabled={isLoading}
                      >
                        <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td 
                  colSpan={headers.length + 1} 
                  className="px-4 py-3 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  No users found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 rounded-b-lg">
        <div className="flex items-center">
          <label htmlFor="rowsPerPage" className="mr-2 text-sm text-gray-700 dark:text-gray-300">
            Rows per page:
          </label>
          <select
            id="rowsPerPage"
            className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm rounded-md focus:outline-none focus:ring-brand-500 focus:border-brand-500"
            value={rowsPerPage}
            onChange={handleChangeRowsPerPage}
          >
            {[5, 10, 25].map((option) => (
              <option key={option} value={option} className="bg-white dark:bg-gray-700">
                {option}
              </option>
            ))}
          </select>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="text-sm text-gray-700 dark:text-gray-300 text-center sm:text-left">
            Showing {filteredRows.length > 0 ? page * rowsPerPage + 1 : 0} to{' '}
            {Math.min((page + 1) * rowsPerPage, filteredRows.length)} of{' '}
            {filteredRows.length} entries
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={() => handleChangePage(page - 1)}
              disabled={page === 0}
              className={`px-3 py-1 text-sm rounded-md ${
                page === 0
                  ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              Previous
            </button>
            <button
              onClick={() => handleChangePage(page + 1)}
              disabled={page >= Math.ceil(filteredRows.length / rowsPerPage) - 1}
              className={`px-3 py-1 text-sm rounded-md ${
                page >= Math.ceil(filteredRows.length / rowsPerPage) - 1
                  ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserTable; 