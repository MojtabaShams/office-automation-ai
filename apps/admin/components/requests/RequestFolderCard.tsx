"use client";

import Link from "next/link";
import { Clock3, FolderOpen, UserRound } from "lucide-react";
import { useTheme } from "../../theme-context";
import type { AdminRequest } from "../../app/lib/mock-requests";
import { formatRequestDate, formatRequestId, getEmployeeName } from "../../app/lib/mock-requests";
import RequestStatusBadge from "./RequestStatusBadge";
import SearchMatchText from "../SearchMatchText";

export default function RequestFolderCard({
  request,
  query = "",
  activeIndex = -1,
  matchStarts,
  registerRef,
}: {
  request: AdminRequest;
  query?: string;
  activeIndex?: number;
  matchStarts?: Partial<Record<"title" | "applicant" | "id" | "process" | "phone", number>>;
  registerRef?: (index: number, element: HTMLElement | null) => void;
}) {
  const { isDarkMode } = useTheme();
  const currentStage = request.stages[request.currentStageIndex];
  const surface = isDarkMode
    ? "border-white/10 bg-[#193632] hover:border-[#66b7a4]/40 hover:bg-[#203b39]"
    : "border-[#d5dad4] bg-white hover:border-[#15554f]/35 hover:bg-[#fafbf9]";

  return (
    <Link
      href={`/requests/${encodeURIComponent(request.id)}`}
      className={`group flex min-h-56 flex-col rounded-2xl border p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${surface}`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${isDarkMode ? "bg-[#15554f]/25 text-[#8bd0bf]" : "bg-[#e2eee8] text-[#15554f]"}`}>
          <FolderOpen className="h-6 w-6" />
        </span>
        <RequestStatusBadge request={request} />
      </div>
      <h2 className={`mb-1 text-sm font-bold leading-6 ${isDarkMode ? "text-white" : "text-[#28443d]"}`}>
        {query && matchStarts && registerRef
          ? <SearchMatchText text={request.title} query={query} startIndex={matchStarts.title ?? 0} activeIndex={activeIndex} registerRef={registerRef} />
          : request.title}
      </h2>
      <p className={`mb-4 text-xs ${isDarkMode ? "text-white/55" : "text-[#68766c]"}`}>
        {query && matchStarts && registerRef
          ? <SearchMatchText text={request.applicantName} query={query} startIndex={matchStarts.applicant ?? 0} activeIndex={activeIndex} registerRef={registerRef} />
          : request.applicantName} · {query && matchStarts && registerRef
          ? <SearchMatchText text={formatRequestId(request.id)} query={query} startIndex={matchStarts.id ?? 0} activeIndex={activeIndex} registerRef={registerRef} />
          : formatRequestId(request.id)}
      </p>
      {(request.processName || request.applicantPhone) && (
        <p className={`-mt-2 mb-3 truncate text-[0.65rem] ${isDarkMode ? "text-white/45" : "text-[#7a857c]"}`}>
          {request.processName && (query && matchStarts && registerRef
            ? <SearchMatchText text={request.processName} query={query} startIndex={matchStarts.process ?? 0} activeIndex={activeIndex} registerRef={registerRef} />
            : request.processName)}
          {request.processName && request.applicantPhone && " · "}
          {request.applicantPhone && (query && matchStarts && registerRef
            ? <SearchMatchText text={request.applicantPhone} query={query} startIndex={matchStarts.phone ?? 0} activeIndex={activeIndex} registerRef={registerRef} />
            : request.applicantPhone)}
        </p>
      )}
      <div className={`mt-auto space-y-2 border-t pt-3 text-[0.7rem] ${isDarkMode ? "border-white/10 text-white/60" : "border-[#e6e9e3] text-[#68766c]"}`}>
        <p className="flex items-center gap-1.5">
          <UserRound className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">مسئول فعلی: {currentStage ? getEmployeeName(currentStage.assigneeId) : "—"}</span>
        </p>
        <p className="flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5 shrink-0" />
          <span>آخرین تغییر: {formatRequestDate(request.updatedAt, true)}</span>
        </p>
      </div>
    </Link>
  );
}
