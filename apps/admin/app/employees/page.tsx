"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ShieldCheck,
  Search,
  ChevronDown,
  ChevronUp,
  X,
  UserPlus,
  UserPen,
  Pencil,
  Trash2,
  Columns3,
} from "lucide-react";
import type { VisibilityState } from "@tanstack/react-table";
import { useTheme } from "../../theme-context";
import EmployeeTable from "../../components/EmployeeTable";
import PermissionsModal from "../../components/PermissionsModal";
import EmployeeFormModal from "../../components/EmployeeFormModal";
import ConfirmModal from "../../components/ConfirmModal";
import {
  Employee,
  AccessLevel,
  initialEmployees,
  initialAccessLevels,
} from "../lib/mock-employees";
import { recordSystemEvent } from "../lib/calendar-events";

const employeeColumns = [
  { id: "fullName", label: "نام و نام خانوادگی" },
  { id: "email", label: "ایمیل" },
  { id: "phone", label: "شماره تماس" },
  { id: "role", label: "نقش شغلی" },
  { id: "accessLevel", label: "سطح دسترسی" },
  { id: "status", label: "وضعیت" },
  { id: "hireDate", label: "تاریخ استخدام" },
];

export default function EmployeesPage() {
  const { isDarkMode } = useTheme();

  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [accessLevels, setAccessLevels] = useState<AccessLevel[]>(initialAccessLevels);

  const [globalFilter, setGlobalFilter] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [filteredCount, setFilteredCount] = useState(initialEmployees.length);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [calendarLogWarning, setCalendarLogWarning] = useState("");
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);

  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const updateHeight = () => setToolbarHeight(toolbar.getBoundingClientRect().height);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);

  const selectedEmployee = employees.find((e) => e.id === selectedId) ?? null;

  const logSystemActivity = async (subject: string, description: string) => {
    const actor = employees[0];
    if (!actor) {
      setCalendarLogWarning("رویداد سیستم ثبت نشد؛ کاربری برای ثبت‌کننده پیدا نشد.");
      return;
    }
    try {
      await recordSystemEvent({
        actorId: actor.id,
        subject,
        description,
        employees,
      });
      setCalendarLogWarning("");
    } catch (error) {
      console.error("ثبت رویداد سیستم در تقویم ناموفق بود:", error);
      setCalendarLogWarning("عملیات انجام شد، اما ثبت خودکار آن در تقویم ناموفق بود.");
    }
  };

  const t = isDarkMode
    ? {
        text: "text-white",
        sub: "text-white/50",
        toolbar: "border-white/10 bg-[#193632]/90 shadow-sm shadow-black/10",
        input: "border-white/10 bg-white/[0.06] text-white placeholder:text-white/40",
        chip: "border-white/15 bg-white/[0.08] text-slate-100 hover:bg-white/[0.14]",
        primary: "bg-[#15554f] text-white hover:bg-[#246b61]",
      }
    : {
        text: "text-[#28443d]",
        sub: "text-[#68766c]",
        toolbar: "border-[#d5dad4] bg-[#edf0eb]",
        input: "border-[#d5dad4] bg-[#fafbf9] text-[#28443d] placeholder:text-[#8c9587]",
        chip: "border-[#d5dad4] bg-[#fafbf9] text-[#40584e] hover:bg-[#edf0eb]",
        primary: "bg-[#15554f] text-white hover:bg-[#246b61]",
      };

  const handleAddAccessLevel = (level: AccessLevel) => {
    setAccessLevels((prev) => [...prev, level]);
    void logSystemActivity("ایجاد سطح دسترسی", `سطح دسترسی «${level.name}» ایجاد شد.`);
  };
  const handleDeleteAccessLevel = (id: string) => {
    const level = accessLevels.find((item) => item.id === id);
    setAccessLevels((prev) => prev.filter((l) => l.id !== id));
    if (level) {
      void logSystemActivity("حذف سطح دسترسی", `سطح دسترسی «${level.name}» حذف شد.`);
    }
  };

  const openCreateForm = () => {
    setFormMode("create");
    setFormOpen(true);
  };
  const openEditForm = () => {
    if (!selectedEmployee) return;
    setFormMode("edit");
    setFormOpen(true);
  };

  const handleFormSubmit = (data: Omit<Employee, "id"> & { id?: string }) => {
    if (data.id) {
      setEmployees((prev) => prev.map((e) => (e.id === data.id ? ({ ...data } as Employee) : e)));
      void logSystemActivity("ویرایش اطلاعات کارمند", `اطلاعات «${data.fullName}» ویرایش شد.`);
    } else {
      setEmployees((prev) => [...prev, { ...(data as Employee), id: `emp-${Date.now()}` }]);
      void logSystemActivity("ثبت کارمند جدید", `کارمند «${data.fullName}» ثبت شد.`);
    }
  };

  const handleDelete = () => {
    if (!selectedEmployee) return;
    setEmployees((prev) => prev.filter((e) => e.id !== selectedEmployee.id));
    void logSystemActivity("حذف کارمند", `کارمند «${selectedEmployee.fullName}» حذف شد.`);
    setSelectedId(null);
  };

  const handleImportClick = () => fileInputRef.current?.click();
  const navigateMatches = (direction: -1 | 1) => {
    if (totalMatches === 0) return;
    setActiveMatch((current) => (current + direction + totalMatches) % totalMatches);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return;
    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) return;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    const imported: Employee[] = rows.map((r, i) => ({
      id: `imp-${Date.now()}-${i}`,
      fullName: String(r["نام و نام خانوادگی"] ?? r["fullName"] ?? ""),
      email: String(r["ایمیل"] ?? r["email"] ?? ""),
      phone: String(r["شماره تماس"] ?? r["phone"] ?? ""),
      role: String(r["نقش شغلی"] ?? r["role"] ?? ""),
      accessLevelId: "",
      status: "active",
      hireDate: new Date(),
    }));

    setEmployees((prev) => [...prev, ...imported]);
    void logSystemActivity("ورود کارمندان از Excel", `${imported.length} کارمند از فایل Excel وارد شد.`);
  };

  return (
    <div className={`w-full ${t.text}`}>
      <h1 className="mb-1 flex items-center gap-2.5 text-xl font-black">
        <UserPen aria-hidden="true" className="h-7 w-7 text-[#15554f]" />
        کارمندان
      </h1>
      <p className={`mb-4 text-xs ${t.sub}`}>مدیریت اطلاعات، نقش‌ها و سطوح دسترسی کارمندان.</p>
      {calendarLogWarning && (
        <p
          role="alert"
          className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700"
        >
          {calendarLogWarning}
        </p>
      )}

      {/* نوار ابزار */}
      <div
        ref={toolbarRef}
        className={`sticky top-0 z-30 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border p-3 ${t.toolbar}`}
      >
        <button
          type="button"
          onClick={openCreateForm}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${t.primary}`}
        >
          <UserPlus className="h-3.5 w-3.5" />
          ثبت کارمند جدید
        </button>

        <button
          type="button"
          onClick={() => setPermissionsOpen(true)}
          className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs ${t.chip}`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          سطح دسترسی
        </button>

        <div className={`flex min-w-0 flex-1 items-center gap-2 rounded-full border px-3 py-2 text-xs ${t.input}`}>
          <Search className="h-3.5 w-3.5 shrink-0 opacity-60" />
          <input
            value={globalFilter}
            onChange={(e) => {
              setGlobalFilter(e.target.value);
              setActiveMatch(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                navigateMatches(e.shiftKey ? -1 : 1);
              } else if (e.key === "Escape") {
                setGlobalFilter("");
                setActiveMatch(0);
              }
            }}
            placeholder="جستجو در جدول... (Enter بعدی، Shift+Enter قبلی)"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:opacity-50"
          />
          {globalFilter && (
            <>
              <span className="shrink-0 text-[0.65rem] tabular-nums opacity-60" dir="ltr">
                {totalMatches > 0 ? `${activeMatch + 1}/${totalMatches}` : "0/0"}
              </span>
              <button
                type="button"
                onClick={() => navigateMatches(-1)}
                disabled={totalMatches === 0}
                aria-label="نتیجه قبلی"
                className="rounded-md p-1 transition-colors hover:bg-black/5 disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => navigateMatches(1)}
                disabled={totalMatches === 0}
                aria-label="نتیجه بعدی"
                className="rounded-md p-1 transition-colors hover:bg-black/5 disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setGlobalFilter("");
                  setActiveMatch(0);
                }}
                aria-label="پاک کردن جستجو"
                className="rounded-md p-1 transition-colors hover:bg-black/5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className={`flex items-center gap-1 rounded-full border p-1 ${t.chip}`}>
          <button
            type="button"
            onClick={openEditForm}
            disabled={!selectedEmployee}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Pencil className="h-3.5 w-3.5" />
            ویرایش
          </button>

          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={!selectedEmployee}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            حذف
          </button>

          <div className="relative">
            <button
              type="button"
              aria-expanded={showColumnMenu}
              onClick={() => setShowColumnMenu((open) => !open)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-black/5"
            >
              <Columns3 className="h-3.5 w-3.5" />
              ستون‌ها
            </button>
            {showColumnMenu && (
              <div
                className={`absolute left-0 top-full z-50 mt-2 w-56 rounded-xl border p-2 shadow-xl ${
                  isDarkMode
                    ? "border-white/10 bg-[#17332f] text-white"
                    : "border-[#d5dad4] bg-[#fafbf9] text-[#28443d]"
                }`}
              >
                {employeeColumns.map(({ id, label }) => (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs hover:bg-black/5"
                  >
                    <input
                      type="checkbox"
                      checked={columnVisibility[id] !== false}
                      onChange={(event) =>
                        setColumnVisibility((current) => ({
                          ...current,
                          [id]: event.target.checked,
                        }))
                      }
                      className="h-3.5 w-3.5 accent-[#15554f]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <span className={`whitespace-nowrap px-2 text-[0.7rem] ${t.sub}`}>
            {filteredCount} مورد
          </span>
        </div>

      </div>

      <EmployeeTable
        data={employees}
        accessLevels={accessLevels}
        globalFilter={globalFilter}
        selectedId={selectedId}
        onSelect={setSelectedId}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        onFilteredCountChange={setFilteredCount}
        onImportClick={handleImportClick}
        activeMatch={activeMatch}
        onActiveMatchChange={setActiveMatch}
        onMatchCountChange={setTotalMatches}
        stickyHeaderTop={toolbarHeight}
      />

      <PermissionsModal
        open={permissionsOpen}
        onClose={() => setPermissionsOpen(false)}
        accessLevels={accessLevels}
        onAdd={handleAddAccessLevel}
        onDelete={handleDeleteAccessLevel}
      />

      <EmployeeFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
        accessLevels={accessLevels}
        initial={formMode === "edit" ? selectedEmployee : null}
      />

      <ConfirmModal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        title="حذف کارمند"
        message={`آیا از حذف «${selectedEmployee?.fullName ?? ""}» مطمئن هستید؟ این عمل قابل بازگشت نیست.`}
        confirmLabel="حذف شود"
        danger
      />
    </div>
  );
}