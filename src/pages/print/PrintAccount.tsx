import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import constants from '../../constants';
import '../../styles/print.css';

const PrintAccount: React.FC = () => {
  const [searchParams] = useSearchParams();
  const achead = searchParams.get('achead');
  const [accountData, setAccountData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAccountData = async () => {
      if (!achead) {
        setError('No account identifier provided');
        setLoading(false);
        return;
      }

      try {
        // Get token from localStorage
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('Authentication required');
        }
        
        const response = await fetch(`${constants.baseURL}/edit/account-master/${achead}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch account data: ${response.status}`);
        }
        
        const data = await response.json();
        setAccountData(data);
      } catch (error) {
        console.error('Error fetching account data:', error);
        setError('Failed to load account data');
      } finally {
        setLoading(false);
      }
    };

    fetchAccountData();
  }, [achead]);

  // Trigger print dialog when data is loaded
  useEffect(() => {
    if (!loading && accountData && !error) {
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [loading, accountData, error]);

  if (loading) {
    return <div className="print-loading">Loading account data...</div>;
  }

  if (error) {
    return <div className="print-error">{error}</div>;
  }

  if (!accountData) {
    return <div className="print-error">No account data found</div>;
  }

  return (
    <div className="print-container">
      <div className="print-header">
        <h1>Account Details</h1>
        <p className="print-date">Date: {new Date().toLocaleDateString()}</p>
      </div>

      <div className="print-content">
        <table className="print-table">
          <tbody>
            <tr>
              <th>Account Name:</th>
              <td>{accountData.achead || 'N/A'}</td>
            </tr>
            <tr>
              <th>Subgroup:</th>
              <td>{accountData.subgroup || 'N/A'}</td>
            </tr>
            <tr>
              <th>GST Number:</th>
              <td>{accountData.gst || 'N/A'}</td>
            </tr>
            <tr>
              <th>Address:</th>
              <td>
                {accountData.addressline1 || ''} 
                {accountData.addressline2 ? `, ${accountData.addressline2}` : ''}
                {!accountData.addressline1 && !accountData.addressline2 ? 'N/A' : ''}
              </td>
            </tr>
            <tr>
              <th>City:</th>
              <td>{accountData.place || 'N/A'}</td>
            </tr>
            <tr>
              <th>State:</th>
              <td>{accountData.statecode || 'N/A'}</td>
            </tr>
            <tr>
              <th>PIN Code:</th>
              <td>{accountData.pincode || 'N/A'}</td>
            </tr>
            <tr>
              <th>Phone:</th>
              <td>{accountData.mobile || 'N/A'}</td>
            </tr>
            <tr>
              <th>Email:</th>
              <td>{accountData.email || 'N/A'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="print-footer">
        <p>This is a computer-generated document. No signature is required.</p>
      </div>
    </div>
  );
};

export default PrintAccount; 