import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Home2 from './pages/Home2';
import Search from './pages/Search';
import Cart from './pages/Cart';
import Orders from './pages/Orders';
import Profile from './pages/Profile';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import InvoiceView from './pages/InvoiceView';
import OrderView from './pages/OrderView';
import { useStore } from './context/StoreContext';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useStore();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  // If must change password, redirect to that screen (except if already there)
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <>{children}</>;
};

const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useStore();
  if (isLoading) return null;
  if (user && !user.mustChangePassword) return <Navigate to="/" replace />;
  return <>{children}</>;
};

import { usePushNotifications } from './hooks/usePushNotifications';

function App() {
  // Initialize push notifications
  usePushNotifications();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthRoute><Login /></AuthRoute>} />
        <Route path="/change-password" element={<ChangePassword />} />

        <Route element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route path="/" element={<Home />} />
          {/* ── Home concept previews ── */}
          <Route path="/home/2" element={<Home2 />} />
          <Route path="/search" element={<Search />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/order/:id" element={<OrderView />} />
          <Route path="/invoice/:series/:billNo" element={<InvoiceView />} />
          <Route path="/profile" element={<Profile />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
