"use client";

import type React from "react";
import { createContext, useState, useContext, useEffect } from "react";

export type Theme = "light" | "dark" | "sage" | "saffron" | "indigo" | "glass";

export type ThemeInfo = {
  id: Theme;
  label: string;
  emoji: string;
  accent: string; // hex for the swatch
};

export const THEMES: ThemeInfo[] = [
  { id: "light",   label: "Day",     emoji: "☀️",  accent: "#465fff" },
  { id: "dark",    label: "Night",   emoji: "🌙",  accent: "#465fff" },
  { id: "sage",    label: "Sage",    emoji: "🌿",  accent: "#16a34a" },
  { id: "saffron", label: "Saffron", emoji: "🔥",  accent: "#d97706" },
  { id: "indigo",  label: "Royal",   emoji: "👑",  accent: "#c9a227" },
  { id: "glass",   label: "Glass",   emoji: "💎",  accent: "#06b6d4" },
];

type ThemeContextType = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void; // kept for backward compatibility (cycles light↔dark)
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// All class names that might be on <html>
const ALL_THEME_CLASSES = ["dark", "theme-sage", "theme-saffron", "theme-indigo", "theme-glass"];

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  // Remove all theme classes first
  root.classList.remove(...ALL_THEME_CLASSES);

  if (theme === "dark")    root.classList.add("dark");
  if (theme === "sage")    root.classList.add("theme-sage");
  if (theme === "saffron") root.classList.add("theme-saffron");
  if (theme === "indigo")  root.classList.add("theme-indigo");
  if (theme === "glass")   root.classList.add("theme-glass");
  // "light" → no extra class
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    const valid: Theme[] = ["light", "dark", "sage", "saffron", "indigo", "glass"];
    const initial: Theme = saved && valid.includes(saved) ? saved : "dark";
    setThemeState(initial);
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem("theme", theme);
      applyTheme(theme);
    }
  }, [theme, isInitialized]);

  const setTheme = (t: Theme) => setThemeState(t);

  // Backward-compat toggle: cycles light ↔ dark only
  const toggleTheme = () =>
    setThemeState((prev) => (prev === "light" ? "dark" : "light"));

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
