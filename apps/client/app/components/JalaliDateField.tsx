"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
} from "lucide-react";
import { useTheme } from "../theme-context";
import { gregorianToJalali, jalaliMonthNames, jalaliToGregorian } from "../lib/jalali";

const WEEK_DAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

/** Persian/Arabic digits → ASCII so previously typed values still parse. */
function asciiDigits(input: string): string {
  return input
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

/** ``YYYY-MM-DD`` (Gregorian, zone-free) — the value the submit endpoint stores. */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function monthLength(year: number, month: number): number {
  const first = jalaliToGregorian(year, month, 1);
  const next =
    month === 12 ? jalaliToGregorian(year + 1, 1, 1) : jalaliToGregorian(year, month + 1, 1);
  return Math.round((next.getTime() - first.getTime()) / 86_400_000);
}

/**
 * Reads a form value into a Date. New pickers store ``YYYY-MM-DD`` (Gregorian);
 * older text entries may hold ``۱۴۰۳/۰۵/۱۲`` (Jalali). Both are accepted.
 */
export function parseDateValue(value: string): Date | null {
  const match = asciiDigits(value).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return null;
  if (year >= 1700) {
    const date = new Date(year, month - 1, day);
    return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }
  if (day > monthLength(year, month)) return null;
  return jalaliToGregorian(year, month, day);
}

/** Jalali label with Persian digits, e.g. ``۱۲ مرداد ۱۴۰۵``. */
export function formatJalaliValue(value: string): string {
  const date = parseDateValue(value);
  if (!date) return "";
  const { year, month, day } = gregorianToJalali(date);
  return `${day.toLocaleString("fa-IR")} ${jalaliMonthNames[month - 1]} ${year.toLocaleString("fa-IR")}`;
}

/**
 * Applicant-side Jalali date picker. Renders a read-only trigger (the stored
 * value stays Gregorian ``YYYY-MM-DD``) and a portal popup so it is never
 * clipped by the stepper's scroll container.
 */
export default function JalaliDateField({
  value,
  onChange,
  invalid = false,
  disabled = false,
  placeholder = "انتخاب تاریخ شمسی",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { isDarkMode } = useTheme();
  const today = new Date();
  const todayJalali = gregorianToJalali(today);
  const selected = parseDateValue(value);
  const selectedJalali = selected ? gregorianToJalali(selected) : null;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(
    null,
  );
  const [shownYear, setShownYear] = useState(selectedJalali?.year ?? todayJalali.year);
  const [shownMonth, setShownMonth] = useState(selectedJalali?.month ?? todayJalali.month);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(300, window.innerWidth - 16);
      const gap = 6;
      const viewportPadding = 8;
      const estimatedHeight = 350;
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
    setShownYear((current) => current + Math.floor(monthIndex / 12));
    setShownMonth((((monthIndex % 12) + 12) % 12) + 1);
  };

  const leadingDays = (jalaliToGregorian(shownYear, shownMonth, 1).getDay() + 1) % 7;
  const days = monthLength(shownYear, shownMonth);

  const theme = isDarkMode
    ? {
        trigger: "border-white/10 bg-white/[0.06] text-white",
        triggerHover: "hover:bg-white/[0.09]",
        panel: "border-white/10 bg-[#17332f] text-white",
        muted: "text-white/55",
        hover: "hover:bg-white/10",
        selected: "bg-[#15554f] text-white",
        today: "border border-[#66b7a4] text-[#9ad9c8]",
        control: "border-white/10 bg-white/[0.06] hover:bg-white/10",
        divider: "border-white/10",
        todayAction: "text-[#9ad9c8] hover:bg-white/10",
      }
    : {
        trigger: "border-[#d5dad4] bg-white text-[#28443d]",
        triggerHover: "hover:bg-[#f2f5ef]",
        panel: "border-[#d5dad4] bg-white text-[#28443d]",
        muted: "text-[#68766c]",
        hover: "hover:bg-[#edf0eb]",
        selected: "bg-[#15554f] text-white",
        today: "border border-[#15554f] text-[#15554f]",
        control: "border-[#d5dad4] bg-[#f1f2ee] hover:bg-[#edf0eb]",
        divider: "border-[#e6eae3]",
        todayAction: "text-[#15554f] hover:bg-[#15554f]/10",
      };

  const label = selected ? formatJalaliValue(value) : "";

  return (
    <>
      <div className={`relative ${className}`}>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => {
            if (!open) {
              const base = selectedJalali ?? gregorianToJalali(new Date());
              setShownYear(base.year);
              setShownMonth(base.month);
            }
            setOpen((current) => !current);
          }}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={label ? `تاریخ انتخاب‌شده: ${label}` : placeholder}
          dir="rtl"
          className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            invalid ? "border-rose-500" : ""
          } ${selected ? "pl-9" : ""} ${theme.trigger} ${disabled ? "" : theme.triggerHover}`}
        >
          <CalendarDays className={`h-4 w-4 shrink-0 ${theme.muted}`} />
          <span className={`truncate ${label ? "" : "opacity-60"}`}>{label || placeholder}</span>
        </button>
        {selected && !disabled ? (
          <button
            type="button"
            aria-label="پاک کردن تاریخ"
            onClick={() => onChange("")}
            className={`absolute left-2 top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors ${theme.muted} ${theme.hover}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {open &&
        position &&
        createPortal(
          <div
            ref={popupRef}
            role="dialog"
            aria-label="انتخاب تاریخ شمسی"
            dir="rtl"
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              maxHeight: position.maxHeight,
            }}
            className={`z-[1200] w-[300px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border p-3 shadow-xl ${theme.panel}`}
          >
            <div className="mb-3 flex items-center justify-between gap-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="ماه بعد"
                  onClick={() => changeMonth(1)}
                  className={`rounded-lg border p-1.5 ${theme.control}`}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="سال بعد"
                  onClick={() => setShownYear((current) => current + 1)}
                  className={`rounded-lg border p-1.5 ${theme.control}`}
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
              <div className="text-sm font-semibold">
                {jalaliMonthNames[shownMonth - 1]} {shownYear.toLocaleString("fa-IR")}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="سال قبل"
                  onClick={() => setShownYear((current) => current - 1)}
                  className={`rounded-lg border p-1.5 ${theme.control}`}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="ماه قبل"
                  onClick={() => changeMonth(-1)}
                  className={`rounded-lg border p-1.5 ${theme.control}`}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className={`mb-1 grid grid-cols-7 text-center text-xs ${theme.muted}`}>
              {WEEK_DAYS.map((day, index) => (
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
                  selectedJalali !== null &&
                  selectedJalali.year === shownYear &&
                  selectedJalali.month === shownMonth &&
                  selectedJalali.day === day;
                const isToday =
                  todayJalali.year === shownYear &&
                  todayJalali.month === shownMonth &&
                  todayJalali.day === day;
                return (
                  <button
                    key={day}
                    type="button"
                    aria-label={`${day} ${jalaliMonthNames[shownMonth - 1]} ${shownYear}`}
                    aria-pressed={isSelected}
                    onClick={() => {
                      onChange(toIsoDate(jalaliToGregorian(shownYear, shownMonth, day)));
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

            <div className={`mt-2 flex items-center justify-between border-t pt-2 text-[0.7rem] ${theme.divider}`}>
              <button
                type="button"
                onClick={() => {
                  onChange(toIsoDate(new Date()));
                  setOpen(false);
                }}
                className={`rounded-lg px-2 py-1 font-semibold transition-colors ${theme.todayAction}`}
              >
                امروز
              </button>
              {selected ? (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-rose-500 transition-colors hover:bg-rose-500/10"
                >
                  <X className="h-3 w-3" />
                  پاک کردن
                </button>
              ) : null}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
