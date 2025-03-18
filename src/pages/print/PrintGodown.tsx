import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import constants from '../../constants';
import PageMeta from '../../components/common/PageMeta';
import Toast from '../../components/ui/toast/Toast';

interface GodownTransferData {
  id: number;
  date: string;
  series: string;
  fromGodown: string;
  fromGodownName: string;
  toGodown: string;
  toGodownName: string;
  items: {
    item: string;
    itemName: string;
    qty: string;
    unit: string;
    pack: string;
    gst: string;
    pcBx: string;
    mrp: string;
    rate: string;
  }[];
}

const PrintGodown: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transferData, setTransferData] = useState<GodownTransferData | null>(null);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    visible: false,
    message: '',
    type: 'info'
  });

  // Extract the transfer ID from the URL query parameters
  const getTransferId = () => {
    const queryParams = new URLSearchParams(window.location.search);
    return queryParams.get('id') || '';
  };

  const transferId = getTransferId();

  useEffect(() => {
    const validateTransfer = async () => {
      if (!transferId) {
        setError('No transfer ID provided');
        setLoading(false);
        showToast('No transfer ID provided', 'error');
        return;
      }

      try {
        const response = await fetch(`${constants.baseURL}/api/godownTransfer/${transferId}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch transfer data');
        }
        
        const data = await response.json();
        
        if (!data) {
          throw new Error('No transfer data found');
        }
        
        // Get godown names
        const godownResponse = await fetch(`${constants.baseURL}/api/dbf/godown.json`);
        const godownData = await godownResponse.json();
        
        const fromGodown = godownData.find((g: any) => g.GCODE === data.fromGodown);
        const toGodown = godownData.find((g: any) => g.GCODE === data.toGodown);
        
        // Get item names
        const pmplResponse = await fetch(`${constants.baseURL}/api/dbf/pmpl.json`);
        const pmplData = await pmplResponse.json();
        
        const itemsWithNames = data.items.map((item: any) => {
          const product = pmplData.find((p: any) => p.ITEM_CODE === item.item);
          return {
            ...item,
            itemName: product ? product.ITEM_NAME : item.item
          };
        });
        
        setTransferData({
          ...data,
          fromGodownName: fromGodown ? fromGodown.GNAME : data.fromGodown,
          toGodownName: toGodown ? toGodown.GNAME : data.toGodown,
          items: itemsWithNames
        });
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching transfer data:', error);
        setError('Error fetching transfer data');
        setLoading(false);
        showToast('Error fetching transfer data', 'error');
      }
    };

    validateTransfer();
  }, [transferId]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({
      visible: true,
      message,
      type
    });
  };

  if (loading) {
    return (
      <div className="text-center p-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-3">Loading transfer data...</p>
      </div>
    );
  }

  if (error || !transferData) {
    return (
      <div className="text-center p-5">
        <div className="alert alert-danger" role="alert">
          {error || 'Failed to load transfer data'}
        </div>
        <button
          className="btn btn-primary mt-3"
          onClick={() => navigate('/db/godown-transfer')}
        >
          Back to Godown Transfers
        </button>
        {toast.visible && (
          <Toast 
            message={toast.message} 
            type={toast.type} 
            isVisible={toast.visible}
            onClose={() => setToast({...toast, visible: false})}
          />
        )}
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="container mt-4 print-container">
      <PageMeta title="Print Godown Transfer" description="Print Godown Transfer page" />
      
      <div className="d-print-none mb-4">
        <button className="btn btn-primary me-2" onClick={handlePrint}>
          <i className="bi bi-printer me-2"></i>Print
        </button>
        <button 
          className="btn btn-secondary" 
          onClick={() => navigate('/db/godown-transfer')}
        >
          Back
        </button>
      </div>
      
      <div className="print-document p-4 border rounded">
        <div className="row mb-4">
          <div className="col-12 text-center">
            <h2>Godown Transfer</h2>
            <p className="mb-0">Transfer ID: {transferData.id}</p>
            <p className="mb-0">Date: {new Date(transferData.date).toLocaleDateString()}</p>
            <p className="mb-0">Series: {transferData.series}</p>
          </div>
        </div>
        
        <div className="row mb-4">
          <div className="col-md-6">
            <div className="card">
              <div className="card-header">
                <h5 className="mb-0">From Godown</h5>
              </div>
              <div className="card-body">
                <p className="mb-0">{transferData.fromGodownName}</p>
                <p className="mb-0">Code: {transferData.fromGodown}</p>
              </div>
            </div>
          </div>
          <div className="col-md-6">
            <div className="card">
              <div className="card-header">
                <h5 className="mb-0">To Godown</h5>
              </div>
              <div className="card-body">
                <p className="mb-0">{transferData.toGodownName}</p>
                <p className="mb-0">Code: {transferData.toGodown}</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="row">
          <div className="col-12">
            <table className="table table-bordered">
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Unit</th>
                  <th>Pack</th>
                  <th>Quantity</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {transferData.items.map((item, index) => (
                  <tr key={index}>
                    <td>{item.item}</td>
                    <td>{item.itemName}</td>
                    <td>{item.unit}</td>
                    <td>{item.pack}</td>
                    <td>{item.qty}</td>
                    <td>{item.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        <div className="row mt-4 print-footer">
          <div className="col-md-6">
            <p>Prepared By: _____________________</p>
          </div>
          <div className="col-md-6 text-end">
            <p>Approved By: _____________________</p>
          </div>
        </div>
      </div>
      
      {toast.visible && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          isVisible={toast.visible}
          onClose={() => setToast({...toast, visible: false})}
        />
      )}
    </div>
  );
};

export default PrintGodown; 