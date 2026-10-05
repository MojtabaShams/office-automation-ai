"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  FileClock,
  Mail,
  MessageCircle,
  Phone,
  RotateCw,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { useTheme } from "../../../theme-context";
import RequestActionPanel, { type RequestActionHandlers } from "../../../components/requests/RequestActionPanel";
import RequestStatusBadge from "../../../components/requests/RequestStatusBadge";
import RequestDocuments from "../../../components/requests/RequestDocuments";
import { RequestStepper, RequestTimeline, deadlineForStage } from "../../../components/requests/RequestWorkflow";
import {
  ReassignRequestModal,
  RequestConversationModal,
  RequestSatisfaction,
} from "../../../components/requests/RequestDialogs";
import {
  CURRENT_MOCK_USER_ID,
  escalateOverdueRequests,
  formatRequestDate,
  formatRequestId,
  getEmployeeName,
  initialRequests,
  REQUEST_STORAGE_KEY,
  saveRequests,
  type AdminRequest,
  type RequestStage,
} from "../../lib/mock-requests";

function createTimelineEntry(action: string, description: string) {
  return {
    id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action,
    actorId: CURRENT_MOCK_USER_ID,
    at: new Date().toISOString(),
    description,
  };
}

export default function RequestDetailsPage() {
  const { isDarkMode } = useTheme();
  const params = useParams<{ id: string }>();
  const requestId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [request, setRequest] = useState<AdminRequest | null>(
    () => initialRequests.find((item) => item.id === requestId) ?? null
  );
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [conversationOpen, setConversationOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);

  useEffect(() => {
    setNow(Date.now());
    try {
      const saved = window.localStorage.getItem(REQUEST_STORAGE_KEY);
      const storedRequests = saved ? JSON.parse(saved) as AdminRequest[] : initialRequests;
      const result = escalateOverdueRequests(storedRequests);
      const list = result.requests;
      if (result.changed) saveRequests(list);
      const storedRequest = list.find((item) => item.id === requestId);
      const sampleRequest = initialRequests.find((item) => item.id === requestId);
      setRequest(
        storedRequest
          ? { ...storedRequest, documents: storedRequest.documents ?? sampleRequest?.documents ?? [] }
          : null
      );
    } catch (storageError) {
      console.error("بارگذاری جزئیات درخواست ناموفق بود:", storageError);
      setError("نسخه ذخیره‌شده درخواست در دسترس نیست؛ داده نمونه نمایش داده می‌شود.");
    } finally {
      setReady(true);
    }
  }, [requestId]);

  const commit = (next: AdminRequest) => {
    setRequest(next);
    try {
      const saved = window.localStorage.getItem(REQUEST_STORAGE_KEY);
      const list = saved ? JSON.parse(saved) as AdminRequest[] : initialRequests;
      saveRequests(list.map((item) => item.id === next.id ? next : item));
      setError("");
    } catch (storageError) {
      console.error("ذخیره تغییرات پرونده ناموفق بود:", storageError);
      setError("تغییر در این نشست نمایش داده می‌شود اما در مرورگر ذخیره نشد.");
    }
  };

  if (!ready) {
    return <div className="rounded-2xl border border-current/10 p-6 text-sm opacity-60">در حال بارگذاری پرونده…</div>;
  }

  if (!request) {
    return (
      <div className={`rounded-2xl border p-8 text-center ${isDarkMode ? "border-white/10 bg-[#193632] text-white" : "border-[#d5dad4] bg-white text-[#28443d]"}`}>
        <FileClock className="mx-auto mb-3 h-9 w-9 opacity-45" />
        <h1 className="text-lg font-bold">پرونده پیدا نشد</h1>
        <Link href="/requests" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#15554f] hover:underline">
          <ArrowRight className="h-3.5 w-3.5" />
          بازگشت به درخواست‌ها
        </Link>
      </div>
    );
  }

  const currentStage: RequestStage | undefined = request.stages[request.currentStageIndex];
  const isCurrentAssignee = request.group === "active"
    && currentStage?.state === "current"
    && currentStage.assigneeId === CURRENT_MOCK_USER_ID;
  const isSupervisor = CURRENT_MOCK_USER_ID === "emp-1";
  const deadline = currentStage ? deadlineForStage(request, currentStage) : null;
  const deadlineDifference = deadline && now !== null ? deadline.getTime() - now : null;
  const deadlineDays = deadlineDifference === null
    ? null
    : deadlineDifference < 0
      ? Math.floor(deadlineDifference / 86_400_000)
      : Math.ceil(deadlineDifference / 86_400_000);
  const userEvidenceDeadlineDifference =
    request.evidenceDueAt && now !== null
      ? new Date(request.evidenceDueAt).getTime() - now
      : null;
  const userEvidenceDeadlineDays = userEvidenceDeadlineDifference === null
    ? null
    : userEvidenceDeadlineDifference < 0
      ? Math.floor(userEvidenceDeadlineDifference / 86_400_000)
      : Math.ceil(userEvidenceDeadlineDifference / 86_400_000);
  const surface = isDarkMode ? "border-white/10 bg-[#193632]" : "border-[#d5dad4] bg-white";
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";
  const appendTimeline = (entry: ReturnType<typeof createTimelineEntry>) => [...request.timeline, entry];

  const actions: RequestActionHandlers = {
    approve: (note) => {
      if (!isCurrentAssignee || !currentStage) return;
      const actedAt = new Date().toISOString();
      const stages = request.stages.map((item, index) => {
        if (index === request.currentStageIndex) return { ...item, state: "approved" as const, decision: "approved" as const, actedAt, note: note || "تأیید شد." };
        if (index === request.currentStageIndex + 1) return { ...item, state: "current" as const, assignedAt: actedAt };
        return item;
      });
      const hasNextStage = request.currentStageIndex + 1 < stages.length;
      commit({
        ...request,
        stages,
        currentStageIndex: hasNextStage ? request.currentStageIndex + 1 : request.currentStageIndex,
        group: hasNextStage ? "active" : "completed",
        subStatus: hasNextStage ? "forwarded" : "approved",
        updatedAt: actedAt,
        timeline: appendTimeline(createTimelineEntry(
          hasNextStage ? "تأیید و ارجاع به مرحله بعد" : "تکمیل درخواست",
          hasNextStage
            ? `${currentStage.title} تأیید شد و پرونده به ${stages[request.currentStageIndex + 1]?.title} ارجاع شد.${note ? ` توضیح: ${note}` : ""}`
            : `درخواست تأیید و تکمیل شد.${note ? ` توضیح: ${note}` : ""}`
        )),
      });
    },
    reject: (kind, note, dueDate) => {
      if (!isCurrentAssignee || !currentStage) return;
      const actedAt = new Date().toISOString();
      const stageList = request.stages.map((item, index) =>
        index === request.currentStageIndex && kind === "final"
          ? { ...item, state: "rejected" as const, decision: "rejected" as const, actedAt, note }
          : item
      );
      if (kind === "return" && stageList[request.currentStageIndex]) {
        stageList[request.currentStageIndex] = {
          ...stageList[request.currentStageIndex]!,
          state: "current",
          assignedAt: actedAt,
          note,
        };
      }
      const due = dueDate ? new Date(dueDate) : undefined;
      if (due) due.setHours(23, 59, 59, 999);
      commit({
        ...request,
        stages: stageList,
        group: kind === "final" ? "completed" : "active",
        subStatus: kind === "final" ? "rejected" : "awaiting-user-documents",
        evidenceDueAt: due?.toISOString(),
        updatedAt: actedAt,
        timeline: appendTimeline(createTimelineEntry(
          kind === "final" ? "رد نهایی درخواست" : "بازگشت برای اصلاح",
          kind === "final" ? `درخواست به‌طور کامل رد شد. ${note}` : `پرونده برای اصلاح به کاربر برگشت؛ مهلت تا ${dueDate ? formatRequestDate(dueDate.toISOString()) : "تعیین‌نشده"}. ${note}`
        )),
      });
    },
    requestDocuments: (note, dueDate) => {
      if (!isCurrentAssignee || !currentStage) return;
      const due = new Date(dueDate);
      due.setHours(23, 59, 59, 999);
      const at = new Date().toISOString();
      commit({
        ...request,
        subStatus: "awaiting-user-documents",
        evidenceDueAt: due.toISOString(),
        updatedAt: at,
        timeline: appendTimeline(createTimelineEntry(
          "درخواست مدرک تکمیلی",
          `${note} مهلت ارسال: ${formatRequestDate(due.toISOString())}.`
        )),
      });
    },
    receiveDocuments: () => {
      if (!isCurrentAssignee || !currentStage || request.subStatus !== "awaiting-user-documents") return;
      const at = new Date().toISOString();
      const stages = request.stages.map((item, index) => index === request.currentStageIndex
        ? { ...item, state: "current" as const, assignedAt: at }
        : item
      );
      commit({
        ...request,
        stages,
        subStatus: "in-review",
        evidenceDueAt: undefined,
        updatedAt: at,
        timeline: appendTimeline(createTimelineEntry(
          "دریافت مدرک از کاربر",
          "مدرک تکمیلی دریافت شد و پرونده برای ادامه بررسی به مسئول مرحله بازگشت."
        )),
      });
    },
    addNote: (note) => {
      if (!isCurrentAssignee) return;
      const at = new Date().toISOString();
      commit({
        ...request,
        updatedAt: at,
        timeline: appendTimeline(createTimelineEntry("یادداشت داخلی", note)),
      });
    },
  };

  const reassign = (employeeId: string, reason: string) => {
    if (!isSupervisor || !currentStage) return;
    const at = new Date().toISOString();
    const stages = request.stages.map((item, index) => index === request.currentStageIndex
      ? { ...item, state: "current" as const, assigneeId: employeeId, assignedAt: at }
      : item
    );
    commit({
      ...request,
      stages,
      group: "active",
      subStatus: "in-review",
      updatedAt: at,
      timeline: appendTimeline(createTimelineEntry(
        "ارجاع مجدد پرونده",
        `پرونده به ${getEmployeeName(employeeId)} ارجاع شد. دلیل: ${reason}`
      )),
    });
    setReassignOpen(false);
  };

  return (
    <div dir="rtl" className={`w-full ${isDarkMode ? "text-white" : "text-[#28443d]"}`}>
      <Link href="/requests" className={`mb-3 inline-flex items-center gap-1 text-xs ${muted} hover:text-[#15554f]`}>
        <ArrowRight className="h-3.5 w-3.5" />
        بازگشت به پوشه درخواست‌ها
      </Link>

      {error && <p role="alert" className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">{error}</p>}
      {request.subStatus === "escalation" && (
        <div role="alert" className="mb-3 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs font-semibold text-amber-700">
          <ShieldAlert className="h-4 w-4" />
          مهلت اقدام کارمند به پایان رسیده است؛ پرونده بسته نشده و هشدار تأخیر برای پیگیری به سرپرست ارجاع شده است.
        </div>
      )}
      {request.subStatus === "cancelled" && (
        <div role="status" className="mb-3 rounded-xl border border-slate-400/30 bg-slate-400/10 px-3 py-2.5 text-xs">
          این درخواست توسط کاربر لغو شده است؛ لغو از اپلیکیشن کاربر انجام شده.
        </div>
      )}
      {request.subStatus === "expired-user" && (
        <div role="status" className="mb-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-700">
          پرونده به دلیل تکمیل‌نشدن مدرک توسط کاربر در مهلت مقرر بسته شده است.
        </div>
      )}
      {request.subStatus === "awaiting-user-documents" && request.evidenceDueAt && (
        <div role="status" className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs">
          منتظر مدرک کاربر تا {formatRequestDate(request.evidenceDueAt)} هستیم.
        </div>
      )}

      <header className={`mb-4 rounded-2xl border p-4 sm:p-5 ${surface}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`mb-1 text-[0.68rem] ${muted}`}>{request.processName} · {formatRequestId(request.id)}</p>
            <h1 className="text-lg font-black sm:text-xl">{request.title}</h1>
            <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs ${muted}`}>
              <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{request.applicantName}</span>
              <a href={`tel:${request.applicantPhone}`} className="inline-flex items-center gap-1.5 hover:text-[#15554f]"><Phone className="h-3.5 w-3.5" /><span dir="ltr">{request.applicantPhone}</span></a>
              <a href={`mailto:${request.applicantEmail}`} className="inline-flex items-center gap-1.5 hover:text-[#15554f]"><Mail className="h-3.5 w-3.5" />{request.applicantEmail}</a>
              <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />ثبت: {formatRequestDate(request.createdAt, true)}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2">
            <RequestStatusBadge request={request} />
            <button type="button" onClick={() => setConversationOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-[#15554f]/25 px-3 py-2 text-[0.68rem] font-semibold text-[#15554f] transition hover:bg-[#15554f]/10">
              <MessageCircle className="h-3.5 w-3.5" />
              مشاهده گفتگوی اصلی با هوش مصنوعی
            </button>
          </div>
        </div>
      </header>

      {request.group === "active" && currentStage && isSupervisor && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#15554f]/20 bg-[#15554f]/5 px-3 py-2">
          <p className={`text-xs ${muted}`}>
            مسئول فعلی: <strong className={isDarkMode ? "text-white" : "text-[#28443d]"}>{getEmployeeName(currentStage.assigneeId)}</strong>
          </p>
          <button type="button" onClick={() => setReassignOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#15554f] hover:bg-[#15554f]/10">
            <RotateCw className="h-3.5 w-3.5" />
            ارجاع مجدد
          </button>
        </div>
      )}

      {request.group === "active" && currentStage?.state === "current" && !isCurrentAssignee && request.subStatus !== "awaiting-user-documents" && (
        <div role="status" className={`mb-4 rounded-xl border px-3 py-2.5 text-xs ${isDarkMode ? "border-white/10 bg-white/[0.04] text-white/65" : "border-[#d5dad4] bg-white/70 text-[#68766c]"}`}>
          این پرونده فقط خواندنی است؛ اقدام برای مسئول مرحله جاری، {getEmployeeName(currentStage.assigneeId)}، فعال خواهد بود.
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <div className="space-y-4">
          <section className={`rounded-2xl border p-4 ${surface}`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold">روند پروسه</h2>
                <p className={`mt-1 text-[0.68rem] ${muted}`}>{request.processName}</p>
              </div>
              {request.subStatus === "awaiting-user-documents" && userEvidenceDeadlineDays !== null && (
                <span className={`rounded-full px-2.5 py-1 text-[0.65rem] ${isDarkMode ? "bg-amber-400/10 text-amber-300" : "bg-amber-500/10 text-amber-800"}`}>
                  {userEvidenceDeadlineDays < 0
                    ? `${Math.abs(userEvidenceDeadlineDays)} روز از مهلت ارسال مدرک توسط کاربر گذشته`
                    : `${userEvidenceDeadlineDays} روز تا پایان مهلت ارسال مدرک توسط کاربر`}
                </span>
              )}
              {request.subStatus !== "awaiting-user-documents" && deadlineDays !== null && currentStage?.state === "current" && (
                <span className={`rounded-full px-2.5 py-1 text-[0.65rem] ${deadlineDays < 0 ? "bg-rose-500/10 text-rose-600" : "bg-amber-500/10 text-amber-700"}`}>
                  {deadlineDays < 0 ? `${Math.abs(deadlineDays)} روز تأخیر کارمند` : `${deadlineDays} روز مهلت کارمند`}
                </span>
              )}
            </div>
            <RequestStepper
              request={request}
              currentDeadlineDays={deadlineDays}
              userEvidenceDeadlineDays={userEvidenceDeadlineDays}
            />
          </section>

          <RequestDocuments documents={request.documents ?? []} />

          <RequestSatisfaction request={request} />
        </div>

        <div className="space-y-4">
          {isCurrentAssignee && <RequestActionPanel request={request} onAction={actions} />}
          <section className={`rounded-2xl border p-4 ${surface}`}>
            <div className="mb-3 flex items-center gap-2">
              <FileClock className="h-4 w-4 text-[#15554f]" />
              <h2 className="text-sm font-bold">تاریخچه پرونده</h2>
            </div>
            <RequestTimeline request={request} />
          </section>
        </div>
      </div>

      {conversationOpen && <RequestConversationModal request={request} onClose={() => setConversationOpen(false)} />}
      <ReassignRequestModal
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        onConfirm={reassign}
      />
    </div>
  );
}
