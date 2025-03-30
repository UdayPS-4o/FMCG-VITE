import { SidebarProvider, useSidebar } from "../context/SidebarContext";
import { Outlet } from "react-router-dom";
import React, { useState, useEffect } from "react";
import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";
import BottomNav from "../components/navigation/BottomNav";

const LayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="min-h-screen xl:flex bg-gray-50 dark:bg-gray-900">
      <div>
        <AppSidebar />
      </div>
      <div
        className={`flex-1 transition-all duration-300 ease-in-out flex flex-col ${
          isExpanded || isHovered ? "lg:ml-[290px]" : "lg:ml-[90px]"
        } ${isMobileOpen ? "ml-0" : ""}`}
      >
        <AppHeader />
        <div className={`mx-auto w-full max-w-(--breakpoint-2xl) flex-1 
          ${isDesktop ? "p-4 md:p-6 pb-16 lg:pb-4" : "p-2 pt-0 pb-20"}
          ${isExpanded || isHovered ? "lg:pt-6" : "lg:pt-4"}`}>
          <Outlet />
        </div>
        <BottomNav />
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
