import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import SignIn from "./pages/AuthPages/SignIn";
import SignUp from "./pages/AuthPages/SignUp";
import Login from "./pages/AuthPages/Login";
import NotFound from "./pages/OtherPage/NotFound";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import MetaController from "./components/common/MetaController";
import AccountMaster from "./pages/account-master/AccountMaster";
import Invoicing from "./pages/invoicing/Invoicing";
import DatabaseAccountMaster from "./pages/database/AccountMaster";
import DatabaseInvoicing from "./pages/database/Invoicing";
import PrintInvoicing from "./pages/print/PrintInvoicing";
import PrintAccount from "./pages/print/PrintAccount";
import EditAccountMaster from "./pages/account-master/EditAccountMaster";
import EditInvoicing from "./pages/invoicing/EditInvoicing";
import AccountMasterApproved from "./pages/approved/AccountMasterApproved";
import InvoicingApproved from "./pages/approved/InvoicingApproved";
import GodownTransfer from "./pages/godown-transfer/GodownTransfer";
import EditGodownTransfer from "./pages/godown-transfer/EditGodownTransfer";
import DatabaseGodownTransfer from "./pages/database/GodownTransfer";
import GodownTransferApproved from "./pages/approved/GodownTransferApproved";
import PrintGodown from "./pages/print/PrintGodown";
import CashReceipt from "./pages/cash-receipt/CashReceipt";
import CashPayment from "./pages/cash-payment/CashPayment";
import DatabaseCashReceipt from "./pages/database/CashReceipt";
import DatabaseCashPayment from "./pages/database/CashPayment";
import CashReceiptApproved from "./pages/approved/CashReceiptApproved";
import CashPaymentApproved from "./pages/approved/CashPaymentApproved";
import PrintCashReceipt from "./pages/print/PrintCashReceipt";
import AddUser from "./pages/add-user/AddUser";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import PdfInvoicePrintPage from './pages/print/PdfInvoicePrintPage';
import PrintBulkCashReceipts from "./pages/print/PrintBulkCashReceipts";
import DbfPrint from "./pages/database/DbfPrint";
import ItemWiseSales from "./pages/reports/ItemWiseSales";
import ItemWisePurchase from './pages/reports/ItemWisePurchase';
// import AnimatedLogo from '../components/AnimatedLogo';

// Root redirect component
const RootRedirect = () => {
  const { getFirstAccessibleRoute, isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <Navigate to={getFirstAccessibleRoute()} replace />;
};

// Protected Route Component
const ProtectedRoute = ({ children, requiredAccess }: { children: React.ReactNode, requiredAccess?: string }) => {
  const { isAuthenticated, hasAccess, loading, getFirstAccessibleRoute } = useAuth();
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (requiredAccess && !hasAccess(requiredAccess)) {
    // If no access to required route, redirect to the first accessible route
    return <Navigate to={getFirstAccessibleRoute()} replace />;
  }
  
  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    {/* Root route - redirects to first accessible route */}
    <Route path="/" element={<RootRedirect />} />
    
    {/* Auth Layout */}
    <Route path="/signin" element={<SignIn />} />
    <Route path="/signup" element={<SignUp />} />
    <Route path="/login" element={<Login />} />
    
    {/* Dashboard Layout */}
    <Route 
      element={
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      }
    >
      {/* Main routes */}
      <Route path="/account-master" element={
        <ProtectedRoute requiredAccess="Account Master">
          <AccountMaster />
        </ProtectedRoute>
      } />
      <Route path="/invoicing" element={
        <ProtectedRoute requiredAccess="Invoicing">
          <Invoicing />
        </ProtectedRoute>
      } />
      <Route path="/godown-transfer" element={
        <ProtectedRoute requiredAccess="Godown Transfer">
          <GodownTransfer />
        </ProtectedRoute>
      } />
      <Route path="/cash-receipt" element={
        <ProtectedRoute requiredAccess="Cash Receipts">
          <CashReceipt />
        </ProtectedRoute>
      } />
      <Route path="/cash-payment" element={
        <ProtectedRoute requiredAccess="Cash Payments">
          <CashPayment />
        </ProtectedRoute>
      } />
      <Route path="/add-user" element={
        <ProtectedRoute requiredAccess="Admin">
          <AddUser />
        </ProtectedRoute>
      } />
      
      {/* Database Section */}
      <Route path="/db/account-master" element={
        <ProtectedRoute requiredAccess="Account Master">
          <DatabaseAccountMaster />
        </ProtectedRoute>
      } />
      <Route path="/db/invoicing" element={
        <ProtectedRoute requiredAccess="Invoicing">
          <DatabaseInvoicing />
        </ProtectedRoute>
      } />
      <Route path="/db/godown-transfer" element={
        <ProtectedRoute requiredAccess="Godown Transfer">
          <DatabaseGodownTransfer />
        </ProtectedRoute>
      } />
      <Route path="/db/cash-receipts" element={
        <ProtectedRoute requiredAccess="Cash Receipts">
          <DatabaseCashReceipt />
        </ProtectedRoute>
      } />
      <Route path="/db/cash-payments" element={
        <ProtectedRoute requiredAccess="Cash Payments">
          <DatabaseCashPayment />
        </ProtectedRoute>
      } />
      <Route path="/db/users" element={
        <ProtectedRoute requiredAccess="Admin">
          <AddUser />
        </ProtectedRoute>
      } />
      <Route path="/db/dbf-print" element={
        <ProtectedRoute requiredAccess="Admin">
          <DbfPrint />
        </ProtectedRoute>
      } />
      
      {/* Reports Section */}
      <Route path="/reports/item-wise-sales" element={
        <ProtectedRoute requiredAccess="Admin">
          <ItemWiseSales />
        </ProtectedRoute>
      } />
      
      <Route path="/reports/item-wise-purchase" element={
        <ProtectedRoute requiredAccess="Admin">
          <ItemWisePurchase />
        </ProtectedRoute>
      } />
      
      {/* Edit Pages */}
      <Route path="/account-master/edit/:id" element={
        <ProtectedRoute requiredAccess="Account Master">
          <EditAccountMaster />
        </ProtectedRoute>
      } />
      <Route path="/invoicing/edit/:id" element={
        <ProtectedRoute requiredAccess="Invoicing">
          <EditInvoicing />
        </ProtectedRoute>
      } />
      <Route path="/godown-transfer/edit/:id" element={
        <ProtectedRoute requiredAccess="Godown Transfer">
          <EditGodownTransfer />
        </ProtectedRoute>
      } />
      <Route path="/db/account-master/edit/:id" element={
        <ProtectedRoute requiredAccess="Account Master">
          <EditAccountMaster />
        </ProtectedRoute>
      } />
      <Route path="/db/invoicing/edit/:id" element={
        <ProtectedRoute requiredAccess="Invoicing">
          <EditInvoicing />
        </ProtectedRoute>
      } />
      <Route path="/db/godown-transfer/edit/:id" element={
        <ProtectedRoute requiredAccess="Godown Transfer">
          <EditGodownTransfer />
        </ProtectedRoute>
      } />
      
      {/* Add missing edit routes for Cash Receipt and Payment */}
      <Route path="/cash-receipts/edit/:id" element={
        <ProtectedRoute requiredAccess="Cash Receipts">
          <CashReceipt />
        </ProtectedRoute>
      } />
      <Route path="/cash-payments/edit/:id" element={
        <ProtectedRoute requiredAccess="Cash Payments">
          <CashPayment />
        </ProtectedRoute>
      } />
      <Route path="/db/cash-receipts/edit/:id" element={
        <ProtectedRoute requiredAccess="Cash Receipts">
          <CashReceipt />
        </ProtectedRoute>
      } />
      <Route path="/db/cash-payments/edit/:id" element={
        <ProtectedRoute requiredAccess="Cash Payments">
          <CashPayment />
        </ProtectedRoute>
      } />
      
      {/* Approved Section */}
      <Route path="/approved/account-master" element={
        <ProtectedRoute requiredAccess="Admin">
          <AccountMasterApproved />
        </ProtectedRoute>
      } />
      <Route path="/approved/invoicing" element={
        <ProtectedRoute requiredAccess="Admin">
          <InvoicingApproved />
        </ProtectedRoute>
      } />
      <Route path="/approved/godown-transfer" element={
        <ProtectedRoute requiredAccess="Admin">
          <GodownTransferApproved />
        </ProtectedRoute>
      } />
      <Route path="/approved/cash-receipts" element={
        <ProtectedRoute requiredAccess="Admin">
          <CashReceiptApproved />
        </ProtectedRoute>
      } />
      <Route path="/approved/cash-payments" element={
        <ProtectedRoute requiredAccess="Admin">
          <CashPaymentApproved />
        </ProtectedRoute>
      } />
    </Route>

    {/* Print Layout - No sidebar/header needed */}
    <Route path="/printInvoicing" element={<PrintInvoicing />} />
    <Route path="/printAccount" element={<PrintAccount />} />
    <Route path="/printGodown" element={<PrintGodown />} />
    <Route path="/print" element={<PrintCashReceipt />} />
    <Route path="/printInvoice" element={<PrintInvoicing />} />

    {/* Internal route for PDF generation - NO LOGIN REQUIRED */}
    <Route path="/internal/print/invoice/:id" element={<PdfInvoicePrintPage />} />
    <Route path="/print/bulk-cash-receipts" element={<PrintBulkCashReceipts />} />
    
    {/* Fallback Route */}
    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default function App() {
  return (
    <>
      <ToastContainer position="bottom-right" autoClose={3000} />
      <Router>
        <AuthProvider>
          <ScrollToTop />
          <MetaController />
          <AppRoutes />
        </AuthProvider>
      </Router>
    </>
  );
}