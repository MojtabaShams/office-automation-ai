"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Columns3,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserPen,
  UserPlus,
  X,
} from "lucide-react";
import type { VisibilityState } from "@tanstack/react-table";
import { useTheme } from "../../theme-context";
import { useAuth } from "../auth-context";
import EmployeeTable from "../../components/EmployeeTable";
import EmployeeFormModal from "../../components/EmployeeFormModal";
import ConfirmModal from "../../components/ConfirmModal";
import ThemedSelect from "../../components/ThemedSelect";
import {
  createUser,
  deleteUser,
  listRoles,
  listUsers,
  updateUser,
  type Role,
} from "../lib/admin-api";
import {
  toEmployee,
  type Employee,
  type EmployeeFormValues,
} from "../lib/employee-view";

const employeeColumns = [
  { id: "fullName", label: "نام و نام خانوادگی" },
  { id: "email", label: "ایمیل" },
  { id: "phone", label: "شماره تماس" },
  { id: "unit", label: "واحد سازمانی" },
  { id: "role", label: "نقش" },
  { id: "status", label: "وضعیت" },
  { id: "lastLoginAt", label: "آخرین ورود" },
];

export default function EmployeesPage() {
  const { isDarkMode } = useTheme();
  const { hasPermission } = useAuth();

  const canCreate = hasPermission("employees", "create");
  const canUpdate = hasPermission("employees", "update");
  const canDelete = hasPermission("employees", "delete");
  const canViewRoles = hasPermission("roles", "view");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [globalFilter, setGlobalFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const [totalMatches, setTotalMatches] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [filteredCount, setFilteredCount] = useState(0);
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  const [mainPaddingTop, setMainPaddingTop] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [usersPayload, rolesPayload] = await Promise.all([
        listUsers({ limit: 500 }),
        listRoles(),
      ]);
      setEmployees(usersPayload.users.map(toEmployee));
      setRoles(rolesPayload.roles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "بارگذاری فهرست کارمندان ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    const main = document.getElementById("admin-main-scroll");
    if (!toolbar) return;

    const updateMetrics = () => {
      setToolbarHeight(toolbar.offsetHeight);
      if (main) {
        setMainPaddingTop(parseFloat(getComputedStyle(main).paddingTop) || 0);
      }
    };

    updateMetrics();
    const observer = new ResizeObserver(updateMetrics);
    observer.observe(toolbar);
    if (main) observer.observe(main);
    window.addEventListener("resize", updateMetrics);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateMetrics);
    };
  }, []);

  const visibleEmployees = useMemo(
    () =>
      employees.filter((employee) => {
        if (roleFilter && employee.roleId !== roleFilter) return false;
        if (statusFilter && employee.status !== statusFilter) return false;
        return true;
      }),
    [employees, roleFilter, statusFilter],
  );

  const selectedEmployee =
    visibleEmployees.find((employee) => employee.id === selectedId) ?? null;

  const t = isDarkMode
    ? {
        text: "text-white",
        sub: "text-white/50",
        toolbar: "border-white/10 bg-[#193632]/90 shadow-sm shadow-black/10 backdrop-blur-md",
        input: "border-white/10 bg-white/[0.06] text-white placeholder:text-white/40",
        chip: "border-white/15 bg-white/[0.08] text-slate-100 hover:bg-white/[0.14]",
        primary: "bg-[#15554f] text-white hover:bg-[#246b61]",
      }
    : {
        text: "text-[#28443d]",
        sub: "text-[#68766c]",
        toolbar: "border-[#d5dad4] bg-[#edf0eb]/90 shadow-sm backdrop-blur-md",
        input: "border-[#d5dad4] bg-[#fafbf9] text-[#28443d] placeholder:text-[#8c9587]",
        chip: "border-[#d5dad4] bg-[#fafbf9] text-[#40584e] hover:bg-[#edf0eb]",
        primary: "bg-[#15554f] text-white hover:bg-[#246b61]",
      };

  const openCreateForm = () => {
    if (!canCreate) return;
    setFormMode("create");
    setFormOpen(true);
  };

  const openEditForm = () => {
    if (!canUpdate || !selectedEmployee) return;
    setFormMode("edit");
    setFormOpen(true);
  };

  const handleFormSubmit = async (values: EmployeeFormValues) => {
    if (formMode === "edit" && selectedEmployee) {
      const updated = await updateUser(selectedEmployee.id, {
        fullName: values.fullName,
        mobile: values.phone,
        nationalId: values.nationalId,
        email: values.email,
        unit: values.unit,
        roleId: values.roleId,
        isActive: values.isActive,
      });
      setNotice(`اطلاعات «${updated.fullName}» ذخیره شد.`);
    } else {
      const created = await createUser({
        fullName: values.fullName,
        mobile: values.phone,
        nationalId: values.nationalId,
        password: values.password,
        roleId: values.roleId,
        email: values.email || undefined,
        unit: values.unit || undefined,
        isActive: values.isActive,
      });
      setNotice(`کارمند «${created.fullName}» ثبت شد.`);
      setSelectedId(created.id);
    }
    setFormOpen(false);
    await load();
  };

  const handleDelete = async () => {
    if (!selectedEmployee) return;
    setDeleting(true);
    setError("");
    try {
      await deleteUser(selectedEmployee.id);
      setNotice(`کارمند «${selectedEmployee.fullName}» حذف شد.`);
      setSelectedId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "حذف کارمند ناموفق بود.");
    } finally {
      setDeleting(false);
    }
  };

  const navigateMatches = (direction: -1 | 1) => {
    if (totalMatches === 0) return;
    setActiveMatch((current) => (current + direction + totalMatches) % totalMatches);
  };

  return (
    <div className={`w-full ${t.text}`}>
      <h1 className="mb-1 flex items-center gap-2.5 text-xl font-black">
        <UserPen aria-hidden="true" className="h-7 w-7 text-[#15554f]" />
        کارمندان
      </h1>
      <p className={`mb-4 text-xs ${t.sub}`}>
        مدیریت کاربران، نقش سازمانی و وضعیت دسترسی؛ داده‌ها مستقیماً از API خوانده می‌شوند.
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-600">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
          {notice}
        </p>
      )}

      {/* نوار ابزار با قابلیت sticky */}
      <div
        ref={toolbarRef}
        className={`sticky z-30 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border p-3 ${t.toolbar}`}
        style={{ top: -mainPaddingTop }}
      >
        <button
          type="button"
          onClick={openCreateForm}
          disabled={!canCreate}
          title={canCreate ? undefined : "دسترسی افزودن کارمند را ندارید"}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${t.primary}`}
        >
          <UserPlus className="h-3.5 w-3.5" />
          ثبت کارمند جدید
        </button>

        <Link
          href="/roles"
          aria-disabled={!canViewRoles}
          className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs transition-colors ${t.chip} ${
            canViewRoles ? "" : "pointer-events-none opacity-40"
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          نقش‌ها و دسترسی‌ها
        </Link>

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

        <ThemedSelect
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setSelectedId(null);
          }}
          aria-label="فیلتر نقش"
          className={`rounded-full border py-2 pl-8 pr-3 text-xs ${t.input}`}
          arrowClassName={`left-2.5 h-3.5 w-3.5 ${t.sub}`}
        >
          <option value="" style={{ backgroundColor: "#fff", color: "#111827" }}>
            همه نقش‌ها
          </option>
          {roles.map((role) => (
            <option key={role.id} value={role.id} style={{ backgroundColor: "#fff", color: "#111827" }}>
              {role.name}
            </option>
          ))}
        </ThemedSelect>

        <ThemedSelect
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setSelectedId(null);
          }}
          aria-label="فیلتر وضعیت"
          className={`rounded-full border py-2 pl-8 pr-3 text-xs ${t.input}`}
          arrowClassName={`left-2.5 h-3.5 w-3.5 ${t.sub}`}
        >
          <option value="" style={{ backgroundColor: "#fff", color: "#111827" }}>
            همه وضعیت‌ها
          </option>
          <option value="active" style={{ backgroundColor: "#fff", color: "#111827" }}>
            فعال
          </option>
          <option value="inactive" style={{ backgroundColor: "#fff", color: "#111827" }}>
            غیرفعال
          </option>
        </ThemedSelect>

        <div className={`flex items-center gap-1 rounded-full border p-1 ${t.chip}`}>
          <button
            type="button"
            onClick={openEditForm}
            disabled={!canUpdate || !selectedEmployee}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Pencil className="h-3.5 w-3.5" />
            ویرایش
          </button>

          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={!canDelete || !selectedEmployee}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            حذف
          </button>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label="بارگذاری مجدد"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-black/5 disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            بازخوانی
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
        data={visibleEmployees}
        globalFilter={globalFilter}
        selectedId={selectedId}
        onSelect={setSelectedId}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        onFilteredCountChange={setFilteredCount}
        activeMatch={activeMatch}
        onActiveMatchChange={setActiveMatch}
        onMatchCountChange={setTotalMatches}
        stickyHeaderTop={toolbarHeight - mainPaddingTop}
      />

      <EmployeeFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
        roles={roles}
        initial={formMode === "edit" ? selectedEmployee : null}
      />

      <ConfirmModal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={() => void handleDelete()}
        title="حذف کارمند"
        message={
          selectedEmployee
            ? `آیا از حذف «${selectedEmployee.fullName}» مطمئن هستید؟ نشست فعال کاربر بسته می‌شود و این عمل قابل بازگشت نیست.`
            : ""
        }
        confirmLabel={deleting ? "در حال حذف..." : "حذف شود"}
        danger
      />
    </div>
  );
}
