import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Button from '@/components/ui/button/Button';
import { fetchWithAuth } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Eye, X } from 'lucide-react';

interface CashReceiptDetail {
  date: string;
  partyName: string;
  receiptNo: string;
  series: string;
  amount: number;
  userName: string;
  source: string;
}

interface CollectionsData {
  collections: CashReceiptDetail[];
  total: number;
}

interface User {
  name: string;
  routeAccess: string[];
}

const TodaysCollections: React.FC = () => {
  const [collectionsData, setCollectionsData] = useState<CollectionsData | null>(null);
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

  const fetchCollectionsData = async (userName?: string) => {
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
      
      const response = await fetchWithAuth(`/api/dashboard/todays-collections-detailed?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch collections data');
      }
      
      const data: CollectionsData = await response.json();
      setCollectionsData(data);
      
      // Extract unique users for admin
      if (isAdmin) {
        const users = Array.from(new Set(data.collections.map(item => item.userName).filter(name => name !== 'System')));
        setAvailableUsers(users);
      }
    } catch (err) {
      console.error('Error fetching collections data:', err);
      setError('Failed to load collections data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollectionsData();
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

  const getFilteredCollections = () => {
    if (!collectionsData) return [];
    
    if (isAdmin && selectedUsers.size > 0) {
      return collectionsData.collections.filter(item => 
        selectedUsers.has(item.userName) || item.userName === 'System'
      );
    }
    
    return collectionsData.collections;
  };

  const getFilteredTotal = () => {
    const filtered = getFilteredCollections();
    return filtered.reduce((sum, item) => sum + item.amount, 0);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Today's Collections</CardTitle>
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
          <CardTitle>Today's Collections</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center p-4">
            <div className="text-red-500">{error}</div>
            <Button 
              onClick={() => fetchCollectionsData()} 
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

  const filteredCollections = getFilteredCollections();
  const filteredTotal = getFilteredTotal();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Today's Collections</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center p-4">
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(collectionsData?.total || 0)}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              Total collections today ({collectionsData?.collections.length || 0} receipts)
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
            <h2 className="text-xl font-semibold">Today's Collections Details</h2>
            <Button 
              onClick={() => setShowDetailModal(false)}
              variant="outline"
              size="sm"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Admin User Selection */}
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
                  <TableHead>Party Name</TableHead>
                  <TableHead>Receipt No</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {isAdmin && <TableHead>User Name</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCollections.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono text-sm">{item.date}</TableCell>
                    <TableCell className="font-medium">{item.partyName}</TableCell>
                    <TableCell className="font-mono text-sm">{item.receiptNo}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(item.amount)}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-sm">{item.userName}</TableCell>
                    )}
                  </TableRow>
                ))}
                {filteredCollections.length === 0 && (
                  <TableRow>
                    <TableCell 
                      colSpan={isAdmin ? 5 : 4} 
                      className="text-center py-4 text-gray-500"
                    >
                      No collections found for today
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Total Row */}
          {filteredCollections.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex justify-between items-center font-semibold text-lg">
                <span>Total ({filteredCollections.length} receipts):</span>
                <span className="text-blue-600">{formatCurrency(filteredTotal)}</span>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};

export default TodaysCollections;