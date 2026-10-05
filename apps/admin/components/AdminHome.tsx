"use client";

import React from "react";
import { Users, ClipboardList, Workflow, MessageSquare } from "lucide-react";
import { useTheme } from "../theme-context";

const stats = [
  { icon: Users, label: "کارمندان فعال", value: "۴۲" },
  { icon: ClipboardList, label: "درخواست‌های باز", value: "۱۸" },
  { icon: Workflow, label: "پروسه‌های در جریان", value: "۷" },
  { icon: MessageSquare, label: "پیام‌های خوانده‌نشده", value: "۵" },
];

/**
 * این کامپوننت فعلاً یک داشبورد نمایشی و موقت است.
 * ساختار نهایی صفحه‌ی اصلی ادمین بعداً همین‌جا (در همین فایل) تکمیل می‌شود.
 */
export default function AdminHome() {
  const { isDarkMode } = useTheme();

  const t = isDarkMode
    ? {
        text: "text-white",
        sub: "text-white/60",
        card: "border-white/10 bg-[#193632]",
        iconWrap: "bg-white/[0.08] text-slate-300",
      }
    : {
        text: "text-[#28443d]",
        sub: "text-[#68766c]",
        card: "border-[#d5dad4] bg-[#fafbf9]",
        iconWrap: "bg-[#e9dfcc] text-[#15554f]",
      };

  return (
    <div className={`w-full ${t.text}`}>
      <h1 className="mb-1 text-xl font-black">صفحه اصلی</h1>
      <p className={`mb-6 text-xs ${t.sub}`}>نمای کلی وضعیت سامانه.</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className={`rounded-2xl border p-4 text-right ${t.card}`}>
            <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${t.iconWrap}`}>
              <Icon className="h-4.5 w-4.5" />
            </div>
            <div className="text-2xl font-black">{value}</div>
            <div className={`mt-1 text-[0.7rem] ${t.sub}`}>{label}</div>
          </div>
        ))}
      </div>

      <div className={`mt-4 rounded-2xl border p-6 text-center text-sm ${t.card} ${t.sub}`}>
        محتوای اصلی این صفحه به‌زودی طراحی می‌شود.
      </div>
    </div>
  );
}