import React from "react";
import GridShape from "../../components/common/GridShape";
import ThemeTogglerTwo from "../../components/common/ThemeTogglerTwo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative p-6 bg-brand-950 z-1 dark:bg-gray-900 sm:p-0">
      <div className="relative flex flex-col justify-center items-center w-full h-screen dark:bg-gray-900 sm:p-0">
        <div className="absolute inset-0 z-0">
          <GridShape />
        </div>
        <div className="relative z-10 w-full max-w-md mx-auto">
          {children}
        </div>
        <div className="fixed z-50 bottom-6 right-6 sm:block">
          <ThemeTogglerTwo />
        </div>
      </div>
    </div>
  );
}
