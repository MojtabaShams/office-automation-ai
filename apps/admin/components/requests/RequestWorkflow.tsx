"use client";

import { useState } from "react";
import { Check, Circle, Clock3, X } from "lucide-react";
import { useTheme } from "../../theme-context";
import type { AdminRequest, RequestStage } from "../../app/lib/mock-requests";
import { formatRequestDate, getEmployeeName } from "../../app/lib/mock-requests";

export function RequestStepper({
  request,
  currentDeadlineDays,
  userEvidenceDeadlineDays,
}: {
  request: AdminRequest;
  currentDeadlineDays: number | null;
  userEvidenceDeadlineDays: number | null;
}) {
  const { isDarkMode } = useTheme();
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const muted = isDarkMode ? "text-white/45" : "text-[#718074]";

  return (
    <div className="space-y-1">
      {request.stages.map((stage, index) => {
        const done = stage.state === "approved" || stage.state === "rejected";
        const active = stage.state === "current";
        const iconClass = stage.state === "approved"
          ? "bg-emerald-500 text-white"
          : stage.state === "rejected"
            ? "bg-rose-500 text-white"
            : active
              ? "bg-[#15554f] text-white ring-4 ring-[#15554f]/15"
              : isDarkMode ? "bg-white/10 text-white/45" : "bg-[#e6e9e3] text-[#829087]";
        const lineClass = isDarkMode ? "bg-white/10" : "bg-[#e3e7e1]";
        const selected = selectedStage === stage.id;

        return (
          <div key={stage.id} className="relative flex gap-3">
            {index < request.stages.length - 1 && (
              <span className={`absolute right-[15px] top-9 h-[calc(100%-20px)] w-px ${lineClass}`} />
            )}
            <span className={`relative z-10 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconClass}`}>
              {stage.state === "approved" ? <Check className="h-4 w-4" /> : stage.state === "rejected" ? <X className="h-4 w-4" /> : active ? <Clock3 className="h-4 w-4" /> : <Circle className="h-3.5 w-3.5" />}
            </span>
            <div className={`mb-3 min-w-0 flex-1 rounded-xl border p-3 ${active ? isDarkMode ? "border-[#66b7a4]/35 bg-[#15554f]/15" : "border-[#15554f]/25 bg-[#e2eee8]/70" : isDarkMode ? "border-white/[0.06] bg-white/[0.02]" : "border-[#e6e9e3] bg-white/70"}`}>
              <button
                type="button"
                disabled={!done}
                aria-expanded={done ? selected : undefined}
                onClick={() => done && setSelectedStage(selected ? null : stage.id)}
                className={`w-full text-right ${done ? "cursor-pointer" : "cursor-default"}`}
              >
                <span className={`block text-xs font-bold ${stage.state === "pending" ? muted : ""}`}>
                  {index + 1}. {stage.title}
                </span>
                <span className={`mt-1 block text-[0.68rem] ${muted}`}>
                  مسئول: {getEmployeeName(stage.assigneeId)}
                  {active && request.subStatus === "awaiting-user-documents" && userEvidenceDeadlineDays !== null && (
                    <span className={`mt-1 block w-fit rounded-full px-2 py-1 text-[0.64rem] font-semibold ${
                      isDarkMode ? "bg-amber-400/10 text-amber-300" : "bg-amber-500/10 text-amber-800"
                    }`}>
                      {userEvidenceDeadlineDays < 0
                        ? `${Math.abs(userEvidenceDeadlineDays)} روز از مهلت ارسال مدرک توسط کاربر گذشته`
                        : `${userEvidenceDeadlineDays} روز تا پایان مهلت ارسال مدرک توسط کاربر`}
                    </span>
                  )}
                  {active && request.subStatus !== "awaiting-user-documents" && currentDeadlineDays !== null && (
                    <span className={`mr-2 font-semibold ${currentDeadlineDays < 0 ? "text-rose-500" : isDarkMode ? "text-amber-300" : "text-amber-700"}`}>
                      {currentDeadlineDays < 0 ? `${Math.abs(currentDeadlineDays)} روز از مهلت کارمند گذشته` : `${currentDeadlineDays} روز تا پایان مهلت کارمند`}
                    </span>
                  )}
                  {stage.state === "approved" && <span className="mr-2 text-emerald-600">تأییدشده</span>}
                  {stage.state === "rejected" && <span className="mr-2 text-rose-500">ردشده</span>}
                  {stage.state === "pending" && <span className="mr-2">شروع‌نشده</span>}
                </span>
              </button>
              {done && selected && (
                <div className={`mt-3 space-y-1 border-t pt-2 text-[0.68rem] leading-5 ${isDarkMode ? "border-white/10 text-white/65" : "border-[#e6e9e3] text-[#5f7067]"}`}>
                  <p>اقدام‌کننده: {getEmployeeName(stage.assigneeId)}</p>
                  <p>زمان: {stage.actedAt ? formatRequestDate(stage.actedAt, true) : "ثبت نشده"}</p>
                  <p>تصمیم: {stage.decision === "approved" ? "تأیید" : "رد"}</p>
                  {stage.note && <p>توضیح: {stage.note}</p>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RequestTimeline({ request }: { request: AdminRequest }) {
  const { isDarkMode } = useTheme();
  const entries = [...request.timeline].sort((first, second) => second.at.localeCompare(first.at));
  return (
    <ol className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#15554f]" />
          <div className="min-w-0">
            <p className="text-xs font-semibold">{entry.action}</p>
            <p className={`mt-0.5 text-[0.68rem] leading-5 ${isDarkMode ? "text-white/60" : "text-[#68766c]"}`}>
              {entry.description}
            </p>
            <p className={`mt-1 text-[0.62rem] ${isDarkMode ? "text-white/40" : "text-[#829087]"}`}>
              {getEmployeeName(entry.actorId)} · {formatRequestDate(entry.at, true)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function deadlineForStage(request: AdminRequest, stage: RequestStage) {
  const start = new Date(stage.assignedAt ?? request.updatedAt);
  start.setDate(start.getDate() + stage.slaDays);
  return start;
}
