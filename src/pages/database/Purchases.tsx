import React, { useRef, useState } from 'react';
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import DatabaseTable from "../../components/tables/DatabaseTable";
import { useNavigate } from 'react-router-dom';
import Toast from '../../components/ui/toast/Toast';

const Purchases: React.FC = () => {
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'info' }>({ visible: false, message: '', type: 'info' });
  const tableRef = useRef<{ refreshData: () => Promise<void> }>(null);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PageMeta title="Purchases | FMCG Vite Admin Template" description="Purchases database page in FMCG Vite Admin Template" />
      <PageBreadcrumb pageTitle="Purchases" />
      <div className="container mx-auto px-4 py-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 w-full">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Purchases Database</h2>
            <div className="flex gap-3">
              
            </div>
          </div>
          <DatabaseTable ref={tableRef} endpoint="purchases" tableId="purchases-db" />
        </div>
      </div>
      {toast.visible && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(prev => ({ ...prev, visible: false }))} isVisible={toast.visible} />
      )}
    </div>
  );
};

export default Purchases;