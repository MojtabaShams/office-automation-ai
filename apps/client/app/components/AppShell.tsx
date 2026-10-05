"use client";

import React from "react";
import Sidebar from "./Sidebar";
import { useTheme } from "../theme-context";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { isDarkMode } = useTheme();

  return (
    <div
      className={`fixed inset-0 transition-colors duration-300 ${
        isDarkMode
          ? "theme-dark bg-gradient-to-br from-[#203b39] via-[#17332f] to-[#102623] text-white"
          : "theme-light bg-gradient-to-br from-[#f1eee5] via-[#efebe2] to-[#eae6dd] text-[#28443d]"
      }`}
    >
      <div
        className={`relative h-full overflow-hidden transition-colors duration-300 ${
          isDarkMode ? "bg-[#122925]" : "bg-[#efede7]"
        }`}
      >
        <Sidebar />
        <main
          id="app-main-scroll"
          className={`relative h-full overflow-y-auto px-4 pt-12 transition-colors duration-300 md:px-6 md:pr-[5.25rem] md:pt-0 ${
            isDarkMode ? "bg-[#122925]/90" : "bg-[#efede7]/95"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}