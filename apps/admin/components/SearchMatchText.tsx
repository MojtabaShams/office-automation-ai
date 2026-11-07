"use client";

import React from "react";

/** تعداد تکرار query در یک متن (بدون درنظرگرفتن بزرگی/کوچکی حروف) */
export function countSearchMatches(text: string, query: string): number {
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
 * شماره‌ی هر نتیجه از روی startIndex (که از قبل و بدون هیچ متغیر مشترکی
 * محاسبه شده) به‌دست می‌آید، نه از یک شمارنده‌ی سراسری در حین رندر —
 * برای جلوگیری از بی‌نظمی در پیمایش بین نتایج.
 */
export default function SearchMatchText({
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
      </mark>
    );
    cursor = found + query.length;
  }

  return <>{parts}</>;
}