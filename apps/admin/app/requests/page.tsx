"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, FolderOpen, Search, X } from "lucide-react";
import { useTheme } from "../../theme-context";
import JalaliDateRangeFilter, { type DateRangeValue } from "../../components/JalaliDateRangeFilter";
import RequestFolderCard from "../../components/requests/RequestFolderCard";
import SearchMatchText, { countSearchMatches } from "../../components/SearchMatchText";
import type { AdminRequest, RequestGroup } from "../lib/mock-requests";
import {
  escalateOverdueRequests,
  formatRequestId,
  initialRequests,
  REQUEST_STORAGE_KEY,
  saveRequests,
} from "../lib/mock-requests";

const tabs: { id: RequestGroup; label: string }[] = [
  { id: "active", label: "در حال رسیدگی" },
  { id: "completed", label: "تکمیل‌شده" },
  { id: "expired", label: "بسته‌شده به دلیل انقضای مهلت" },
];

export default function RequestsPage() {
  const { isDarkMode } = useTheme();
  const [requests, setRequests] = useState<AdminRequest[]>(initialRequests);
  const [group, setGroup] = useState<RequestGroup>("active");
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const matchRefs = useRef<(HTMLElement | null)[]>([]);
  const [dateRange, setDateRange] = useState<DateRangeValue>();
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REQUEST_STORAGE_KEY);
      const storedRequests = saved ? JSON.parse(saved) as AdminRequest[] : initialRequests;
      const result = escalateOverdueRequests(storedRequests);
      setRequests(result.requests);
      if (result.changed) saveRequests(result.requests);
    } catch (error) {
      console.error("بارگذاری درخواست‌های ذخیره‌شده ناموفق بود:", error);
      setStorageError("داده‌های ذخیره‌شده بارگذاری نشدند؛ نمونه‌های اولیه نمایش داده می‌شوند.");
    }
  }, []);

  const counts = useMemo(
    () => ({
      active: requests.filter((request) => request.group === "active").length,
      completed: requests.filter((request) => request.group === "completed").length,
      expired: requests.filter((request) => request.group === "expired").length,
    }),
    [requests]
  );

  const filteredRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fa");
    return requests.filter((request) => {
      if (request.group !== group) return false;
      if (
        normalizedQuery &&
        !`${request.id} ${request.title} ${request.applicantName} ${request.applicantPhone} ${request.processName}`
          .toLocaleLowerCase("fa")
          .includes(normalizedQuery)
      ) return false;
      const createdAt = new Date(request.createdAt);
      if (dateRange?.from && createdAt < dateRange.from) return false;
      if (dateRange?.to && createdAt > dateRange.to) return false;
      return true;
    });
  }, [dateRange, group, query, requests]);

  const matchLayout = useMemo(() => {
    const fieldStarts = new Map<string, Partial<Record<"title" | "applicant" | "id" | "process" | "phone", number>>>();
    let total = 0;
    if (!query) return { fieldStarts, total };
    filteredRequests.forEach((request) => {
      const starts: Partial<Record<"title" | "applicant" | "id" | "process" | "phone", number>> = {};
      const fields = [
        ["title", request.title],
        ["applicant", request.applicantName],
        ["id", formatRequestId(request.id)],
        ["process", request.processName],
        ["phone", request.applicantPhone],
      ] as const;
      fields.forEach(([fieldKey, text]) => {
        const matches = countSearchMatches(text, query);
        if (!matches) return;
        starts[fieldKey] = total;
        total += matches;
      });
      fieldStarts.set(request.id, starts);
    });
    return { fieldStarts, total };
  }, [filteredRequests, query]);

  useEffect(() => {
    if (activeMatch >= matchLayout.total) setActiveMatch(0);
  }, [activeMatch, matchLayout.total]);

  useEffect(() => {
    if (!query || !matchLayout.total) return;
    const element = matchRefs.current[activeMatch];
    const container = document.getElementById("admin-main-scroll");
    if (!element || !container) return;
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const targetTop = container.scrollTop
      + elementRect.top - containerRect.top
      - container.clientHeight / 2
      + elementRect.height / 2;
    container.scrollTo({ top: targetTop, behavior: "smooth" });
  }, [activeMatch, matchLayout, query]);

  const navigateMatches = (direction: -1 | 1) => {
    if (!matchLayout.total) return;
    setActiveMatch((current) => (current + direction + matchLayout.total) % matchLayout.total);
  };

  const surface = isDarkMode
    ? "border-white/10 bg-[#193632] text-white"
    : "border-[#d5dad4] bg-[#edf0eb] text-[#28443d]";
  const input = isDarkMode
    ? "border-white/10 bg-white/[0.06] text-white placeholder:text-white/40"
    : "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]";

  return (
    <div dir="rtl" className={`w-full ${isDarkMode ? "text-white" : "text-[#28443d]"}`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black">
            <FolderOpen className="h-7 w-7 text-[#15554f]" />
            درخواست‌ها
          </h1>
          <p className={`mt-1 text-xs ${isDarkMode ? "text-white/50" : "text-[#68766c]"}`}>
            پیگیری پرونده‌ها، گردش کار و اقدام‌های موردنیاز
          </p>
        </div>
      </div>

      {storageError && (
        <p role="alert" className="mb-3 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          <AlertCircle className="h-4 w-4" />
          {storageError}
        </p>
      )}

      <section aria-label="فیلتر درخواست‌ها" className={`sticky top-0 z-30 mb-5 rounded-2xl border p-3 shadow-sm ${surface}`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className={`flex min-w-56 flex-1 items-center gap-2 rounded-full border px-3 py-2.5 text-xs ${input}`}>
            <Search className="h-4 w-4 shrink-0 opacity-60" />
            <input
              type="search"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setActiveMatch(0); }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  navigateMatches(event.shiftKey ? -1 : 1);
                } else if (event.key === "Escape") {
                  setQuery("");
                  setActiveMatch(0);
                }
              }}
              placeholder="جستجو بر اساس عنوان، متقاضی یا شماره پرونده... (Enter بعدی، Shift+Enter قبلی)"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:opacity-70"
            />
            {query && (
              <>
                <span className="shrink-0 text-[0.65rem] tabular-nums opacity-60" dir="ltr">{matchLayout.total ? `${activeMatch + 1}/${matchLayout.total}` : "0/0"}</span>
                <button type="button" onClick={() => navigateMatches(-1)} disabled={!matchLayout.total} aria-label="نتیجه قبلی" className="rounded-md p-1 opacity-60 hover:opacity-100 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => navigateMatches(1)} disabled={!matchLayout.total} aria-label="نتیجه بعدی" className="rounded-md p-1 opacity-60 hover:opacity-100 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label="پاک کردن جستجو" onClick={() => { setQuery(""); setActiveMatch(0); }} className="rounded-md p-1 opacity-60 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
              </>
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
          <span className={`shrink-0 rounded-full px-3 py-2 text-xs ${isDarkMode ? "bg-white/[0.06] text-white/65" : "bg-white/70 text-[#68766c]"}`}>
            {requests.length} پرونده
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="دسته‌بندی درخواست‌ها">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={group === tab.id}
              onClick={() => { setGroup(tab.id); setActiveMatch(0); }}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
                group === tab.id
                  ? "border-[#15554f] bg-[#15554f] text-white"
                  : isDarkMode
                    ? "border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]"
                    : "border-[#d5dad4] bg-white/70 text-[#40584e] hover:bg-white"
              }`}
            >
              {tab.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[0.65rem] ${group === tab.id ? "bg-white/15" : isDarkMode ? "bg-white/10" : "bg-[#e6e9e3]"}`}>
                {counts[tab.id]}
              </span>
            </button>
          ))}
        </div>
      </section>

      {filteredRequests.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredRequests.map((request) => (
            <RequestFolderCard
              key={request.id}
              request={request}
              query={query}
              activeIndex={activeMatch}
              matchStarts={matchLayout.fieldStarts.get(request.id)}
              registerRef={(index, element) => { matchRefs.current[index] = element; }}
            />
          ))}
        </div>
      ) : (
        <div className={`rounded-2xl border border-dashed p-10 text-center ${isDarkMode ? "border-white/15 text-white/55" : "border-[#cfd6ce] text-[#68766c]"}`}>
          <FolderOpen className="mx-auto mb-3 h-9 w-9 opacity-45" />
          <p className="text-sm font-semibold">درخواستی با این فیلترها پیدا نشد</p>
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
        </div>
      )}
    </div>
  );
}
