"use client";

import React, { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { useTheme } from "../../theme-context";
import Modal from "../Modal";
import ConfirmModal from "../ConfirmModal";
import AuditLogTable from "./AuditLogTable";
import ReportBuilderWizard from "./ReportBuilderWizard";
import {
  loadReports,
  saveReports,
  type ReportDefinition,
} from "../../app/lib/mock-reports";
import { runReport } from "./report-engine";
import { getReportEntity } from "../../app/lib/report-entities";
import {
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

/* ---------- گزارش‌های آماده (کاشی‌ها) ---------- */
const miniChartData = [
  { name: "ش", value: 12 },
  { name: "ی", value: 19 },
  { name: "د", value: 8 },
  { name: "س", value: 15 },
  { name: "چ", value: 22 },
  { name: "پ", value: 18 },
  { name: "ج", value: 10 },
];

const quickReports = [
  {
    id: "requests",
    title: "آمار درخواست‌ها",
    desc: "تعداد درخواست‌های باز، بسته و در انتظار",
    icon: ClipboardList,
    stat: "۱۸",
    statLabel: "درخواست باز",
    trend: "+۱۲٪",
    trendUp: true,
    chartData: miniChartData,
    chartColor: "#15554f",
  },
  {
    id: "employees",
    title: "عملکرد کارمندان",
    desc: "تعداد درخواست‌های رسیدگی‌شده توسط هر کارمند",
    icon: Users,
    stat: "۴۲",
    statLabel: "کارمند فعال",
    trend: "+۵٪",
    trendUp: true,
    chartData: [
      { name: "ش", value: 8 },
      { name: "ی", value: 14 },
      { name: "د", value: 11 },
      { name: "س", value: 17 },
      { name: "چ", value: 9 },
      { name: "پ", value: 13 },
      { name: "ج", value: 6 },
    ],
    chartColor: "#3b82f6",
  },
  {
    id: "processes",
    title: "وضعیت پروسه‌ها",
    desc: "پروسه‌های در جریان، تکمیل‌شده و متوقف",
    icon: Workflow,
    stat: "۷",
    statLabel: "پروسه فعال",
    trend: "-۲٪",
    trendUp: false,
    chartData: [
      { name: "ش", value: 4 },
      { name: "ی", value: 6 },
      { name: "د", value: 5 },
      { name: "س", value: 8 },
      { name: "چ", value: 3 },
      { name: "پ", value: 7 },
      { name: "ج", value: 4 },
    ],
    chartColor: "#8b5cf6",
  },
  {
    id: "messages",
    title: "پیام‌های روزانه",
    desc: "حجم پیام‌های ارسالی و خوانده‌نشده",
    icon: MessageSquare,
    stat: "۵",
    statLabel: "خوانده‌نشده",
    trend: "+۸٪",
    trendUp: true,
    chartData: [
      { name: "ش", value: 20 },
      { name: "ی", value: 15 },
      { name: "د", value: 28 },
      { name: "س", value: 12 },
      { name: "چ", value: 22 },
      { name: "پ", value: 18 },
      { name: "ج", value: 9 },
    ],
    chartColor: "#f59e0b",
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

type TabId = "quick" | "saved" | "events";

export default function ReportsPage() {
  const { isDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState<TabId>("quick");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [reports, setReports] = useState<ReportDefinition[]>([]);
  const [runOpen, setRunOpen] = useState(false);
  const [running, setRunning] = useState<ReportDefinition | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const [mainPaddingTop, setMainPaddingTop] = useState(0);

  useEffect(() => {
    setReports(loadReports());
  }, []);

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

  const surface = isDarkMode
    ? "border-white/10 bg-[#193632]/90 text-white shadow-black/10"
    : "border-[#d5dad4] bg-[#edf0eb]/90 text-[#28443d]";
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";
  const card = isDarkMode
    ? "border-white/10 bg-[#193632]"
    : "border-[#d5dad4] bg-white";

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

  const openRun = (report: ReportDefinition) => {
    setRunning(report);
    setRunOpen(true);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const next = reports.filter((r) => r.id !== deleteId);
    saveReports(next);
    setReports(next);
    setDeleteId(null);
  };

  const exportExcel = async (report: ReportDefinition) => {
    try {
      const XLSX = await import("xlsx");
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

  const runPreview = running ? runReport(running) : null;

  return (
    <div dir="rtl" className={`w-full space-y-5 ${isDarkMode ? "text-white" : "text-[#28443d]"}`}>
      {/* هدر */}
      <div>
        <h1 className="flex items-center gap-2 text-xl font-black">
          <BarChart3 className="h-7 w-7 text-[#15554f]" />
          گزارشات
        </h1>
        <p className={`mt-1 text-xs ${muted}`}>
          گزارش‌های آماده، گزارش‌های ذخیره‌شده و سازنده گزارش سفارشی
        </p>
      </div>

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
              {quickReports.length}
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
              7
            </span>
          </button>
        </div>
      </section>

      {/* ========== تب گزارشات آماده ========== */}
      {activeTab === "quick" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickReports.map((report) => (
            <div
              key={report.id}
              className={`rounded-2xl border p-4 transition-colors ${card} ${
                isDarkMode ? "hover:bg-[#1f403b]" : "hover:bg-[#f8f9f6]"
              }`}
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#15554f]/10 text-[#15554f]">
                  <report.icon className="h-5 w-5" />
                </div>
                <div
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${
                    report.trendUp
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-rose-500/10 text-rose-600"
                  }`}
                >
                  {report.trendUp ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {report.trend}
                </div>
              </div>

              <h3 className="text-sm font-bold">{report.title}</h3>
              <p className={`mt-1 text-[0.7rem] leading-relaxed ${muted}`}>{report.desc}</p>

              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  <div className="text-2xl font-black tracking-tight">{report.stat}</div>
                  <div className={`text-[0.65rem] ${muted}`}>{report.statLabel}</div>
                </div>
                <div className="h-12 w-24">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={report.chartData}>
                      <defs>
                        <linearGradient id={`grad-${report.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={report.chartColor} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={report.chartColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={report.chartColor}
                        strokeWidth={1.5}
                        fill={`url(#grad-${report.id})`}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <Link
                href={`/reports/${report.id}`}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#15554f] bg-[#15554f] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[#124740]"
              >
                <Play className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                <span className="text-white">اجرای گزارش</span>
              </Link>
            </div>
          ))}
        </div>
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
              const updated = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date(report.updatedAt));

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
                        {displayLabel[report.display.type] ?? report.display.type}
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
                      onClick={() => openRun(report)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#15554f] bg-[#15554f] px-3 py-1.5 text-[0.7rem] font-semibold text-white transition hover:bg-[#124740]"
                    >
                      <Play className="h-3.5 w-3.5 text-white" />
                      <span className="text-white">اجرا</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openRun(report)}
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
                      onClick={() => exportExcel(report)}
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
      {activeTab === "events" && <AuditLogTable />}

      {/* Modal سازنده گزارش */}
      <Modal
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        title="ساخت گزارش جدید"
        maxWidthClass="max-w-3xl"
      >
        <ReportBuilderWizard
          onClose={() => setBuilderOpen(false)}
          onSaved={() => setReports(loadReports())}
        />
      </Modal>

      {/* Modal اجرای گزارش ذخیره‌شده */}
      <Modal
        open={runOpen}
        onClose={() => {
          setRunOpen(false);
          setRunning(null);
        }}
        title={running?.title ?? "نتیجه گزارش"}
        maxWidthClass="max-w-3xl"
      >
        {running && runPreview && (
          <div className="space-y-4">
            <div className={`flex flex-wrap items-center justify-between gap-2 text-xs ${muted}`}>
              <span>
                منبع: {getReportEntity(running.entityId)?.label ?? running.entityId} ·{" "}
                {displayLabel[running.display.type]}
              </span>
              <button
                type="button"
                onClick={() => exportExcel(running)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#15554f] bg-[#15554f] px-3 py-1.5 text-[0.7rem] font-semibold text-white hover:bg-[#124740]"
              >
                <Download className="h-3.5 w-3.5" />
                خروجی Excel
              </button>
            </div>

            {running.display.type === "table" || running.display.type === "kpi" ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] text-right text-xs">
                  <thead>
                    <tr className={`border-b ${isDarkMode ? "border-white/10" : "border-[#d5dad4]"}`}>
                      {Object.keys(runPreview.rows[0] ?? runPreview.metricLabels).map((k) => (
                        <th key={k} className={`px-2 py-2 font-semibold ${muted}`}>
                          {runPreview.metricLabels[k] ?? k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runPreview.rows.map((row, i) => (
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
                    {!runPreview.rows.length && (
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
                  {running.display.type === "pie" ? (
                    <PieChart>
                      <Pie
                        data={runPreview.rows}
                        dataKey={running.display.yMetricIds?.[0] ?? Object.keys(runPreview.metricLabels)[0] ?? "value"}
                        nameKey={
                          running.display.xFieldId ??
                          running.groupBy[0]?.fieldId ??
                          "name"
                        }
                        outerRadius={90}
                      >
                        {runPreview.rows.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  ) : running.display.type === "line" ? (
                    <LineChart data={runPreview.rows}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}
                      />
                      <XAxis
                        dataKey={
                          running.display.xFieldId ?? running.groupBy[0]?.fieldId
                        }
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      {(running.display.yMetricIds?.length
                        ? running.display.yMetricIds
                        : Object.keys(runPreview.metricLabels)
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
                    <BarChart data={runPreview.rows}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}
                      />
                      <XAxis
                        dataKey={
                          running.display.xFieldId ?? running.groupBy[0]?.fieldId
                        }
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      {(running.display.yMetricIds?.length
                        ? running.display.yMetricIds
                        : Object.keys(runPreview.metricLabels)
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
        onConfirm={handleDelete}
        title="حذف گزارش"
        message="آیا از حذف این گزارش مطمئن هستید؟ این عمل قابل بازگشت نیست."
        confirmLabel="حذف شود"
        danger
      />
    </div>
  );
}