"use client";

import React from "react";
import Link from "next/link";
import {
  Users,
  ClipboardList,
  MessageSquare,
  User,
  ChevronLeft,
  Circle,
  Shield,
  LogIn,
} from "lucide-react";
import { useTheme } from "../theme-context";
import { useAuth } from "../app/auth-context";
import { formatJalali } from "../app/lib/jalali";
import AnalogClock from "./AnalogClock";

/* ---------- داده‌های نمایشی (موقت) ---------- */
const pendingRequests = [
  { id: 1, title: "درخواست مرخصی استحقاقی", employee: "سارا احمدی", status: "در انتظار", time: "۰۹:۴۵" },
  { id: 2, title: "درخواست خرید تجهیزات", employee: "رضا کریمی", status: "تأیید اولیه", time: "دیروز" },
  { id: 3, title: "درخواست دورکاری", employee: "مینا رضایی", status: "در انتظار", time: "۱۱:۲۰" },
  { id: 4, title: "درخواست مأموریت", employee: "علی محمدی", status: "در انتظار", time: "دیروز" },
];

const activeEmployees = [
  { id: 1, name: "سارا احمدی", role: "کارشناس منابع انسانی", status: "آنلاین" },
  { id: 2, name: "رضا کریمی", role: "توسعه‌دهنده", status: "آنلاین" },
  { id: 3, name: "مینا رضایی", role: "طراح UI", status: "مشغول" },
  { id: 4, name: "حسین نوری", role: "مدیر پروژه", status: "آنلاین" },
  { id: 5, name: "فاطمه زارعی", role: "حسابدار", status: "آنلاین" },
];

const todayMessages = [
  { id: 1, from: "سارا احمدی", text: "سلام، فایل گزارش ماهانه رو فرستادم.", time: "۱۰:۱۲" },
  { id: 2, from: "رضا کریمی", text: "سیستم تیکتینگ یه باگ داره، لطفاً بررسی کنید.", time: "۰۹:۴۸" },
  { id: 3, from: "مینا رضایی", text: "طراحی صفحه جدید آماده شد.", time: "۰۹:۱۵" },
  { id: 4, from: "حسین نوری", text: "جلسه ساعت ۱۴ برگزار می‌شه.", time: "۰۸:۵۰" },
];

export default function AdminHome() {
  const { isDarkMode } = useTheme();
  const { user } = useAuth();

  const lastLogin = user?.last_login_at ? new Date(user.last_login_at) : null;
  const lastLoginLabel =
    lastLogin && !Number.isNaN(lastLogin.getTime())
      ? `${formatJalali(lastLogin)} · ${new Intl.DateTimeFormat("fa-IR", {
          hour: "2-digit",
          minute: "2-digit",
        }).format(lastLogin)}`
      : "—";
  const roleLabel = user?.role_name || user?.role || "—";
  const unitLabel = user?.unit?.trim() || "بدون واحد سازمانی";

  const t = isDarkMode
    ? {
      text: "text-white",
      sub: "text-white/60",
      card: "border-white/10 bg-[#193632]",
      cardHover: "hover:bg-[#1f403b]",
      iconWrap: "bg-white/[0.08] text-slate-300",
      badge: "bg-[#15554f]/40 text-[#7dd3c0]",
      statusOnline: "text-emerald-400",
      statusBusy: "text-amber-400",
      divider: "border-white/10",
      softBg: "bg-white/[0.04]",
    }
    : {
      text: "text-[#28443d]",
      sub: "text-[#68766c]",
      card: "border-[#d5dad4] bg-[#fafbf9]",
      cardHover: "hover:bg-[#f3f5f1]",
      iconWrap: "bg-[#e9dfcc] text-[#15554f]",
      badge: "bg-[#e9dfcc] text-[#15554f]",
      statusOnline: "text-emerald-600",
      statusBusy: "text-amber-600",
      divider: "border-[#d5dad4]",
      softBg: "bg-[#f1eee5]",
    };

  return (
    <div className={`w-full space-y-5 ${t.text}`}>
      {/* ========== ردیف بالا: ساعت + اطلاعات کاربر ========== */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* کاشی ساعت و تقویم‌ها */}
        <section className={`rounded-2xl border p-5 ${t.card}`}>
          {/* هدر */}
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <span className={isDarkMode ? "text-[#7dd3c0]" : "text-[#b45309]"}>
                {new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }).format(new Date())}
              </span>
              <span className={`mx-1 ${t.sub}`}>|</span>
              <span>ساعت و تقویم ایران</span>
            </div>
          </div>

          {/* بدنه: ساعت سمت راست + تاریخ‌ها وسط */}
          <div className="flex items-center justify-between gap-6">
            {/* ساعت آنالوگ - سمت راست */}
            <div className="shrink-0">
              <AnalogClock />
            </div>

            {/* سه تاریخ - وسط */}
            <div className="flex flex-1 justify-center">
              <div className="grid grid-cols-1 gap-6 text-center sm:grid-cols-3 sm:gap-10">
                {/* تاریخ خورشیدی */}
                <div>
                  <div className={`text-[0.7rem] font-medium ${isDarkMode ? "text-[#7dd3c0]" : "text-[#b45309]"}`}>
                    تاریخ خورشیدی
                  </div>
                  <div className="mt-1 text-sm font-bold">
                    {new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    }).format(new Date())}
                  </div>
                  <div className={`mt-0.5 text-[0.75rem] ${t.sub}`}>
                    {new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    }).format(new Date())}
                  </div>
                </div>

                {/* تاریخ میلادی */}
                <div>
                  <div className={`text-[0.7rem] font-medium ${isDarkMode ? "text-[#7dd3c0]" : "text-[#b45309]"}`}>
                    تاریخ میلادی
                  </div>
                  <div className="mt-1 text-sm font-bold">
                    {new Intl.DateTimeFormat("en-CA", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    }).format(new Date())}
                  </div>
                  <div className={`mt-0.5 text-[0.75rem] ${t.sub}`}>
                    {new Intl.DateTimeFormat("en-GB", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    }).format(new Date())}
                  </div>
                </div>

                {/* تاریخ قمری */}
                <div>
                  <div className={`text-[0.7rem] font-medium ${isDarkMode ? "text-[#7dd3c0]" : "text-[#b45309]"}`}>
                    تاریخ قمری
                  </div>
                  <div className="mt-1 text-sm font-bold">
                    {new Intl.DateTimeFormat("fa-IR-u-ca-islamic", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    }).format(new Date())}
                  </div>
                  <div className={`mt-0.5 text-[0.75rem] ${t.sub}`}>
                    {new Intl.DateTimeFormat("fa-IR-u-ca-islamic", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    }).format(new Date())}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* کاشی اطلاعات کاربر */}
        <section className={`rounded-2xl border p-5 ${t.card}`}>
          {/* بالای کارت */}
          <div className="flex items-center gap-4">
            {/* آواتار گرد با حلقه وضعیت */}
            <div className="relative shrink-0">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#276e63] to-[#174b46] text-white shadow-lg ring-2 ring-white/20">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.full_name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-7 w-7" />
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-lg font-black">{user?.full_name ?? "کاربر"}</h3>
                <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${t.badge}`}>
                  آنلاین
                </span>
              </div>
              <p className={`mt-0.5 truncate text-sm ${t.sub}`}>
                {roleLabel} · {unitLabel}
              </p>
            </div>
          </div>

          {/* خط جداکننده */}
          <div className={`my-4 h-px ${isDarkMode ? "bg-white/10" : "bg-[#d5dad4]"}`} />

          {/* اطلاعات */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-xl p-3 ${t.softBg}`}>
              <div className={`mb-1 text-[0.65rem] ${t.sub}`}>آخرین ورود</div>
              <div className="flex items-center gap-1.5 text-sm font-bold">
                <LogIn className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">{lastLoginLabel}</span>
              </div>
            </div>

            <div className={`rounded-xl p-3 ${t.softBg}`}>
              <div className={`mb-1 text-[0.65rem] ${t.sub}`}>نقش کاربری</div>
              <div className="flex items-center gap-1.5 text-sm font-bold">
                <Shield className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">{roleLabel}</span>
              </div>
            </div>
          </div>

          {/* دکمه پایین */}
          <div className="mt-4 flex">
            <Link
              href="/profile"
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors ${isDarkMode
                ? "border-white/15 bg-white/5 text-white hover:bg-white/10"
                : "border-[#d5dad4] bg-white text-[#28443d] hover:bg-[#f3f5f1]"
                }`}
            >
              <User className="h-4 w-4" />
              حساب کاربری
            </Link>
          </div>
        </section>
      </div>
      {/* ========== گرید پایین ========== */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* درخواست‌های امروز / مانده */}
        <section className={`rounded-2xl border ${t.card}`}>
          <div className={`flex items-center justify-between border-b px-4 py-3 ${t.divider}`}>
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${t.iconWrap}`}>
                <ClipboardList className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-bold">درخواست‌های امروز و مانده</h2>
            </div>
            <Link
              href="/requests"
              className={`flex items-center gap-1 text-[0.7rem] font-medium ${t.sub} hover:opacity-80`}
            >
              مشاهده همه
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-current/5">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className={`flex items-start justify-between gap-3 px-4 py-3 transition-colors ${t.cardHover}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{req.title}</div>
                  <div className={`mt-0.5 text-[0.7rem] ${t.sub}`}>{req.employee}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${t.badge}`}>
                    {req.status}
                  </span>
                  <span className={`text-[0.65rem] ${t.sub}`}>{req.time}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* کارمندان فعال امروز */}
        <section className={`rounded-2xl border ${t.card}`}>
          <div className={`flex items-center justify-between border-b px-4 py-3 ${t.divider}`}>
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${t.iconWrap}`}>
                <Users className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-bold">کارمندان فعال امروز</h2>
            </div>
            <Link
              href="/employees"
              className={`flex items-center gap-1 text-[0.7rem] font-medium ${t.sub} hover:opacity-80`}
            >
              مشاهده همه
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-current/5">
            {activeEmployees.map((emp) => (
              <div
                key={emp.id}
                className={`flex items-center gap-3 px-4 py-3 transition-colors ${t.cardHover}`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isDarkMode ? "bg-[#15554f] text-white" : "bg-[#15554f] text-white"
                    }`}
                >
                  {emp.name
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0] || "")
                    .join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{emp.name}</div>
                  <div className={`truncate text-[0.7rem] ${t.sub}`}>{emp.role}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Circle
                    className={`h-2 w-2 fill-current ${emp.status === "آنلاین" ? t.statusOnline : t.statusBusy
                      }`}
                  />
                  <span className={`text-[0.65rem] ${t.sub}`}>{emp.status}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* پیام‌های امروز */}
        <section className={`rounded-2xl border ${t.card}`}>
          <div className={`flex items-center justify-between border-b px-4 py-3 ${t.divider}`}>
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${t.iconWrap}`}>
                <MessageSquare className="h-4 w-4" />
              </div>
              <h2 className="text-sm font-bold">پیام‌های امروز</h2>
            </div>
            <Link
              href="/messages"
              className={`flex items-center gap-1 text-[0.7rem] font-medium ${t.sub} hover:opacity-80`}
            >
              مشاهده همه
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-current/5">
            {todayMessages.map((msg) => (
              <div
                key={msg.id}
                className={`px-4 py-3 transition-colors ${t.cardHover}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{msg.from}</span>
                  <span className={`text-[0.65rem] ${t.sub}`}>{msg.time}</span>
                </div>
                <p className={`mt-1 line-clamp-1 text-[0.75rem] ${t.sub}`}>{msg.text}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}