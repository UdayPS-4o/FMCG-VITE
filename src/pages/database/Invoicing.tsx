import React, { useState, useEffect } from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import DatabaseTable from "../../components/tables/DatabaseTable";
import { TableSkeletonLoader } from "../../components/ui/skeleton/SkeletonLoader";
import { useNavigate } from 'react-router-dom';
import constants from "../../constants";
import Toast from '../../components/ui/toast/Toast';

const Invoicing: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({ visible: false, message: '', type: 'info' });

  useEffect(() => {
    // Simulate loading delay for demo purposes
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);
  
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ visible: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 5000);
  };

  const handleApproveSuccess = () => {
    showToast('Invoice approved successfully and PDF checked/generated.', 'success');
  };

  const handleBeforeApprove = async (invoiceId: string): Promise<boolean> => {
    if (!invoiceId) {
      showToast('Invoice ID is missing.', 'error');
      return false;
    }
    try {
      showToast(`Checking/Generating PDF for invoice ${invoiceId}...`, 'info');
      const response = await fetch(`${constants.baseURL}/api/generate-pdf/check-or-generate-invoice-pdf/${invoiceId}`, {
        method: 'GET',
      });

      const result = await response.json();

      if (response.ok) {
        if (result.status === 'exists') {
          showToast(`PDF for invoice ${invoiceId} already exists.`, 'success');
        } else if (result.status === 'generated') {
          showToast(`PDF for invoice ${invoiceId} generated successfully. Path: ${result.pdfPath}`, 'success');
        }
        return true;
      } else {
        showToast(`Failed to check/generate PDF: ${result.message || 'Unknown error'}`, 'error');
        return false;
      }
    } catch (error: any) {
      console.error('Error in handleBeforeApprove:', error);
      showToast(`Error during PDF check/generation: ${error.message}`, 'error');
      return false;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta
        title="Invoicing | FMCG Vite Admin Template"
        description="Invoicing database page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Invoicing" />
      
      <div className="container mx-auto px-4 py-6 overflow-hidden">
        <div className="bg-white  dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Invoicing Database</h2>
          </div>
          <DatabaseTable 
            endpoint="invoicing" 
            tableId="invoicing-db"
            onApproveSuccess={handleApproveSuccess}
            onBeforeApprove={handleBeforeApprove}
          />
        </div>
      </div>
      {toast.visible && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(prev => ({ ...prev, visible: false }))}
          isVisible={toast.visible}
        />
      )}
    </div>
  );
};

export default Invoicing; 