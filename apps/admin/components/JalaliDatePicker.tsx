"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useTheme } from "../theme-context";
import {
  formatJalali,
  gregorianToJalali,
  jalaliMonthNames,
  jalaliToGregorian,
} from "../app/lib/jalali";

const weekDays = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

function getMonthLength(year: number, month: number) {
  const nextMonth = month === 12 ? jalaliToGregorian(year + 1, 1, 1) : jalaliToGregorian(year, month + 1, 1);
  const firstDay = jalaliToGregorian(year, month, 1);
  return Math.round((nextMonth.getTime() - firstDay.getTime()) / 86_400_000);
}

export default function JalaliDatePicker({
  value,
  onChange,
}: {
  value: Date;
  onChange: (date: Date) => void;
}) {
  const { isDarkMode } = useTheme();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(
    null
  );
  const selected = gregorianToJalali(value);
  const [shownYear, setShownYear] = useState(selected.year);
  const [shownMonth, setShownMonth] = useState(selected.month);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(320, window.innerWidth - 16);
      const gap = 6;
      const viewportPadding = 8;
      const estimatedHeight = 340;
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - gap - viewportPadding);
      const spaceAbove = Math.max(0, rect.top - gap - viewportPadding);
      const opensAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
      const maxHeight = opensAbove ? spaceAbove : spaceBelow;
      const popupHeight = popupRef.current?.getBoundingClientRect().height ?? estimatedHeight;
      const top = opensAbove
        ? Math.max(viewportPadding, rect.top - Math.min(popupHeight, maxHeight) - gap)
        : rect.bottom + gap;
      setPosition({
        top,
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
        maxHeight,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !position || !popupRef.current) return;

    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect || position.top >= triggerRect.top) return;

    const popupHeight = popupRef.current.getBoundingClientRect().height;
    const top = Math.max(8, triggerRect.top - popupHeight - 6);
    if (Math.abs(position.top - top) > 1) {
      setPosition((current) => (current ? { ...current, top } : current));
    }
  }, [open, position, shownMonth, shownYear]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !triggerRef.current?.contains(target) &&
        !popupRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const changeMonth = (amount: number) => {
    const monthIndex = shownMonth - 1 + amount;
    setShownYear(shownYear + Math.floor(monthIndex / 12));
    setShownMonth(((monthIndex % 12) + 12) % 12 + 1);
  };

  const firstDay = jalaliToGregorian(shownYear, shownMonth, 1);
  const leadingDays = (firstDay.getDay() + 1) % 7;
  const days = getMonthLength(shownYear, shownMonth);
  const theme = isDarkMode
    ? {
        panel: "border-white/10 bg-[#17332f] text-white",
        muted: "text-slate-400",
        hover: "hover:bg-white/10",
        selected: "bg-[#15554f] text-white",
        today: "border border-[#66b7a4] text-[#9ad9c8]",
        control: "border-white/10 bg-white/[0.06] hover:bg-white/10",
      }
    : {
        panel: "border-[#d5dad4] bg-white text-[#28443d]",
        muted: "text-[#68766c]",
        hover: "hover:bg-[#edf0eb]",
        selected: "bg-[#15554f] text-white",
        today: "border border-[#15554f] text-[#15554f]",
        control: "border-[#d5dad4] bg-[#f1f2ee] hover:bg-[#edf0eb]",
      };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!open) {
            setShownYear(selected.year);
            setShownMonth(selected.month);
          }
          setOpen((current) => !current);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm outline-none transition-colors focus:border-[#15554f] ${theme.control}`}
      >
        <CalendarDays className={`h-4 w-4 shrink-0 ${theme.muted}`} />
        <span className={value ? "" : theme.muted}>{value ? formatJalali(value) : "انتخاب تاریخ شمسی"}</span>
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={popupRef}
            role="dialog"
            aria-label="انتخاب تاریخ شمسی"
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              maxHeight: position.maxHeight,
            }}
            className={`z-[1100] w-80 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border p-3 shadow-xl ${theme.panel}`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label="ماه بعد"
                onClick={() => changeMonth(1)}
                className={`rounded-lg border p-1.5 ${theme.control}`}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="text-sm font-semibold">
                {jalaliMonthNames[shownMonth - 1]} {shownYear}
              </div>
              <button
                type="button"
                aria-label="ماه قبل"
                onClick={() => changeMonth(-1)}
                className={`rounded-lg border p-1.5 ${theme.control}`}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>

            <div className={`mb-1 grid grid-cols-7 text-center text-xs ${theme.muted}`}>
              {weekDays.map((day, index) => (
                <span key={`${day}-${index}`} className="py-2">
                  {day}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {Array.from({ length: leadingDays }, (_, index) => (
                <span key={`empty-${index}`} />
              ))}
              {Array.from({ length: days }, (_, index) => {
                const day = index + 1;
                const isSelected =
                  selected.year === shownYear &&
                  selected.month === shownMonth &&
                  selected.day === day;
                const todayJalali = gregorianToJalali(new Date());
                const isToday =
                  todayJalali.year === shownYear &&
                  todayJalali.month === shownMonth &&
                  todayJalali.day === day;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      onChange(jalaliToGregorian(shownYear, shownMonth, day));
                      setOpen(false);
                    }}
                    className={`h-9 rounded-lg transition-colors ${
                      isSelected ? theme.selected : isToday ? theme.today : theme.hover
                    }`}
                  >
                    {day.toLocaleString("fa-IR")}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
