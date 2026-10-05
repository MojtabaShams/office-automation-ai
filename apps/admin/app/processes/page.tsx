"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  Landmark,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Wallet,
  Workflow,
  X,
} from "lucide-react";
import { useTheme } from "../../theme-context";
import ConfirmModal from "../../components/ConfirmModal";
import Modal from "../../components/Modal";
import ProcessBuilderWizard from "../../components/processes/ProcessBuilderWizard";
import PaymentGatewayManagerModal from "../../components/processes/PaymentGatewayManagerModal";
import SearchMatchText, { countSearchMatches } from "../../components/SearchMatchText";
import {
  formatPersianNumber,
  formatProcessDate,
  initialProcesses,
  PROCESS_DEPARTMENTS,
  PROCESS_STORAGE_KEY,
  saveProcesses,
  type ProcessDefinition,
  type ProcessStatus,
} from "../lib/mock-processes";
import {
  PAYMENT_GATEWAYS_STORAGE_KEY,
  savePaymentGateways,
  type PaymentGateway,
} from "../lib/payment-gateways";

const STATUS_FILTERS: { value: "all" | ProcessStatus; label: string }[] = [
  { value: "all", label: "همه وضعیت‌ها" },
  { value: "active", label: "فعال" },
  { value: "inactive", label: "غیرفعال" },
  { value: "draft", label: "پیش‌نویس" },
];

function statusStyle(status: ProcessStatus, isDarkMode: boolean) {
  const styles: Record<ProcessStatus, { light: string; dark: string }> = {
    active: { light: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700", dark: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" },
    inactive: { light: "border-slate-400/30 bg-slate-400/10 text-slate-600", dark: "border-slate-300/20 bg-slate-300/10 text-slate-300" },
    draft: { light: "border-amber-500/25 bg-amber-500/10 text-amber-700", dark: "border-amber-400/25 bg-amber-400/10 text-amber-300" },
    archived: { light: "border-rose-500/25 bg-rose-500/10 text-rose-700", dark: "border-rose-400/25 bg-rose-400/10 text-rose-300" },
  };
  return isDarkMode ? styles[status].dark : styles[status].light;
}
const STATUS_LABEL: Record<ProcessStatus, string> = {
  active: "فعال",
  inactive: "غیرفعال",
  draft: "پیش‌نویس",
  archived: "بایگانی‌شده",
};

function isPaymentGatewayList(value: unknown): value is PaymentGateway[] {
  return Array.isArray(value) && value.every((gateway: unknown) =>
    typeof gateway === "object"
    && gateway !== null
    && "id" in gateway
    && typeof gateway.id === "string"
    && "bankName" in gateway
    && typeof gateway.bankName === "string"
    && "connectionKey" in gateway
    && typeof gateway.connectionKey === "string"
    && "description" in gateway
    && typeof gateway.description === "string"
    && "updatedAt" in gateway
    && typeof gateway.updatedAt === "string"
  );
}

function IconForProcess({ icon, className }: { icon: string; className?: string }) {
  const Icon = icon === "building"
    ? Building2
    : icon === "wallet"
      ? Wallet
      : icon === "calendar"
        ? CalendarDays
        : FileText;
  return <Icon className={className} />;
}

function ProcessPreview({ process, gateways, onClose }: { process: ProcessDefinition; gateways: PaymentGateway[]; onClose: () => void }) {
  const { isDarkMode } = useTheme();
  const surface = isDarkMode ? "border-white/10 bg-[#122925]" : "border-[#e1e6df] bg-[#f6f7f4]";
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";

  return (
    <Modal open onClose={onClose} title="جزئیات و پیش‌نمایش پروسه" maxWidthClass="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`rounded-xl p-3 ${isDarkMode ? "bg-[#15554f]/25 text-[#8bd0bf]" : "bg-[#e2eee8] text-[#15554f]"}`}>
            <IconForProcess icon={process.icon} className="h-6 w-6" />
          </span>
          <div>
            <h3 className="text-base font-bold">{process.title}</h3>
            <p className={`mt-1 text-xs ${muted}`}>{process.department} · <span dir="ltr">{process.code}</span> · نسخه {process.version}</p>
          </div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs ${statusStyle(process.status, isDarkMode)}`}>{STATUS_LABEL[process.status]}</span>
      </div>
      <p className={`mb-4 rounded-xl border p-3 text-xs leading-6 ${surface} ${muted}`}>{process.description || "بدون توضیحات"}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`rounded-xl border p-4 ${surface}`}>
          <h4 className="mb-3 text-xs font-bold">زنجیره مراحل</h4>
          <ol className="space-y-2">
            {process.stages.map((stage, index) => (
              <li key={stage.id} className={`flex items-start gap-2 text-xs ${muted}`}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#15554f]/10 text-[0.62rem] text-[#15554f]">{index + 1}</span>
                <span>{stage.title} <span className="opacity-70">· {stage.assigneeRole} · {formatPersianNumber(stage.slaDays)} روز</span></span>
              </li>
            ))}
          </ol>
        </section>
        <section className={`rounded-xl border p-4 ${surface}`}>
          <h4 className="mb-3 text-xs font-bold">فیلدهای فرم و قوانین</h4>
          <div className="mb-3 space-y-2">
            {process.fields.map((field) => (
              <div key={field.id} className={`rounded-lg border p-2 ${isDarkMode ? "border-white/10 bg-white/[0.025]" : "border-[#d5dad4] bg-white"}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full border px-2.5 py-1 text-[0.65rem] ${isDarkMode ? "border-white/10 text-white/75" : "border-[#d5dad4] text-[#40584e]"}`}>
                    {field.type === "section" ? "بخش" : field.type === "repeater" ? "فهرست تکرارشونده" : field.type === "number" ? "عدد" : field.type === "select" ? "فهرست انتخاب" : field.type === "date" ? "تاریخ" : field.type === "file" ? "فایل" : "متن"}: {field.label}{field.required && " *"}
                  </span>
                  {field.slug && <code dir="ltr" className={`rounded px-1.5 py-0.5 text-[0.6rem] ${isDarkMode ? "bg-white/[0.06] text-white/55" : "bg-[#edf0eb] text-[#68766c]"}`}>{field.slug}</code>}
                  {field.unit && <span className={`text-[0.62rem] ${muted}`}>واحد: {field.unit}</span>}
                  {field.condition && <span className={`text-[0.62rem] ${muted}`}>نمایش مشروط</span>}
                </div>
                {!!field.subFields?.length && <div className={`mt-2 flex flex-wrap gap-1.5 border-r-2 pr-2 ${isDarkMode ? "border-white/10" : "border-[#d5dad4]"}`}>
                  {field.subFields.map((subField) => <span key={subField.id} className={`rounded-full px-2 py-1 text-[0.62rem] ${isDarkMode ? "bg-white/[0.05] text-white/65" : "bg-[#edf0eb] text-[#40584e]"}`}>{subField.label || "زیرفیلد"}{subField.slug ? ` · ${subField.slug}` : ""}</span>)}
                </div>}
              </div>
            ))}
          </div>
          <ul className={`space-y-1.5 text-[0.68rem] leading-5 ${muted}`}>
            {process.rules.length ? process.rules.map((rule, index) => <li key={`${index}-${rule}`}>• {rule}</li>) : <li>قانون خاصی ثبت نشده است.</li>}
          </ul>
        </section>
      </div>
      <section className={`mt-4 rounded-xl border p-4 ${surface}`}>
        <h4 className="mb-2 text-xs font-bold">راهنمای متقاضی</h4>
        <p className={`text-xs leading-6 ${muted}`}>{process.applicantGuidance || "راهنمایی ثبت نشده است."}</p>
        <p className={`mt-3 text-[0.68rem] ${muted}`}>
          پرداخت: {process.payment.mode === "none" ? "بدون پرداخت" : process.payment.mode === "fixed" ? `${formatPersianNumber(process.payment.amount)} ریال · ${gateways.find((gateway) => gateway.id === process.payment.provider)?.bankName ?? process.payment.provider}` : `${process.payment.formula} · ${gateways.find((gateway) => gateway.id === process.payment.provider)?.bankName ?? process.payment.provider}`}
        </p>
      </section>
    </Modal>
  );
}

export default function ProcessesPage() {
  const { isDarkMode } = useTheme();
  const [processes, setProcesses] = useState<ProcessDefinition[]>(initialProcesses);
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const matchRefs = useRef<(HTMLElement | null)[]>([]);
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState<"all" | ProcessStatus>("all");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [gatewaysModalOpen, setGatewaysModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProcessDefinition | null>(null);
  const [preview, setPreview] = useState<ProcessDefinition | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ProcessDefinition | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [gatewayError, setGatewayError] = useState("");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PROCESS_STORAGE_KEY);
      if (stored) setProcesses(JSON.parse(stored) as ProcessDefinition[]);
    } catch (storageError) {
      console.error("بارگذاری پروسه‌های ذخیره‌شده ناموفق بود:", storageError);
      setError("پروسه‌های ذخیره‌شده بارگذاری نشدند؛ داده‌های نمونه نمایش داده می‌شوند.");
    }
    try {
      const storedGateways = window.localStorage.getItem(PAYMENT_GATEWAYS_STORAGE_KEY);
      if (storedGateways) {
        const parsed: unknown = JSON.parse(storedGateways);
        if (!isPaymentGatewayList(parsed)) {
          throw new Error("ساختار فهرست درگاه‌های ذخیره‌شده معتبر نیست.");
        }
        setPaymentGateways(parsed);
      }
    } catch (storageError) {
      console.error("بارگذاری درگاه‌های پرداخت ذخیره‌شده ناموفق بود:", storageError);
      setGatewayError("درگاه‌های پرداخت ذخیره‌شده بارگذاری نشدند.");
    }
  }, []);

  const persist = (next: ProcessDefinition[], successMessage?: string) => {
    setProcesses(next);
    try {
      saveProcesses(next);
      setError("");
      if (successMessage) setNotice(successMessage);
    } catch (storageError) {
      console.error("ذخیره پروسه‌ها ناموفق بود:", storageError);
      setError("تغییرات نمایش داده شدند، اما در مرورگر ذخیره نشدند.");
    }
  };

  const persistPaymentGateways = (next: PaymentGateway[]) => {
    try {
      savePaymentGateways(next);
      setPaymentGateways(next);
      setGatewayError("");
      return true;
    } catch (storageError) {
      console.error("ذخیره درگاه‌های پرداخت ناموفق بود:", storageError);
      setGatewayError("درگاه پرداخت ذخیره نشد؛ فضای ذخیره‌سازی مرورگر در دسترس نیست.");
      return false;
    }
  };

  const savePaymentGateway = (gateway: PaymentGateway) => {
    const exists = paymentGateways.some((item) => item.id === gateway.id);
    const next = exists
      ? paymentGateways.map((item) => item.id === gateway.id ? gateway : item)
      : [...paymentGateways, gateway];
    return persistPaymentGateways(next);
  };

  const deletePaymentGateway = (gatewayId: string) => {
    const gateway = paymentGateways.find((item) => item.id === gatewayId);
    if (!gateway) return false;
    const nextGateways = paymentGateways.filter((item) => item.id !== gatewayId);
    if (!persistPaymentGateways(nextGateways)) return false;
    const affectedProcesses = processes.filter((process) => process.payment.provider === gatewayId);
    if (affectedProcesses.length) {
      persist(
        processes.map((process) => process.payment.provider === gatewayId
          ? { ...process, payment: { ...process.payment, provider: "" } }
          : process),
      );
    }
    return true;
  };

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fa");
    return processes.filter((process) => {
      if (process.status === "archived") return false;
      if (department !== "all" && process.department !== department) return false;
      if (status !== "all" && process.status !== status) return false;
      if (!normalizedQuery) return true;
      return `${process.title} ${process.code} ${process.department}`.toLocaleLowerCase("fa").includes(normalizedQuery);
    });
  }, [department, processes, query, status]);

  const matchLayout = useMemo(() => {
    const fieldStarts = new Map<string, number>();
    const locations: number[] = [];
    let total = 0;
    if (!query) return { fieldStarts, locations, total };

    filtered.forEach((process, processIndex) => {
      const searchableFields = [
        ["title", process.title],
        ["code", process.code],
        ["department", process.department],
      ] as const;
      searchableFields.forEach(([fieldKey, text]) => {
        const matches = countSearchMatches(text, query);
        if (!matches) return;
        fieldStarts.set(`${processIndex}:${fieldKey}`, total);
        for (let matchIndex = 0; matchIndex < matches; matchIndex += 1) locations.push(processIndex);
        total += matches;
      });
    });
    return { fieldStarts, locations, total };
  }, [filtered, query]);

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

  const counts = useMemo(() => ({
    active: processes.filter((process) => process.status === "active").length,
    inactive: processes.filter((process) => process.status === "inactive").length,
    draft: processes.filter((process) => process.status === "draft").length,
  }), [processes]);

  const saveDefinition = (definition: ProcessDefinition, publish: boolean) => {
    const duplicateCode = processes.some((item) => item.code.toLocaleLowerCase() === definition.code.toLocaleLowerCase() && item.id !== editing?.id && item.status !== "archived");
    if (duplicateCode) {
      setError(`کد شناسه «${definition.code}» قبلاً برای پروسه دیگری ثبت شده است.`);
      return false;
    }
    const exists = processes.some((item) => item.id === editing?.id);
    const next = exists
      ? processes.map((item) => item.id === editing!.id ? { ...definition, id: editing!.id } : item)
      : [...processes, definition];
    persist(next, publish ? "پروسه با موفقیت منتشر شد." : "پیش‌نویس پروسه ذخیره شد.");
    setEditing(null);
    setWizardOpen(false);
    return true;
  };

  const toggleStatus = (process: ProcessDefinition) => {
    if (process.status === "draft" || process.status === "archived") return;
    const nextStatus = process.status === "active" ? "inactive" : "active";
    persist(
      processes.map((item) => item.id === process.id ? { ...item, status: nextStatus, updatedAt: new Date().toISOString() } : item),
      `پروسه «${process.title}» ${nextStatus === "active" ? "فعال" : "غیرفعال"} شد.`
    );
    setOpenMenu(null);
  };

  const archive = () => {
    if (!archiveTarget) return;
    persist(
      processes.map((item) => item.id === archiveTarget.id ? { ...item, status: "archived", updatedAt: new Date().toISOString() } : item),
      `پروسه «${archiveTarget.title}» به بایگانی منتقل شد.`
    );
    setArchiveTarget(null);
  };

  const surface = isDarkMode ? "border-white/10 bg-[#193632]" : "border-[#d5dad4] bg-[#edf0eb]";
  const field = isDarkMode
    ? "border-white/10 bg-white/[0.06] text-white placeholder:text-white/40"
    : "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]";
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";

  return (
    <div dir="rtl" className={`w-full ${isDarkMode ? "text-white" : "text-[#28443d]"}`}>
      <div className="mb-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black">
            <Workflow className="h-7 w-7 text-[#15554f]" />
            مدیریت پروسه‌ها و گردش کار
          </h1>
          <p className={`mt-1 text-xs ${muted}`}>تعریف فرم‌ها، مراحل رسیدگی، قوانین و تنظیمات پروسه‌های سامانه</p>
        </div>
      </div>
      {notice && (
        <div role="status" className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{notice}</span>
          <button type="button" aria-label="بستن پیام" onClick={() => setNotice("")}><X className="h-4 w-4" /></button>
        </div>
      )}
      {error && <p role="alert" className="mb-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-600">{error}</p>}

      <section className={`sticky top-0 z-30 mb-4 rounded-2xl border p-3 shadow-sm ${surface}`}>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setEditing(null); setWizardOpen(true); setNotice(""); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#15554f] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#246b61]">
            <Plus className="h-3.5 w-3.5" />ایجاد پروسه جدید
          </button>
          <button type="button" onClick={() => { setGatewaysModalOpen(true); setGatewayError(""); }} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${isDarkMode ? "border-white/15 bg-white/[0.05] text-white/85 hover:bg-white/10" : "border-[#d5dad4] bg-[#fafbf9] text-[#40584e] hover:bg-[#edf0eb]"}`}>
            <Landmark className="h-3.5 w-3.5 text-[#15554f]" />ثبت درگاه
          </button>
          <label className={`flex min-w-56 flex-1 items-center gap-2 rounded-full border px-3 py-2.5 text-xs ${field}`}>
            <Search className="h-4 w-4 shrink-0 opacity-55" />
            <input
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
              placeholder="جستجوی عنوان، کد شناسه یا واحد... (Enter بعدی، Shift+Enter قبلی)"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:opacity-70"
            />
            {query && (
              <>
                <span className="shrink-0 text-[0.65rem] tabular-nums opacity-60" dir="ltr">{matchLayout.total ? `${activeMatch + 1}/${matchLayout.total}` : "0/0"}</span>
                <button type="button" onClick={() => navigateMatches(-1)} disabled={!matchLayout.total} aria-label="نتیجه قبلی" className="rounded-md p-1 transition-colors hover:bg-black/5 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => navigateMatches(1)} disabled={!matchLayout.total} aria-label="نتیجه بعدی" className="rounded-md p-1 transition-colors hover:bg-black/5 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label="پاک کردن جستجو" onClick={() => { setQuery(""); setActiveMatch(0); }} className="rounded-md p-1 transition-colors hover:bg-black/5"><X className="h-3.5 w-3.5" /></button>
              </>
            )}
          </label>
          <label className="flex items-center gap-2">
            <span className={`text-[0.68rem] ${muted}`}>واحد</span>
            <span className="relative">
              <select value={department} onChange={(event) => { setDepartment(event.target.value); setActiveMatch(0); }} className={`min-w-36 appearance-none rounded-xl border py-2.5 pl-9 pr-3 text-xs outline-none ${field}`}>
                <option value="all" style={{ background: "#fff", color: "#111827" }}>همه واحدها</option>
                {PROCESS_DEPARTMENTS.map((item) => <option key={item} value={item} style={{ background: "#fff", color: "#111827" }}>{item}</option>)}
              </select>
              <ChevronDown aria-hidden="true" className={`pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${muted}`} />
            </span>
          </label>
          <label className="flex items-center gap-2">
            <span className={`text-[0.68rem] ${muted}`}>وضعیت</span>
            <span className="relative">
              <select value={status} onChange={(event) => { setStatus(event.target.value as "all" | ProcessStatus); setActiveMatch(0); }} className={`min-w-36 appearance-none rounded-xl border py-2.5 pl-9 pr-3 text-xs outline-none ${field}`}>
                {STATUS_FILTERS.map((item) => <option key={item.value} value={item.value} style={{ background: "#fff", color: "#111827" }}>{item.label}</option>)}
              </select>
              <ChevronDown aria-hidden="true" className={`pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${muted}`} />
            </span>
          </label>
          <span className={`mr-auto rounded-full px-3 py-2 text-[0.68rem] ${isDarkMode ? "bg-white/[0.05]" : "bg-white/70"} ${muted}`}>{formatPersianNumber(filtered.length)} پروسه</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["active", "inactive", "draft"] as const).map((key) => (
            <span key={key} className={`rounded-full border px-2.5 py-1 text-[0.65rem] ${statusStyle(key, isDarkMode)}`}>
              {STATUS_LABEL[key]}: {formatPersianNumber(counts[key])}
            </span>
          ))}
        </div>
      </section>

      {filtered.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((process, processIndex) => (
            <article key={process.id} className={`relative rounded-2xl border p-4 shadow-sm transition hover:shadow-md ${isDarkMode ? "border-white/10 bg-[#193632]" : "border-[#d5dad4] bg-white"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${isDarkMode ? "bg-[#15554f]/25 text-[#8bd0bf]" : "bg-[#e2eee8] text-[#15554f]"}`}><IconForProcess icon={process.icon} className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold" title={process.title}>
                      <SearchMatchText text={process.title} query={query} startIndex={matchLayout.fieldStarts.get(`${processIndex}:title`) ?? 0} activeIndex={activeMatch} registerRef={(index, element) => { matchRefs.current[index] = element; }} />
                    </h2>
                          <p className={`mt-1 flex items-center gap-1 text-[0.68rem] ${muted}`}><Building2 className="h-3.5 w-3.5" /><SearchMatchText text={process.department} query={query} startIndex={matchLayout.fieldStarts.get(`${processIndex}:department`) ?? 0} activeIndex={activeMatch} registerRef={(index, element) => { matchRefs.current[index] = element; }} /></p>
                  </div>
                </div>
                <div className="relative">
                  <button type="button" aria-label={`عملیات ${process.title}`} aria-expanded={openMenu === process.id} onClick={() => setOpenMenu(openMenu === process.id ? null : process.id)} className={`rounded-lg border p-1.5 ${isDarkMode ? "border-white/10 hover:bg-white/[0.06]" : "border-[#e1e6df] hover:bg-[#edf0eb]"}`}><MoreVertical className="h-4 w-4" /></button>
                  {openMenu === process.id && (
                    <div className={`absolute left-0 top-full z-20 mt-1 w-48 rounded-xl border p-1.5 shadow-xl ${isDarkMode ? "border-white/10 bg-[#122925]" : "border-[#d5dad4] bg-white"}`}>
                      <button type="button" onClick={() => { setEditing(process); setWizardOpen(true); setOpenMenu(null); setNotice(""); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-right text-xs hover:bg-[#15554f]/10"><Pencil className="h-3.5 w-3.5" />ویرایش / ایجاد نسخه</button>
                      <button type="button" onClick={() => { setPreview(process); setOpenMenu(null); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-right text-xs hover:bg-[#15554f]/10"><ClipboardList className="h-3.5 w-3.5" />پیش‌نمایش جزئیات</button>
                      <button type="button" disabled={process.status === "draft"} onClick={() => toggleStatus(process)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-right text-xs hover:bg-[#15554f]/10 disabled:cursor-not-allowed disabled:opacity-40">
                        {process.status === "active" ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                        {process.status === "active" ? "غیرفعال‌کردن سریع" : process.status === "draft" ? "ابتدا پروسه را منتشر کنید" : "فعال‌کردن"}
                      </button>
                      <button type="button" onClick={() => { setArchiveTarget(process); setOpenMenu(null); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-right text-xs text-rose-600 hover:bg-rose-500/10"><Archive className="h-3.5 w-3.5" />انتقال به بایگانی</button>
                    </div>
                  )}
                </div>
              </div>
              <p className={`mt-3 line-clamp-2 min-h-10 text-xs leading-5 ${muted}`}>{process.description || "بدون توضیحات"}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[0.65rem] ${statusStyle(process.status, isDarkMode)}`}>{STATUS_LABEL[process.status]}</span>
                <span className={`rounded-full px-2.5 py-1 text-[0.65rem] ${isDarkMode ? "bg-white/[0.06] text-white/65" : "bg-[#edf0eb] text-[#53665b]"}`}>نسخه {process.version}</span>
                <span className={`rounded-full px-2.5 py-1 text-[0.65rem] ${isDarkMode ? "bg-white/[0.06] text-white/65" : "bg-[#edf0eb] text-[#53665b]"}`}><span dir="ltr"><SearchMatchText text={process.code} query={query} startIndex={matchLayout.fieldStarts.get(`${processIndex}:code`) ?? 0} activeIndex={activeMatch} registerRef={(index, element) => { matchRefs.current[index] = element; }} /></span></span>
              </div>
              <div className={`mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-[0.68rem] ${isDarkMode ? "border-white/10 text-white/55" : "border-[#e6e9e3] text-[#68766c]"}`}>
                <span className="inline-flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5" />{formatPersianNumber(process.activeCases)} پرونده جاری</span>
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />به‌روزرسانی {formatProcessDate(process.updatedAt)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={`rounded-2xl border border-dashed p-10 text-center ${muted} ${isDarkMode ? "border-white/15" : "border-[#cfd6ce]"}`}>
          <Search className="mx-auto mb-3 h-8 w-8 opacity-40" />
          <p className="text-sm font-semibold">پروسه‌ای با این فیلترها پیدا نشد</p>
          <button type="button" onClick={() => { setQuery(""); setDepartment("all"); setStatus("all"); }} className="mt-3 text-xs font-semibold text-[#15554f] hover:underline">پاک کردن فیلترها</button>
        </div>
      )}

      <ProcessBuilderWizard
        open={wizardOpen}
        initial={editing}
        paymentGateways={paymentGateways}
        onClose={() => { setWizardOpen(false); setEditing(null); }}
        onSave={saveDefinition}
      />
      {preview && <ProcessPreview process={preview} gateways={paymentGateways} onClose={() => setPreview(null)} />}
      <PaymentGatewayManagerModal
        open={gatewaysModalOpen}
        gateways={paymentGateways}
        operationError={gatewayError}
        onClose={() => setGatewaysModalOpen(false)}
        onSave={savePaymentGateway}
        onDelete={deletePaymentGateway}
      />
      <ConfirmModal
        open={Boolean(archiveTarget)}
        title="انتقال پروسه به بایگانی"
        message={archiveTarget ? `«${archiveTarget.title}» از فهرست فعال خارج و به بایگانی منتقل می‌شود. این کار پرونده‌های جاری را حذف نمی‌کند. ادامه می‌دهید؟` : ""}
        confirmLabel="انتقال به بایگانی"
        danger
        onConfirm={archive}
        onClose={() => setArchiveTarget(null)}
      />
    </div>
  );
}
