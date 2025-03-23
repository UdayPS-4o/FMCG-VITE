import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
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
import Login from "./pages/Login";
import Unauthorized from "./pages/Unauthorized";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import { AuthProvider } from "./hooks/useAuth";
import NotFound from "./pages/OtherPage/NotFound";

export default function App() {
  return (
    <>
      <ToastContainer position="bottom-right" autoClose={3000} />
      <Router>
        <AuthProvider>
          <ScrollToTop />
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/unauthorized" element={<Unauthorized />} />

            {/* Protected Routes with App Layout */}
            <Route element={<AppLayout />}>
              <Route element={<ProtectedRoute />}>
                <Route index path="/" element={<Home />} />
                
                {/* Main Features Routes */}
                <Route element={<ProtectedRoute requiredRouteAccess="Account Master" />}>
                  <Route path="/account-master" element={<AccountMaster />} />
                  <Route path="/account-master/edit/:id" element={<EditAccountMaster />} />
                </Route>
                
                <Route element={<ProtectedRoute requiredRouteAccess="Invoicing" />}>
                  <Route path="/invoicing" element={<Invoicing />} />
                  <Route path="/invoicing/edit/:id" element={<EditInvoicing />} />
                </Route>
                
                <Route element={<ProtectedRoute requiredRouteAccess="Godown Transfer" />}>
                  <Route path="/godown-transfer" element={<GodownTransfer />} />
                  <Route path="/godown-transfer/edit/:id" element={<EditGodownTransfer />} />
                </Route>
                
                <Route element={<ProtectedRoute requiredRouteAccess="Cash Receipts" />}>
                  <Route path="/cash-receipt" element={<CashReceipt />} />
                  <Route path="/cash-receipts/edit/:id" element={<CashReceipt />} />
                </Route>
                
                <Route element={<ProtectedRoute requiredRouteAccess="Cash Payments" />}>
                  <Route path="/cash-payment" element={<CashPayment />} />
                  <Route path="/cash-payments/edit/:id" element={<CashPayment />} />
                </Route>

                {/* Database Section */}
                <Route element={<ProtectedRoute requiredRouteAccess="Database" />}>
                  <Route path="/db/account-master" element={<DatabaseAccountMaster />} />
                  <Route path="/db/invoicing" element={<DatabaseInvoicing />} />
                  <Route path="/db/godown-transfer" element={<DatabaseGodownTransfer />} />
                  <Route path="/db/cash-receipts" element={<DatabaseCashReceipt />} />
                  <Route path="/db/cash-payments" element={<DatabaseCashPayment />} />
                  <Route path="/db/account-master/edit/:id" element={<EditAccountMaster />} />
                  <Route path="/db/invoicing/edit/:id" element={<EditInvoicing />} />
                  <Route path="/db/godown-transfer/edit/:id" element={<EditGodownTransfer />} />
                  <Route path="/db/cash-receipts/edit/:id" element={<CashReceipt />} />
                  <Route path="/db/cash-payments/edit/:id" element={<CashPayment />} />
                </Route>
                
                {/* User Management */}
                <Route element={<ProtectedRoute requiredRouteAccess="Add User" />}>
                  <Route path="/add-user" element={<AddUser />} />
                  <Route path="/db/users" element={<AddUser />} />
                </Route>
                
                {/* Approved Section */}
                <Route element={<ProtectedRoute requiredRouteAccess="Approved" />}>
                  <Route path="/approved/account-master" element={<AccountMasterApproved />} />
                  <Route path="/approved/invoicing" element={<InvoicingApproved />} />
                  <Route path="/approved/godown-transfer" element={<GodownTransferApproved />} />
                  <Route path="/approved/cash-receipts" element={<CashReceiptApproved />} />
                  <Route path="/approved/cash-payments" element={<CashPaymentApproved />} />
                </Route>
              </Route>
            </Route>

            {/* Print Layout - Protected but no sidebar/header needed */}
            <Route element={<ProtectedRoute />}>
              <Route path="/printInvoicing" element={<PrintInvoicing />} />
              <Route path="/printAccount" element={<PrintAccount />} />
              <Route path="/printGodown" element={<PrintGodown />} />
              <Route path="/print" element={<PrintCashReceipt />} />
              <Route path="/printInvoice" element={<PrintInvoicing />} />
            </Route>

            {/* Fallback Route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </Router>
    </>
  );
}
