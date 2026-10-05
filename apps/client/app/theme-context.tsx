"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type ThemeMode = "light" | "dark" | "system";

type ThemeContextValue = {
  themeMode: ThemeMode;
  isDarkMode: boolean;
  changeTheme: (mode: ThemeMode) => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_STORAGE_KEY = "client-theme-mode-v1";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [systemDark, setSystemDark] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // خواندن تم ذخیره‌شده
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "light" || saved === "dark" || saved === "system") {
        setThemeMode(saved);
      }
    } catch {}
  }, []);

  // دنبال کردن تم سیستم به‌صورت زنده
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // دنبال کردن تمام‌صفحه
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const changeTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
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

  const isDarkMode = themeMode === "system" ? systemDark : themeMode === "dark";

  return (
    <ThemeContext.Provider
      value={{ themeMode, isDarkMode, changeTheme, isFullscreen, toggleFullscreen }}
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