"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowUp,
  Paperclip,
  Sparkles,
  Mic,
  SlidersHorizontal,
  FileText,
  ClipboardList,
  BookOpen,
} from "lucide-react";
import { useTheme } from "../theme-context";
import { conversations } from "../lib/mock-history";

const suggestions = [
  {
    icon: FileText,
    title: "فرم اداری می‌خواهم",
    desc: "فرم موردنظرت را بگو تا پیدا و پر کنم.",
  },
  {
    icon: ClipboardList,
    title: "پیگیری درخواست",
    desc: "وضعیت درخواست‌های قبلی‌ات را ببین.",
  },
  {
    icon: BookOpen,
    title: "راهنمای قوانین",
    desc: "درباره مقررات و مراحل اداری بپرس.",
  },
];

function ChatPanelInner() {
  const { isDarkMode } = useTheme();
  const [text, setText] = useState("");

  // اگر از صفحه تاریخچه روی «ادامه گفتگو» زده باشد، اینجا آن را تشخیص می‌دهیم
  const params = useSearchParams();
  const continueId = params.get("continue");

  useEffect(() => {
    if (!continueId) return;
    const found = conversations.find((c) => c.id === continueId);
    if (found) {
      setText(`ادامه‌ی گفتگوی «${found.title}»: `);
    }
  }, [continueId]);

  const t = isDarkMode
    ? {
        hello: "text-[#8bd0bf]",
        sub: "text-white/55",
        boxOuter: "border-white/10",
        boxOuterBg: "rgba(25,54,50,0.92)",
        banner: "text-white/75",
        boxInnerBg: "#102623",
        chip: "border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/10",
        card: "border-white/10",
        cardBg: "rgba(25,54,50,0.82)",
        cardDesc: "text-white/55",
        iconColor: "text-white",
      }
    : {
        hello: "text-[#15554f]",
        sub: "text-[#68766c]",
        boxOuter: "border-[#d5dad4]",
        boxOuterBg: "rgba(237,240,235,0.96)",
        banner: "text-[#40584e]",
        boxInnerBg: "#ffffff",
        chip: "border-[#d5dad4] bg-white/80 text-[#40584e] hover:bg-[#edf0eb]",
        card: "border-[#d5dad4]",
        cardBg: "rgba(255,255,255,0.82)",
        cardDesc: "text-[#68766c]",
        iconColor: "text-[#15554f]",
      };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[34rem] flex-col items-center justify-center py-4 text-center">
      <div
        aria-hidden="true"
        className="mb-4 grid h-20 w-20 shrink-0 place-items-center rounded-[1.6rem] border border-white/35 bg-gradient-to-br from-[#32796d] via-[#15554f] to-[#102623] shadow-[0_12px_30px_rgba(21,85,79,0.25)] ring-4 ring-[#15554f]/[0.08]"
      >
        <Sparkles className="h-9 w-9 text-white drop-shadow-sm" strokeWidth={1.6} />
      </div>

      <h1 className={`text-lg font-bold ${t.hello}`}>سلام، علی</h1>
      <h2 className="mt-0.5 text-2xl font-black leading-tight">
        امروز چه کاری از من برمیاد؟
      </h2>
      <p className={`mt-2 max-w-[15rem] text-[0.7rem] leading-5 ${t.sub}`}>
        من اینجام تا کارهای اداری‌ات رو سریع‌تر و ساده‌تر انجام بدم.
      </p>

      {/* کارت نیمه‌شفاف دور باکس ورودی */}
      <div
        className={`mt-5 w-full rounded-2xl border p-1 shadow-2xl backdrop-blur-sm ${t.boxOuter}`}
        style={{ background: t.boxOuterBg }}
      >
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[0.7rem] ${t.banner}`}>
          <Sparkles className="h-3.5 w-3.5 text-[#4f7aab]" />
          <span>با هوش مصنوعی کارهای اداری را سریع‌تر انجام دهید</span>
        </div>

        <div className="rounded-xl px-2 pb-2 pt-1" style={{ background: t.boxInnerBg }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="درخواست جدید"
            placeholder="درخواستت را بنویس... (مثلاً: فرم پروانه ساختمان)"
            className="h-14 w-full resize-none bg-transparent p-2 text-right text-sm outline-none placeholder:text-current placeholder:opacity-35"
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] transition-colors ${t.chip}`}
              >
                <Paperclip className="h-3.5 w-3.5" />
                پیوست فایل
              </button>
              <button
                type="button"
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] transition-colors ${t.chip}`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                ابزارها
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="ورودی صوتی"
                className={`rounded-full border p-1.5 transition-colors ${t.chip}`}
              >
                <Mic className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="ارسال درخواست"
                disabled={!text.trim()}
                className="rounded-full bg-[#15554f] p-1.5 text-white transition-colors hover:bg-[#246b61] disabled:opacity-60"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* کارت‌های پیشنهاد */}
      <div className="mt-3 grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
        {suggestions.map(({ icon: Icon, title, desc }) => (
          <button
            key={title}
            type="button"
            onClick={() => setText(title)}
            className={`rounded-xl border p-2.5 text-right transition-colors hover:brightness-125 ${t.card}`}
            style={{ background: t.cardBg }}
          >
            <div className="mb-1 flex items-center gap-1.5 text-xs font-bold">
              <Icon className={`h-3.5 w-3.5 ${t.iconColor}`} />
              {title}
            </div>
            <p className={`text-[0.65rem] leading-4 ${t.cardDesc}`}>{desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ChatPanel() {
  return (
    <Suspense fallback={null}>
      <ChatPanelInner />
    </Suspense>
  );
}