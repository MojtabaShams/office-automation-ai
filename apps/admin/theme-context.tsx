"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type ThemeContextValue = {
  isDarkMode: boolean;
  themeMode: "light" | "dark";
  changeTheme: (mode: "light" | "dark") => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("admin-theme-mode");
      if (saved === "light" || saved === "dark") {
        setThemeMode(saved);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const changeTheme = (mode: "light" | "dark") => {
    setThemeMode(mode);
    try {
      localStorage.setItem("admin-theme-mode", mode);
    } catch {}
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <ThemeContext.Provider
      value={{ themeMode, isDarkMode: themeMode === "dark", changeTheme, isFullscreen, toggleFullscreen }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme باید داخل ThemeProvider استفاده شود");
  return ctx;
}