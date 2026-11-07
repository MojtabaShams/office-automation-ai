"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Plus,
  Save,
  Play,
  Download,
  Trash2,
  Eye,
  TrendingUp,
  TrendingDown,
  History,
  ClipboardList,
  Users,
  Workflow,
  MessageSquare,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer as RC,
} from "recharts";
import { useTheme } from "../../theme-context";
import Modal from "../Modal";
import ConfirmModal from "../ConfirmModal";
import AuditLogTable, { type AuditAction, type AuditLog } from "./AuditLogTable";
import ReportBuilderWizard from "./ReportBuilderWizard";
import type { ReportDefinition } from "../../app/lib/report-types";
import { runReport, type ReportResultRow } from "./report-engine";
import { getReportEntity, loadReportEntities } from "../../app/lib/report-entities";
import {
  deleteReportDefinition,
  getReportEvents,
  getReportSummary,
  listSavedReports,
  type ReportEvent,
  type ReportQuickTileId,
  type ReportSummary,
} from "../../app/lib/admin-api";

/* ---------- گزارش‌های آماده (کاشی‌ها) — اعداد از پایگاه داده ---------- */
const quickReportMeta: {
  id: ReportQuickTileId;
  title: string;
  desc: string;
  icon: React.ElementType;
  color: string;
}[] = [
  {
    id: "requests",
    title: "آمار درخواست‌ها",
    desc: "تعداد درخواست‌های باز، بسته و در انتظار",
    icon: ClipboardList,
    color: "#15554f",
  },
  {
    id: "employees",
    title: "عملکرد کارمندان",
    desc: "تعداد درخواست‌های ثبت‌شده و کارمندان فعال",
    icon: Users,
    color: "#3b82f6",
  },
  {
    id: "processes",
    title: "وضعیت پروسه‌ها",
    desc: "پروسه‌های فعال و پرونده‌های در جریان",
    icon: Workflow,
    color: "#8b5cf6",
  },
  {
    id: "messages",
    title: "پیام‌های روزانه",
    desc: "حجم پیام‌های متقاضی و دستیار در هفت روز گذشته",
    icon: MessageSquare,
    color: "#f59e0b",
  },
];

const CHART_COLORS = ["#15554f", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444"];

const displayLabel: Record<string, string> = {
  table: "جدول",
  bar: "نمودار میله‌ای",
  line: "نمودار خطی",
  pie: "نمودار دایره‌ای",
  kpi: "کارت آماری",
};

/** Comparing the last two points of a daily series is enough for a tile trend. */
function trendOf(series: number[]): { text: string; up: boolean } | null {
  if (series.length < 2) return null;
  const current = series[series.length - 1] ?? 0;
  const previous = series[series.length - 2] ?? 0;
  if (current === 0 && previous === 0) return null;
  const delta = current - previous;
  return { text: `${delta >= 0 ? "+" : "−"}${Math.abs(delta)}`, up: delta >= 0 };
}

function toChartData(labels: string[], values: number[]) {
  return labels.map((name, index) => ({ name, value: values[index] ?? 0 }));
}

function displayDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

type TabId = "quick" | "saved" | "events";

export default function ReportsPage() {
  const { isDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState<TabId>("quick");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [events, setEvents] = useState<ReportEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [runOpen, setRunOpen] = useState(false);
  const [running, setRunning] = useState<ReportDefinition | null>(null);
  const [preview, setPreview] = useState<{
    rows: ReportResultRow[];
    metricLabels: Record<string, string>;
  } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const [mainPaddingTop, setMainPaddingTop] = useState(0);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryData, savedData, eventsData] = await Promise.all([
        getReportSummary(),
        listSavedReports(),
        getReportEvents(100),
        loadReportEntities(),
      ]);
      setSummary(summaryData);
      setReports(savedData);
      setEvents(eventsData);
      setLoadError("");
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "دریافت گزارش‌ها از پایگاه داده با خطا مواجه شد.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    const main = document.getElementById("admin-main-scroll");
    if (!toolbar) return;

    const updateMetrics = () => {
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

  const auditLogs = useMemo<AuditLog[]>(
    () =>
      events.map((event) => ({
        id: event.id,
        userId: event.userId,
        userName: event.userName,
        action: event.action as AuditAction,
        module: event.module,
        recordId: event.recordId,
        oldValues: event.oldValues,
        newValues: event.newValues,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        createdAt: event.createdAt ? new Date(event.createdAt) : new Date(0),
      })),
    [events],
  );

  const surface = isDarkMode
    ? "border-white/10 bg-[#193632]/90 text-white shadow-black/10"
    : "border-[#d5dad4] bg-[#edf0eb]/90 text-[#28443d]";
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";
  const card = isDarkMode ? "border-white/10 bg-[#193632]" : "border-[#d5dad4] bg-white";

  const tabBtn = (active: boolean) =>
    active
      ? "border-[#15554f] bg-[#15554f] text-white"
      : isDarkMode
        ? "border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]"
        : "border-[#d5dad4] bg-white/70 text-[#40584e] hover:bg-white";

  const tabCount = (active: boolean) =>
    active
      ? "bg-white/15"
      : isDarkMode
        ? "bg-white/10"
        : "bg-[#e6e9e3]";

  const openRun = async (report: ReportDefinition) => {
    setRunning(report);
    setRunOpen(true);
    setPreview(null);
    setPreviewBusy(true);
    try {
      await loadReportEntities();
      setPreview(runReport(report));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "اجرای گزارش با خطا مواجه شد.");
    } finally {
      setPreviewBusy(false);
    }
  };

  const reloadSaved = useCallback(async () => {
    try {
      setReports(await listSavedReports());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "دریافت گزارش‌های ذخیره‌شده با خطا مواجه شد.");
    }
  }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteBusy(true);
    try {
      await deleteReportDefinition(deleteId);
      setReports((current) => current.filter((report) => report.id !== deleteId));
      setDeleteId(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "حذف گزارش با خطا مواجه شد.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const exportExcel = async (report: ReportDefinition) => {
    try {
      const XLSX = await import("xlsx");
      await loadReportEntities();
      const { rows, metricLabels } = runReport(report);
      if (!rows.length) {
        window.alert("داده‌ای برای خروجی وجود ندارد.");
        return;
      }
      const headers = Object.keys(rows[0]!).map((k) => metricLabels[k] ?? k);
      const data = rows.map((row) => Object.values(row));
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "گزارش");
      XLSX.writeFile(workbook, `${report.title || "report"}.xlsx`);
    } catch (error) {
      console.error(error);
      window.alert("خروجی Excel با خطا مواجه شد.");
    }
  };

  return (
    <div dir="rtl" className={`w-full space-y-5 ${isDarkMode ? "text-white" : "text-[#28443d]"}`}>
      {/* هدر */}
      <div>
        <h1 className="flex items-center gap-2 text-xl font-black">
          <BarChart3 className="h-7 w-7 text-[#15554f]" />
          گزارشات
        </h1>
        <p className={`mt-1 text-xs ${muted}`}>
          گزارش‌های آماده، گزارش‌های ذخیره‌شده و سازنده گزارش سفارشی — همه از پایگاه داده
        </p>
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-600"
        >
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {loadError}
          </span>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="rounded-full border border-rose-500/30 px-3 py-1 font-semibold hover:bg-rose-500/10"
          >
            تلاش دوباره
          </button>
        </div>
      )}

      {/* نوار ابزار sticky */}
      <section
        ref={toolbarRef}
        aria-label="دسته‌بندی گزارش‌ها"
        className={`sticky z-30 rounded-2xl border p-3 shadow-sm backdrop-blur-md ${surface}`}
        style={{ top: -mainPaddingTop }}
      >
        <div className="flex flex-wrap gap-2" role="tablist">
          {/* ۱. گزارشات */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "quick"}
            onClick={() => setActiveTab("quick")}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${tabBtn(activeTab === "quick")}`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            گزارشات
            <span className={`rounded-full px-1.5 py-0.5 text-[0.65rem] ${tabCount(activeTab === "quick")}`}>
              {quickReportMeta.length}
            </span>
          </button>

          {/* ۲. ساخت گزارش جدید */}
          <button
            type="button"
            onClick={() => setBuilderOpen(true)}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
              isDarkMode
                ? "border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]"
                : "border-[#d5dad4] bg-white/70 text-[#40584e] hover:bg-white"
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            ساخت گزارش جدید
          </button>

          {/* ۳. گزارشات من */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "saved"}
            onClick={() => setActiveTab("saved")}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${tabBtn(activeTab === "saved")}`}
          >
            <Save className="h-3.5 w-3.5" />
            گزارشات من
            <span className={`rounded-full px-1.5 py-0.5 text-[0.65rem] ${tabCount(activeTab === "saved")}`}>
              {reports.length}
            </span>
          </button>

          {/* ۴. رویدادهای سیستم */}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "events"}
            onClick={() => setActiveTab("events")}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${tabBtn(activeTab === "events")}`}
          >
            <History className="h-3.5 w-3.5" />
            رویدادهای سیستم
            <span className={`rounded-full px-1.5 py-0.5 text-[0.65rem] ${tabCount(activeTab === "events")}`}>
              {auditLogs.length}
            </span>
          </button>
        </div>
      </section>

      {/* ========== تب گزارشات آماده ========== */}
      {activeTab === "quick" && (
        <>
          {loading && !summary ? (
            <div className={`flex items-center justify-center gap-2 rounded-2xl border p-10 text-sm ${card} ${muted}`}>
              <Loader2 className="h-4 w-4 animate-spin" />
              در حال محاسبه گزارش‌ها از پایگاه داده…
            </div>
          ) : summary ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {quickReportMeta.map((meta) => {
                const tile = summary.quick[meta.id];
                const trend = tile ? trendOf(tile.series) : null;
                const chartData = tile ? toChartData(summary.weekly.labels, tile.series) : [];
                return (
                  <div
                    key={meta.id}
                    className={`rounded-2xl border p-4 transition-colors ${card} ${
                      isDarkMode ? "hover:bg-[#1f403b]" : "hover:bg-[#f8f9f6]"
                    }`}
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#15554f]/10 text-[#15554f]">
                        <meta.icon className="h-5 w-5" />
                      </div>
                      {trend ? (
                        <div
                          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${
                            trend.up
                              ? "bg-emerald-500/10 text-emerald-600"
                              : "bg-rose-500/10 text-rose-600"
                          }`}
                        >
                          {trend.up ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {trend.text}
                        </div>
                      ) : null}
                    </div>

                    <h3 className="text-sm font-bold">{meta.title}</h3>
                    <p className={`mt-1 text-[0.7rem] leading-relaxed ${muted}`}>{meta.desc}</p>

                    <div className="mt-3 flex items-end justify-between gap-2">
                      <div>
                        <div className="text-2xl font-black tracking-tight">
                          {(tile?.stat ?? 0).toLocaleString("fa-IR")}
                        </div>
                        <div className={`text-[0.65rem] ${muted}`}>
                          {tile?.statLabel ?? "—"}
                        </div>
                      </div>
                      <div className="h-12 w-24">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                            <defs>
                              <linearGradient id={`grad-${meta.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={meta.color} stopOpacity={0.35} />
                                <stop offset="100%" stopColor={meta.color} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <Area
                              type="monotone"
                              dataKey="value"
                              stroke={meta.color}
                              strokeWidth={1.5}
                              fill={`url(#grad-${meta.id})`}
                              isAnimationActive={false}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <Link
                      href={`/reports/${meta.id}`}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#15554f] bg-[#15554f] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#124740]"
                    >
                      <Play className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                      <span className="text-white">اجرای گزارش</span>
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      )}

      {/* ========== تب گزارشات من ========== */}
      {activeTab === "saved" && (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <div
              className={`rounded-2xl border border-dashed p-10 text-center ${
                isDarkMode ? "border-white/15 text-white/55" : "border-[#cfd6ce] text-[#68766c]"
              }`}
            >
              <Save className="mx-auto mb-3 h-9 w-9 opacity-45" />
              <p className="text-sm font-semibold">هنوز گزارشی ذخیره نکرده‌اید</p>
              <button
                type="button"
                onClick={() => setBuilderOpen(true)}
                className="mt-3 text-xs font-semibold text-[#15554f] hover:underline"
              >
                ساخت اولین گزارش
              </button>
            </div>
          ) : (
            reports.map((report) => {
              const entity = getReportEntity(report.entityId);
              const updated = displayDate(report.updatedAt);

              return (
                <div
                  key={report.id}
                  className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${card}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold">{report.title}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${
                          isDarkMode ? "bg-white/10 text-white/70" : "bg-[#e6e9e3] text-[#53665b]"
                        }`}
                      >
                        {displayLabel[report.display?.type] ?? report.display?.type ?? "—"}
                      </span>
                    </div>
                    <div className={`mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] ${muted}`}>
                      <span>منبع: {entity?.label ?? report.entityId}</span>
                      <span>آخرین به‌روزرسانی: {updated}</span>
                      {report.category && <span>دسته: {report.category}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void openRun(report)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#15554f] bg-[#15554f] px-3 py-1.5 text-[0.7rem] font-semibold text-white transition hover:bg-[#124740]"
                    >
                      <Play className="h-3.5 w-3.5 text-white" />
                      <span className="text-white">اجرا</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void openRun(report)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition ${
                        isDarkMode
                          ? "border-white/15 bg-white/[0.06] text-white/80 hover:bg-white/10"
                          : "border-[#d5dad4] bg-white text-[#40584e] hover:bg-[#f3f5f1]"
                      }`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      مشاهده
                    </button>
                    <button
                      type="button"
                      onClick={() => void exportExcel(report)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition ${
                        isDarkMode
                          ? "border-white/15 bg-white/[0.06] text-white/80 hover:bg-white/10"
                          : "border-[#d5dad4] bg-white text-[#40584e] hover:bg-[#f3f5f1]"
                      }`}
                    >
                      <Download className="h-3.5 w-3.5" />
                      خروجی
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteId(report.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[0.7rem] font-semibold text-red-600 transition hover:bg-red-500/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ========== تب رویدادهای سیستم ========== */}
      {activeTab === "events" &&
        (loading && !auditLogs.length ? (
          <div className={`flex items-center justify-center gap-2 rounded-2xl border p-10 text-sm ${card} ${muted}`}>
            <Loader2 className="h-4 w-4 animate-spin" />
            در حال دریافت رویدادها…
          </div>
        ) : (
          <AuditLogTable data={auditLogs} />
        ))}

      {/* Modal سازنده گزارش */}
      <Modal
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        title="ساخت گزارش جدید"
        maxWidthClass="max-w-3xl"
      >
        <ReportBuilderWizard
          onClose={() => setBuilderOpen(false)}
          onSaved={() => void reloadSaved()}
        />
      </Modal>

      {/* Modal اجرای گزارش ذخیره‌شده */}
      <Modal
        open={runOpen}
        onClose={() => {
          setRunOpen(false);
          setRunning(null);
          setPreview(null);
        }}
        title={running?.title ?? "نتیجه گزارش"}
        maxWidthClass="max-w-3xl"
      >
        {running && (
          <div className="space-y-4">
            <div className={`flex flex-wrap items-center justify-between gap-2 text-xs ${muted}`}>
              <span>
                منبع: {getReportEntity(running.entityId)?.label ?? running.entityId} ·{" "}
                {displayLabel[running.display?.type] ?? running.display?.type ?? "—"}
              </span>
              <button
                type="button"
                onClick={() => void exportExcel(running)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#15554f] bg-[#15554f] px-3 py-1.5 text-[0.7rem] font-semibold text-white hover:bg-[#124740]"
              >
                <Download className="h-3.5 w-3.5" />
                خروجی Excel
              </button>
            </div>

            {previewBusy || !preview ? (
              <div className={`flex items-center justify-center gap-2 py-12 text-sm ${muted}`}>
                <Loader2 className="h-4 w-4 animate-spin" />
                در حال محاسبه…
              </div>
            ) : running.display?.type === "table" || running.display?.type === "kpi" ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] text-right text-xs">
                  <thead>
                    <tr className={`border-b ${isDarkMode ? "border-white/10" : "border-[#d5dad4]"}`}>
                      {Object.keys(preview.rows[0] ?? preview.metricLabels).map((k) => (
                        <th key={k} className={`px-2 py-2 font-semibold ${muted}`}>
                          {preview.metricLabels[k] ?? k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr
                        key={i}
                        className={`border-b last:border-0 ${
                          isDarkMode ? "border-white/5" : "border-[#edf0eb]"
                        }`}
                      >
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="px-2 py-2">
                            {String(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {!preview.rows.length && (
                      <tr>
                        <td colSpan={8} className={`p-6 text-center ${muted}`}>
                          داده‌ای یافت نشد
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-64">
                <RC width="100%" height="100%">
                  {running.display?.type === "pie" ? (
                    <PieChart>
                      <Pie
                        data={preview.rows}
                        dataKey={running.display.yMetricIds?.[0] ?? Object.keys(preview.metricLabels)[0] ?? "value"}
                        nameKey={
                          running.display.xFieldId ??
                          running.groupBy[0]?.fieldId ??
                          "name"
                        }
                        outerRadius={90}
                      >
                        {preview.rows.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  ) : running.display?.type === "line" ? (
                    <LineChart data={preview.rows}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}
                      />
                      <XAxis
                        dataKey={running.display.xFieldId ?? running.groupBy[0]?.fieldId}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      {(running.display.yMetricIds?.length
                        ? running.display.yMetricIds
                        : Object.keys(preview.metricLabels)
                      ).map((id, i) => (
                        <Line
                          key={id}
                          type="monotone"
                          dataKey={id}
                          stroke={CHART_COLORS[i % CHART_COLORS.length]}
                          strokeWidth={2}
                        />
                      ))}
                    </LineChart>
                  ) : (
                    <BarChart data={preview.rows}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}
                      />
                      <XAxis
                        dataKey={running.display?.xFieldId ?? running.groupBy[0]?.fieldId}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      {(running.display?.yMetricIds?.length
                        ? running.display.yMetricIds
                        : Object.keys(preview.metricLabels)
                      ).map((id, i) => (
                        <Bar
                          key={id}
                          dataKey={id}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                          radius={[4, 4, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  )}
                </RC>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* تأیید حذف */}
      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => void handleDelete()}
        title="حذف گزارش"
        message={
          deleteBusy
            ? "در حال حذف گزارش…"
            : "آیا از حذف این گزارش مطمئن هستید؟ گزارش به‌صورت نرم حذف می‌شود و برای حسابرسی در پایگاه داده باقی می‌ماند."
        }
        confirmLabel="حذف شود"
        danger
      />
    </div>
  );
}
