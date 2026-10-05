"use client";

import type { ReactNode } from "react";

export function countSearchMatches(text: string, query: string) {
  if (!query) return 0;
  const normalizedText = text.toLocaleLowerCase("fa");
  const normalizedQuery = query.toLocaleLowerCase("fa");
  let count = 0;
  let cursor = 0;
  while (true) {
    const found = normalizedText.indexOf(normalizedQuery, cursor);
    if (found === -1) return count;
    count += 1;
    cursor = found + normalizedQuery.length;
  }
}

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
  registerRef: (index: number, element: HTMLElement | null) => void;
}) {
  if (!query) return <>{text}</>;

  const normalizedText = text.toLocaleLowerCase("fa");
  const normalizedQuery = query.toLocaleLowerCase("fa");
  const parts: ReactNode[] = [];
  let cursor = 0;
  let matchOffset = 0;

  while (true) {
    const found = normalizedText.indexOf(normalizedQuery, cursor);
    if (found === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (found > cursor) parts.push(text.slice(cursor, found));
    const matchIndex = startIndex + matchOffset;
    matchOffset += 1;
    parts.push(
      <mark
        key={`${matchIndex}-${found}`}
        ref={(element) => registerRef(matchIndex, element)}
        className={matchIndex === activeIndex
          ? "rounded bg-orange-400 px-0.5 text-black"
          : "rounded bg-yellow-300/70 px-0.5 text-black"}
      >
        {text.slice(found, found + query.length)}
      </mark>
    );
    cursor = found + query.length;
  }

  return <>{parts}</>;
}
