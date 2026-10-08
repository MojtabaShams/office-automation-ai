"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  Menu,
  X,
  Sun,
  Moon,
  Maximize,
  Minimize,
  User,
  Home,
  Users,
  Workflow,
  FileText,
  ClipboardList,
  CalendarDays,
  MessageSquare,
  BarChart3,
} from "lucide-react";
import { useTheme } from "../theme-context";

const navItems = [
  { href: "/", label: "صفحه اصلی", icon: Home },
  { href: "/employees", label: "کارمندان", icon: Users },
  { href: "/forms", label: "فرم‌ها", icon: FileText },
  { href: "/processes", label: "پروسه‌ها", icon: Workflow },
  { href: "/requests", label: "درخواست‌ها", icon: ClipboardList },
  { href: "/calendar", label: "تقویم کاری", icon: CalendarDays },
  { href: "/messages", label: "پیام‌ها", icon: MessageSquare },
  { href: "/reports", label: "گزارشات", icon: BarChart3 },
];

function ThemeButtons() {
  const { isDarkMode, themeMode, changeTheme } = useTheme();
  const modes = [
    { mode: "light", icon: Sun, label: "روشن" },
    { mode: "dark", icon: Moon, label: "تاریک" },
  ] as const;
  const inactive = isDarkMode
    ? "text-slate-300 hover:bg-white/10 hover:text-white"
    : "text-[#59685f] hover:bg-[#e9ece7] hover:text-[#28443d]";

  return modes.map(({ mode, icon: Icon, label }) => (
    <button
      key={mode}
      type="button"
      aria-label={`تم ${label}`}
      aria-pressed={themeMode === mode}
      onClick={() => changeTheme(mode)}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
        themeMode === mode
          ? "bg-[#15554f] text-white shadow-md shadow-black/20"
          : inactive
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  ));
}

function FullscreenButton() {
  const { isDarkMode, isFullscreen, toggleFullscreen } = useTheme();
  return (
    <button
      type="button"
      aria-label={isFullscreen ? "خروج از تمام‌صفحه" : "تمام‌صفحه"}
      onClick={toggleFullscreen}
      className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border shadow-sm transition-colors ${
        isDarkMode
          ? "border-white/15 bg-[#193632] text-slate-100 hover:bg-[#23433e]"
          : "border-[#d5dad4] bg-[#edf0eb] text-[#29463f] hover:bg-[#e4e9e2]"
      }`}
    >
      {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
    </button>
  );
}

function AccountButton() {
  return (
    <button
      type="button"
      aria-label="حساب کاربری"
      className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#276e63] to-[#174b46] text-white shadow-md shadow-black/20 ring-1 ring-white/30 transition-transform hover:scale-105"
    >
      <User className="h-4 w-4" />
    </button>
  );
}

export default function AdminTopBar() {
  const { isDarkMode } = useTheme();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const inactiveNav = isDarkMode
    ? "text-slate-300 hover:bg-white/10 hover:text-white"
    : "text-[#40584e] hover:bg-[#e9ece7] hover:text-[#28443d]";

  const navigation = (
    <nav aria-label="منوی اصلی" className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-0.5">
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive =
          pathname === href ||
          (href === "/requests" && pathname.startsWith("/requests/")) ||
          (href === "/forms" && pathname.startsWith("/forms/"));
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            aria-current={isActive ? "page" : undefined}
            style={isActive ? { color: "#ffffff" } : undefined}
            className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium transition-colors lg:gap-1.5 lg:px-2.5 xl:px-3 ${
              isActive
                ? "bg-gradient-to-b from-[#287267] to-[#174f49] text-white shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
                : inactiveNav
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="relative z-30 shrink-0">
      <header
        className={`grid min-h-14 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-x-0 border-t-0 px-3 py-2 backdrop-blur-md sm:px-4 ${
          isDarkMode
            ? "border-white/[0.12] bg-gradient-to-b from-[#203b39] via-[#17332f] to-[#102623]"
            : "border-[#d5dad4] bg-[#edf0eb] shadow-sm shadow-[#55452f]/10"
        }`}
      >
        <Link href="/" className="flex items-center gap-2 justify-self-start">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#32796d] to-[#174f49] shadow-md shadow-black/30 ring-1 ring-white/20">
            <Sparkles className="h-4 w-4 text-white" />
          </span>
          <span className={`hidden whitespace-nowrap text-sm font-bold sm:inline ${isDarkMode ? "text-white" : "text-[#28443d]"}`}>
            پنل مدیریت
          </span>
        </Link>

        <div
          className={`hidden min-w-0 justify-self-center rounded-full border p-1 lg:block ${
            isDarkMode
              ? "border-white/[0.06] bg-black/20"
              : "border-[#d5dad4] bg-white"
          }`}
        >
          {navigation}
        </div>

        <div className="hidden items-center gap-2 justify-self-end sm:flex">
          <div
            className={`flex items-center gap-0.5 rounded-full border p-1 ${
              isDarkMode ? "border-white/10 bg-black/25" : "border-[#d5dad4] bg-[#edf0eb]"
            }`}
          >
            <ThemeButtons />
          </div>
          <FullscreenButton />
          <AccountButton />
        </div>

        <button
          type="button"
          aria-label={open ? "بستن منو" : "باز کردن منو"}
          aria-expanded={open}
          onClick={() => setOpen((isOpen) => !isOpen)}
          className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors sm:justify-self-end lg:hidden ${
            isDarkMode
              ? "border-white/15 bg-white/10 text-white hover:bg-white/20"
              : "border-[#d5dad4] bg-[#f1f2ee] text-[#29463f] hover:bg-[#e9ece7]"
          }`}
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </header>

      {open && (
        <div
          className={`absolute inset-x-0 top-full mt-2 rounded-2xl border p-3 shadow-[inset_0_2px_14px_rgba(0,0,0,0.25),0_18px_32px_rgba(15,23,42,0.2)] backdrop-blur-xl lg:hidden ${
            isDarkMode
              ? "border-white/10 bg-[#122925]/[0.98] text-white"
              : "border-[#d5dad4] bg-[#fafbf9]/[0.98] text-[#28443d]"
          }`}
        >
          {navigation}
          <div className="mt-3 flex items-center justify-between border-t border-current/10 pt-3">
            <div
              className={`flex items-center gap-0.5 rounded-full border p-1 ${
                isDarkMode ? "border-white/10 bg-white/[0.06]" : "border-[#d5dad4] bg-[#f1f2ee]"
              }`}
            >
              <ThemeButtons />
            </div>
            <div className="flex items-center gap-2">
              <FullscreenButton />
              <AccountButton />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}