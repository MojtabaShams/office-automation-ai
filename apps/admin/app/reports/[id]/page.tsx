"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  Download,
  Loader2,
  MessageSquare,
  RefreshCw,
  Users,
  Workflow,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "../../../theme-context";
import {
  getQuickReport,
  type ReportQuickReport,
} from "../../lib/admin-api";
import { formatJalali } from "../../lib/jalali";

const reportMeta: Record<string, { title: string; icon: React.ElementType; color: string }> = {
  requests: { title: "آمار درخواست‌ها", icon: ClipboardList, color: "#15554f" },
  employees: { title: "عملکرد کارمندان", icon: Users, color: "#3b82f6" },
  processes: { title: "وضعیت پروسه‌ها", icon: Workflow, color: "#8b5cf6" },
  messages: { title: "پیام‌های روزانه", icon: MessageSquare, color: "#f59e0b" },
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const time = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(date);
  return `${formatJalali(date)} · ${time}`;
}

export default function ReportDetailPage() {
  const { isDarkMode } = useTheme();
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [report, setReport] = useState<ReportQuickReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (force = false) => {
      if (!id) return;
      if (force) setBusy(true);
      else setLoading(true);
      try {
        setReport(await getQuickReport(id));
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "دریافت گزارش با خطا مواجه شد.");
        if (!force) setReport(null);
      } finally {
        setLoading(false);
        setBusy(false);
      }
    },
    [id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const meta = reportMeta[id ?? ""] ?? {
    title: report?.title ?? "گزارش",
    icon: BarChart3,
    color: "#15554f",
  };
  const Icon = meta.icon;

  const surface = isDarkMode
    ? "border-white/10 bg-[#193632] text-white"
    : "border-[#d5dad4] bg-white text-[#28443d]";
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";
  const gridStroke = isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const tooltipStyle = {
    borderRadius: 12,
    border: "none",
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    fontSize: 12,
  };

  const chartData = (report?.series.labels ?? []).map((label, index) => {
    const row: Record<string, string | number> = { name: label };
    for (const item of report?.series.series ?? []) {
      row[item.key] = item.values[index] ?? 0;
    }
    return row;
  });
  const pieData = (report?.pie.data ?? []).filter((slice) => slice.value > 0);
  const hasData = Boolean(report) && (report?.table.rows.length ?? 0) > 0;

  const exportExcel = async () => {
    if (!report) return;
    try {
      const XLSX = await import("xlsx");
      const headers = report.table.columns.map((column) => column.label);
      const rows = report.table.rows.map((row) =>
        report.table.columns.map((column) => row[column.key] ?? ""),
      );
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "گزارش");
      XLSX.writeFile(workbook, `${report.title || "report"}.xlsx`);
    } catch {
      window.alert("خروجی Excel با خطا مواجه شد.");
    }
  };

  return (
    <div dir="rtl" className={`w-full space-y-5 ${isDarkMode ? "text-white" : "text-[#28443d]"}`}>
      <div>
        <Link
          href="/reports"
          className={`mb-3 inline-flex items-center gap-1 text-xs ${muted} hover:text-[#15554f]`}
        >
          <ArrowRight className="h-3.5 w-3.5" />
          بازگشت به گزارشات
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#15554f]/10 text-[#15554f]">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black">{report?.title ?? meta.title}</h1>
              <p className={`mt-0.5 text-xs ${muted}`}>
                گزارش تفصیلی · به‌روزرسانی لحظه‌ای
                {report ? ` · ${formatDateTime(report.generated_at)}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={busy || loading}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition disabled:opacity-60 ${
                isDarkMode
                  ? "border-white/15 bg-white/[0.06] text-white/80 hover:bg-white/10"
                  : "border-[#d5dad4] bg-white text-[#40584e] hover:bg-[#f3f5f1]"
              }`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
              به‌روزرسانی
            </button>
            <button
              type="button"
              onClick={() => void exportExcel()}
              disabled={!hasData}
              className="inline-flex items-center gap-2 rounded-full border border-[#15554f] bg-[#15554f] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#124740] disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              خروجی Excel
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-xs text-rose-600"
        >
          {error}
        </div>
      )}

      {loading && !report ? (
        <div className={`flex items-center justify-center gap-2 rounded-2xl border p-10 text-sm ${surface} ${muted}`}>
          <Loader2 className="h-4 w-4 animate-spin" />
          در حال محاسبه گزارش از پایگاه داده…
        </div>
      ) : report ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {report.kpis.map((kpi) => (
              <div key={kpi.label} className={`rounded-2xl border p-4 ${surface}`}>
                <div className={`text-[0.7rem] ${muted}`}>{kpi.label}</div>
                <div className="mt-1 flex items-end justify-between gap-2">
                  <div className="text-2xl font-black">
                    {kpi.value}
                    {kpi.unit ? (
                      <span className={`mr-1 text-xs font-medium ${muted}`}>{kpi.unit}</span>
                    ) : null}
                  </div>
                  {kpi.trend ? (
                    <div
                      className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold ${
                        kpi.up
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-rose-500/10 text-rose-600"
                      }`}
                    >
                      {kpi.trend}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <section className={`rounded-2xl border p-4 lg:col-span-3 ${surface}`}>
              <h2 className="mb-4 text-sm font-bold">روند هفت روز گذشته</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke={muted} />
                    <YAxis tick={{ fontSize: 11 }} stroke={muted} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend
                      content={({ payload }) => (
                        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
                          {payload?.map((entry) => (
                            <div key={String(entry.value)} className="flex items-center gap-2">
                              <span
                                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                                style={{ backgroundColor: entry.color }}
                              />
                              <span className={isDarkMode ? "text-white/80" : "text-[#40584e]"}>
                                {entry.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    />
                    {report.series.series.map((item) => (
                      <Bar
                        key={item.key}
                        dataKey={item.key}
                        name={item.label}
                        fill={item.color}
                        radius={[4, 4, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className={`rounded-2xl border p-4 lg:col-span-2 ${surface}`}>
              <h2 className="mb-4 text-sm font-bold">توزیع وضعیت</h2>
              <div className="h-64">
                {pieData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={3}
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend
                        content={({ payload }) => (
                          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
                            {payload?.map((entry) => (
                              <div key={String(entry.value)} className="flex items-center gap-2">
                                <span
                                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: entry.color }}
                                />
                                <span className={isDarkMode ? "text-white/80" : "text-[#40584e]"}>
                                  {entry.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className={`flex h-full items-center justify-center text-xs ${muted}`}>
                    داده‌ای برای نمایش وجود ندارد.
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className={`rounded-2xl border p-4 ${surface}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold">خلاصه وضعیت</h2>
              {report.note ? <p className={`text-[0.7rem] ${muted}`}>{report.note}</p> : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-right text-xs">
                <thead>
                  <tr className={`border-b ${isDarkMode ? "border-white/10" : "border-[#d5dad4]"}`}>
                    {report.table.columns.map((column) => (
                      <th key={column.key} className={`px-2 pb-2 font-semibold ${muted}`}>
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.table.rows.map((row, index) => (
                    <tr
                      key={index}
                      className={`border-b last:border-0 ${
                        isDarkMode ? "border-white/5" : "border-[#edf0eb]"
                      }`}
                    >
                      {report.table.columns.map((column) => (
                        <td key={column.key} className="px-2 py-2.5 font-medium">
                          {String(row[column.key] ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!report.table.rows.length && (
                    <tr>
                      <td
                        colSpan={Math.max(report.table.columns.length, 1)}
                        className={`p-6 text-center ${muted}`}
                      >
                        هنوز داده‌ای در پایگاه داده ثبت نشده است. برای نمایش نمونه می‌توانید
                        اسکریپت <span dir="ltr">seed_reports_demo.py</span> را اجرا کنید.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
