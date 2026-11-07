"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import AdminTopBar from "./AdminTopBar";
import { useTheme } from "../theme-context";
import { useAuth } from "../app/auth-context";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { isDarkMode } = useTheme();
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isLoginRoute = pathname === "/login";

  // The session is short-lived (30 minutes); when it is gone every admin route
  // falls back to the login page, no matter which section is open.
  useEffect(() => {
    if (loading || isLoginRoute || user) return;
    router.replace("/login");
  }, [loading, isLoginRoute, user, router]);

  if (isLoginRoute) {
    return (
      <div
        className={`fixed inset-0 overflow-y-auto ${isDarkMode ? "text-white" : "text-slate-900"}`}
        style={{
          backgroundImage: isDarkMode
            ? "linear-gradient(145deg, #203b39 0%, #17332f 52%, #102623 100%)"
            : "linear-gradient(145deg, #f1eee5 0%, #efebe2 52%, #eae6dd 100%)",
        }}
      >
        {children}
      </div>
    );
  }

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
      {loading || !user ? (
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
            <p className="text-xs opacity-70">
              {loading ? "در حال بررسی نشست کاربری..." : "در حال انتقال به صفحه ورود..."}
            </p>
          </div>
        </div>
      ) : (
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
      )}
    </div>
  );
}
