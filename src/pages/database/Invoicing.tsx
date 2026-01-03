import React, { useState, useEffect, useRef } from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import DatabaseTable from "../../components/tables/DatabaseTable";
import { TableSkeletonLoader } from "../../components/ui/skeleton/SkeletonLoader";
import { useNavigate } from 'react-router-dom';
import constants from "../../constants";
import Toast from '../../components/ui/toast/Toast';
import { useAuth } from '../../contexts/AuthContext';
import EditOldBillsDialog from '../../components/dialogs/EditOldBillsDialog';

const Invoicing: React.FC = () => {
  const [selectedBills, setSelectedBills] = useState<any[]>([]);
  const [isEditOldBillsDialogOpen, setIsEditOldBillsDialogOpen] = useState(false);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({ visible: false, message: '', type: 'info' });
  const navigate = useNavigate();
  const tableRef = useRef<{ refreshData: () => Promise<void> }>(null);
  const { hasAccess } = useAuth();
  
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ visible: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 5000);
  };

  const handleApproveSuccess = () => {
    showToast('Invoice approved successfully and PDF checked/generated.', 'success');
    navigate('/approved/invoicing');
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

  // Handle selection changes from the DatabaseTable component
  const handleSelectionChange = (selectedRows: any[]) => {
    setSelectedBills(selectedRows);
  };

  // Handle printing all selected bills
  const handlePrintAllSelected = () => {
    if (selectedBills.length === 0) {
      showToast('No bills selected for printing', 'error');
      return;
    }

    // Collect all selected bill IDs
    const selectedIds = selectedBills
      .map(bill => bill.id || bill._id)
      .filter(id => id) // Filter out any undefined or null IDs
      .join(','); // Join IDs with commas
    
    // Open a single tab with all selected invoice IDs
    if (selectedIds) {
      window.open(`/printInvoice?id=${selectedIds}`, '_blank');
    }

    showToast(`Printing ${selectedBills.length} selected bills`, 'success');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta
        title="Invoicing | FMCG Vite Admin Template"
        description="Invoicing database page in FMCG Vite Admin Template"
      />
      <PageBreadcrumb pageTitle="Invoicing" />
      
      <div className="container mx-auto px-4 py-6">
        <div className="bg-white  dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Invoicing Database</h2>
            <div className="flex gap-3">
              {hasAccess('Admin') && (
                <button
                  onClick={() => setIsEditOldBillsDialogOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 dark:bg-orange-600 dark:hover:bg-orange-700"
                  title="Edit old bills from previous system"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                  Edit Old Bills
                </button>
              )}
              <button
                onClick={handlePrintAllSelected}
                disabled={selectedBills.length === 0}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${selectedBills.length === 0 ? 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700'}`}
                title="Print all selected bills"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"></polyline>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                  <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
                Print All Selected ({selectedBills.length})
              </button>
            </div>
          </div>
          <DatabaseTable 
            ref={tableRef}
            endpoint="invoicing" 
            tableId="invoicing-db"
            onApproveSuccess={handleApproveSuccess}
            onBeforeApprove={handleBeforeApprove}
            onSelectionChange={handleSelectionChange}
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
      
      {/* Edit Old Bills Dialog */}
      <EditOldBillsDialog
        isOpen={isEditOldBillsDialogOpen}
        onClose={() => setIsEditOldBillsDialogOpen(false)}
      />
    </div>
  );
};

export default Invoicing;