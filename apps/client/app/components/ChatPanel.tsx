"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowUp,
  Eye,
  EyeOff,
  FileText,
  ClipboardList,
  BookOpen,
  Loader2,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import { useTheme } from "../theme-context";
import JalaliDateField from "./JalaliDateField";
import ProcessStepper from "./ProcessStepper";
import ThemedSelect from "./ThemedSelect";
import {
  type AgentActivity,
  type AgentForm,
  type AgentUser,
  type AgentAttachment,
  type ChatResponse,
  type ProcessStepperPayload,
  clearSession,
  getChatSession,
  getForm,
  getStoredUser,
  getSubmissions,
  getToken,
  streamChat,
  postChatAttachment,
  postFormSubmit,
  postLogin,
  postLogout,
  postRegister,
  saveSession,
} from "../lib/agent-api";

type UiMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  form?: AgentForm;
  attachments?: AgentAttachment[];
  /** Behind-the-scenes steps this assistant turn reported. */
  activity?: AgentActivity[];
};

/**
 * Shown while a turn is in flight; the exact labels arrive with the reply and
 * are rendered as chips under the assistant bubble.
 */
const BUSY_STAGES = [
  "در حال بررسی درخواست شما…",
  "مرور راهنمای خدمات و فرایندها…",
  "آماده‌سازی پاسخ…",
];

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
    title: "راهنمای خدمات",
    desc: "درباره خدمات و مراحل اداری بپرس.",
  },
];

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function applyFormAction(stepper: ProcessStepperPayload, action: NonNullable<ChatResponse["action"]>): ProcessStepperPayload {
  if (action.action !== "OPEN_AND_FILL_FORM") return stepper;
  const aliases: Record<string, string[]> = {
    applicant_name: ["applicant_name", "employee_name", "full_name", "name"],
    employee_name: ["applicant_name", "employee_name", "full_name", "name"],
    employee_id: ["employee_id", "employeeId", "national_id"],
    start_date: ["start_date", "startDate", "from_date", "leave_start"],
    end_date: ["end_date", "endDate", "to_date", "leave_end"],
    duration_days: ["duration_days", "durationDays", "days", "leave_days", "duration"],
  };

  return {
    ...stepper,
    steps: stepper.steps.map((step) => ({
      ...step,
      forms: step.forms.map((form) => {
        if (form.form_id !== action.form_id) return form;
        const prefill: Record<string, unknown> = { ...(form.prefill ?? {}) };
        for (const field of form.fields ?? []) {
          const fieldName = field.slug || field.id;
          if (!fieldName) continue;
          const canonical = Object.entries(aliases).find(([, names]) =>
            names.includes(fieldName),
          )?.[0];
          const value = canonical ? action.fields[canonical] ?? action.fields[fieldName] : action.fields[fieldName];
          if (value !== undefined && value !== null) prefill[fieldName] = value;
        }
        return { ...form, prefill };
      }),
    })),
  };
}

/** Mirrors the server limits so the composer fails fast before uploading. */
const MAX_ATTACHMENTS = 3;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ATTACHMENT_ACCEPT = ".pdf,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.webp";

/** Tehran is UTC+3:30 all year (Iran dropped DST in 2022). */
const TEHRAN_OFFSET_MS = (3 * 60 + 30) * 60_000;

/** ``YYYY-MM-DD`` of the Tehran calendar day an ISO timestamp belongs to. */
function tehranDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return null;
  return new Date(value.getTime() + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Best-effort one-request-per-day check. The server enforces the rule too; this
 * only lets the inline form show the limit before a doomed submit.
 */
async function submittedToday(): Promise<boolean> {
  if (!getToken()) return false;
  try {
    const data = await getSubmissions(5);
    const today = tehranDay(new Date().toISOString());
    return data.submissions.some((item) => tehranDay(item.created_at) === today);
  } catch {
    return false;
  }
}

function InlineAgentForm({
  form,
  isDarkMode,
  busy,
  error,
  onSubmit,
  onLink,
}: {
  form: AgentForm;
  isDarkMode: boolean;
  busy: boolean;
  error: string;
  onSubmit: (values: Record<string, string>) => void;
  onLink: (action: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(form.prefill ?? {});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>(
    {},
  );

  const fieldCls = isDarkMode
    ? "border-white/10 bg-white/[0.06] text-white placeholder:text-white/35"
    : "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]";
  const errorBorder = "border-rose-500 focus:border-rose-500";
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";
  /** Native dropdown lists ignore the closed select's classes; force readable colors. */
  const optionStyle = {
    background: isDarkMode ? "#17332f" : "#ffffff",
    color: isDarkMode ? "#ffffff" : "#28443d",
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    for (const f of form.fields) {
      const val = (values[f.name] ?? "").trim();
      const checked = values[f.name] === "true";

      if (f.type === "checkbox") {
        if (f.required && !checked)
          errs[f.name] = "برای ادامه باید این مورد را تأیید کنید";
        continue;
      }
      if (f.required && !val) {
        errs[f.name] = "این فیلد نمی‌تواند خالی باشد";
        continue;
      }
      if (!val) continue;

      if (f.type === "number") {
        const num = Number(val);
        if (Number.isNaN(num)) {
          errs[f.name] = "مقدار واردشده باید عدد باشد";
          continue;
        }
        if (f.minValue !== undefined && num < f.minValue) {
          errs[f.name] = `حداقل مقدار مجاز ${f.minValue} است`;
          continue;
        }
        if (f.maxValue !== undefined && num > f.maxValue) {
          errs[f.name] = `حداکثر مقدار مجاز ${f.maxValue} است`;
          continue;
        }
      }

      if (f.pattern) {
        try {
          if (!new RegExp(f.pattern).test(val)) {
            errs[f.name] = "مقدار واردشده معتبر نیست";
            continue;
          }
        } catch {
          /* ignore bad pattern */
        }
      }
      if (f.minLength && val.length < f.minLength) {
        errs[f.name] = `حداقل ${f.minLength} کاراکتر لازم است`;
        continue;
      }
      if (f.maxLength && val.length > f.maxLength) {
        errs[f.name] = `حداکثر ${f.maxLength} کاراکتر مجاز است`;
      }
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const inputClass = (name: string) =>
    `mt-1 w-full rounded-xl border px-3 py-2 text-xs outline-none ${
      fieldErrors[name] ? errorBorder : `focus:border-[#15554f] ${fieldCls}`
    }`;

  return (
    <form
      noValidate
      className="mt-2 w-full space-y-2.5 text-right"
      onSubmit={(e) => {
        e.preventDefault();
        if (!validate()) return;
        onSubmit(values);
      }}
    >
      <p className="text-xs font-bold">{form.title}</p>

      {form.fields.map((f) => {
        // A date picker is a button, so it must not be nested inside a <label>.
        const Shell = f.type === "date" ? "div" : "label";
        return (
        <Shell key={f.name} className={`block text-[0.7rem] font-semibold ${muted}`}>
          {f.label}
          {f.required ? " *" : ""}

          {f.type === "checkbox" ? (
            <span className="mt-1 flex items-start gap-2">
              <input
                type="checkbox"
                checked={values[f.name] === "true"}
                onChange={(e) => {
                  const checked = e.target.checked ? "true" : "";
                  setValues((v) => ({ ...v, [f.name]: checked }));
                  setFieldErrors((er) => {
                    const next = { ...er };
                    delete next[f.name];
                    return next;
                  });
                }}
                className="mt-0.5 h-3.5 w-3.5 accent-[#15554f]"
              />
              <span className="text-[0.65rem] leading-5">
                {f.placeholder ?? "برای ادامه، این مورد را تأیید کنید."}
              </span>
            </span>
          ) : f.type === "select" && f.options ? (
            <ThemedSelect
              value={values[f.name] ?? ""}
              onChange={(e) => {
                setValues((v) => ({ ...v, [f.name]: e.target.value }));
                setFieldErrors((er) => {
                  const next = { ...er };
                  delete next[f.name];
                  return next;
                });
              }}
              className={`${inputClass(f.name)} pl-9`}
              arrowClassName={`left-3 ${muted}`}
              wrapperClassName="block w-full"
            >
              <option value="" style={optionStyle}>
                انتخاب کنید
              </option>
              {f.options.map((opt) => (
                <option key={opt} value={opt} style={optionStyle}>
                  {opt}
                </option>
              ))}
            </ThemedSelect>
          ) : f.type === "textarea" ? (
            <textarea
              rows={3}
              placeholder={f.placeholder}
              value={values[f.name] ?? ""}
              onChange={(e) => {
                setValues((v) => ({ ...v, [f.name]: e.target.value }));
                setFieldErrors((er) => {
                  const next = { ...er };
                  delete next[f.name];
                  return next;
                });
              }}
              className={`${inputClass(f.name)} resize-y`}
            />
          ) : f.type === "password" ? (
            <span className="relative block">
              <input
                type={visiblePasswords[f.name] ? "text" : "password"}
                placeholder={f.placeholder}
                value={values[f.name] ?? ""}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [f.name]: e.target.value }));
                  setFieldErrors((er) => {
                    const next = { ...er };
                    delete next[f.name];
                    return next;
                  });
                }}
                className={`${inputClass(f.name)} pl-10`}
                dir="ltr"
              />
              <button
                type="button"
                onClick={() =>
                  setVisiblePasswords((prev) => ({
                    ...prev,
                    [f.name]: !prev[f.name],
                  }))
                }
                aria-label={
                  visiblePasswords[f.name]
                    ? "پنهان کردن گذرواژه"
                    : "نمایش گذرواژه"
                }
                title={
                  visiblePasswords[f.name]
                    ? "پنهان کردن گذرواژه"
                    : "نمایش گذرواژه"
                }
                className={`absolute left-2 top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors hover:opacity-70 ${muted}`}
              >
                {visiblePasswords[f.name] ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            </span>
          ) : f.type === "date" ? (
            <span className="mt-1 block">
              <JalaliDateField
                value={values[f.name] ?? ""}
                onChange={(next) => {
                  setValues((v) => ({ ...v, [f.name]: next }));
                  setFieldErrors((er) => {
                    const nextErrors = { ...er };
                    delete nextErrors[f.name];
                    return nextErrors;
                  });
                }}
                invalid={Boolean(fieldErrors[f.name])}
                placeholder={f.placeholder ?? "انتخاب تاریخ شمسی"}
              />
            </span>
          ) : (
            <input
              type={f.type === "number" ? "number" : "text"}
              inputMode={f.type === "number" ? "numeric" : undefined}
              min={f.type === "number" ? f.minValue : undefined}
              max={f.type === "number" ? f.maxValue : undefined}
              minLength={f.type === "number" ? undefined : f.minLength}
              maxLength={f.type === "number" ? undefined : f.maxLength}
              placeholder={f.placeholder}
              value={values[f.name] ?? ""}
              onChange={(e) => {
                setValues((v) => ({ ...v, [f.name]: e.target.value }));
                setFieldErrors((er) => {
                  const next = { ...er };
                  delete next[f.name];
                  return next;
                });
              }}
              className={inputClass(f.name)}
              dir={
                f.name === "mobile" || f.name === "national_id" || f.type === "number"
                  ? "ltr"
                  : "rtl"
              }
            />
          )}

          {fieldErrors[f.name] && (
            <span className="mt-1 block text-[0.65rem] font-medium text-rose-500">
              {fieldErrors[f.name]}
            </span>
          )}
          {f.helpText && !fieldErrors[f.name] && (
            <span className={`mt-1 block text-[0.6rem] ${muted}`}>
              {f.helpText}
            </span>
          )}
        </Shell>
        );
      })}

      {error && (
        <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-1.5 text-[0.7rem] text-rose-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#15554f] px-3 py-2 text-xs font-semibold text-white hover:bg-[#246b61] disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {form.submit_label}
      </button>

      {form.footer_links?.map((link) => (
        <button
          key={link.action}
          type="button"
          onClick={() => onLink(link.action)}
          className={`block w-full text-center text-[0.7rem] underline-offset-2 hover:underline ${muted}`}
        >
          {link.label}
        </button>
      ))}
    </form>
  );
}
function ChatPanelInner() {
  const { isDarkMode } = useTheme();
  const params = useSearchParams();
  const continueId = params.get("continue");

  const [text, setText] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [user, setUser] = useState<AgentUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [pendingAfterAuth, setPendingAfterAuth] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [stepper, setStepper] = useState<ProcessStepperPayload | null>(null);
  const [sideForm, setSideForm] = useState<AgentForm | null>(null);
  const [busyStage, setBusyStage] = useState(0);
  const [liveActivities, setLiveActivities] = useState<AgentActivity[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  /**
   * Runs right after a successful chat login/register: stores the 15-minute token
   * and routes the account by role — applicants stay in the chat, employees and
   * admins are offered (and then given) the admin panel.
   */
  const applySession = (
    data: { message: string; token: string; user: AgentUser; expires_at?: string },
  ) => {
    saveSession(data.token, data.user, data.expires_at);
    setUser(data.user);
    // همه نقش‌ها، از جمله مدیران و کارشناسان، پس از ورود در همین گفتگو می‌مانند.
    // تغییر صفحه فقط توسط کاربر انجام می‌شود.
    return;
  };

  // «ادامه گفتگو» از صفحه تاریخچه: پیام‌ها را از سرور بازیابی می‌کنیم.
  useEffect(() => {
    if (!continueId) return;
    let cancelled = false;

    const restore = async () => {
      if (!getToken()) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            text: "برای مشاهده گفتگوهای قبلی ابتدا وارد حساب کاربری شوید.",
          },
        ]);
        return;
      }
      try {
        const data = await getChatSession(continueId);
        if (cancelled) return;

        const restored: UiMessage[] = data.messages
          .filter(
            (m) =>
              (m.content ?? "").trim() || (m.attachments?.length ?? 0) > 0,
          )
          .map((m) => ({
            id: m.id,
            role: m.role === "user" ? "user" : "assistant",
            text: m.content,
            attachments: m.attachments ?? [],
            activity: m.activity ?? undefined,
          }));

        const lastFormId = [...data.messages]
          .reverse()
          .find((m) => m.form_id)?.form_id;
        if (lastFormId) {
          try {
            const formData = await getForm(lastFormId);
            const target = [...restored]
              .reverse()
              .find((m) => m.role === "assistant");
            if (target && formData.form) target.form = formData.form;
            if (formData.form) setSideForm(formData.form);
          } catch {
            /* فرم حذف یا غیرفعال شده است */
          }
        }
        if (cancelled) return;
        setSessionId(data.session_id);
        setMessages(restored);
      } catch (e) {
        if (cancelled) return;
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            text:
              e instanceof Error ? e.message : "بارگذاری گفتگو ناموفق بود.",
          },
        ]);
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [continueId]);

  useEffect(() => {
    const container = messagesScrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  // Keeps the "working…" line moving so long DB lookups feel alive.
  useEffect(() => {
    if (!busy) {
      setBusyStage(0);
      return;
    }
    const timer = window.setInterval(
      () => setBusyStage((stage) => (stage + 1) % BUSY_STAGES.length),
      1600,
    );
    return () => window.clearInterval(timer);
  }, [busy]);

  const t = isDarkMode
    ? {
        sub: "text-white/55",
        boxOuter: "border-white/10",
        boxOuterBg: "rgba(25,54,50,0.92)",
        banner: "text-white/75",
        boxInnerBg: "#102623",
        chip: "border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/10",
        attachment: "border-white/20 bg-white/[0.08] text-white/80",
        card: "border-white/10",
        cardBg: "rgba(25,54,50,0.82)",
        cardDesc: "text-white/55",
        iconColor: "text-white",
        bubbleUser: "bg-[#15554f] text-white",
        bubbleBot: "border-white/10 bg-white/[0.06] text-white",
      }
    : {
        sub: "text-[#68766c]",
        boxOuter: "border-[#d5dad4]",
        boxOuterBg: "rgba(237,240,235,0.96)",
        banner: "text-[#40584e]",
        boxInnerBg: "#ffffff",
        chip: "border-[#d5dad4] bg-white/80 text-[#40584e] hover:bg-[#edf0eb]",
        attachment: "border-[#d5dad4] bg-[#f6f7f4] text-[#40584e]",
        card: "border-[#d5dad4]",
        cardBg: "rgba(255,255,255,0.82)",
        cardDesc: "text-[#68766c]",
        iconColor: "text-[#15554f]",
        bubbleUser: "bg-[#15554f] text-white",
        bubbleBot: "border-[#d5dad4] bg-white text-[#28443d]",
      };

  const append = (msg: Omit<UiMessage, "id">) =>
    setMessages((prev) => [...prev, { ...msg, id: uid() }]);

  /**
   * Drops the submitted form from the whole conversation (so it can never be sent
   * twice) and labels the first copy with the server response.
   */
  const clearFormOnMessage = (formId: string, newText: string) => {
    if (sideForm?.form_id === formId) setSideForm(null);
    setMessages((prev) => {
      let labelled = false;
      return prev.map((msg) => {
        if (msg.form?.form_id !== formId) return msg;
        if (labelled) return { ...msg, form: undefined };
        labelled = true;
        return { ...msg, form: undefined, text: newText };
      });
    });
  };

  const sendToAgent = async (
    message: string,
    intent?: "login" | "register",
    attachmentIds: string[] = [],
  ) => {
    setBusy(true);
    setFormError("");
    try {
      setLiveActivities([]);
      const data = await streamChat(
        message,
        intent,
        sessionId ?? undefined,
        (activity) => setLiveActivities((current) =>
          current.some((item) => item.key === activity.key)
            ? current
            : [...current, activity],
        ),
        attachmentIds,
      );
      if (data.session_id) setSessionId(data.session_id);

      if (data.status === "auth_required" && data.form) {
        const isAuthFormIntent =
          data.intent === "auth_login" || data.intent === "auth_register";
        if (!intent && !isAuthFormIntent && message.trim()) {
          setPendingAfterAuth(message);
        } else if (isAuthFormIntent) {
          setPendingAfterAuth(null);
        }
        append({
          role: "assistant",
          text: data.message,
        });
        setSideForm(data.form);
        setStepper(null);
        return;
      }

      if (data.status === "ok") {
        if (data.user) setUser(data.user);
        append({
          role: "assistant",
          text: data.message,
          activity: data.activity,
        });
        if (data.form) {
          setSideForm(data.form);
          setStepper(null);
        }
        // The agent only sends this after the applicant confirmed the process.
        if (data.stepper) {
          setSideForm(null);
          setStepper(data.action ? applyFormAction(data.stepper, data.action) : data.stepper);
        }
        return;
      }

      append({
        role: "assistant",
        text: data.message || "خطای نامشخص از سرور.",
      });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "ارتباط با سرور Agent برقرار نشد.";
      append({
        role: "assistant",
        text: `${msg} — مطمئن شو سرور پایتون روی پورت 8000 روشن است.`,
      });
    } finally {
      setBusy(false);
      setLiveActivities([]);
      window.requestAnimationFrame(() => composerRef.current?.focus());
    }
  };

  const handleSend = async () => {
    const msg = text.trim();
    if (busy || uploading) return;
    if (!msg && attachments.length === 0) return;
    const files = attachments;
    setText("");
    setAttachments([]);
    setFileError("");
    append({ role: "user", text: msg, attachments: files });
    await sendToAgent(
      msg,
      undefined,
      files.map((file) => file.id),
    );
  };

  /** Uploads the picked files one by one; only the returned ids travel with the turn. */
  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setFileError("");
    if (!getToken()) {
      setFileError("برای پیوست فایل ابتدا وارد حساب کاربری شوید.");
      return;
    }
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      setFileError(`حداکثر ${MAX_ATTACHMENTS} فایل در هر پیام مجاز است.`);
      return;
    }
    const picked = Array.from(files).slice(0, room);
    setUploading(true);
    try {
      for (const file of picked) {
        if (file.size > MAX_FILE_BYTES) {
          setFileError(`حجم فایل «${file.name}» بیش از ۲۰ مگابایت است.`);
          continue;
        }
        try {
          const attachment = await postChatAttachment(file);
          setAttachments((prev) =>
            prev.length >= MAX_ATTACHMENTS ? prev : [...prev, attachment],
          );
        } catch (e) {
          setFileError(
            e instanceof Error ? e.message : "بارگذاری فایل ناموفق بود.",
          );
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFormSubmit = async (
    form: AgentForm,
    values: Record<string, string>,
  ) => {
    setBusy(true);
    setFormError("");
    try {
      if (form.form_id === "login") {
        const data = await postLogin(values.mobile ?? "", values.password ?? "");
        clearFormOnMessage(form.form_id, data.message);
        const pending = pendingAfterAuth;
        setPendingAfterAuth(null);
        applySession(data);
        if (pending) {
          append({ role: "user", text: pending });
          await sendToAgent(pending);
        }
      } else if (form.form_id === "register") {
        const data = await postRegister({
          full_name: values.full_name ?? "",
          national_id: values.national_id ?? "",
          mobile: values.mobile ?? "",
          password: values.password ?? "",
          password_confirm: values.password_confirm ?? "",
        });
        clearFormOnMessage(form.form_id, data.message);
        const pending = pendingAfterAuth;
        setPendingAfterAuth(null);
        applySession(data);
        if (pending) {
          append({ role: "user", text: pending });
          await sendToAgent(pending);
        }
      } else {
        // The server enforces this too; checking first avoids a pointless submit.
        if (await submittedToday()) {
          setFormError(
            "شما امروز یک درخواست ثبت کرده‌اید؛ هر کاربر در هر روز فقط می‌تواند یک درخواست ثبت کند.",
          );
          return;
        }
        const data = await postFormSubmit(form.form_id, values, sessionId);
        clearFormOnMessage(form.form_id, data.message);
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "خطا در ارسال فرم");
    } finally {
      setBusy(false);
    }
  };

  const handleFormLink = async (action: string) => {
    if (action === "show_register") await sendToAgent("ثبت‌نام", "register");
    else if (action === "show_login") await sendToAgent("ورود", "login");
  };

  const handleLogout = () => {
    void postLogout();
    clearSession();
    setUser(null);
    setSessionId(null);
    setMessages([]);
    setPendingAfterAuth(null);
  };

  const inChat = messages.length > 0;

  return (
    <div
      dir="rtl"
      className={`mx-auto h-full min-h-0 w-full overflow-hidden ${
        stepper || sideForm
          ? "[direction:ltr] grid grid-cols-1 gap-0 px-0 py-0 lg:grid-cols-[30rem_minmax(0,1fr)] [&>*]:[direction:rtl]"
          : `flex flex-col px-4 py-0 ${inChat ? "max-w-[48rem]" : "max-w-[36rem]"}`
      }`}
    >
      <div
        className={`order-2 flex h-full min-h-0 w-full flex-col ${
          inChat && !stepper && !sideForm ? "px-2" : "px-4"
        } ${
          inChat
            ? "relative"
            : stepper
              ? "items-stretch justify-center py-4"
              : "items-center justify-center py-1 text-center sm:justify-start"
        }`}
      >
      <div className={inChat ? "mb-2 shrink-0 text-right" : "contents"}>
        <>
          <div
            aria-hidden
            className={inChat
              ? "hidden"
              : "mb-4 grid h-20 w-20 shrink-0 place-items-center rounded-[1.6rem] border border-white/35 bg-gradient-to-br from-[#32796d] via-[#15554f] to-[#102623] shadow-[0_12px_30px_rgba(21,85,79,0.25)] ring-4 ring-[#15554f]/[0.08]"
            }
          >
            <Sparkles
              className="h-9 w-9 text-white drop-shadow-sm"
              strokeWidth={1.6}
            />
          </div>
          <h1 className={`mt-0.5 font-black leading-tight ${inChat ? "text-sm" : "max-w-[18rem] text-[1.35rem] leading-[1.4]"}`}>
            سلام، امروز چطوری می‌تونم کمکتون کنم؟
          </h1>
          {!inChat && (
            <p className={`mt-2 max-w-[16rem] text-xs leading-5 ${t.sub}`}>
              من اینجام تا کارهای اداری‌ات رو سریع‌تر و ساده‌تر انجام بدم.
            </p>
          )}
          {user && (
            <button
              type="button"
              onClick={handleLogout}
              className={`mt-2 text-[0.65rem] underline opacity-70 ${t.sub}`}
            >
              خروج از حساب ({user.mobile})
            </button>
          )}
        </>
      </div>

      {inChat && (
        <div
          ref={messagesScrollRef}
          dir="rtl"
          className="mb-0 min-h-0 flex-1 overflow-y-auto px-1 pb-56 [scrollbar-gutter:stable]"
        >
          <div dir="rtl" className="flex min-h-full flex-col justify-end gap-2.5">
          {user && (
            <div
              className={`flex items-center justify-between text-[0.65rem] ${t.sub}`}
            >
              <span>وارد شده: {user.full_name}</span>
              <button type="button" onClick={handleLogout} className="underline">
                خروج
              </button>
            </div>
          )}
          {messages.length === 0 && (
            <div className={`flex justify-end`}>
              <div className={`max-w-[90%] rounded-2xl border px-3 py-2 text-right text-sm leading-6 ${t.bubbleBot}`}>
                <p className="whitespace-pre-wrap">
                  سلام! آیا می‌خواهید وارد حساب کاربری خود شوید یا ثبت‌نام کنید؟
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void sendToAgent("ورود", "login")}
                    className="rounded-lg border px-3 py-1 text-xs"
                  >
                    ورود به حساب
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendToAgent("ثبت‌نام", "register")}
                    className="rounded-lg border px-3 py-1 text-xs"
                  >
                    ثبت نام
                  </button>
                </div>
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl border px-3 py-2 text-right text-sm leading-6 ${
                  m.role === "user" ? t.bubbleUser : t.bubbleBot
                }`}
              >
                {m.attachments?.length ? (
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {m.attachments.map((file) => (
                      <span
                        key={file.id}
                        className={`inline-flex max-w-full items-center gap-1 rounded-lg border px-2 py-1 text-[0.65rem] ${t.attachment}`}
                      >
                        <FileText className="h-3 w-3 shrink-0" />
                        <span className="truncate">{file.name}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
                {m.text ? (
                  <p className="whitespace-pre-wrap">{m.text}</p>
                ) : null}
                {m.activity?.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {m.activity.map((step, stepIndex) => (
                      <span
                        key={`${step.key}-${stepIndex}`}
                        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.6rem] ${
                          isDarkMode
                            ? "border-white/10 bg-white/[0.03] text-white/50"
                            : "border-[#e6eae3] bg-[#f6f8f3] text-[#68766c]"
                        }`}
                      >
                        <Sparkles className="h-2.5 w-2.5 opacity-70" />
                        {step.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {busy && (
            <div className={`flex flex-col gap-1 text-[0.7rem] ${t.sub}`}>
              <div className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {liveActivities.at(-1)?.label ?? BUSY_STAGES[busyStage] ?? BUSY_STAGES[0]}
              </div>
              {liveActivities.slice(0, -1).map((activity) => (
                <span key={activity.key} className="opacity-70">• {activity.label}</span>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
          </div>
        </div>
      )}

      <div
        className={
          inChat
            ? "absolute inset-x-2 bottom-0 z-20 mx-auto w-auto max-w-[34rem]"
            : "mt-5 w-full shrink-0"
        }
      >
        <div
          className={`rounded-2xl border p-1 shadow-[0_12px_30px_rgba(40,68,61,0.12)] ${t.boxOuter}`}
          style={{ background: t.boxOuterBg }}
        >
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[0.7rem] ${t.banner}`}
          >
            <Sparkles className="h-3.5 w-3.5 text-[#4f7aab]" />
            <span>با هوش مصنوعی کارهای اداری را سریع‌تر انجام دهید</span>
          </div>

          <div
            className="relative min-h-[6.5rem] rounded-xl px-2 pb-2 pt-1"
            style={{ background: t.boxInnerBg }}
          >
          {attachments.length > 0 || uploading ? (
            <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1">
              {attachments.map((file) => (
                <span
                  key={file.id}
                  className={`inline-flex max-w-full items-center gap-1 rounded-lg border px-2 py-1 text-[0.65rem] ${t.chip}`}
                >
                  <FileText className="h-3 w-3 shrink-0" />
                  <span className="max-w-[9rem] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setAttachments((prev) =>
                        prev.filter((item) => item.id !== file.id),
                      )
                    }
                    aria-label={`حذف پیوست ${file.name}`}
                    title="حذف پیوست"
                    className="rounded p-0.5 transition-opacity hover:opacity-70"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {uploading && (
                <span
                  className={`inline-flex items-center gap-1 text-[0.65rem] ${t.sub}`}
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  در حال بارگذاری...
                </span>
              )}
            </div>
          ) : null}
          {fileError && (
            <p className="px-1 pt-1 text-[0.65rem] font-medium text-rose-500">
              {fileError}
            </p>
          )}
          <textarea
            ref={composerRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            aria-label="درخواست جدید"
            placeholder="درخواستت را بنویس... (مثلاً: فرم مرخصی می‌خوام)"
            className="h-24 w-full resize-none bg-transparent p-2 pb-9 text-right text-sm outline-none placeholder:text-current placeholder:opacity-35"
            disabled={busy}
          />

          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                className="hidden"
                onChange={(e) => void handleFiles(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={
                  busy || uploading || attachments.length >= MAX_ATTACHMENTS
                }
                title="پیوست فایل"
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] transition-colors disabled:opacity-50 ${t.chip}`}
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5" />
                )}
                پیوست فایل
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="ارسال درخواست"
                disabled={(!text.trim() && attachments.length === 0) || busy || uploading}
                onClick={() => void handleSend()}
                className="rounded-full bg-[#15554f] p-1.5 text-white transition-colors hover:bg-[#246b61] disabled:bg-[#7fa6a1] disabled:opacity-100"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          </div>
        </div>
      </div>

      {!inChat && (
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
      )}
      </div>
      {(stepper || sideForm) && (
        <aside className="order-1 flex h-full min-h-0 w-full items-stretch overflow-hidden" aria-label="پنل فرم و فرآیند">
          {stepper ? (
            <ProcessStepper
              payload={stepper}
              sessionId={sessionId}
              onClose={() => setStepper(null)}
              onSubmitted={(result) => {
                setFormError("");
                append({
                  role: "assistant",
                  text: result.trackingCode
                    ? `${result.message}\nکد پیگیری: ${result.trackingCode}`
                    : result.message,
                });
              }}
            />
          ) : sideForm ? (
            <div className={`h-full w-full overflow-y-auto rounded-2xl border p-4 ${isDarkMode ? "border-white/10 bg-[#14302c]" : "border-[#dfe4dc] bg-[#fbfcf9]"}`}>
              <InlineAgentForm
                form={sideForm}
                isDarkMode={isDarkMode}
                busy={busy}
                error={formError}
                onSubmit={(values) => handleFormSubmit(sideForm, values)}
                onLink={handleFormLink}
              />
            </div>
          ) : null}
        </aside>
      )}
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