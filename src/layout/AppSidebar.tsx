import React, { forwardRef } from 'react';
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BoxIcon,
  DatabaseIcon,
  UserIcon,
  CashReceiptIcon,
  CashPaymentIcon,
  InvoiceIcon,
  WarehouseIcon
} from '../components/icons';
import { useSidebar } from "../context/SidebarContext";
import constants from '../constants';

// Add missing icon components
const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 9l-7 7-7-7"
    />
  </svg>
);

const HorizontaLDots: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z"
    />
  </svg>
);

// Add LogoutIcon component
const LogoutIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
    />
  </svg>
);

const BellIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
    />
  </svg>
);

const AttendanceIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

interface SubNavItem {
  name: string;
  path: string;
  pro?: boolean;
  new?: boolean;
}

interface NavItem {
  icon: React.ReactNode;
  name: string;
  path?: string;
  subItems?: SubNavItem[];
}

interface User {
  id: number;
  name: string;
  username: string;
  password: string;
  routeAccess: string[];
  powers: string[];
  token?: string;
  subgroup?: {
    title: string;
    subgroupCode?: string;
  } | null;
}

// Create an admin attendance icon
const AdminAttendanceIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
    />
  </svg>
);

const fmcgItems: NavItem[] = [
  {
    icon: <AttendanceIcon />,
    name: "Attendance",
    path: "/attendance",
  },
  {
    icon: <AdminAttendanceIcon />,
    name: "Admin Attendance",
    path: "/admin/attendance",
  },
  {
    icon: <UserIcon />,
    name: "Account Master",
    path: "/account-master",
  },
  {
    icon: <InvoiceIcon />,
    name: "Invoicing",
    path: "/invoicing",
  },
  {
    icon: <WarehouseIcon />,
    name: "Godown Transfer",
    path: "/godown-transfer",
  },
  {
    icon: <CashReceiptIcon />,
    name: "Cash Receipt",
    path: "/cash-receipt",
  },
  {
    icon: <CashPaymentIcon />,
    name: "Cash Payment",
    path: "/cash-payment",
  },
  {
    icon: <UserIcon />,
    name: "Add User",
    path: "/add-user",
  },
  {
    icon: <BellIcon />,
    name: "Push Notifications",
    path: "/push-notifications",
  },
  {
    icon: <DatabaseIcon />,
    name: "Database",
    subItems: [
      { name: "Account Master", path: "/db/account-master", pro: false },
      { name: "Invoicing", path: "/db/invoicing", pro: false },
      { name: "Godown Transfer", path: "/db/godown-transfer", pro: false },
      { name: "Cash Receipts", path: "/db/cash-receipts", pro: false },
      { name: "Cash Payments", path: "/db/cash-payments", pro: false },
      { name: "DBF Print", path: "/db/dbf-print", pro: false },
    ],
  },
  {
    icon: <BoxIcon />,
    name: "Approved",
    subItems: [
      { name: "Account Master", path: "/approved/account-master", pro: false },
      { name: "Invoicing", path: "/approved/invoicing", pro: false },
      { name: "Godown Transfer", path: "/approved/godown-transfer", pro: false },
      { name: "Cash Receipts", path: "/approved/cash-receipts", pro: false },
      { name: "Cash Payments", path: "/approved/cash-payments", pro: false },
    ],
  },
  {
    icon: <DatabaseIcon />,
    name: "Reports",
    subItems: [
      { name: "Item Wise Sales", path: "/reports/item-wise-sales", pro: false },
      { name: "Item Wise Purchase", path: "/reports/item-wise-purchase", pro: false },
      { name: "Godown Stock Register", path: "/reports/godown-stock-register", pro: false },
      { name: "Item Wise Stock Register", path: "/reports/item-wise-stock-register", pro: false },
      { name: "Bills Delivery Register", path: "/reports/bills-delivery-register", pro: false },
      { name: "Cash Book", path: "/reports/cash-book", pro: false },
      { name: "Party Ledger", path: "/reports/party-ledger", pro: false },
      { name: "Print Van Loading", path: "/reports/van-loading", pro: false },
      { name: "PNB Stock Statement", path: "/reports/pnb-stock-statement", pro: false },
      { name: "GSTR - Match Pur. B2B with GSTR2A", path: "/reports/gstr2a-matching", pro: false },
    ],
  }
];

const navItems: NavItem[] = [];

const othersItems: NavItem[] = [];

const AppSidebar = React.forwardRef<HTMLElement>((_props, ref) => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleMobileSidebar } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [filteredItems, setFilteredItems] = useState<NavItem[]>([]);

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "main" | "others" | "fmcg";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>(
    {}
  );
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Fetch user data when component mounts
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          navigate('/login');
          return;
        }

        const response = await fetch(`${constants.baseURL}/api/checkIsAuth`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.authenticated && data.user) {
            setUser(data.user);
          } else {
            // Redirect to login if not authenticated
            localStorage.removeItem('token');
            navigate('/login');
          }
        } else {
          localStorage.removeItem('token');
          navigate('/login');
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        localStorage.removeItem('token');
        navigate('/login');
      }
    };

    fetchUserData();
  }, [navigate]);

  // Filter menu items based on user access rights
  useEffect(() => {
    if (!user) {
      setFilteredItems([]);
      return;
    }

    // Debug: Print user access rights to console
    console.log("User routeAccess:", user.routeAccess);
    console.log("User powers:", user.powers);

    // If user has Admin access, show all items
    if (user.routeAccess.includes('Admin')) {
      console.log("User has Admin access, showing all menu items");
      setFilteredItems([...fmcgItems]);
      return;
    }

    // Filter items based on user's routeAccess
    const filtered = fmcgItems.filter(item => {
      // Special case for "Add User" - only show for Admin
      if (item.name === "Add User") {
        return false;
      }

      // Only show push notifications for admin
      if (item.name === "Push Notifications") {
        return false;
      }

      // Special case for "Bills Delivery Register" - only show for Admin
      if (item.name === "Bills Delivery Register") {
        return false;
      }

      // Filter main menu items with direct paths
      if (item.path) {
        // Show different attendance options based on user role
        if (item.name === "Attendance") {
          // Show attendance marking page only for non-admin users
          return !user.routeAccess.includes('Admin');
        }
        if (item.name === "Admin Attendance") {
          // Show admin attendance portal only for admin users
          return user.routeAccess.includes('Admin');
        }
        if (item.name === "Account Master" && !user.routeAccess.includes('Account Master')) return false;
        if (item.name === "Invoicing" && !user.routeAccess.includes('Invoicing')) return false;
        if (item.name === "Godown Transfer" && !user.routeAccess.includes('Godown Transfer')) return false;
        if (item.name === "Cash Receipt" && !user.routeAccess.includes('Cash Receipts')) return false;
        if (item.name === "Cash Payment" && !user.routeAccess.includes('Cash Payments')) return false;
        return true;
      }

      // For items with subitems, handle properly
      if (item.subItems) {
        // Special case for "Approved" section - only show to Admin
        if (item.name === "Approved") {
          return user.routeAccess.includes('Admin');
        }
        // Special case for "Reports" section
        if (item.name === "Reports") {
          return user.routeAccess.includes('Reports');
        }

        // For Database section, filter subitems based on user access
        if (item.name === "Database") {
          const accessibleSubItems = item.subItems.filter(subItem => {
            if (subItem.name === "Account Master") return user.routeAccess.includes('Account Master');
            if (subItem.name === "Invoicing") return user.routeAccess.includes('Invoicing');
            if (subItem.name === "Godown Transfer") return user.routeAccess.includes('Godown Transfer');
            if (subItem.name === "Cash Receipts") return user.routeAccess.includes('Cash Receipts');
            if (subItem.name === "Cash Payments") return user.routeAccess.includes('Cash Payments');
            if (subItem.name === "DBF Print") return user.routeAccess.includes('Admin');
            return false;
          });
          
          // Only show Database section if it has accessible subitems
          if (accessibleSubItems.length === 0) {
            return false;
          }
          
          // Create a new item with only the accessible subitems
          item.subItems = accessibleSubItems;
          return true;
        }
        
        // Filter subitems for other sections
        const filteredSubItems = item.subItems.filter(subItem => {
          if (subItem.name === "Account Master") return user.routeAccess.includes('Account Master');
          if (subItem.name === "Invoicing") return user.routeAccess.includes('Invoicing');
          if (subItem.name === "Godown Transfer") return user.routeAccess.includes('Godown Transfer');
          if (subItem.name === "Cash Receipts") return user.routeAccess.includes('Cash Receipts');
          if (subItem.name === "Cash Payments") return user.routeAccess.includes('Cash Payments');
          return false;
        });
        
        // If all subitems are filtered out, don't show the parent item
        if (filteredSubItems.length === 0) {
          return false;
        }
        
        // Update the item with filtered subitems
        item.subItems = filteredSubItems;
        return true;
      }

      return false;
    });

    console.log("Filtered menu items:", filtered.map(item => item.name));
    setFilteredItems(filtered);
  }, [user]);

  const isActive = useCallback(
    (path: string) => location.pathname === path,
    [location.pathname]
  );

  useEffect(() => {
    let submenuMatched = false;
    ["main", "others", "fmcg"].forEach((menuType) => {
      const items = menuType === "main" 
        ? navItems 
        : menuType === "others" 
          ? othersItems 
          : filteredItems;
      items.forEach((nav, index) => {
        if (nav.subItems) {
          nav.subItems.forEach((subItem) => {
            if (isActive(subItem.path)) {
              setOpenSubmenu({
                type: menuType as "main" | "others" | "fmcg",
                index,
              });
              submenuMatched = true;
            }
          });
        }
      });
    });

    if (!submenuMatched) {
      setOpenSubmenu(null);
    }
  }, [location, isActive, filteredItems]);

  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (index: number, menuType: "main" | "others" | "fmcg") => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === menuType &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  // Fix the handleLogout function
  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${constants.baseURL}/api/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        // Clear any locally stored data
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Redirect to login page
        navigate('/login');
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Still try to clear data and redirect even if API call fails
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      navigate('/login');
    }
  };

  // Close mobile sidebar on item click
  const handleItemClick = () => {
    if (isMobileOpen) {
      toggleMobileSidebar();
    }
  };

  const renderMenuItems = (items: NavItem[], menuType: "main" | "others" | "fmcg") => (
    <ul className="flex flex-col gap-4">
      {items.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              onClick={() => handleSubmenuToggle(index, menuType)}
              className={`menu-item group ${
                openSubmenu?.type === menuType && openSubmenu?.index === index
                  ? "menu-item-active"
                  : "menu-item-inactive"
              } cursor-pointer ${
                !isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "justify-start"
              }`}
            >
              <span
                className={`menu-item-icon-size  ${
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }`}
              >
                {nav.icon}
              </span>
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className="menu-item-text">{nav.name}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDownIcon
                  className={`ml-auto w-5 h-5 transition-transform duration-200 ${
                    openSubmenu?.type === menuType &&
                    openSubmenu?.index === index
                      ? "rotate-180 text-brand-500"
                      : ""
                  }`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              <Link
                to={nav.path}
                onClick={handleItemClick}
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
              >
                <span
                  className={`menu-item-icon-size ${
                    isActive(nav.path)
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className="menu-item-text">{nav.name}</span>
                )}
              </Link>
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            <div
              ref={(el) => {
                subMenuRefs.current[`${menuType}-${index}`] = el;
              }}
              className="overflow-hidden transition-all duration-300"
              style={{
                height:
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? `${subMenuHeight[`${menuType}-${index}`]}px`
                    : "0px",
              }}
            >
              <ul className="mt-2 space-y-1 ml-9">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      to={subItem.path}
                      className={`menu-dropdown-item ${
                        isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                      }`}
                    >
                      {subItem.name}
                      <span className="flex items-center gap-1 ml-auto">
                        {subItem.new && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge`}
                          >
                            new
                          </span>
                        )}
                        {subItem.pro && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge`}
                          >
                            pro
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <aside
      ref={ref}
      className={`fixed flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-[999] border-r border-gray-200 
        ${
          isExpanded || isMobileOpen
            ? "w-[290px]"
            : isHovered
            ? "w-[290px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-4 lg:py-8 flex invisible ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
    
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar flex-grow">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "FMCG"
                ) : (
                  <HorizontaLDots className="size-6" />
                )}
              </h2>
              {/* Use filtered items instead of all fmcgItems */}
              {renderMenuItems(filteredItems, "fmcg")}
            </div>
          </div>
        </nav>
      </div>
      
      {/* Logout button with adjusted positioning */}
      <div className="mt-auto mb-4 lg:mb-4">
        <button
          onClick={handleLogout}
          className="menu-item group menu-item-inactive w-full"
        >
          <span className="menu-item-icon-size menu-item-icon-inactive">
            <LogoutIcon />
          </span>
          {(isExpanded || isHovered || isMobileOpen) && (
            <span className="menu-item-text">Logout</span>
          )}
        </button>
      </div>
    </aside>
  );
});

export default AppSidebar;