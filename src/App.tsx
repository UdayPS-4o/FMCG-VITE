import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
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

export default function App() {
  return (
    <>
      <ToastContainer position="bottom-right" autoClose={3000} />
      <Router>
        <ScrollToTop />
        <Routes>
          {/* Dashboard Layout */}
          <Route element={<AppLayout />}>
            <Route index path="/" element={<Home />} />
            <Route path="/account-master" element={<AccountMaster />} />
            <Route path="/invoicing" element={<Invoicing />} />
            
            {/* Database Section */}
            <Route path="/db/account-master" element={<DatabaseAccountMaster />} />
            <Route path="/db/invoicing" element={<DatabaseInvoicing />} />
            
            {/* Edit Pages */}
            <Route path="/account-master/edit/:id" element={<EditAccountMaster />} />
            <Route path="/invoicing/edit/:id" element={<EditInvoicing />} />
            <Route path="/db/account-master/edit/:id" element={<EditAccountMaster />} />
            <Route path="/db/invoicing/edit/:id" element={<EditInvoicing />} />
            
            {/* Approved Section */}
            <Route path="/approved/account-master" element={<AccountMasterApproved />} />
            <Route path="/approved/invoicing" element={<InvoicingApproved />} />
            
          </Route>

          {/* Print Layout - No sidebar/header needed */}
          <Route path="/printInvoicing" element={<PrintInvoicing />} />
          <Route path="/printAccount" element={<PrintAccount />} />

          {/* Auth Layout */}
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/login" element={<Login />} />

          {/* Fallback Route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </>
  );
}
