import { SidebarProvider, useSidebar } from "../context/SidebarContext";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import React, { useState, useEffect, useRef } from "react";
import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";
import BottomNav from "../components/navigation/BottomNav";
import useAttendanceCheck from "../hooks/useAttendanceCheck";

const LayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen, toggleMobileSidebar } = useSidebar();
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const prevPathnameRef = useRef(location.pathname);
  const { hasMarkedToday, isLoading, shouldHideNavigation, isNavigating } = useAttendanceCheck();

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isMobileOpen &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node)
      ) {
        toggleMobileSidebar();
      }
    };

    if (isMobileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMobileOpen, toggleMobileSidebar]);

  useEffect(() => {
    if (prevPathnameRef.current !== location.pathname) {
      if (isMobileOpen) {
        toggleMobileSidebar();
      }
    }
    prevPathnameRef.current = location.pathname;
  }, [location.pathname, isMobileOpen, toggleMobileSidebar]);

  // Redirect to attendance page if not marked and trying to access other pages
  // But only redirect if we're not already in the process of navigating
  useEffect(() => {
    if (shouldHideNavigation && location.pathname !== '/attendance' && !isLoading && !isNavigating) {
      // Add a small delay to prevent interference with navigation after attendance marking
      const timer = setTimeout(() => {
        if (shouldHideNavigation && location.pathname !== '/attendance' && !isNavigating) {
          navigate('/attendance');
        }
      }, 50);
      
      return () => clearTimeout(timer);
    }
  }, [shouldHideNavigation, location.pathname, navigate, isLoading, isNavigating]);

  // Show loading state while checking attendance
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Checking attendance status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen xl:flex bg-gray-50 dark:bg-gray-900">
      {/* Only show sidebar if attendance is marked or on attendance/login pages */}
      {!shouldHideNavigation && (
        <div>
          <AppSidebar ref={sidebarRef} />
        </div>
      )}
      <div
        className={`flex-1 transition-all duration-300 ease-in-out flex flex-col ${
          !shouldHideNavigation && (isExpanded || isHovered) ? "lg:ml-[290px]" : 
          !shouldHideNavigation ? "lg:ml-[90px]" : "ml-0"
        } ${isMobileOpen ? "ml-0" : ""}`}
      >
        <AppHeader />
        <div className={`mx-auto w-full max-w-(--breakpoint-2xl) flex-1 
          ${isDesktop ? "p-4 md:p-6 pb-16 lg:pb-4" : "p-2 pt-0 pb-20"}
          ${!shouldHideNavigation && (isExpanded || isHovered) ? "lg:pt-6" : "lg:pt-4"}`}>
          <Outlet />
        </div>
        {/* Only show bottom navigation if attendance is marked or on attendance/login pages */}
        {!shouldHideNavigation && <BottomNav />}
      </div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
};

export default AppLayout;
