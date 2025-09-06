import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Button from '@/components/ui/button/Button';
import { fetchWithAuth } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Eye, X } from 'lucide-react';

interface SalesDetail {
  date: string;
  partyName: string;
  billNo: string;
  netAmt: number;
}

interface SalesData {
  sales: SalesDetail[];
  total: number;
}

interface User {
  name: string;
  routeAccess: string[];
}

const TodaysSales: React.FC = () => {
  const [salesData, setSalesData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [availableUsers, setAvailableUsers] = useState<string[]>([]);
  const { user } = useAuth();

  const isAdmin = user?.routeAccess?.includes('Admin') || false;

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const fetchSalesData = async (userName?: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (user?.subgroup) {
        params.append('userSubgroups', Array.isArray(user.subgroup) ? user.subgroup.join(',') : user.subgroup.title);
      }
      if (userName) {
        params.append('userName', userName);
      }
      
      const response = await fetchWithAuth(`/api/dashboard/todays-sales?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch sales data');
      }
      
      const data: SalesDetail[] = await response.json();
      const total = data.reduce((sum, item) => sum + item.netAmt, 0);
      
      setSalesData({ sales: data, total });
      
      // Extract unique users for admin (if needed for future enhancement)
      if (isAdmin) {
        // For now, we don't have user info in sales data, but keeping structure consistent
        setAvailableUsers([]);
      }
    } catch (err) {
      console.error('Error fetching sales data:', err);
      setError('Failed to load sales data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalesData();
  }, [user]);

  const handleUserSelection = (userName: string, checked: boolean) => {
    const newSelectedUsers = new Set(selectedUsers);
    if (checked) {
      newSelectedUsers.add(userName);
    } else {
      newSelectedUsers.delete(userName);
    }
    setSelectedUsers(newSelectedUsers);
  };

  const getFilteredSales = () => {
    if (!salesData) return [];
    
    if (isAdmin && selectedUsers.size > 0) {
      // For future enhancement when user info is available in sales data
      return salesData.sales;
    }
    
    return salesData.sales;
  };

  const getFilteredTotal = () => {
    const filtered = getFilteredSales();
    return filtered.reduce((sum, item) => sum + item.netAmt, 0);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Today's Sales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Today's Sales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center p-4">
            <div className="text-red-500">{error}</div>
            <Button 
              onClick={() => fetchSalesData()} 
              className="mt-2"
              variant="outline"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const filteredSales = getFilteredSales();
  const filteredTotal = getFilteredTotal();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Today's Sales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center p-4">
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(salesData?.total || 0)}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              Total sales today ({salesData?.sales.length || 0} bills)
            </div>
            <Button 
              onClick={() => setShowDetailModal(true)}
              className="mt-3"
              variant="outline"
              size="sm"
            >
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Modal 
        isOpen={showDetailModal} 
        onClose={() => setShowDetailModal(false)}
        className="max-w-6xl max-h-[90vh] overflow-hidden"
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Today's Sales Details</h2>
            <Button 
              onClick={() => setShowDetailModal(false)}
              variant="outline"
              size="sm"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Admin User Selection - Placeholder for future enhancement */}
          {isAdmin && availableUsers.length > 0 && (
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h3 className="text-sm font-medium mb-2">Filter by Users:</h3>
              <div className="flex flex-wrap gap-2">
                {availableUsers.map(userName => (
                  <label key={userName} className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedUsers.has(userName)}
                      onChange={(e) => handleUserSelection(userName, e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span>{userName}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          
          <div className="overflow-auto max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Bill No</TableHead>
                  <TableHead>Party Name</TableHead>
                  <TableHead className="text-right">Net Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono text-sm">{item.date}</TableCell>
                    <TableCell className="font-mono text-sm font-medium">{item.billNo}</TableCell>
                    <TableCell className="font-medium">{item.partyName}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.netAmt)}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredSales.length === 0 && (
                  <TableRow>
                    <TableCell 
                      colSpan={4} 
                      className="text-center py-4 text-gray-500"
                    >
                      No sales found for today
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Total Row */}
          {filteredSales.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex justify-between items-center font-semibold text-lg">
                <span>Total ({filteredSales.length} bills):</span>
                <span className="text-green-600">{formatCurrency(filteredTotal)}</span>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};

export default TodaysSales;