"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  Archive,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileClock,
  FileText,
  Loader2,
  RotateCcw,
  Send,
  ShieldAlert,
  UserRound,
  Workflow,
  XCircle,
} from "lucide-react";
import { useTheme } from "../../../theme-context";
import { useAuth } from "../../auth-context";
import ConfirmModal from "../../../components/ConfirmModal";
import { formatJalali } from "../../lib/jalali";
import {
  advanceProcessCase,
  archiveAdminSubmission,
  escalateProcessCase,
  getAdminSubmission,
  getProcessCase,
  rejectProcessCase,
  updateSubmissionStatus,
  type AdminSubmission,
  type ProcessCase,
  type SubmissionFormField,
  type SubmissionStatus,
} from "../../lib/admin-api";

const STATUS_LABELS: Record<string, string> = {
  submitted: "ثبت شده",
  in_review: "در حال بررسی",
  need_info: "نیاز به اطلاعات بیشتر",
  approved: "تأیید شده",
  rejected: "رد شده",
  canceled: "لغو شده",
};

const STATUS_OPTIONS: SubmissionStatus[] = [
  "submitted",
  "in_review",
  "need_info",
  "approved",
  "rejected",
  "canceled",
];

const CASE_STATUS_LABELS: Record<string, string> = {
  active: "در جریان",
  completed: "پایان‌یافته",
  expired: "منقضی‌شده",
};

const SUBSTATUS_LABELS: Record<string, string> = {
  "in-review": "در حال بررسی کارمند",
  "awaiting-user-documents": "در انتظار مدرک از متقاضی",
  approved: "تأیید و تکمیل‌شده",
  rejected: "رد نهایی",
  expired: "بسته‌شده به دلیل انقضای مهلت",
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${formatJalali(date)} · ${date.toLocaleTimeString("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Answers are keyed by ``slug || id``; walk the frozen snapshot to label them. */
function collectFields(
  fields: SubmissionFormField[] | undefined,
  into: Map<string, SubmissionFormField> = new Map(),
): Map<string, SubmissionFormField> {
  for (const field of fields ?? []) {
    const key = field.slug || field.id;
    if (key) into.set(key, field);
    if (field.subFields?.length) collectFields(field.subFields, into);
  }
  return into;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "بله" : "خیر";
  if (typeof value === "number") return value.toLocaleString("fa-IR");
  if (Array.isArray(value)) {
    const items = value.map((item) => displayValue(item)).filter((item) => item !== "—");
    return items.length ? items.join("، ") : "—";
  }
  if (typeof value === "object") {
    const pairs = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${displayValue(item)}`)
      .filter((pair) => !pair.endsWith("—"));
    return pairs.length ? pairs.join(" · ") : "—";
  }
  return String(value);
}

function Answers({
  values,
  fields,
  isDarkMode,
}: {
  values: Record<string, unknown> | undefined;
  fields: SubmissionFormField[] | undefined;
  isDarkMode: boolean;
}) {
  const metas = useMemo(() => collectFields(fields), [fields]);
  const entries = Object.entries(values ?? {}).filter(([, value]) => {
    if (value === null || value === undefined || value === "") return false;
    return !(Array.isArray(value) && value.length === 0);
  });

  if (!entries.length) {
    return (
      <p className={`text-xs ${isDarkMode ? "text-white/55" : "text-[#68766c]"}`}>
        پاسخی برای این فرم ثبت نشده است.
      </p>
    );
  }

  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {entries.map(([key, value]) => {
        const meta = metas.get(key);
        const isFile = meta?.type === "file";
        const fileList = isFile
          ? (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === "string")
          : [];
        return (
          <div
            key={key}
            className={`rounded-xl border px-3 py-2 ${
              isDarkMode ? "border-white/10 bg-white/[0.03]" : "border-[#e1e6df] bg-[#f8faf6]"
            }`}
          >
            <dt className={`text-[0.66rem] ${isDarkMode ? "text-white/50" : "text-[#68766c]"}`}>
              {meta?.label || key}
              {meta?.required ? " *" : ""}
            </dt>
            <dd className="mt-1 whitespace-pre-line break-words text-xs leading-6">
              {isFile && fileList.length ? (
                <span className="flex flex-wrap gap-1.5">
                  {fileList.map((url, index) => (
                    <a
                      key={`${url}-${index}`}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-[#15554f]/25 px-2 py-0.5 text-[0.66rem] font-semibold text-[#15554f] hover:bg-[#15554f]/10"
                    >
                      <FileText className="h-3 w-3" />
                      فایل {index + 1}
                    </a>
                  ))}
                </span>
              ) : (
                displayValue(value)
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function stageProgress(caseInfo: ProcessCase): string {
  const stages = caseInfo.stages ?? [];
  const index = stages.findIndex((stage) => stage.id === caseInfo.currentStageId);
  return index >= 0 ? `مرحله ${index + 1} از ${stages.length}` : "بدون مرحله فعال";
}

function CaseStepper({ caseInfo, isDarkMode }: { caseInfo: ProcessCase; isDarkMode: boolean }) {
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";
  const surface = isDarkMode ? "border-white/10 bg-white/[0.03]" : "border-[#e1e6df] bg-[#f8faf6]";
  const stages = caseInfo.stages ?? [];

  if (!stages.length) {
    return <p className={`text-xs ${muted}`}>مراحل این پروسه در دسترس نیست.</p>;
  }

  return (
    <ol className="space-y-2">
      {stages.map((stage, index) => {
        const state = caseInfo.stageStates?.[stage.id];
        const isCurrent = stage.id === caseInfo.currentStageId;
        const approved = state?.state === "approved";
        const rejected = state?.state === "rejected";
        const entered = Boolean(state?.enteredAt) || approved || rejected;
        const tone = approved
          ? "bg-emerald-500 text-white"
          : rejected
            ? "bg-rose-500 text-white"
            : isCurrent
              ? "bg-[#15554f] text-white"
              : isDarkMode
                ? "bg-white/10 text-white/50"
                : "bg-[#e6e9e3] text-[#7b887e]";
        const label = approved
          ? "تأیید شده"
          : rejected
            ? "رد شده"
            : isCurrent
              ? "در جریان"
              : entered
                ? "بازگشته"
                : "در انتظار";
        return (
          <li
            key={stage.id}
            className={`rounded-xl border p-3 ${
              isCurrent ? (isDarkMode ? "border-[#66b7a4]/40" : "border-[#15554f]/35") : ""
            } ${surface}`}
          >
            <div className="flex items-start gap-2.5">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.68rem] font-bold ${tone}`}
              >
                {approved ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : rejected ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-xs font-bold">{stage.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.6rem] ${
                      isCurrent
                        ? isDarkMode
                          ? "bg-[#15554f]/40 text-[#8bd0bf]"
                          : "bg-[#e2eee8] text-[#15554f]"
                        : isDarkMode
                          ? "bg-white/[0.06] text-white/55"
                          : "bg-[#edf0eb] text-[#68766c]"
                    }`}
                  >
                    {label}
                  </span>
                  <span className={`text-[0.62rem] ${muted}`}>
                    {stage.responsibleUnit}
                    {stage.slaDays > 0 ? ` · مهلت ${stage.slaDays} روز` : ""}
                  </span>
                </div>
                {stage.guidance ? (
                  <p className={`mt-1 text-[0.68rem] leading-5 ${muted}`}>{stage.guidance}</p>
                ) : null}
                {state?.actedAt ? (
                  <p className={`mt-1 text-[0.62rem] ${muted}`}>
                    اقدام: {formatDateTime(state.actedAt)}
                    {state.note ? ` — ${state.note}` : ""}
                  </p>
                ) : state?.enteredAt ? (
                  <p className={`mt-1 text-[0.62rem] ${muted}`}>
                    ورود به مرحله: {formatDateTime(state.enteredAt)}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function RequestDetailsPage() {
  const { isDarkMode } = useTheme();
  const { hasPermission } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const requestId = Array.isArray(params.id) ? params.id[0] : params.id;

  const canUpdate = hasPermission("requests", "update");
  const canProcess = hasPermission("processes", "update");
  const canArchive = hasPermission("requests", "delete");

  const [submission, setSubmission] = useState<AdminSubmission | null>(null);
  const [caseInfo, setCaseInfo] = useState<ProcessCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<SubmissionStatus>("submitted");
  const [archiveOpen, setArchiveOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!requestId) return;
    const data = await getAdminSubmission(requestId);
    setSubmission(data);
    setStatus((STATUS_OPTIONS as string[]).includes(data.status) ? (data.status as SubmissionStatus) : "submitted");
    if (data.process_case_id) {
      try {
        setCaseInfo(await getProcessCase(data.process_case_id));
      } catch {
        // The case may be archived while the submission itself stays readable.
        setCaseInfo(null);
      }
    } else {
      setCaseInfo(null);
    }
  }, [requestId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    reload()
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "بارگذاری پرونده ناموفق بود.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const run = async (key: string, action: () => Promise<void>, success: string) => {
    setBusy(key);
    setActionError("");
    setNotice("");
    try {
      await action();
      await reload();
      setNote("");
      setNotice(success);
    } catch (actionFailure) {
      setActionError(actionFailure instanceof Error ? actionFailure.message : "عملیات ناموفق بود.");
    } finally {
      setBusy(null);
    }
  };

  const archive = () => {
    if (!requestId) return;
    setBusy("archive");
    setActionError("");
    archiveAdminSubmission(requestId)
      .then(() => router.push("/requests"))
      .catch((actionFailure: unknown) => {
        setActionError(actionFailure instanceof Error ? actionFailure.message : "آرشیو درخواست ناموفق بود.");
      })
      .finally(() => setBusy(null));
  };

  const surface = isDarkMode ? "border-white/10 bg-[#193632]" : "border-[#d5dad4] bg-white";
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";
  const input = isDarkMode
    ? "border-white/10 bg-white/[0.06] text-white placeholder:text-white/35"
    : "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]";

  if (loading) {
    return (
      <div className={`flex items-center justify-center gap-2 rounded-2xl border border-dashed p-10 text-xs ${muted} ${isDarkMode ? "border-white/15" : "border-[#cfd6ce]"}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        در حال بارگذاری پرونده…
      </div>
    );
  }

  if (!submission) {
    return (
      <div className={`rounded-2xl border p-8 text-center ${surface}`}>
        <FileClock className="mx-auto mb-3 h-9 w-9 opacity-45" />
        <h1 className="text-lg font-bold">پرونده پیدا نشد</h1>
        {error && <p className={`mt-2 text-xs ${muted}`}>{error}</p>}
        <Link
          href="/requests"
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#15554f] hover:underline"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          بازگشت به درخواست‌ها
        </Link>
      </div>
    );
  }

  const isCaseActive = caseInfo?.status === "active";
  const events = submission.events ?? [];
  const timeline = caseInfo?.timeline ?? [];
  const dueAt = caseInfo?.dueAt ?? null;

  return (
    <div dir="rtl" className={`w-full ${isDarkMode ? "text-white" : "text-[#28443d]"}`}>
      <Link href="/requests" className={`mb-3 inline-flex items-center gap-1 text-xs ${muted} hover:text-[#15554f]`}>
        <ArrowRight className="h-3.5 w-3.5" />
        بازگشت به درخواست‌ها
      </Link>

      {error && (
        <p role="alert" className="mb-3 flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}
      {actionError && (
        <p role="alert" className="mb-3 flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-600">
          <AlertCircle className="h-4 w-4" />
          {actionError}
        </p>
      )}
      {notice && !actionError && (
        <p role="status" className="mb-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
          {notice}
        </p>
      )}

      {caseInfo?.needsEscalation && (
        <div role="alert" className="mb-3 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs font-semibold text-amber-700">
          <ShieldAlert className="h-4 w-4" />
          مهلت اقدام کارمند به پایان رسیده است؛ پرونده بسته نشده و هشدار تأخیر ثبت شده است.
        </div>
      )}

      <header className={`mb-4 rounded-2xl border p-4 sm:p-5 ${surface}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`mb-1 flex flex-wrap items-center gap-1.5 text-[0.68rem] ${muted}`}>
              <ClipboardList className="h-3.5 w-3.5" />
              {submission.process_title || "بدون پروسه"} · کد پیگیری{" "}
              <span className="font-semibold" dir="ltr">{submission.tracking_code}</span>
            </p>
            <h1 className="text-lg font-black sm:text-xl">
              {submission.form_title || "درخواست بدون عنوان"}
            </h1>
            <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs ${muted}`}>
              <span className="inline-flex items-center gap-1.5">
                <UserRound className="h-3.5 w-3.5" />
                {submission.user_name || "متقاضی نامشخص"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" />
                ثبت: {formatDateTime(submission.created_at)}
              </span>
              {submission.step_index && submission.step_count ? (
                <span className="inline-flex items-center gap-1.5">
                  <Workflow className="h-3.5 w-3.5" />
                  گام {submission.step_index} از {submission.step_count}
                </span>
              ) : null}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
              isDarkMode ? "bg-[#15554f]/40 text-[#8bd0bf]" : "bg-[#e2eee8] text-[#15554f]"
            }`}
          >
            {submission.status_label || STATUS_LABELS[submission.status] || submission.status}
          </span>
        </div>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
        <div className="space-y-4">
          {caseInfo ? (
            <section className={`rounded-2xl border p-4 ${surface}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold">روند پروسه</h2>
                  <p className={`mt-1 text-[0.68rem] ${muted}`}>
                    {caseInfo.processTitle}
                    {caseInfo.processVersion ? ` · نسخه ${caseInfo.processVersion}` : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[0.65rem] ${
                    isCaseActive
                      ? isDarkMode
                        ? "bg-sky-400/15 text-sky-300"
                        : "bg-sky-50 text-sky-700"
                      : isDarkMode
                        ? "bg-white/10 text-white/60"
                        : "bg-[#edf0eb] text-[#68766c]"
                  }`}
                >
                  {CASE_STATUS_LABELS[caseInfo.status] ?? caseInfo.status}
                  {caseInfo.substatus ? ` · ${SUBSTATUS_LABELS[caseInfo.substatus] ?? caseInfo.substatus}` : ""}
                </span>
              </div>
              <div className={`mb-3 grid gap-2 text-[0.68rem] sm:grid-cols-3 ${muted}`}>
                <p className="inline-flex items-center gap-1.5">
                  <Workflow className="h-3.5 w-3.5 shrink-0" />
                  مرحله جاری: {caseInfo.currentStageTitle || "—"}
                </p>
                <p className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5 shrink-0" />
                  مهلت اقدام: {dueAt ? formatDateTime(dueAt) : "—"}
                </p>
                <p className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  {stageProgress(caseInfo)}
                </p>
              </div>
              <CaseStepper caseInfo={caseInfo} isDarkMode={isDarkMode} />
            </section>
          ) : (
            <section className={`rounded-2xl border p-4 text-xs ${surface} ${muted}`}>
              این درخواست به پرونده پروسه‌ای متصل نیست؛ فقط داده‌های فرم ثبت شده در دسترس است.
            </section>
          )}

          <section className={`rounded-2xl border p-4 ${surface}`}>
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#15554f]" />
              <h2 className="text-sm font-bold">داده‌های فرم ثبت‌شده</h2>
            </div>
            {submission.form_guidance ? (
              <p
                className={`mb-3 rounded-xl border px-3 py-2 text-[0.68rem] leading-6 ${
                  isDarkMode ? "border-white/10 bg-white/[0.03] text-white/65" : "border-[#e1e6df] bg-[#f8faf6] text-[#4d6258]"
                }`}
              >
                {submission.form_guidance}
              </p>
            ) : null}
            <Answers values={submission.values} fields={submission.form_fields} isDarkMode={isDarkMode} />
            {submission.notes ? (
              <p className={`mt-3 text-[0.68rem] leading-6 ${muted}`}>یادداشت ثبت: {submission.notes}</p>
            ) : null}
          </section>

          <section className={`rounded-2xl border p-4 ${surface}`}>
            <div className="mb-3 flex items-center gap-2">
              <FileClock className="h-4 w-4 text-[#15554f]" />
              <h2 className="text-sm font-bold">تاریخچه وضعیت</h2>
            </div>
            {events.length ? (
              <ol className={`space-y-2 text-[0.68rem] ${muted}`}>
                {events.map((event, index) => (
                  <li
                    key={`${event.status}-${index}`}
                    className={`rounded-xl border px-3 py-2 ${
                      isDarkMode ? "border-white/10 bg-white/[0.03]" : "border-[#e1e6df] bg-[#f8faf6]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-xs font-semibold">
                        {event.status_label || STATUS_LABELS[event.status] || event.status}
                      </span>
                      <span>{formatDateTime(event.created_at)}</span>
                    </div>
                    {event.note ? <p className="mt-1 leading-5">{event.note}</p> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className={`text-xs ${muted}`}>رویدادی برای این درخواست ثبت نشده است.</p>
            )}
          </section>

          {timeline.length ? (
            <section className={`rounded-2xl border p-4 ${surface}`}>
              <div className="mb-3 flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-[#15554f]" />
                <h2 className="text-sm font-bold">رویدادهای پرونده</h2>
              </div>
              <ol className={`space-y-2 border-r-2 pr-3 text-[0.68rem] leading-5 ${muted} ${isDarkMode ? "border-white/10" : "border-[#e1e6df]"}`}>
                {timeline.map((entry, index) => (
                  <li key={entry.id ?? `${entry.at}-${index}`}>
                    <span className="block text-xs font-semibold">
                      {entry.description || entry.action || "رویداد"}
                    </span>
                    <span>{formatDateTime(entry.at)}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>

        <div className="space-y-4">
          <section className={`rounded-2xl border p-4 ${surface}`}>
            <h2 className="mb-3 text-sm font-bold">اقدامات رسیدگی</h2>
            <label className="block">
              <span className={`text-[0.68rem] ${muted}`}>یادداشت اقدام (اختیاری)</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="توضیح یا دلیل تصمیم…"
                className={`mt-1 w-full resize-y rounded-xl border px-3 py-2 text-xs outline-none ${input}`}
              />
            </label>

            {isCaseActive && canProcess ? (
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(
                      "advance",
                      async () => {
                        if (!caseInfo) return;
                        await advanceProcessCase(caseInfo.id, note ? { note } : {});
                      },
                      "پرونده تأیید و به مرحله بعد ارسال شد.",
                    )
                  }
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#15554f] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#246b61] disabled:opacity-60"
                >
                  {busy === "advance" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  تأیید و ارسال به مرحله بعد
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        "return",
                        async () => {
                          if (!caseInfo) return;
                          await rejectProcessCase(caseInfo.id, { ...(note ? { note } : {}), final: false });
                        },
                        "پرونده برای اصلاح به متقاضی بازگشت.",
                      )
                    }
                    className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
                      isDarkMode
                        ? "border-amber-400/30 text-amber-300 hover:bg-amber-400/10"
                        : "border-amber-500/30 text-amber-700 hover:bg-amber-500/10"
                    }`}
                  >
                    {busy === "return" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    بازگشت برای اصلاح
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        "reject",
                        async () => {
                          if (!caseInfo) return;
                          await rejectProcessCase(caseInfo.id, { ...(note ? { note } : {}), final: true });
                        },
                        "رد نهایی پرونده ثبت شد.",
                      )
                    }
                    className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
                      isDarkMode
                        ? "border-rose-400/30 text-rose-300 hover:bg-rose-400/10"
                        : "border-rose-500/30 text-rose-700 hover:bg-rose-500/10"
                    }`}
                  >
                    {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    رد نهایی
                  </button>
                </div>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(
                      "escalate",
                      async () => {
                        if (!caseInfo) return;
                        await escalateProcessCase(caseInfo.id, note ? { note } : {});
                      },
                      "پرونده به مقصد ارجاع مرحله ارسال شد.",
                    )
                  }
                  className={`inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
                    isDarkMode
                      ? "border-white/15 text-white/75 hover:bg-white/[0.06]"
                      : "border-[#d5dad4] text-[#40584e] hover:bg-[#f6f7f4]"
                  }`}
                >
                  {busy === "escalate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                  ارجاع به مقصد مرحله
                </button>
              </div>
            ) : !isCaseActive ? (
              <p className={`mt-3 text-[0.68rem] ${muted}`}>
                این پرونده بسته شده است؛ اقدام مرحله‌ای امکان‌پذیر نیست.
              </p>
            ) : (
              <p className={`mt-3 text-[0.68rem] ${muted}`}>
                برای اقدام مرحله‌ای به دسترسی «پروسه‌ها · ویرایش» نیاز دارید.
              </p>
            )}

            {canUpdate ? (
              <div className={`mt-4 border-t pt-3 ${isDarkMode ? "border-white/10" : "border-[#e6e9e3]"}`}>
                <label className="block">
                  <span className={`text-[0.68rem] ${muted}`}>وضعیت درخواست</span>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as SubmissionStatus)}
                    className={`mt-1 w-full rounded-xl border px-3 py-2 text-xs outline-none ${input}`}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option} style={{ backgroundColor: "#fff", color: "#111827" }}>
                        {STATUS_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy !== null || status === submission.status}
                  onClick={() =>
                    void run(
                      "status",
                      async () => {
                        await updateSubmissionStatus(submission.id, status, note || undefined);
                      },
                      "وضعیت درخواست به‌روزرسانی شد.",
                    )
                  }
                  className={`mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
                    isDarkMode
                      ? "border-[#66b7a4]/30 text-[#8bd0bf] hover:bg-[#15554f]/25"
                      : "border-[#15554f]/25 text-[#15554f] hover:bg-[#e2eee8]"
                  }`}
                >
                  {busy === "status" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  ثبت وضعیت
                </button>
              </div>
            ) : null}

            {canArchive ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setArchiveOpen(true)}
                className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
                  isDarkMode
                    ? "border-white/10 text-white/55 hover:bg-white/[0.05]"
                    : "border-[#e1e6df] text-[#68766c] hover:bg-[#f6f7f4]"
                }`}
              >
                {busy === "archive" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                آرشیو درخواست
              </button>
            ) : null}
          </section>
        </div>
      </div>

      <ConfirmModal
        open={archiveOpen}
        title="آرشیو درخواست"
        message="این درخواست از فهرست‌ها پنهان می‌شود اما داده‌ها و تاریخچه آن برای ممیزی در پایگاه داده باقی می‌ماند. ادامه می‌دهید؟"
        confirmLabel="آرشیو"
        danger
        onConfirm={archive}
        onClose={() => setArchiveOpen(false)}
      />
    </div>
  );
}
