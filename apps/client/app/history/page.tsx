"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  ChevronUp,
  ChevronDown,
  X,
  CalendarDays,
  MessageSquareText,
  Trash2,
} from "lucide-react";
import { useTheme } from "../theme-context";
import {
  conversations as initialConversations,
  Conversation,
} from "../lib/mock-history";
import {
  formatJalali,
  gregorianToJalali,
  jalaliMonthNames,
} from "../lib/jalali";

/** تعداد تکرار query در یک متن (بدون درنظرگرفتن بزرگی/کوچکی حروف) */
function countMatches(text: string, query: string) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let count = 0;
  let idx = 0;
  while (true) {
    const found = t.indexOf(q, idx);
    if (found === -1) break;
    count += 1;
    idx = found + q.length;
  }
  return count;
}

/**
 * متن را با هایلایت نتایج جستجو رندر می‌کند (مثل Ctrl+F مرورگر).
 * برخلاف نسخه‌ی قبلی، شماره‌ی هر نتیجه از روی startIndex (که از قبل و
 * بدون هیچ متغیر مشترکی محاسبه شده) به‌دست می‌آید، نه از یک شمارنده‌ی
 * سراسری که در حین رندر تغییر می‌کرد و باعث بی‌نظمی در پیمایش می‌شد.
 */
function Highlighted({
  text,
  query,
  startIndex,
  activeIndex,
  registerRef,
}: {
  text: string;
  query: string;
  startIndex: number;
  activeIndex: number;
  registerRef: (idx: number, el: HTMLElement | null) => void;
}) {
  if (!query) return <>{text}</>;

  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let local = 0;

  while (true) {
    const found = t.indexOf(q, cursor);
    if (found === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (found > cursor) parts.push(text.slice(cursor, found));

    const myIdx = startIndex + local;
    local += 1;
    const isActive = myIdx === activeIndex;

    parts.push(
      <mark
        key={`${myIdx}-${found}`}
        ref={(el) => registerRef(myIdx, el)}
        className={
          isActive
            ? "rounded bg-orange-400 px-0.5 text-black"
            : "rounded bg-yellow-300/70 px-0.5 text-black"
        }
      >
        {text.slice(found, found + query.length)}
      </mark>,
    );
    cursor = found + query.length;
  }

  return <>{parts}</>;
}

export default function HistoryPage() {
  const { isDarkMode } = useTheme();
  const router = useRouter();

  const [items, setItems] = useState<Conversation[]>(initialConversations);
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // فیلتر ماهانه‌ی شمسی: فقط یک ماه + سال (بدون بازه)
  const [filterMonth, setFilterMonth] = useState("");
  const [filterYear, setFilterYear] = useState("");

  const matchRefs = useRef<Record<number, HTMLElement | null>>({});
  const registerRef = (idx: number, el: HTMLElement | null) => {
    matchRefs.current[idx] = el;
  };

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    initialConversations.forEach((c) =>
      set.add(gregorianToJalali(c.date).year),
    );
    return Array.from(set).sort((a, b) => b - a);
  }, []);

  const hasMonthFilter = !!filterMonth && !!filterYear;

  const clearMonthFilter = () => {
    setFilterMonth("");
    setFilterYear("");
  };

  const filteredByMonth = useMemo(() => {
    if (!hasMonthFilter) return items;
    return items.filter((c) => {
      const j = gregorianToJalali(c.date);
      return j.month === +filterMonth && j.year === +filterYear;
    });
  }, [items, hasMonthFilter, filterMonth, filterYear]);

  const sorted = useMemo(
    () =>
      [...filteredByMonth].sort((a, b) => b.date.getTime() - a.date.getTime()),
    [filteredByMonth],
  );

  // محاسبه‌ی از پیش‌تعیین‌شده‌ی موقعیت هر نتیجه (بدون هیچ شمارنده‌ی مشترکی حین رندر)
  const matchLayout = useMemo(() => {
    let running = 0;
    const byId = new Map<
      string,
      { titleStart: number; snippetStart: number }
    >();
    for (const c of sorted) {
      const titleStart = running;
      running += countMatches(c.title, query);
      const snippetStart = running;
      running += countMatches(c.snippet, query);
      byId.set(c.id, { titleStart, snippetStart });
    }
    return { byId, total: running };
  }, [sorted, query]);

  const totalMatches = query ? matchLayout.total : 0;

  // با تغییر جستجو یا فیلتر، برو به اولین نتیجه
  useEffect(() => {
    setActiveMatch(0);
  }, [query, filterMonth, filterYear]);

  // اگر تعداد نتایج کم شد (مثلاً بعد از حذف)، ایندکس را اصلاح کن
  useEffect(() => {
    if (activeMatch >= totalMatches) setActiveMatch(0);
  }, [totalMatches, activeMatch]);

  // اسکرول واقعی به نتیجه‌ی فعال روی کانتینر اصلی اسکرول (main در AppShell)
  useEffect(() => {
    if (!query || totalMatches === 0) return;
    const el = matchRefs.current[activeMatch];
    const container = document.getElementById("app-main-scroll");
    if (!el || !container) return;

    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const targetTop =
      container.scrollTop +
      (elRect.top - containerRect.top) -
      container.clientHeight / 2 +
      elRect.height / 2;

    container.scrollTo({ top: targetTop, behavior: "smooth" });
  }, [activeMatch, query, totalMatches]);

  const goNext = () => {
    if (totalMatches === 0) return;
    setActiveMatch((i) => (i + 1) % totalMatches);
  };
  const goPrev = () => {
    if (totalMatches === 0) return;
    setActiveMatch((i) => (i - 1 + totalMatches) % totalMatches);
  };

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((c) => c.id !== id));
    setConfirmDeleteId(null);
  };

  const handleContinue = (id: string) => {
    router.push(`/?continue=${id}`);
  };

  const t = isDarkMode
    ? {
        text: "text-white",
        sub: "text-white/55",
        card: "border-white/10 bg-[#193632] hover:bg-[#203b39]",
        input:
          "border-white/10 bg-white/[0.06] text-white placeholder:text-white/40",
        chip: "border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/10",
        iconBtn: "hover:bg-white/10",
        stickyBg: "border-white/10 bg-[#122925]/95",
        select:
          "rounded-lg border border-white/10 bg-white/[0.06] px-1.5 py-1 text-[0.7rem] text-white/80 outline-none",
        optionBg: "#122925",
        optionText: "#ffffff",
      }
    : {
        text: "text-[#28443d]",
        sub: "text-[#68766c]",
        card: "border-[#d5dad4] bg-white hover:bg-[#fafbf9]",
        input:
          "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]",
        chip: "border-[#d5dad4] bg-white/70 text-[#40584e] hover:bg-white",
        iconBtn: "hover:bg-[#edf0eb]",
        stickyBg: "border-[#d5dad4] bg-[#edf0eb]/95",
        select:
          "rounded-lg border border-[#d5dad4] bg-white px-1.5 py-1 text-[0.7rem] text-[#40584e] outline-none",
        optionBg: "#ffffff",
        optionText: "#28443d",
      };

  return (
    <div className={`mx-auto w-full max-w-3xl pb-10 pt-4 ${t.text}`}>
      {/* نوار جستجو و فیلتر: کارتی گرد، رنگ متمایز و چسبان به بالای صفحه */}
      <div
        className={`sticky top-2 z-30 mb-4 rounded-2xl border p-4 shadow-lg backdrop-blur-md ${t.stickyBg}`}
      >
        <h1 className="mb-1 text-xl font-black">تاریخچه درخواست‌ها</h1>
        <p className={`mb-4 text-xs ${t.sub}`}>
          گفتگوهای قبلی خود را جستجو، فیلتر یا مدیریت کنید.
        </p>

        {/* نوار جستجوی پیشرفته، شبیه جستجوی مرورگر (Ctrl+F) */}
        <div
          className={`mb-3 flex items-center gap-2 rounded-2xl border px-3 py-2 ${t.input}`}
        >
          <Search className="h-4 w-4 shrink-0 opacity-60" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) goPrev();
                else goNext();
              } else if (e.key === "Escape") {
                setQuery("");
              }
            }}
            placeholder="جستجو در عنوان و متن گفتگوها... (Enter برای نتیجه بعدی)"
            className="w-full bg-transparent text-sm outline-none placeholder:opacity-50"
          />
          {query && (
            <>
              <span
                className="shrink-0 text-[0.7rem] tabular-nums opacity-60"
                dir="ltr"
              >
                {totalMatches > 0
                  ? `${activeMatch + 1}/${totalMatches}`
                  : "0/0"}
              </span>
              <button
                type="button"
                aria-label="نتیجه قبلی"
                onClick={goPrev}
                disabled={totalMatches === 0}
                className={`rounded-lg p-1 disabled:opacity-30 ${t.iconBtn}`}
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="نتیجه بعدی"
                onClick={goNext}
                disabled={totalMatches === 0}
                className={`rounded-lg p-1 disabled:opacity-30 ${t.iconBtn}`}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="پاک کردن جستجو"
                onClick={() => setQuery("")}
                className={`rounded-lg p-1 ${t.iconBtn}`}
              >
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* فیلتر ماه شمسی (فقط یک ماه، بدون بازه) */}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`flex items-center gap-1 text-xs ${t.sub}`}>
            <CalendarDays className="h-3.5 w-3.5" />
            فیلتر ماه:
          </span>

          <div className="relative inline-flex">
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className={`${t.select} appearance-none pl-6`}
              aria-label="ماه"
            >
              <option
                value=""
                style={{ background: t.optionBg, color: t.optionText }}
              >
                ماه
              </option>
              {jalaliMonthNames.map((m, i) => (
                <option
                  key={m}
                  value={i + 1}
                  style={{ background: t.optionBg, color: t.optionText }}
                >
                  {m}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60"
            />
          </div>

          <div className="relative inline-flex">
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className={`${t.select} appearance-none pl-6`}
              aria-label="سال"
            >
              <option
                value=""
                style={{ background: t.optionBg, color: t.optionText }}
              >
                سال
              </option>
              {yearOptions.map((y) => (
                <option
                  key={y}
                  value={y}
                  style={{ background: t.optionBg, color: t.optionText }}
                >
                  {y}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60"
            />
          </div>

          {hasMonthFilter && (
            <button
              type="button"
              onClick={clearMonthFilter}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.7rem] transition-colors ${t.chip}`}
            >
              <X className="h-3 w-3" />
              پاک کردن فیلتر
            </button>
          )}
        </div>
      </div>

      {/* لیست گفتگوها */}
      <div className="flex flex-col gap-2.5">
        {sorted.length === 0 && (
          <p className={`py-10 text-center text-sm ${t.sub}`}>
            موردی یافت نشد.
          </p>
        )}

        {sorted.map((c) => {
          const layout = matchLayout.byId.get(c.id) ?? {
            titleStart: 0,
            snippetStart: 0,
          };
          return (
            <div
              key={c.id}
              className={`rounded-2xl border p-3.5 text-right transition-colors ${t.card}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">
                  <Highlighted
                    text={c.title}
                    query={query}
                    startIndex={layout.titleStart}
                    activeIndex={activeMatch}
                    registerRef={registerRef}
                  />
                </h3>
                <span className={`shrink-0 text-[0.65rem] ${t.sub}`}>
                  {formatJalali(c.date)}
                </span>
              </div>

              <p className={`mb-3 text-xs leading-5 ${t.sub}`}>
                <Highlighted
                  text={c.snippet}
                  query={query}
                  startIndex={layout.snippetStart}
                  activeIndex={activeMatch}
                  registerRef={registerRef}
                />
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleContinue(c.id)}
                  className="flex items-center gap-1.5 rounded-full bg-[#15554f] px-3 py-1.5 text-[0.7rem] text-white transition-colors hover:bg-[#246b61]"
                >
                  <MessageSquareText className="h-3.5 w-3.5" />
                  ادامه گفتگو
                </button>

                {confirmDeleteId === c.id ? (
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[0.7rem] ${t.sub}`}>حذف شود؟</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      className="rounded-full bg-red-500 px-2.5 py-1 text-[0.7rem] text-white hover:bg-red-400"
                    >
                      بله
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className={`rounded-full border px-2.5 py-1 text-[0.7rem] ${t.chip}`}
                    >
                      انصراف
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(c.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.7rem] transition-colors ${t.chip}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    حذف
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
