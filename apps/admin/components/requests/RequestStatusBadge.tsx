"use client";

import { AlertTriangle, CheckCircle2, Clock3, XCircle } from "lucide-react";
import { useTheme } from "../../theme-context";
import type { AdminRequest } from "../../app/lib/mock-requests";
import { REQUEST_STATUS_LABELS } from "../../app/lib/mock-requests";

export default function RequestStatusBadge({ request }: { request: AdminRequest }) {
  const { isDarkMode } = useTheme();
  const escalation = request.subStatus === "escalation";
  const Icon = escalation
    ? AlertTriangle
    : request.group === "completed"
      ? request.subStatus === "approved" ? CheckCircle2 : XCircle
      : request.group === "expired" ? Clock3 : Clock3;
  const className = escalation
    ? isDarkMode ? "border-amber-400/25 bg-amber-400/10 text-amber-300" : "border-amber-500/30 bg-amber-500/10 text-amber-700"
    : request.group === "active"
      ? isDarkMode ? "border-sky-400/25 bg-sky-400/10 text-sky-300" : "border-sky-500/25 bg-sky-500/10 text-sky-700"
      : request.group === "completed"
        ? isDarkMode ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700"
        : isDarkMode ? "border-rose-400/25 bg-rose-400/10 text-rose-300" : "border-rose-500/25 bg-rose-500/10 text-rose-700";

  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${className}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{REQUEST_STATUS_LABELS[request.subStatus]}</span>
    </span>
  );
}
