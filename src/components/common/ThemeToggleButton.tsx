import { useRef, useState, useEffect } from "react";
import { useTheme, THEMES, type Theme } from "../../context/ThemeContext";

export const ThemeToggleButton: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  // Icons for the toggle button
  const SunIcon = () => (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd"
        d="M10 1.54a.75.75 0 01.75.75v1.25a.75.75 0 01-1.5 0V2.29A.75.75 0 0110 1.54zm0 5.25a3.21 3.21 0 100 6.42 3.21 3.21 0 000-6.42zm5.98-.71a.75.75 0 00-1.06-1.06l-.88.88a.75.75 0 001.06 1.06l.88-.88zM18.46 10a.75.75 0 01-.75.75h-1.25a.75.75 0 010-1.5h1.25a.75.75 0 01.75.75zm-2.54 4.92a.75.75 0 00-1.06-1.06l-.88.88a.75.75 0 001.06 1.06l.88-.88zM10 15.71a.75.75 0 01.75.75v1.25a.75.75 0 01-1.5 0v-1.25A.75.75 0 0110 15.71zM5.08 14.96a.75.75 0 10-1.06 1.06l.88.88a.75.75 0 001.06-1.06l-.88-.88zM4.29 10a.75.75 0 01-.75.75H2.29a.75.75 0 010-1.5h1.25A.75.75 0 014.29 10zM5.96 5.96A.75.75 0 104.9 4.9l-.88.88A.75.75 0 005.08 6.84l.88-.88z"
        fill="currentColor"/>
    </svg>
  );

  const MoonIcon = () => (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.45 11.97l.73.19c.085-.323-.054-.663-.34-.835a.75.75 0 00-.844.076l.454.569zM8.03 2.55l.55.51a.75.75 0 00-.672-1.236l.122.726zM12.92 13c-3.27 0-5.92-2.65-5.92-5.92H5.5a7.42 7.42 0 007.42 7.42V13zm4.02-1.58c-1.057.983-2.47 1.58-4.02 1.58v1.5a7.39 7.39 0 005.04-1.98l-1.02-1.1zm-.26.35c-.786 2.982-3.5 5.18-6.73 5.18v1.5a8.46 8.46 0 008.18-6.29l-1.45-.39zM10 18.46A8.46 8.46 0 011.54 10H.04A9.96 9.96 0 0010 19.96v-1.5zM1.54 10A8.46 8.46 0 018.2 1.83L7.82.1A9.96 9.96 0 00.04 10h1.5zM5.5 7.08A3.58 3.58 0 018.58 3.5V2a5.08 5.08 0 00-5.08 5.08H5.5z"
        fill="currentColor"/>
    </svg>
  );

  const PaletteIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.1 0 2-.9 2-2 0-.53-.21-1.01-.54-1.37-.32-.34-.51-.81-.51-1.3 0-1.1.9-2 2-2h2.35C19.33 15.33 22 12.95 22 10c0-4.41-4.48-8-10-8zm-5.5 9a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm3-4a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm3 4a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" fill="currentColor"/>
    </svg>
  );

  const getIcon = () => {
    if (theme === "light") return <SunIcon />;
    if (theme === "dark") return <MoonIcon />;
    return <PaletteIcon />;
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger Button */}
      <button
        id="theme-picker-trigger"
        onClick={() => setOpen((o) => !o)}
        title={`Theme: ${current.label}`}
        className="relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full hover:text-gray-700 h-11 w-11 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        style={{
          color: theme !== "light" && theme !== "dark" ? current.accent : undefined,
          borderColor: theme !== "light" && theme !== "dark" ? `${current.accent}55` : undefined,
        }}
      >
        {getIcon()}
        {/* Active theme indicator dot */}
        <span
          className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-900"
          style={{ backgroundColor: current.accent }}
        />
      </button>

      {/* Theme Picker Dropdown */}
      {open && (
        <div
          className="absolute right-0 mt-2 w-52 origin-top-right rounded-2xl border border-gray-100 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900 overflow-hidden z-[99999]"
          style={{ animation: "themePickerIn 0.15s ease" }}
        >
          <div className="px-3 pt-3 pb-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">
              Choose Theme
            </p>
          </div>
          <div className="px-2 pb-2 flex flex-col gap-0.5">
            {THEMES.map((t) => {
              const isActive = theme === t.id;
              return (
                <button
                  key={t.id}
                  id={`theme-option-${t.id}`}
                  onClick={() => { setTheme(t.id as Theme); setOpen(false); }}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-left
                    ${t.isSubTheme ? "pl-8 text-xs border-l-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600" : ""}
                    ${isActive
                      ? (t.isSubTheme ? "bg-gray-50 dark:bg-white/[0.06] text-gray-900 dark:text-white border-l-2 border-gray-400 dark:border-gray-500!" : "bg-gray-50 dark:bg-white/[0.06] text-gray-900 dark:text-white")
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.04] hover:text-gray-900 dark:hover:text-white"
                    }`}
                >
                  {/* Colour swatch */}
                  <span
                    className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-white shadow-sm"
                    style={{
                      backgroundColor: t.accent,
                      boxShadow: isActive ? `0 0 0 2px ${t.accent}` : undefined,
                    }}
                  />
                  <span className="flex-1">{t.emoji} {t.label}</span>
                  {/* Tick */}
                  {isActive && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-gray-900 dark:text-white flex-shrink-0">
                      <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes themePickerIn {
          from { opacity: 0; transform: scale(0.95) translateY(-4px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>
    </div>
  );
};
