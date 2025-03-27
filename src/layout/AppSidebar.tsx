import React from 'react';
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

const fmcgItems: NavItem[] = [
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
    icon: <DatabaseIcon />,
    name: "Database",
    subItems: [
      { name: "Account Master", path: "/db/account-master", pro: false },
      { name: "Invoicing", path: "/db/invoicing", pro: false },
      { name: "Godown Transfer", path: "/db/godown-transfer", pro: false },
      { name: "Cash Receipts", path: "/db/cash-receipts", pro: false },
      { name: "Cash Payments", path: "/db/cash-payments", pro: false },
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
];

const navItems: NavItem[] = [];

const othersItems: NavItem[] = [];

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
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
        const response = await fetch(`${constants.baseURL}/api/checkIsAuth`, {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.authenticated && data.user) {
            setUser(data.user);
          } else {
            // Redirect to login if not authenticated
            navigate('/login');
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
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

      // Filter main menu items with direct paths
      if (item.path) {
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
          return false;
        }

        // For Database section, filter subitems based on user access
        if (item.name === "Database") {
          const accessibleSubItems = item.subItems.filter(subItem => {
            if (subItem.name === "Account Master") return user.routeAccess.includes('Account Master');
            if (subItem.name === "Invoicing") return user.routeAccess.includes('Invoicing');
            if (subItem.name === "Godown Transfer") return user.routeAccess.includes('Godown Transfer');
            if (subItem.name === "Cash Receipts") return user.routeAccess.includes('Cash Receipts');
            if (subItem.name === "Cash Payments") return user.routeAccess.includes('Cash Payments');
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
      const response = await fetch(`${constants.baseURL}/api/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      
      if (response.ok) {
        // Clear any locally stored data
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        // Use window.location for a full page refresh to clear all React state
        window.location.href = '/login';
      } else {
        console.error('Logout failed');
        // Still redirect even if logout failed
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Logout error:', error);
      window.location.href = '/login';
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
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-[999] border-r border-gray-200 
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
        className={`py-8 flex invisible ${
          !isExpanded && !isHovered ? "lg:justify-center" : "justify-start"
        }`}
      >
        <Link to="/">
          {isExpanded || isHovered || isMobileOpen ? (
            <>
              <img
                className="dark:hidden"
                src="/images/logo/logo.svg"
                alt="Logo"
                width={150}
                height={40}
              />
              <img
                className="hidden dark:block"
                src="/images/logo/logo-dark.svg"
                alt="Logo"
                width={150}
                height={40}
              />
            </>
          ) : (
            <img
              src="/images/logo/logo-icon.svg"
              alt="Logo"
              width={32}
              height={32}
            />
          )}
        </Link>
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
      
      {/* Remove user info display, but keep logout button */}
      <div className="mt-auto mb-8">
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
};

export default AppSidebar;