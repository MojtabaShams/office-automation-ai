"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
    ArrowRight,
    BarChart3,
    Download,
    Users,
    ClipboardList,
    Workflow,
    MessageSquare,
    TrendingUp,
    TrendingDown,
} from "lucide-react";
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import { useTheme } from "../../../theme-context";

const reportMeta: Record<
    string,
    {
        title: string;
        icon: React.ElementType;
        color: string;
    }
> = {
    requests: { title: "آمار درخواست‌ها", icon: ClipboardList, color: "#15554f" },
    employees: { title: "عملکرد کارمندان", icon: Users, color: "#3b82f6" },
    processes: { title: "وضعیت پروسه‌ها", icon: Workflow, color: "#8b5cf6" },
    messages: { title: "پیام‌های روزانه", icon: MessageSquare, color: "#f59e0b" },
};

const weeklyData = [
    { name: "شنبه", باز: 12, بسته: 8, انتظار: 4 },
    { name: "یکشنبه", باز: 19, بسته: 11, انتظار: 6 },
    { name: "دوشنبه", باز: 8, بسته: 14, انتظار: 3 },
    { name: "سه‌شنبه", باز: 15, بسته: 9, انتظار: 7 },
    { name: "چهارشنبه", باز: 22, بسته: 13, انتظار: 5 },
    { name: "پنجشنبه", باز: 18, بسته: 10, انتظار: 4 },
    { name: "جمعه", باز: 10, بسته: 7, انتظار: 2 },
];

const statusPie = [
    { name: "باز", value: 18, color: "#15554f" },
    { name: "بسته", value: 42, color: "#3b82f6" },
    { name: "در انتظار", value: 7, color: "#f59e0b" },
];

const kpiCards = [
    { label: "کل درخواست‌ها", value: "۶۷", trend: "+۱۲٪", up: true },
    { label: "میانگین رسیدگی", value: "۲.۴ روز", trend: "-۸٪", up: true },
    { label: "نرخ تکمیل", value: "۷۸٪", trend: "+۵٪", up: true },
    { label: "تأخیر بیش از مهلت", value: "۵", trend: "+۲", up: false },
];

export default function ReportDetailPage() {
    const { isDarkMode } = useTheme();
    const params = useParams<{ id: string }>();
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
   const meta = reportMeta[id]!;
    const Icon = meta.icon;

    const surface = isDarkMode
        ? "border-white/10 bg-[#193632] text-white"
        : "border-[#d5dad4] bg-white text-[#28443d]";
    const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";
    const gridStroke = isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

    return (
        <div dir="rtl" className={`w-full space-y-5 ${isDarkMode ? "text-white" : "text-[#28443d]"}`}>
            {/* بازگشت + هدر */}
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
                            <h1 className="text-xl font-black">{meta.title}</h1>
                            <p className={`mt-0.5 text-xs ${muted}`}>گزارش تفصیلی · به‌روزرسانی لحظه‌ای</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-[#15554f] bg-[#15554f] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#124740]"
                    >
                        <Download className="h-3.5 w-3.5" />
                        خروجی Excel / PDF
                    </button>
                </div>
            </div>

            {/* KPI کارت‌ها */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {kpiCards.map((kpi) => (
                    <div key={kpi.label} className={`rounded-2xl border p-4 ${surface}`}>
                        <div className={`text-[0.7rem] ${muted}`}>{kpi.label}</div>
                        <div className="mt-1 flex items-end justify-between gap-2">
                            <div className="text-2xl font-black">{kpi.value}</div>
                            <div
                                className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold ${kpi.up ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
                                    }`}
                            >
                                {kpi.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                {kpi.trend}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* نمودارها */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                {/* نمودار میله‌ای / خطی */}
                <section className={`rounded-2xl border p-4 lg:col-span-3 ${surface}`}>
                    <h2 className="mb-4 text-sm font-bold">روند هفتگی</h2>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={weeklyData} barGap={4}>
                                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke={muted} />
                                <YAxis tick={{ fontSize: 11 }} stroke={muted} />
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: 12,
                                        border: "none",
                                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                                        fontSize: 12,
                                    }}
                                />
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
                                <Bar dataKey="باز" fill="#15554f" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="بسته" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="انتظار" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                {/* نمودار دایره‌ای */}
                <section className={`rounded-2xl border p-4 lg:col-span-2 ${surface}`}>
                    <h2 className="mb-4 text-sm font-bold">توزیع وضعیت</h2>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusPie}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={80}
                                    paddingAngle={3}
                                >
                                    {statusPie.map((entry) => (
                                        <Cell key={entry.name} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: 12,
                                        border: "none",
                                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                                        fontSize: 12,
                                    }}
                                />
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
                    </div>
                </section>
            </div>

            {/* جدول خلاصه */}
            <section className={`rounded-2xl border p-4 ${surface}`}>
                <h2 className="mb-3 text-sm font-bold">خلاصه وضعیت</h2>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-right text-xs">
                        <thead>
                            <tr className={`border-b ${isDarkMode ? "border-white/10" : "border-[#d5dad4]"}`}>
                                <th className={`pb-2 font-semibold ${muted}`}>وضعیت</th>
                                <th className={`pb-2 font-semibold ${muted}`}>تعداد</th>
                                <th className={`pb-2 font-semibold ${muted}`}>درصد</th>
                                <th className={`pb-2 font-semibold ${muted}`}>تغییر نسبت به هفته قبل</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { status: "باز", count: 18, percent: "۲۷٪", change: "+۴" },
                                { status: "بسته", count: 42, percent: "۶۳٪", change: "+۲" },
                                { status: "در انتظار", count: 7, percent: "۱۰٪", change: "-۱" },
                            ].map((row) => (
                                <tr
                                    key={row.status}
                                    className={`border-b last:border-0 ${isDarkMode ? "border-white/5" : "border-[#edf0eb]"
                                        }`}
                                >
                                    <td className="py-2.5 font-medium">{row.status}</td>
                                    <td className="py-2.5">{row.count}</td>
                                    <td className="py-2.5">{row.percent}</td>
                                    <td className="py-2.5">{row.change}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}