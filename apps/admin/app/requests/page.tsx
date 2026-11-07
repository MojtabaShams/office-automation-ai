"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ChevronLeft,
  ClipboardList,
  Clock3,
  Loader2,
  RefreshCw,
  Search,
  UserRound,
  Workflow,
  X,
} from "lucide-react";
import { useTheme } from "../../theme-context";
import { useAuth } from "../auth-context";
import JalaliDateRangeFilter, { type DateRangeValue } from "../../components/JalaliDateRangeFilter";
import { formatJalali } from "../lib/jalali";
import {
  listAdminSubmissions,
  updateSubmissionStatus,
  type AdminSubmission,
  type SubmissionStatus,
} from "../lib/admin-api";

type Group = "active" | "completed" | "expired";

const tabs: { id: Group; label: string }[] = [
  { id: "active", label: "در حال رسیدگی" },
  { id: "completed", label: "تکمیل‌شده" },
  { id: "expired", label: "بسته‌شده به دلیل انقضای مهلت" },
];

const GROUP_OF: Record<string, Group> = {
  submitted: "active",
  in_review: "active",
  need_info: "active",
  approved: "completed",
  rejected: "completed",
  canceled: "expired",
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "ثبت شده",
  in_review: "در حال بررسی",
  need_info: "نیاز به اطلاعات بیشتر",
  approved: "تأیید شده",
  rejected: "رد شده",
  canceled: "لغو شده",
};

const STATUS_OPTIONS: SubmissionStatus[] = [
  "submitted",
  "in_review",
  "need_info",
  "approved",
  "rejected",
  "canceled",
];

function groupOf(status: string): Group {
  return GROUP_OF[status] ?? "active";
}

function statusTone(status: string, isDarkMode: boolean) {
  switch (status) {
    case "approved":
      return isDarkMode
        ? "bg-emerald-400/15 text-emerald-300"
        : "bg-emerald-50 text-emerald-700";
    case "rejected":
      return isDarkMode
        ? "bg-rose-400/15 text-rose-300"
        : "bg-rose-50 text-rose-700";
    case "canceled":
      return isDarkMode
        ? "bg-white/10 text-white/55"
        : "bg-[#eceee9] text-[#6b7a70]";
    case "need_info":
      return isDarkMode
        ? "bg-amber-400/15 text-amber-300"
        : "bg-amber-50 text-amber-700";
    case "in_review":
      return isDarkMode
        ? "bg-sky-400/15 text-sky-300"
        : "bg-sky-50 text-sky-700";
    default:
      return isDarkMode
        ? "bg-[#15554f]/40 text-[#7dd3c0]"
        : "bg-[#e2eee8] text-[#15554f]";
  }
}

function stageTone(isDarkMode: boolean) {
  return isDarkMode
    ? "border border-[#66b7a4]/30 bg-[#15554f]/25 text-[#8bd0bf]"
    : "border border-[#15554f]/15 bg-[#e2eee8] text-[#15554f]";
}

function formatCreatedAt(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatJalali(date);
}

export default function RequestsPage() {
  const { isDarkMode } = useTheme();
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission("requests", "update");

  const [rows, setRows] = useState<AdminSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [group, setGroup] = useState<Group>("active");
  const [query, setQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeValue>();

  const load = useCallback(async (soft = false) => {
    if (soft) setReloading(true);
    else setLoading(true);
    setError("");
    try {
      const data = await listAdminSubmissions({ limit: 200 });
      setRows(data.submissions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "دریافت درخواست‌ها ناموفق بود.");
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      active: rows.filter((row) => groupOf(row.status) === "active").length,
      completed: rows.filter((row) => groupOf(row.status) === "completed").length,
      expired: rows.filter((row) => groupOf(row.status) === "expired").length,
    }),
    [rows],
  );

  const filteredRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fa");
    return rows.filter((row) => {
      if (groupOf(row.status) !== group) return false;
      if (normalizedQuery) {
        const haystack = `${row.tracking_code} ${row.form_title ?? ""} ${row.user_name ?? ""} ${row.process_title ?? ""} ${row.current_stage_title ?? ""} ${row.status_label ?? ""}`
          .toLocaleLowerCase("fa");
        if (!haystack.includes(normalizedQuery)) return false;
      }
      if (dateRange?.from || dateRange?.to) {
        if (!row.created_at) return false;
        const createdAt = new Date(row.created_at);
        if (Number.isNaN(createdAt.getTime())) return false;
        if (dateRange.from && createdAt < dateRange.from) return false;
        if (dateRange.to && createdAt > dateRange.to) return false;
      }
      return true;
    });
  }, [dateRange, group, query, rows]);

  const changeStatus = async (row: AdminSubmission, status: SubmissionStatus) => {
    if (status === row.status) return;
    setUpdatingId(row.id);
    setError("");
    setNotice("");
    try {
      const updated = await updateSubmissionStatus(row.id, status);
      setRows((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      setNotice(`وضعیت درخواست «${row.tracking_code}» به‌روزرسانی شد.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "به‌روزرسانی وضعیت ناموفق بود.");
    } finally {
      setUpdatingId(null);
    }
  };

  const surface = isDarkMode
    ? "border-white/10 bg-[#193632] text-white"
    : "border-[#d5dad4] bg-[#edf0eb] text-[#28443d]";
  const input = isDarkMode
    ? "border-white/10 bg-white/[0.06] text-white placeholder:text-white/40"
    : "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]";
  const muted = isDarkMode ? "text-white/50" : "text-[#68766c]";
  const card = isDarkMode
    ? "border-white/10 bg-[#193632] hover:border-[#66b7a4]/40 hover:bg-[#203b39]"
    : "border-[#d5dad4] bg-white hover:border-[#15554f]/35 hover:bg-[#fafbf9]";

  return (
    <div dir="rtl" className={`w-full ${isDarkMode ? "text-white" : "text-[#28443d]"}`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black">
            <ClipboardList className="h-7 w-7 text-[#15554f]" />
            درخواست‌ها
          </h1>
          <p className={`mt-1 text-xs ${muted}`}>
            درخواست‌های ثبت‌شده توسط کاربران و وضعیت رسیدگی به آن‌ها
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading || reloading}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs transition-colors disabled:opacity-60 ${
            isDarkMode
              ? "border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/[0.1]"
              : "border-[#d5dad4] bg-white text-[#40584e] hover:bg-[#f6f7f4]"
          }`}
        >
          {reloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          به‌روزرسانی
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-3 flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-600"
        >
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}
      {notice && !error && (
        <p
          role="status"
          className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700"
        >
          {notice}
        </p>
      )}

      <section
        aria-label="فیلتر درخواست‌ها"
        className={`sticky top-0 z-30 mb-5 rounded-2xl border p-3 shadow-sm ${surface}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`flex min-w-56 flex-1 items-center gap-2 rounded-full border px-3 py-2.5 text-xs ${input}`}
          >
            <Search className="h-4 w-4 shrink-0 opacity-60" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setQuery("");
              }}
              placeholder="جستجو بر اساس کد پیگیری، عنوان فرم یا نام متقاضی..."
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:opacity-70"
            />
            {query && (
              <button
                type="button"
                aria-label="پاک کردن جستجو"
                onClick={() => setQuery("")}
                className="rounded-md p-1 opacity-60 hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="w-44 shrink-0">
            <JalaliDateRangeFilter
              value={dateRange}
              onChange={setDateRange}
              label="بازه تاریخ ثبت"
              className="!gap-2 !rounded-full !px-4 !py-2.5 !text-xs"
            />
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-2 text-xs ${
              isDarkMode ? "bg-white/[0.06] text-white/65" : "bg-white/70 text-[#68766c]"
            }`}
          >
            {rows.length} پرونده
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="دسته‌بندی درخواست‌ها">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={group === tab.id}
              onClick={() => setGroup(tab.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
                group === tab.id
                  ? "border-[#15554f] bg-[#15554f] text-white"
                  : isDarkMode
                    ? "border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]"
                    : "border-[#d5dad4] bg-white/70 text-[#40584e] hover:bg-white"
              }`}
            >
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[0.65rem] ${
                  group === tab.id
                    ? "bg-white/15"
                    : isDarkMode
                      ? "bg-white/10"
                      : "bg-[#e6e9e3]"
                }`}
              >
                {counts[tab.id]}
              </span>
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <div className={`flex items-center justify-center gap-2 rounded-2xl border border-dashed p-10 text-xs ${muted} ${isDarkMode ? "border-white/15" : "border-[#cfd6ce]"}`}>
          <Loader2 className="h-4 w-4 animate-spin" />
          در حال دریافت درخواست‌ها...
        </div>
      ) : filteredRequests.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredRequests.map((row) => (
            <article
              key={row.id}
              className={`flex min-h-52 flex-col rounded-2xl border p-4 text-right shadow-sm transition ${card}`}
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                    isDarkMode ? "bg-[#15554f]/25 text-[#8bd0bf]" : "bg-[#e2eee8] text-[#15554f]"
                  }`}
                >
                  <ClipboardList className="h-6 w-6" />
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[0.65rem] font-medium ${statusTone(
                    row.status,
                    isDarkMode,
                  )}`}
                >
                  {row.status_label || STATUS_LABELS[row.status] || row.status}
                </span>
              </div>

              <h2 className="mb-1 line-clamp-2 text-sm font-bold leading-6">
                <Link href={`/requests/${row.id}`} className="hover:text-[#15554f] hover:underline">
                  {row.form_title || "درخواست بدون عنوان"}
                </Link>
              </h2>
              <p className={`mb-1 flex items-center gap-1.5 text-xs ${muted}`}>
                <UserRound className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{row.user_name || "متقاضی نامشخص"}</span>
              </p>
              <p className={`mb-1 flex items-center gap-1.5 text-[0.7rem] ${muted}`}>
                <Workflow className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{row.process_title || "درخواست بدون پروسه"}</span>
              </p>
              <p className={`mb-2 flex flex-wrap items-center gap-1.5 text-[0.66rem] ${muted}`}>
                <span className={`rounded-full px-2 py-0.5 ${stageTone(isDarkMode)}`}>
                  {row.current_stage_title || "مرحله‌ای ثبت نشده"}
                </span>
                {row.step_index && row.step_count ? (
                  <span dir="rtl">گام {row.step_index} از {row.step_count}</span>
                ) : null}
              </p>
              <p className={`mb-2 text-[0.7rem] ${muted}`}>
                کد پیگیری: <span className="font-semibold" dir="ltr">{row.tracking_code}</span>
              </p>
              {row.notes ? (
                <p className={`mb-2 line-clamp-2 text-[0.68rem] leading-5 ${muted}`}>
                  {row.notes}
                </p>
              ) : null}

              <div
                className={`mt-auto space-y-2 border-t pt-3 text-[0.7rem] ${
                  isDarkMode ? "border-white/10 text-white/60" : "border-[#e6e9e3] text-[#68766c]"
                }`}
              >
                <p className="flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5 shrink-0" />
                  <span>تاریخ ثبت: {formatCreatedAt(row.created_at)}</span>
                </p>
                {canUpdate ? (
                  <label className="flex items-center justify-between gap-2">
                    <span className="shrink-0">تغییر وضعیت</span>
                    <span className="relative flex min-w-0 flex-1 items-center">
                      <select
                        value={row.status}
                        disabled={updatingId === row.id}
                        onChange={(event) =>
                          void changeStatus(row, event.target.value as SubmissionStatus)
                        }
                        className={`w-full appearance-none rounded-lg border py-1 pl-7 pr-2 text-[0.7rem] outline-none disabled:opacity-60 ${input}`}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option
                            key={status}
                            value={status}
                            style={{ backgroundColor: "#fff", color: "#111827" }}
                          >
                            {STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                      {updatingId === row.id ? (
                        <Loader2 className="pointer-events-none absolute left-2 h-3 w-3 animate-spin" />
                      ) : null}
                    </span>
                  </label>
                ) : null}
                <Link
                  href={`/requests/${row.id}`}
                  className={`inline-flex w-full items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[0.7rem] font-semibold transition-colors ${
                    isDarkMode
                      ? "border-[#66b7a4]/30 text-[#8bd0bf] hover:bg-[#15554f]/30"
                      : "border-[#15554f]/25 text-[#15554f] hover:bg-[#e2eee8]"
                  }`}
                >
                  مشاهده پرونده
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div
          className={`rounded-2xl border border-dashed p-10 text-center ${
            isDarkMode ? "border-white/15 text-white/55" : "border-[#cfd6ce] text-[#68766c]"
          }`}
        >
          <ClipboardList className="mx-auto mb-3 h-9 w-9 opacity-45" />
          <p className="text-sm font-semibold">
            {rows.length
              ? "درخواستی با این فیلترها پیدا نشد"
              : "هنوز درخواستی ثبت نشده است"}
          </p>
          {(query || dateRange) && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setDateRange(undefined);
              }}
              className="mt-3 text-xs font-semibold text-[#15554f] hover:underline"
            >
              پاک کردن فیلترها
            </button>
          )}
        </div>
      )}
    </div>
  );
}
