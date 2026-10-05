"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { useTheme } from "../../theme-context";
import Modal from "../../components/Modal";
import ConfirmModal from "../../components/ConfirmModal";
import JalaliDatePicker from "../../components/JalaliDatePicker";
import ThemedSelect from "../../components/ThemedSelect";
import { initialEmployees } from "../lib/mock-employees";
import {
  type CalendarEvent,
  type CalendarEventType,
  deleteCalendarEvent,
  loadCalendarEvents,
  saveCalendarEvent,
} from "../lib/calendar-events";
import { gregorianToJalali, jalaliMonthNames, jalaliToGregorian } from "../lib/jalali";

const EVENT_TYPES: {
  id: CalendarEventType;
  label: string;
  color: string;
  darkColor: string;
}[] = [
  { id: "task", label: "وظایف کارمندان", color: "#16a36a", darkColor: "#34d399" },
  { id: "system", label: "رویدادهای سیستم", color: "#d99a16", darkColor: "#fbbf24" },
  { id: "public-request", label: "درخواست‌های مردمی", color: "#3979b8", darkColor: "#60a5fa" },
];

const WEEK_DAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

function formatNumber(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value);
}

function formatYear(value: number) {
  return new Intl.NumberFormat("fa-IR", { useGrouping: false }).format(value);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function jalaliDateKey(date: Date) {
  const { year, month, day } = gregorianToJalali(date);
  return `${year}-${month}-${day}`;
}

function getMonthLength(year: number, month: number) {
  const firstDay = jalaliToGregorian(year, month, 1);
  const nextMonth =
    month === 12 ? jalaliToGregorian(year + 1, 1, 1) : jalaliToGregorian(year, month + 1, 1);
  return Math.round((nextMonth.getTime() - firstDay.getTime()) / 86_400_000);
}

function getDayEvents(events: CalendarEvent[], date: Date) {
  const key = dateKey(date);
  return events.filter((event) => {
    const startsAt = new Date(event.startsAt);
    const endsAt = new Date(event.endsAt);
    return dateKey(startsAt) <= key && key <= dateKey(endsAt);
  });
}

function withTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return result;
}

function toDateTime(date: string, time: string) {
  if (!date || !time) return null;
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return null;
  return withTime(jalaliToGregorian(year, month, day), time);
}

function formatEventTime(value: string) {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
}

function TimePicker({
  value,
  onChange,
  label,
  isDarkMode,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  isDarkMode: boolean;
}) {
  const [hour = "09", minute = "00"] = value.split(":");
  const controlClass = isDarkMode
    ? "border-white/10 bg-white/[0.06] text-white"
    : "border-[#d5dad4] bg-white text-[#28443d]";

  return (
    <div
      dir="ltr"
      className={`mt-2 flex items-center gap-1.5 rounded-xl border px-3 py-2 ${controlClass}`}
    >
      <Clock3 className="h-4 w-4 shrink-0 opacity-60" />
      <select
        aria-label={`${label} - ساعت`}
        value={hour}
        onChange={(event) => onChange(`${event.target.value}:${minute}`)}
        className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-center text-sm outline-none"
      >
        {Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0")).map((item) => (
          <option key={item} value={item} style={{ backgroundColor: "#fff", color: "#111827" }}>
            {formatNumber(Number(item))}
          </option>
        ))}
      </select>
      <span className="text-sm opacity-60">:</span>
      <select
        aria-label={`${label} - دقیقه`}
        value={minute}
        onChange={(event) => onChange(`${hour}:${event.target.value}`)}
        className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-center text-sm outline-none"
      >
        {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map((item) => (
          <option key={item} value={item} style={{ backgroundColor: "#fff", color: "#111827" }}>
            {formatNumber(Number(item))}
          </option>
        ))}
      </select>
    </div>
  );
}

function EventDetailsModal({
  eventDate,
  events,
  onClose,
  onEdit,
  onRequestDelete,
  isDarkMode,
}: {
  eventDate: Date | null;
  events: CalendarEvent[];
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
  onRequestDelete: (event: CalendarEvent) => void;
  isDarkMode: boolean;
}) {
  const t = isDarkMode
    ? {
        sub: "text-white/55",
        card: "border-white/10 bg-white/[0.04]",
        title: "text-white",
        badge: "bg-white/[0.07] text-white/80",
      }
    : {
        sub: "text-[#68766c]",
        card: "border-[#d5dad4] bg-[#f6f7f4]",
        title: "text-[#28443d]",
        badge: "bg-[#edf0eb] text-[#40584e]",
      };

  return (
    <Modal
      open={eventDate !== null}
      onClose={onClose}
      title={eventDate ? `رویدادهای ${formatNumber(gregorianToJalali(eventDate).day)} ${jalaliMonthNames[gregorianToJalali(eventDate).month - 1]}` : "جزئیات رویداد"}
      maxWidthClass="max-w-xl"
    >
      <div className="space-y-3">
        {events.map((event) => {
          const type = EVENT_TYPES.find((item) => item.id === event.type)!;
          const creator = initialEmployees.find((employee) => employee.id === event.createdBy);
          const recipients = event.recipientIds
            .map((id) => initialEmployees.find((employee) => employee.id === id)?.fullName)
            .filter(Boolean);
          return (
            <article key={event.id} className={`rounded-2xl border p-4 ${t.card}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className={`text-sm font-bold ${t.title}`}>{event.subject}</h3>
                <span
                  className="rounded-full px-2.5 py-1 text-[0.65rem] font-medium"
                  style={{
                    color: isDarkMode ? type.darkColor : type.color,
                    backgroundColor: `${isDarkMode ? type.darkColor : type.color}18`,
                  }}
                >
                  {type.label}
                </span>
              </div>
              <p className={`whitespace-pre-wrap text-xs leading-6 ${t.sub}`}>
                {event.description || "توضیحی ثبت نشده است."}
              </p>
              <div className={`mt-3 grid gap-2 border-t border-current/10 pt-3 text-[0.68rem] sm:grid-cols-2 ${t.sub}`}>
                <p>از طرف: {creator?.fullName ?? "کارمند"}</p>
                <p className="flex items-center gap-1">
                  <UsersRound className="h-3.5 w-3.5" />
                  برای: {recipients.length ? recipients.join("، ") : "همه"}
                </p>
                <p>ایجاد: {formatEventTime(event.createdAt)}</p>
                <p className="sm:col-span-2">
                  زمان اجرا: {formatEventTime(event.startsAt)} تا {formatEventTime(event.endsAt)}
                </p>
              </div>
              {event.type === "task" && (
                <div className="mt-4 flex justify-end gap-2 border-t border-current/10 pt-3">
                  <button
                    type="button"
                    onClick={() => onEdit(event)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#15554f]/20 px-3 py-1.5 text-xs text-[#15554f] transition hover:bg-[#15554f]/10"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    ویرایش
                  </button>
                  <button
                    type="button"
                    onClick={() => onRequestDelete(event)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/20 px-3 py-1.5 text-xs text-rose-600 transition hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    حذف
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {events.length === 0 && <p className={`py-8 text-center text-sm ${t.sub}`}>رویدادی برای این روز ثبت نشده است.</p>}
      </div>
    </Modal>
  );
}

export default function CalendarPage() {
  const { isDarkMode } = useTheme();
  const [today, setToday] = useState<Date | null>(null);
  const [shownMonth, setShownMonth] = useState<{ year: number; month: number } | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [enabledTypes, setEnabledTypes] = useState<Record<CalendarEventType, boolean>>({
    task: true,
    system: true,
    "public-request": true,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [detailsDate, setDetailsDate] = useState<Date | null>(null);
  const [detailsEvents, setDetailsEvents] = useState<CalendarEvent[]>([]);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  const [storageError, setStorageError] = useState("");
  const [formError, setFormError] = useState("");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [startsDate, setStartsDate] = useState<Date>(new Date());
  const [endsDate, setEndsDate] = useState<Date>(new Date());
  const [startsTime, setStartsTime] = useState("09:00");
  const [endsTime, setEndsTime] = useState("10:00");
  const [createdAt, setCreatedAt] = useState(new Date());
  const currentUser = initialEmployees[0];

  useEffect(() => {
    const now = new Date();
    setToday(now);
    setShownMonth(gregorianToJalali(now));
    setStartsDate(now);
    setEndsDate(now);
    setCreatedAt(now);
    loadCalendarEvents()
      .then(setEvents)
      .catch((error: unknown) => {
        console.error("بارگذاری رویدادهای تقویم ناموفق بود:", error);
        setStorageError("بارگذاری رویدادها ناموفق بود. ذخیره‌سازی مرورگر را بررسی کنید.");
      });
  }, []);

  const t = isDarkMode
    ? {
        text: "text-white",
        sub: "text-white/50",
        toolbar: "border-white/10 bg-[#193632]/90",
        control: "border-white/10 bg-white/[0.06] text-white hover:bg-white/10",
        calendar: "border-white/10 bg-[#17332f]",
        cell: "border-white/[0.07] bg-[#193632]/60 hover:bg-white/[0.055]",
        mutedCell: "bg-white/[0.015] text-white/25",
        input: "border-white/10 bg-white/[0.06] text-white placeholder:text-white/35",
        panel: "border-white/[0.08] bg-white/[0.035]",
      }
    : {
        text: "text-[#28443d]",
        sub: "text-[#68766c]",
        toolbar: "border-[#d5dad4] bg-[#edf0eb]",
        control: "border-[#d5dad4] bg-white text-[#40584e] hover:bg-[#edf0eb]",
        calendar: "border-[#d5dad4] bg-white",
        cell: "border-[#e6e9e3] bg-white hover:bg-[#fafbf9]",
        mutedCell: "bg-[#f6f7f4] text-[#9b927e]",
        input: "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]",
        panel: "border-[#d5dad4] bg-[#f6f7f4]",
      };

  const visibleEvents = useMemo(
    () => events.filter((event) => enabledTypes[event.type]),
    [events, enabledTypes]
  );
  const calendarCells = useMemo(() => {
    if (!shownMonth) return [];
    const firstDay = jalaliToGregorian(shownMonth.year, shownMonth.month, 1);
    const leadingDays = (firstDay.getDay() + 1) % 7;
    const monthLength = getMonthLength(shownMonth.year, shownMonth.month);
    return Array.from({ length: Math.ceil((leadingDays + monthLength) / 7) * 7 }, (_, index) => {
      const day = index - leadingDays + 1;
      return day > 0 && day <= monthLength
        ? jalaliToGregorian(shownMonth.year, shownMonth.month, day)
        : null;
    });
  }, [shownMonth]);

  const filteredMembers = initialEmployees.filter((employee) =>
    employee.fullName.toLowerCase().includes(recipientQuery.trim().toLowerCase())
  );
  const yearOptions = today
    ? Array.from(
        { length: 11 },
        (_, index) => (shownMonth?.year ?? gregorianToJalali(today).year) - 5 + index
      )
    : [];

  const moveMonth = (amount: number) => {
    setShownMonth((current) => {
      if (!current) return current;
      const monthIndex = current.month - 1 + amount;
      return {
        year: current.year + Math.floor(monthIndex / 12),
        month: ((monthIndex % 12) + 12) % 12 + 1,
      };
    });
  };

  const resetForm = () => {
    const now = new Date();
    setEditingEventId(null);
    setSubject("");
    setDescription("");
    setRecipientIds([]);
    setRecipientQuery("");
    setRecipientPickerOpen(false);
    setStartsDate(now);
    setEndsDate(now);
    setStartsTime("09:00");
    setEndsTime("10:00");
    setCreatedAt(now);
    setFormError("");
  };

  const openCreateModal = () => {
    resetForm();
    setCreateOpen(true);
  };

  const openCreateModalForDate = (date: Date) => {
    resetForm();
    setStartsDate(date);
    setEndsDate(date);
    setCreateOpen(true);
  };

  const openEditModal = (event: CalendarEvent) => {
    setEditingEventId(event.id);
    setSubject(event.subject);
    setDescription(event.description);
    setRecipientIds(event.recipientIds);
    setRecipientQuery("");
    setRecipientPickerOpen(false);
    setStartsDate(new Date(event.startsAt));
    setEndsDate(new Date(event.endsAt));
    setStartsTime(new Date(event.startsAt).toTimeString().slice(0, 5));
    setEndsTime(new Date(event.endsAt).toTimeString().slice(0, 5));
    setCreatedAt(new Date(event.createdAt));
    setFormError("");
    setDetailsDate(null);
    setCreateOpen(true);
  };

  const createTask = async () => {
    const start = toDateTime(jalaliDateKey(startsDate), startsTime);
    const end = toDateTime(jalaliDateKey(endsDate), endsTime);
    if (!subject.trim()) {
      setFormError("موضوع رویداد را وارد کنید.");
      return;
    }
    if (recipientIds.length === 0) {
      setFormError("حداقل یک کارمند را برای این وظیفه انتخاب کنید.");
      return;
    }
    if (!currentUser) {
      setFormError("حساب کاربری فعلی مشخص نیست.");
      return;
    }
    if (!start || !end || end < start) {
      setFormError("زمان پایان باید پس از زمان شروع باشد.");
      return;
    }

    const existingEvent = editingEventId
      ? events.find((event) => event.id === editingEventId)
      : undefined;
    const event: CalendarEvent = {
      id: existingEvent?.id ?? crypto.randomUUID(),
      type: "task",
      createdBy: existingEvent?.createdBy ?? currentUser.id,
      recipientIds,
      subject: subject.trim(),
      description: description.trim(),
      createdAt: existingEvent?.createdAt ?? createdAt.toISOString(),
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    };
    try {
      await saveCalendarEvent(event);
      setEvents((current) =>
        existingEvent
          ? current.map((item) => (item.id === event.id ? event : item))
          : [...current, event]
      );
      if (existingEvent) setDetailsDate(null);
      setCreateOpen(false);
      setEditingEventId(null);
      setFormError("");
    } catch (error) {
      console.error("ثبت وظیفه در تقویم ناموفق بود:", error);
      setFormError("ذخیره رویداد انجام نشد. فضای ذخیره‌سازی مرورگر را بررسی کنید.");
    }
  };

  const removeEvent = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCalendarEvent(deleteTarget.id);
      setEvents((current) => current.filter((event) => event.id !== deleteTarget.id));
      setDetailsEvents((current) => current.filter((event) => event.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      console.error("حذف رویداد تقویم ناموفق بود:", error);
      setStorageError("حذف رویداد انجام نشد. فضای ذخیره‌سازی مرورگر را بررسی کنید.");
      setDeleteTarget(null);
    }
  };

  const openDayDetails = (date: Date, type: CalendarEventType) => {
    setDetailsDate(date);
    setDetailsEvents(getDayEvents(visibleEvents, date).filter((event) => event.type === type));
  };

  return (
    <div className={`w-full ${t.text}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <CalendarDays className="h-7 w-7 text-[#15554f]" />
          <div>
            <h1 className="text-xl font-black">تقویم کاری</h1>
            <p className={`mt-0.5 text-xs ${t.sub}`}>برنامه‌ی کارمندان و رویدادهای سازمان</p>
          </div>
        </div>
      </div>

      <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 ${t.toolbar}`}>
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#15554f] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#246b61]"
          >
            <Plus className="h-4 w-4" />
            ثبت رویداد
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="ماه قبل"
              onClick={() => moveMonth(-1)}
              className={`rounded-xl border p-2 transition-colors ${t.control}`}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <ThemedSelect
              aria-label="ماه تقویم"
              value={shownMonth?.month ?? ""}
              disabled={!shownMonth}
              onChange={(event) =>
                setShownMonth((current) =>
                  current ? { ...current, month: Number(event.target.value) } : current
                )
              }
              className={`rounded-xl border py-2 pl-8 pr-3 text-xs outline-none ${t.control}`}
              arrowClassName={`left-3 ${isDarkMode ? "text-white/55" : "text-[#68766c]"}`}
            >
              {!shownMonth && <option value="">در حال بارگذاری...</option>}
              {jalaliMonthNames.map((month, index) => (
                <option key={month} value={index + 1} style={{ backgroundColor: "#fff", color: "#111827" }}>
                  {month}
                </option>
              ))}
            </ThemedSelect>
            <ThemedSelect
              aria-label="سال تقویم"
              value={shownMonth?.year ?? ""}
              disabled={!shownMonth}
              onChange={(event) =>
                setShownMonth((current) =>
                  current ? { ...current, year: Number(event.target.value) } : current
                )
              }
              className={`rounded-xl border py-2 pl-8 pr-3 text-xs outline-none ${t.control}`}
              arrowClassName={`left-3 ${isDarkMode ? "text-white/55" : "text-[#68766c]"}`}
            >
              {!shownMonth && <option value="">در حال بارگذاری...</option>}
              {yearOptions.map((year) => (
                <option key={year} value={year} style={{ backgroundColor: "#fff", color: "#111827" }}>
                  {formatYear(year)}
                </option>
              ))}
            </ThemedSelect>
            {today && (
              <span className={`whitespace-nowrap rounded-xl px-2.5 py-2 text-xs ${t.sub}`}>
                امروز: {formatNumber(gregorianToJalali(today).day)}{" "}
                {jalaliMonthNames[gregorianToJalali(today).month - 1]}
              </span>
            )}
            <button
              type="button"
              aria-label="ماه بعد"
              onClick={() => moveMonth(1)}
              className={`rounded-xl border p-2 transition-colors ${t.control}`}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2">
          {EVENT_TYPES.map((type) => (
            <button
              key={type.id}
              type="button"
              aria-pressed={enabledTypes[type.id]}
              onClick={() =>
                setEnabledTypes((current) => ({ ...current, [type.id]: !current[type.id] }))
              }
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-opacity ${
                enabledTypes[type.id] ? "opacity-100" : "opacity-45"
              } ${t.panel}`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: isDarkMode ? type.darkColor : type.color }}
              />
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {storageError && (
        <div role="alert" className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600">
          {storageError}
        </div>
      )}

      <div className={`overflow-hidden rounded-2xl border shadow-sm ${t.calendar}`}>
        <div className="grid grid-cols-7 border-b border-current/10">
          {WEEK_DAYS.map((day) => (
            <div key={day} className={`px-1 py-3 text-center text-[0.65rem] font-semibold sm:text-xs ${t.sub}`}>
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {shownMonth ? calendarCells.map((date, index) => {
            if (!date || !shownMonth) {
              return (
                <div
                  key={`empty-${index}`}
                  className={`min-h-24 border-b border-l border-current/[0.06] p-1 sm:min-h-32 sm:p-2 ${t.mutedCell}`}
                />
              );
            }
            const isToday = today !== null && dateKey(date) === dateKey(today);
            const dayEvents = getDayEvents(visibleEvents, date);
            return (
              <div
                key={dateKey(date)}
                onDoubleClick={() => openCreateModalForDate(date)}
                className={`min-h-24 border-b border-l p-1 transition-colors sm:min-h-32 sm:p-2 ${
                  t.cell
                } cursor-pointer ${isToday ? "ring-2 ring-inset ring-[#15554f]/60" : ""}`}
                title="برای ثبت رویداد، دوبار کلیک کنید"
              >
                <div className="mb-2 flex items-start justify-between">
                  <span
                    className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-semibold ${
                      isToday ? "bg-[#15554f] text-white" : ""
                    }`}
                  >
                    {formatNumber(gregorianToJalali(date).day)}
                  </span>
                  {dayEvents.length > 0 && (
                    <span className={`hidden text-[0.6rem] sm:inline ${t.sub}`}>
                      {formatNumber(dayEvents.length)} رویداد
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {EVENT_TYPES.filter((type) => enabledTypes[type.id]).map((type) => {
                    const count = dayEvents.filter((event) => event.type === type.id).length;
                    if (count === 0) return null;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => openDayDetails(date, type.id)}
                        aria-label={`${formatNumber(count)} ${type.label} در ${formatNumber(gregorianToJalali(date).day)} ${jalaliMonthNames[shownMonth.month - 1]}`}
                        title={type.label}
                        className="flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-[0.65rem] font-bold text-white transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15554f]"
                        style={{ backgroundColor: isDarkMode ? type.darkColor : type.color }}
                      >
                        {formatNumber(count)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }) : (
            <p className={`col-span-7 py-16 text-center text-sm ${t.sub}`}>
              در حال بارگذاری تقویم...
            </p>
          )}
        </div>
      </div>

      <div className={`mt-3 flex flex-wrap items-start gap-2 text-[0.68rem] leading-5 ${t.sub}`}>
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        رویدادهای وظیفه در این مرورگر ذخیره می‌شوند؛ ثبت خودکار رویدادهای سیستم و همگام‌سازی درخواست‌های مردمی به اتصال backend نیاز دارد.
      </div>

      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setEditingEventId(null);
          setRecipientPickerOpen(false);
        }}
        title={editingEventId ? "ویرایش رویداد کاری" : "ثبت رویداد کاری"}
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-4">
          <section className={`rounded-2xl border p-4 ${t.panel}`}>
            <h3 className={`mb-3 flex items-center gap-2 text-xs font-semibold ${t.sub}`}>
              <CalendarDays className="h-4 w-4" />
              اطلاعات رویداد
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={`mb-1.5 block text-xs font-medium ${t.sub}`} htmlFor="event-author">
                  از طرف
                </label>
                <div
                  id="event-author"
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${t.input}`}
                >
                  <ShieldCheck className={`h-4 w-4 ${t.sub}`} />
                  {currentUser?.fullName ?? "کاربر جاری"}
                  <span className={`mr-auto text-[0.65rem] ${t.sub}`}>ثبت‌کننده</span>
                </div>
                <p className={`mt-1.5 text-[0.65rem] leading-5 ${t.sub}`}>
                  هویت ورود کاربر در نسخه‌ی فعلی پنل تعریف نشده؛ نام بالا حساب پیش‌فرض پنل است.
                </p>
              </div>
              <div className="relative sm:col-span-2">
                <label className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                  برای چه کارمندانی است؟
                </label>
                <button
                  type="button"
                  aria-expanded={recipientPickerOpen}
                  onClick={() => setRecipientPickerOpen((open) => !open)}
                  className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-right text-xs outline-none transition focus:border-[#15554f] ${t.input}`}
                >
                  <UsersRound className={`h-4 w-4 shrink-0 ${t.sub}`} />
                  <span className="min-w-0 flex-1 truncate">
                    {recipientIds.length
                      ? initialEmployees
                          .filter((employee) => recipientIds.includes(employee.id))
                          .map((employee) => employee.fullName)
                          .join("، ")
                      : "انتخاب کارمندان"}
                  </span>
                  {recipientIds.length > 0 && (
                    <span className="shrink-0 rounded-full bg-[#15554f]/15 px-2 py-0.5 text-[0.65rem] text-[#15554f]">
                      {formatNumber(recipientIds.length)}
                    </span>
                  )}
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${recipientPickerOpen ? "rotate-180" : ""}`} />
                </button>
                {recipientPickerOpen && (
                  <div className={`absolute inset-x-0 top-full z-40 mt-2 rounded-xl border p-2 shadow-xl ${t.panel}`}>
                    <div className={`mb-2 flex items-center gap-2 rounded-lg border px-2.5 py-2 ${t.input}`}>
                      <Search className={`h-3.5 w-3.5 ${t.sub}`} />
                      <input
                        value={recipientQuery}
                        onChange={(event) => setRecipientQuery(event.target.value)}
                        placeholder="جستجوی کارمند..."
                        className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                      />
                      {recipientQuery && (
                        <button
                          type="button"
                          aria-label="پاک کردن جستجوی کارمند"
                          onClick={() => setRecipientQuery("")}
                        >
                          <X className={`h-3.5 w-3.5 ${t.sub}`} />
                        </button>
                      )}
                    </div>
                    <div className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                      {filteredMembers.map((employee) => {
                        const selected = recipientIds.includes(employee.id);
                        return (
                          <button
                            key={employee.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() =>
                              setRecipientIds((current) =>
                                selected
                                  ? current.filter((id) => id !== employee.id)
                                  : [...current, employee.id]
                              )
                            }
                            className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-right text-xs transition ${
                              selected
                                ? "bg-[#15554f]/10 text-[#15554f]"
                                : isDarkMode
                                  ? "text-white hover:bg-white/[0.06]"
                                  : "text-[#28443d] hover:bg-[#edf0eb]"
                            }`}
                          >
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              selected
                                ? "border-[#15554f] bg-[#15554f] text-white"
                                : "border-current/30"
                            }`}>
                              {selected && <Check className="h-3 w-3" />}
                            </span>
                            <span className="truncate">{employee.fullName}</span>
                          </button>
                        );
                      })}
                      {filteredMembers.length === 0 && (
                        <p className={`col-span-2 px-2 py-4 text-center text-xs ${t.sub}`}>
                          کارمندی پیدا نشد.
                        </p>
                      )}
                    </div>
                    <div className={`mt-2 flex items-center justify-between border-t border-current/10 pt-2 text-[0.65rem] ${t.sub}`}>
                      <span>{formatNumber(recipientIds.length)} کارمند انتخاب شده</span>
                      <button
                        type="button"
                        onClick={() => setRecipientPickerOpen(false)}
                        className="rounded-md px-2 py-1 text-[#15554f] hover:bg-[#15554f]/10"
                      >
                        تأیید انتخاب
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className={`mb-1.5 block text-xs font-medium ${t.sub}`} htmlFor="event-subject">
                  موضوع
                </label>
                <input
                  id="event-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="موضوع رویداد یا وظیفه"
                  className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[#15554f] ${t.input}`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={`mb-1.5 block text-xs font-medium ${t.sub}`} htmlFor="event-description">
                  توضیحات
                </label>
                <textarea
                  id="event-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  placeholder="جزئیات و توضیحات تکمیلی"
                  className={`w-full resize-y rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[#15554f] ${t.input}`}
                />
              </div>
              <div className="sm:col-span-2">
                <p className={`mb-1.5 text-xs font-medium ${t.sub}`}>تاریخ و ساعت ایجاد</p>
                <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${t.input}`}>
                  <Clock3 className={`h-4 w-4 ${t.sub}`} />
                  {formatEventTime(createdAt.toISOString())}
                  <span className={`mr-auto ${t.sub}`}>زمان ثبت خودکار</span>
                </div>
              </div>
            </div>
          </section>

          <section className={`rounded-2xl border p-4 ${t.panel}`}>
            <h3 className={`mb-3 flex items-center gap-2 text-xs font-semibold ${t.sub}`}>
              <Clock3 className="h-4 w-4" />
              بازه‌ی اجرای رویداد
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={`mb-1.5 block text-xs ${t.sub}`}>شروع</label>
                <JalaliDatePicker value={startsDate} onChange={setStartsDate} />
                <TimePicker
                  value={startsTime}
                  onChange={setStartsTime}
                  label="ساعت شروع"
                  isDarkMode={isDarkMode}
                />
              </div>
              <div>
                <label className={`mb-1.5 block text-xs ${t.sub}`}>پایان</label>
                <JalaliDatePicker value={endsDate} onChange={setEndsDate} />
                <TimePicker
                  value={endsTime}
                  onChange={setEndsTime}
                  label="ساعت پایان"
                  isDarkMode={isDarkMode}
                />
              </div>
            </div>
          </section>

          {formError && (
            <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-current/10 pt-4">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className={`rounded-xl border px-4 py-2 text-xs ${t.control}`}
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={() => void createTask()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#15554f] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#246b61]"
            >
              {editingEventId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingEventId ? "ذخیره تغییرات" : "ثبت رویداد"}
            </button>
          </div>
        </div>
      </Modal>

      <EventDetailsModal
        eventDate={detailsDate}
        events={detailsEvents}
        onClose={() => setDetailsDate(null)}
        onEdit={openEditModal}
        onRequestDelete={setDeleteTarget}
        isDarkMode={isDarkMode}
      />
      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void removeEvent()}
        title="حذف رویداد"
        message={`آیا از حذف رویداد «${deleteTarget?.subject ?? ""}» مطمئن هستید؟ این کار قابل بازگشت نیست.`}
        confirmLabel="حذف رویداد"
        danger
      />
    </div>
  );
}
