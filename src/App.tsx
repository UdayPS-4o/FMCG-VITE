import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import SignIn from "./pages/AuthPages/SignIn";
import SignUp from "./pages/AuthPages/SignUp";
import Login from "./pages/AuthPages/Login";
import NotFound from "./pages/OtherPage/NotFound";
import AppLayout from "./layout/AppLayout";
import { ScrollToTop } from "./components/common/ScrollToTop";
import Home from "./pages/Dashboard/Home";
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

// Protected Route Component
const ProtectedRoute = ({ children, requiredAccess }: { children: JSX.Element, requiredAccess?: string }) => {
  const { isAuthenticated, hasAccess, loading } = useAuth();
  
  if (loading) {
    return <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (requiredAccess && !hasAccess(requiredAccess)) {
    return <Navigate to="/unauthorized" replace />;
  }
  
  return children;
};

// Unauthorized access page
const Unauthorized = () => (
  <div className="flex items-center justify-center h-screen bg-gray-100">
    <div className="text-center p-8 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
      <p className="text-gray-700 mb-6">You don't have permission to access this page.</p>
      <button 
        onClick={() => window.history.back()} 
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Go Back
      </button>
    </div>
  </div>
);

const AppRoutes = () => (
  <Routes>
    {/* Auth Layout */}
    <Route path="/signin" element={<SignIn />} />
    <Route path="/signup" element={<SignUp />} />
    <Route path="/login" element={<Login />} />
    <Route path="/unauthorized" element={<Unauthorized />} />

    {/* Dashboard Layout */}
    <Route element={
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    }>
      <Route index path="/" element={<Home />} />
      
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
        <ProtectedRoute requiredAccess="Account Master">
          <AccountMasterApproved />
        </ProtectedRoute>
      } />
      <Route path="/approved/invoicing" element={
        <ProtectedRoute requiredAccess="Invoicing">
          <InvoicingApproved />
        </ProtectedRoute>
      } />
      <Route path="/approved/godown-transfer" element={
        <ProtectedRoute requiredAccess="Godown Transfer">
          <GodownTransferApproved />
        </ProtectedRoute>
      } />
      <Route path="/approved/cash-receipts" element={
        <ProtectedRoute requiredAccess="Cash Receipts">
          <CashReceiptApproved />
        </ProtectedRoute>
      } />
      <Route path="/approved/cash-payments" element={
        <ProtectedRoute requiredAccess="Cash Payments">
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
          <AppRoutes />
        </AuthProvider>
      </Router>
    </>
  );
}