"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, X } from "lucide-react";
import { useTheme } from "../theme-context";
import ThemedSelect from "./ThemedSelect";
import { jalaliToGregorian, jalaliMonthNames } from "../app/lib/jalali";

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);
const YEAR_OPTIONS = Array.from({ length: 11 }, (_, i) => 1399 + i);

export type DateRangeValue = { from?: Date; to?: Date } | undefined;

export default function JalaliDateRangeFilter({
  value,
  onChange,
  label = "بازه تاریخ",
  className = "",
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  label?: string;
  className?: string;
}) {
  const { isDarkMode } = useTheme();
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [fromDay, setFromDay] = useState("");
  const [fromMonth, setFromMonth] = useState("");
  const [fromYear, setFromYear] = useState("");
  const [toDay, setToDay] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [toYear, setToYear] = useState("");

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const panelWidth = Math.min(256, window.innerWidth - 16);
      const left = Math.max(8, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 8));
      const top = rect.bottom + 6;
      const maxHeight = Math.max(80, window.innerHeight - top - 8);

      setPanelPosition({ top, left, maxHeight });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const t = isDarkMode
    ? {
        btn: "border-white/10 bg-white/[0.05] text-white/80 hover:bg-white/10",
        panel: "border-white/10 bg-[#17332f] text-white",
        select: "rounded-lg border border-white/10 bg-white/[0.06] px-1 py-1 text-[0.65rem] text-white/80",
        optionBg: "#ffffff",
        optionText: "#111827",
      }
    : {
        btn: "border-[#d5dad4] bg-white text-[#40584e] hover:bg-[#edf0eb]",
        panel: "border-[#d5dad4] bg-white text-[#28443d]",
        select: "rounded-lg border border-[#d5dad4] bg-white px-1 py-1 text-[0.65rem] text-[#40584e]",
        optionBg: "#ffffff",
        optionText: "#111827",
      };

  const opt = (label: string | number, val: string | number) => (
    <option key={val} value={val} style={{ background: t.optionBg, color: t.optionText }}>
      {label}
    </option>
  );

  const apply = () => {
    const from =
      fromDay && fromMonth && fromYear
        ? jalaliToGregorian(+fromYear, +fromMonth, +fromDay)
        : undefined;
    const to =
      toDay && toMonth && toYear
        ? (() => {
            const d = jalaliToGregorian(+toYear, +toMonth, +toDay);
            d.setHours(23, 59, 59, 999);
            return d;
          })()
        : undefined;
    onChange(from || to ? { from, to } : undefined);
    setOpen(false);
  };

  const clear = () => {
    setFromDay("");
    setFromMonth("");
    setFromYear("");
    setToDay("");
    setToMonth("");
    setToYear("");
    onChange(undefined);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-1 rounded-lg border px-1.5 py-1 text-[0.65rem] ${t.btn} ${className}`}
      >
        <CalendarDays className="h-3 w-3" />
        {value?.from || value?.to ? "بازه فعال" : label}
      </button>

      {open && panelPosition && createPortal(
        <div
          style={{
            position: "fixed",
            top: panelPosition.top,
            left: panelPosition.left,
            maxHeight: panelPosition.maxHeight,
          }}
          className={`z-[1000] w-64 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border p-3 shadow-xl ${t.panel}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold">{label}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="بستن">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mb-2">
            <div className="mb-1 text-[0.65rem] opacity-60">از تاریخ</div>
            <div className="flex gap-1">
              <ThemedSelect value={fromDay} onChange={(e) => setFromDay(e.target.value)} className={`${t.select} pl-5 pr-1`} arrowClassName={`left-1 h-3 w-3 ${isDarkMode ? "text-white/55" : "text-[#68766c]"}`}>
                {opt("روز", "")}
                {DAY_OPTIONS.map((d) => opt(d, d))}
              </ThemedSelect>
              <ThemedSelect value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} className={`${t.select} pl-5 pr-1`} arrowClassName={`left-1 h-3 w-3 ${isDarkMode ? "text-white/55" : "text-[#68766c]"}`}>
                {opt("ماه", "")}
                {jalaliMonthNames.map((m, i) => opt(m, i + 1))}
              </ThemedSelect>
              <ThemedSelect value={fromYear} onChange={(e) => setFromYear(e.target.value)} className={`${t.select} pl-5 pr-1`} arrowClassName={`left-1 h-3 w-3 ${isDarkMode ? "text-white/55" : "text-[#68766c]"}`}>
                {opt("سال", "")}
                {YEAR_OPTIONS.map((y) => opt(y, y))}
              </ThemedSelect>
            </div>
          </div>

          <div className="mb-3">
            <div className="mb-1 text-[0.65rem] opacity-60">تا تاریخ</div>
            <div className="flex gap-1">
              <ThemedSelect value={toDay} onChange={(e) => setToDay(e.target.value)} className={`${t.select} pl-5 pr-1`} arrowClassName={`left-1 h-3 w-3 ${isDarkMode ? "text-white/55" : "text-[#68766c]"}`}>
                {opt("روز", "")}
                {DAY_OPTIONS.map((d) => opt(d, d))}
              </ThemedSelect>
              <ThemedSelect value={toMonth} onChange={(e) => setToMonth(e.target.value)} className={`${t.select} pl-5 pr-1`} arrowClassName={`left-1 h-3 w-3 ${isDarkMode ? "text-white/55" : "text-[#68766c]"}`}>
                {opt("ماه", "")}
                {jalaliMonthNames.map((m, i) => opt(m, i + 1))}
              </ThemedSelect>
              <ThemedSelect value={toYear} onChange={(e) => setToYear(e.target.value)} className={`${t.select} pl-5 pr-1`} arrowClassName={`left-1 h-3 w-3 ${isDarkMode ? "text-white/55" : "text-[#68766c]"}`}>
                {opt("سال", "")}
                {YEAR_OPTIONS.map((y) => opt(y, y))}
              </ThemedSelect>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button type="button" onClick={clear} className="text-[0.65rem] opacity-60 hover:opacity-100">
              پاک کردن
            </button>
            <button
              type="button"
              onClick={apply}
              className="rounded-full bg-[#15554f] px-3 py-1 text-[0.65rem] text-white hover:bg-[#246b61]"
            >
              اعمال
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}