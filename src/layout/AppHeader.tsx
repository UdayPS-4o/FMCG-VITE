import { useEffect, useRef, useState } from "react";

import { Link, useNavigate } from "react-router-dom";
import { useSidebar } from "../context/SidebarContext";
import { ThemeToggleButton } from "../components/common/ThemeToggleButton";
import UserDropdown from "../components/header/UserDropdown";
import constants from "../constants";

const AppHeader: React.FC = () => {
  const [isApplicationMenuOpen, setApplicationMenuOpen] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [isHeaderVisible, setIsHeaderVisible] = useState(false);
  const [isHoveringHeader, setIsHoveringHeader] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const navigate = useNavigate();
  const applicationMenuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  const { isMobileOpen } = useSidebar();

  // Fetch user data when component mounts
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

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
            localStorage.removeItem('token');
          }
        } else {
          localStorage.removeItem('token');
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        localStorage.removeItem('token');
      }
    };

    fetchUserData();
  }, []);



  const toggleApplicationMenu = () => {
    setApplicationMenuOpen(!isApplicationMenuOpen);
  };

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Generate a random avatar color
  const getRandomColor = () => {
    const colors = ['bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 
                    'bg-purple-100 text-purple-700', 'bg-yellow-100 text-yellow-700', 
                    'bg-red-100 text-red-700', 'bg-indigo-100 text-indigo-700'];
    return colors[Math.floor(Math.random() * colors.length)];
  };
  
  const avatarColor = getRandomColor();

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

  // Add handleLogout function
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
    setApplicationMenuOpen(false); // Close dropdown after logout
  };

  // Effect to close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        applicationMenuRef.current &&
        !applicationMenuRef.current.contains(event.target as Node)
      ) {
        setApplicationMenuOpen(false);
      }
    };

    if (isApplicationMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isApplicationMenuOpen]);

  // Auto-hide functionality for desktop view
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      // Only apply auto-hide on desktop (lg breakpoint and above)
      if (window.innerWidth < 1024) {
        setIsHeaderVisible(true);
        return;
      }

      const topEdgeThreshold = 50; // Show header when mouse is within 50px of top
      const isNearTopEdge = event.clientY <= topEdgeThreshold;
      
      setIsHeaderVisible(isNearTopEdge || isHoveringHeader);
    };

    const handleMouseLeave = () => {
      // Only apply auto-hide on desktop
      if (window.innerWidth >= 1024) {
        setIsHeaderVisible(false);
      }
    };

    // Add event listeners
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    // Handle window resize to reset header visibility on mobile
    const handleResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (!desktop) {
        setIsHeaderVisible(true);
      } else {
        setIsHeaderVisible(false);
      }
    };

    window.addEventListener('resize', handleResize);
    
    // Set initial state based on screen size
    handleResize();

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('resize', handleResize);
    };
  }, [isHoveringHeader]);

  // Header hover handlers
  const handleHeaderMouseEnter = () => {
    setIsHoveringHeader(true);
    if (window.innerWidth >= 1024) {
      setIsHeaderVisible(true);
    }
  };

  const handleHeaderMouseLeave = () => {
    setIsHoveringHeader(false);
    // Header will hide based on mouse position handled in mousemove
  };

  return (
    <header 
      ref={headerRef}
      onMouseEnter={handleHeaderMouseEnter}
      onMouseLeave={handleHeaderMouseLeave}
      className={`flex w-full bg-white/95 backdrop-blur-sm border-gray-200 dark:border-gray-800 dark:bg-gray-900/95 lg:border-b transition-transform duration-300 ease-in-out ${
        isDesktop 
          ? `fixed top-0 ${isHeaderVisible ? 'translate-y-0' : '-translate-y-full'}` 
          : 'sticky top-0'
      }`}
      style={{
        zIndex: 9999,
        transform: isDesktop 
          ? (isHeaderVisible ? 'translateY(0)' : 'translateY(-100%)') 
          : undefined
      }}>
      <div className="flex flex-col items-center justify-between grow lg:flex-row lg:px-6">
        <div className="flex items-center justify-between w-full gap-2 px-3 py-1 sm:py-2 lg:py-3 border-b border-gray-200 dark:border-gray-800 sm:gap-4 lg:justify-between lg:border-b-0 lg:px-0 lg:py-4">


          <Link to="/" className="lg:hidden invisible">
            <img
              className="dark:hidden"
              src="./images/logo/logo.svg"
              alt="Logo"
            />
            <img
              className="hidden dark:block"
              src="./images/logo/logo-dark.svg"
              alt="Logo"
            />
          </Link>

          {/* Mobile Application Menu Trigger (Triple Dots) */}
          <div className="relative lg:hidden"> {/* Container for positioning */} 
            <button
              onClick={toggleApplicationMenu}
              className="flex items-center justify-center w-10 h-10 text-gray-700 rounded-lg z-99999 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M5.99902 10.4951C6.82745 10.4951 7.49902 11.1667 7.49902 11.9951V12.0051C7.49902 12.8335 6.82745 13.5051 5.99902 13.5051C5.1706 13.5051 4.49902 12.8335 4.49902 12.0051V11.9951C4.49902 11.1667 5.1706 10.4951 5.99902 10.4951ZM17.999 10.4951C18.8275 10.4951 19.499 11.1667 19.499 11.9951V12.0051C19.499 12.8335 18.8275 13.5051 17.999 13.5051C17.1706 13.5051 16.499 12.8335 16.499 12.0051V11.9951C16.499 11.1667 17.1706 10.4951 17.999 10.4951ZM13.499 11.9951C13.499 11.1667 12.8275 10.4951 11.999 10.4951C11.1706 10.4951 10.499 11.1667 10.499 11.9951V12.0051C10.499 12.8335 11.1706 13.5051 11.999 13.5051C12.8275 13.5051 13.499 12.8335 13.499 12.0051V11.9951Z"
                  fill="currentColor"
                />
              </svg>
            </button>

            {/* Mobile Application Dropdown Menu */}
            <div
              ref={applicationMenuRef}
              className={`absolute top-full right-0 mt-2 w-56 origin-top-right rounded-md bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none transform transition ease-out duration-100 
                ${isApplicationMenuOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'}`}
              role="menu"
              aria-orientation="vertical"
              aria-labelledby="menu-button"
              tabIndex={-1}
            >
              <div className="py-1" role="none">
                {/* User Info in Dropdown */}
                {user && (
                  <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center text-sm`}>
                        {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {user.name}
                        </span>
                        {user.routeAccess && !user.routeAccess.includes('Admin') && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {user.subgroup?.title || "No subgroup"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {/* Theme Toggle in Dropdown */} 
                <div className="px-4 py-2 flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Theme</span>
                  <ThemeToggleButton />
                </div>
                {/* Logout Button in Dropdown */} 
                <button
                  onClick={handleLogout}
                  className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                  role="menuitem"
                  tabIndex={-1}
                >
                  <LogoutIcon className="w-5 h-5 mr-2" />
                  Logout
                </button>
              </div>
            </div>
          </div> 

          {/* Desktop Buttons */}
          <div className="hidden lg:flex items-center gap-3 2xsm:gap-4 relative z-10">
            <ThemeToggleButton />
            
            {user ? (
              <div className="flex items-center space-x-4">
                <div className={`w-10 h-10 rounded-full ${avatarColor} flex items-center justify-center`}>
                  {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {user.name}
                  </span>
                  {user.routeAccess && !user.routeAccess.includes('Admin') && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {user.subgroup?.title || "No subgroup"}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
            )}
          </div>

          <div className="hidden">
            <form>
              <div className="relative">
                <span className="absolute -translate-y-1/2 pointer-events-none left-4 top-1/2">
                  <svg
                    className="fill-gray-500 dark:fill-gray-400"
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M3.04175 9.37363C3.04175 5.87693 5.87711 3.04199 9.37508 3.04199C12.8731 3.04199 15.7084 5.87693 15.7084 9.37363C15.7084 12.8703 12.8731 15.7053 9.37508 15.7053C5.87711 15.7053 3.04175 12.8703 3.04175 9.37363ZM9.37508 1.54199C5.04902 1.54199 1.54175 5.04817 1.54175 9.37363C1.54175 13.6991 5.04902 17.2053 9.37508 17.2053C11.2674 17.2053 13.003 16.5344 14.357 15.4176L17.177 18.238C17.4699 18.5309 17.9448 18.5309 18.2377 18.238C18.5306 17.9451 18.5306 17.4703 18.2377 17.1774L15.418 14.3573C16.5365 13.0033 17.2084 11.2669 17.2084 9.37363C17.2084 5.04817 13.7011 1.54199 9.37508 1.54199Z"
                      fill=""
                    />
                  </svg>
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search or type command..."
                  className="dark:bg-dark-900 h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800 xl:w-[430px]"
                />

                <button className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs -tracking-[0.2px] text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
                  <span> ⌘ </span>
                  <span> K </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
