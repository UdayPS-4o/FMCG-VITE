import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  UserIcon, 
  InvoiceIcon, 
  CashReceiptIcon, 
  CashPaymentIcon,
  WarehouseIcon
} from '../../components/icons';
import { useAuth } from '../../contexts/AuthContext';

interface NavItem {
  icon: React.ReactNode;
  name: string;
  path: string;
  requiredAccess: string;
}

const BottomNav: React.FC = () => {
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(false);
  const { hasAccess } = useAuth();
  
  // Check if we're on mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024); // 1024px is the lg breakpoint in Tailwind
    };
    
    // Initial check
    checkMobile();
    
    // Add event listener
    window.addEventListener('resize', checkMobile);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);
  
  // Define the most important navigation items for mobile
  const mobileNavItems: NavItem[] = [
    {
      icon: <UserIcon />,
      name: "Account",
      path: "/account-master",
      requiredAccess: "Account Master",
    },
    {
      icon: <InvoiceIcon />,
      name: "Invoicing",
      path: "/invoicing",
      requiredAccess: "Invoicing",
    },
    {
      icon: <WarehouseIcon />,
      name: "Godown",
      path: "/godown-transfer",
      requiredAccess: "Godown Transfer",
    },
    {
      icon: <CashReceiptIcon />,
      name: "Receipt",
      path: "/cash-receipt",
      requiredAccess: "Cash Receipts",
    },
    {
      icon: <CashPaymentIcon />,
      name: "Payment",
      path: "/cash-payment",
      requiredAccess: "Cash Payments",
    }
  ];

  // Filter items based on user access
  const accessibleNavItems = mobileNavItems.filter(item => hasAccess(item.requiredAccess));

  const isActive = (path: string) => location.pathname === path;

  // If not mobile, don't render
  if (!isMobile) return null;

  return (
    <>
      {/* Add an invisible overlay with even higher z-index to catch any elements that might overlay */}
      <div 
        className="fixed inset-0 bottom-0 pointer-events-none" 
        style={{ 
          zIndex: 99998,
          height: '75px',
          top: 'auto' 
        }} 
      />
      
      {/* The actual bottom nav */}
      <div 
        className="fixed bottom-0 left-0 right-0 w-full bg-white border-t border-gray-200 shadow-lg dark:bg-gray-900 dark:border-gray-800"
        style={{ zIndex: 99999 }}
      >
        <div className="flex justify-between items-center px-2 py-3">
          {accessibleNavItems.map((item) => (
            <Link
              key={item.name}
              to={item.path}
              className={`flex flex-col items-center justify-center space-y-1 px-3 py-1 rounded-md transition-colors ${
                isActive(item.path)
                  ? "text-brand-500 bg-brand-50 dark:bg-gray-800"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <span className="w-5 h-5">
                {item.icon}
              </span>
              <span className="text-[10px] font-medium">
                {item.name}
              </span>
            </Link>
          ))}
        </div>
        <div className="h-safe-area-bottom bg-white dark:bg-gray-900"></div>
      </div>
    </>
  );
};

export default BottomNav;