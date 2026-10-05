"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  PlusCircle,
  History,
  Moon,
  Sun,
  Monitor,
  Maximize,
  Minimize,
  User,
  Menu,
  X,
  Sparkles,
} from "lucide-react";
import { useTheme } from "../theme-context";

const navItems = [
  { href: "/", icon: Home, label: "خانه" },
  { href: "/new-request", icon: PlusCircle, label: "درخواست جدید" },
  { href: "/history", icon: History, label: "تاریخچه درخواست‌ها" },
];

/* Tooltip که به سمت چپ باز می‌شود */
function Tip({
  label,
  isDarkMode,
  children,
}: {
  label: string;
  isDarkMode: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="group/tip relative flex justify-center">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute right-full top-1/2 z-[70] mr-3 hidden -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[0.7rem] font-medium opacity-0 shadow-xl transition-all duration-200 group-hover/tip:translate-x-0 group-hover/tip:opacity-100 group-focus-within/tip:translate-x-0 group-focus-within/tip:opacity-100 md:block ${
          isDarkMode
            ? "border-white/10 bg-[#122925] text-white"
            : "border-[#d5dad4] bg-white text-[#28443d]"
        }`}
      >
        {label}
        <span
          className={`absolute left-full top-1/2 h-2 w-2 -translate-x-1 -translate-y-1/2 rotate-45 border-r border-t ${
            isDarkMode ? "border-white/10 bg-[#122925]" : "border-[#d5dad4] bg-white"
          }`}
        />
      </span>
    </div>
  );
}

export default function Sidebar() {
  const { isDarkMode, themeMode, changeTheme, isFullscreen, toggleFullscreen } = useTheme();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const c = isDarkMode
    ? {
      aside: "border-white/10 bg-[#122925] md:border-transparent md:bg-transparent",
        line: "border-white/10",
        text: "text-white/70 hover:text-white",
        circle:
          "bg-white/[0.08] hover:bg-white/[0.18] border border-white/[0.12] backdrop-blur-sm",
      group: "bg-[#193632] border border-white/[0.12] backdrop-blur-sm",
        strong: "text-white",
      burger: "border-white/15 bg-[#193632] text-white",
      }
    : {
      aside: "border-[#d5dad4] bg-[#efede7] md:border-transparent md:bg-transparent",
      line: "border-[#d5dad4]",
      text: "text-[#53665b] hover:text-[#28443d]",
      circle: "bg-white/70 hover:bg-white border border-[#d5dad4]",
      group: "bg-[#edf0eb] border border-[#d5dad4]",
      strong: "text-[#28443d]",
      burger: "border-[#d5dad4] bg-[#edf0eb] text-[#28443d]",
      };

  const circleBtn =
    "flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f7aab]";

  return (
    <>
      {/* همبرگر (فقط موبایل) */}
      <button
        type="button"
        aria-label={open ? "بستن منو" : "باز کردن منو"}
        onClick={() => setOpen(!open)}
        className={`fixed right-3 top-3 z-[60] rounded-full border p-2 md:hidden ${c.burger}`}
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-[4.25rem] flex-col justify-between border-l px-2 pb-3 pt-14 transition-transform duration-300 md:absolute md:translate-x-0 md:py-4 ${c.aside} ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* بالا */}
        <div className="flex flex-col items-center gap-3">
          <div className={`flex w-full flex-col items-center gap-1 border-b pb-3 ${c.line}`}>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#32796d] to-[#174f49] shadow-md shadow-black/25">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className={`text-[0.6rem] font-bold ${c.strong}`}>میزخدمت</span>
          </div>

          <nav className="flex w-full flex-col gap-2.5">
            {navItems.map(({ href, icon: Icon, label }) => {
              const active = pathname === href;
              return (
                <Tip key={href} label={label} isDarkMode={isDarkMode}>
                  <Link
                    href={href}
                    aria-label={label}
                    onClick={() => setOpen(false)}
                    style={active ? { color: "#ffffff" } : undefined}
                    className={`${circleBtn} ${
                      active
                        ? "bg-gradient-to-b from-[#287267] to-[#174f49] text-white shadow-lg shadow-black/25"
                        : `${c.circle} ${c.text}`
                    }`}
                  >
                    <Icon
                      className="h-[1.1rem] w-[1.1rem]"
                      style={active ? { color: "#ffffff", stroke: "#ffffff" } : undefined}
                    />
                  </Link>
                </Tip>
              );
            })}
          </nav>
        </div>

        {/* پایین */}
        <div className="flex flex-col items-center gap-2.5">
          {/* انتخابگر تم: روشن / سیستم / تاریک */}
          <div
            role="radiogroup"
            aria-label="تم"
            className={`flex flex-col items-center gap-1 rounded-full p-1 ${c.group}`}
          >
            {(
              [
                { mode: "light", icon: Sun, label: "روشن" },
                { mode: "system", icon: Monitor, label: "سیستم" },
                { mode: "dark", icon: Moon, label: "تاریک" },
              ] as const
            ).map(({ mode, icon: Icon, label }) => {
              const selected = themeMode === mode;
              return (
                <Tip key={mode} label={label} isDarkMode={isDarkMode}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={label}
                    onClick={() => changeTheme(mode)}
                    className={`flex h-7 w-7 items-center justify-center rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f7aab] ${
                      selected ? "bg-gradient-to-b from-[#287267] to-[#174f49] text-white" : c.text
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                </Tip>
              );
            })}
          </div>

          <Tip label={isFullscreen ? "خروج از تمام‌صفحه" : "تمام‌صفحه"} isDarkMode={isDarkMode}>
            <button
              type="button"
              aria-label="تمام‌صفحه"
              onClick={toggleFullscreen}
              className={`${circleBtn} ${c.circle} ${c.text}`}
            >
              {isFullscreen ? (
                <Minimize className="h-[1.1rem] w-[1.1rem]" />
              ) : (
                <Maximize className="h-[1.1rem] w-[1.1rem]" />
              )}
            </button>
          </Tip>

          <Tip label="علی محمدی" isDarkMode={isDarkMode}>
            <button
              type="button"
              aria-label="حساب کاربری"
              className={`${circleBtn} bg-gradient-to-br from-[#32796d] to-[#174f49] text-white shadow-md shadow-black/20 ring-1 ring-white/20`}
            >
              <User className="h-[1.1rem] w-[1.1rem]" />
            </button>
          </Tip>
        </div>
      </aside>
    </>
  );
}