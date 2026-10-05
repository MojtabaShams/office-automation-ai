"use client";

import React from "react";
import AdminTopBar from "./AdminTopBar";
import { useTheme } from "../theme-context";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { isDarkMode } = useTheme();

  return (
    <div
      className={`fixed inset-0 overflow-hidden transition-colors duration-300 ${
        isDarkMode ? "text-white" : "text-slate-900"
      }`}
      style={{
        backgroundImage: isDarkMode
          ? "linear-gradient(145deg, #203b39 0%, #17332f 52%, #102623 100%)"
          : "linear-gradient(145deg, #f1eee5 0%, #efebe2 52%, #eae6dd 100%)",
      }}
    >
      <div className="flex h-full min-h-0 flex-col">
        <AdminTopBar />
        <main
          id="admin-main-scroll"
          className={`min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 ${
            isDarkMode ? "bg-[#122925]/90" : "bg-[#efede7]/95"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
