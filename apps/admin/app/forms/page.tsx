"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  FolderUp,
  Landmark,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Wallet,
  X,
} from "lucide-react";
import { useTheme } from "../../theme-context";
import ConfirmModal from "../../components/ConfirmModal";
import Modal from "../../components/Modal";
import FormEditorModal from "../../components/forms/FormEditorModal";
import PaymentGatewayManagerModal from "../../components/processes/PaymentGatewayManagerModal";
import SearchMatchText, { countSearchMatches } from "../../components/SearchMatchText";
import type { FormDefinition, FormType } from "../lib/mock-forms";
import type { ProcessStatus } from "../lib/mock-processes";
import {
  archiveAdminForm,
  listAdminForms,
  saveAdminForm,
  setAdminFormStatus,
} from "../lib/admin-api";
import { usePaymentGateways, type PaymentGateway } from "../lib/payment-gateways";
import { UNIT_LABELS } from "../lib/units";

const STATUS_FILTERS: { value: "all" | ProcessStatus; label: string }[] = [
  { value: "all", label: "همه وضعیت‌ها" },
  { value: "active", label: "فعال" },
  { value: "inactive", label: "غیرفعال" },
  { value: "draft", label: "پیش‌نویس" },
];

const TYPE_LABEL: Record<FormType, string> = {
  standard: "فرم عادی",
  document: "بارگذاری مدرک",
  payment: "پرداخت",
};

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

function IconForForm({ formType, className }: { formType: FormType; className?: string }) {
  const Icon = formType === "payment" ? Wallet : formType === "document" ? FolderUp : FileText;
  return <Icon className={className} />;
}

function formatFormDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}
function formatPersianNumber(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value);
}

/** شمارش بازگشتی تمام فیلدهای برگ (بدون شمردن خود بخش‌ها) برای نمایش «فیلدها: N» */
function countLeafFields(fields: FormDefinition["fields"]): number {
  return fields.reduce((sum, field) => {
    if (field.type === "section" || field.type === "repeater") {
      return sum + countLeafFields(field.subFields ?? []);
    }
    return sum + 1;
  }, 0);
}

function FormPreview({ form, gateways, onClose }: { form: FormDefinition; gateways: PaymentGateway[]; onClose: () => void }) {
  const { isDarkMode } = useTheme();
  const surface = isDarkMode ? "border-white/10 bg-[#122925]" : "border-[#e1e6df] bg-[#f6f7f4]";
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";

  return (
    <Modal open onClose={onClose} title="جزئیات و پیش‌نمایش فرم" maxWidthClass="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`rounded-xl p-3 ${isDarkMode ? "bg-[#15554f]/25 text-[#8bd0bf]" : "bg-[#e2eee8] text-[#15554f]"}`}>
            <IconForForm formType={form.formType} className="h-6 w-6" />
          </span>
          <div>
            <h3 className="text-base font-bold">{form.title}</h3>
            <p className={`mt-1 text-xs ${muted}`}>{form.department} · <span dir="ltr">{form.code}</span> · نسخه {form.version}</p>
          </div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs ${statusStyle(form.status, isDarkMode)}`}>{STATUS_LABEL[form.status]}</span>
      </div>

      <p className={`mb-4 rounded-xl border p-3 text-xs leading-6 ${surface} ${muted}`}>{form.description || "بدون توضیحات"}</p>

      {form.formType === "payment" ? (
        <section className={`rounded-xl border p-4 ${surface}`}>
          <h4 className="mb-2 text-xs font-bold">تنظیمات پرداخت</h4>
          <p className={`text-xs leading-6 ${muted}`}>
            درگاه: {gateways.find((g) => g.id === form.payment?.gatewayId)?.bankName ?? "انتخاب نشده"}
            {form.payment?.defaultAmount ? ` · مبلغ پیش‌فرض: ${formatPersianNumber(form.payment.defaultAmount)} ریال` : ""}
          </p>
          <p className={`mt-2 text-[0.68rem] ${muted}`}>فرمول دقیق مبلغ، در لحظه‌ی اتصال این فرم به یک پروسه‌ی مشخص تعریف می‌شود.</p>
        </section>
      ) : (
        <section className={`rounded-xl border p-4 ${surface}`}>
          <h4 className="mb-3 text-xs font-bold">فیلدهای فرم</h4>
          <div className="mb-3 space-y-2">
            {form.fields.map((field) => (
              <div key={field.id} className={`rounded-lg border p-2 ${isDarkMode ? "border-white/10 bg-white/[0.025]" : "border-[#e1e6df] bg-white"}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full border px-2.5 py-1 text-[0.65rem] ${isDarkMode ? "border-white/10 text-white/75" : "border-[#e1e6df] text-[#40584e]"}`}>
                    {field.type === "section" ? "بخش" : field.label}
                  </span>
                  {field.unit && <span className={`text-[0.62rem] ${muted}`}>واحد: {UNIT_LABELS[field.unit] ?? field.unit}</span>}
                </div>
                {!!field.subFields?.length && (
                  <div className={`mt-2 flex flex-wrap gap-1.5 border-r-2 pr-2 ${isDarkMode ? "border-white/10" : "border-[#e1e6df]"}`}>
                    {field.subFields.map((sub) => (
                      <span key={sub.id} className={`rounded-full px-2 py-1 text-[0.62rem] ${isDarkMode ? "bg-white/[0.05] text-white/65" : "bg-[#f6f7f4] text-[#40584e]"}`}>
                        {sub.label || "زیرفیلد"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {!form.fields.length && <p className={`text-xs ${muted}`}>هنوز فیلدی تعریف نشده است.</p>}
          </div>
          <h4 className="mb-2 text-xs font-bold">قوانین اعتبارسنجی</h4>
          <ul className={`space-y-1.5 text-[0.68rem] leading-5 ${muted}`}>
            {form.rules.length
              ? form.rules.map((rule) => (
                  <li key={rule.id}>
                    • {rule.text}
                    {rule.source && <span className="opacity-70"> (منبع: {rule.source.fileName}{rule.source.pageOrClause ? `، ${rule.source.pageOrClause}` : ""})</span>}
                  </li>
                ))
              : <li>قانونی ثبت نشده است.</li>}
          </ul>
        </section>
      )}

      <section className={`mt-4 rounded-xl border p-4 ${surface}`}>
        <h4 className="mb-2 text-xs font-bold">راهنمای متقاضی</h4>
        <p className={`text-xs leading-6 ${muted}`}>{form.applicantGuidance || "راهنمایی ثبت نشده است."}</p>
      </section>
    </Modal>
  );
}

export default function FormsPage() {
  const { isDarkMode } = useTheme();
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const {
    gateways: paymentGateways,
    loading: gatewaysLoading,
    error: gatewayError,
    reload: reloadGateways,
  } = usePaymentGateways();
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const matchRefs = useRef<(HTMLElement | null)[]>([]);
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState<"all" | ProcessStatus>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [gatewaysModalOpen, setGatewaysModalOpen] = useState(false);
  const [editing, setEditing] = useState<FormDefinition | null>(null);
  const [preview, setPreview] = useState<FormDefinition | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<FormDefinition | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  /** Every list/mutation goes through PostgreSQL; the server stays the source of truth. */
  const reload = useCallback(async () => {
    try {
      const next = await listAdminForms();
      setForms(next);
      setError("");
    } catch (loadError) {
      console.error("بارگذاری فرم‌ها از سرور ناموفق بود:", loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "بارگذاری فرم‌ها از سرور ناموفق بود.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const saveDefinition = async (definition: FormDefinition) => {
    const duplicateCode = forms.some(
      (item) => item.code.toLocaleLowerCase() === definition.code.toLocaleLowerCase() && item.id !== editing?.id && item.status !== "archived"
    );
    if (duplicateCode) {
      setError(`کد «${definition.code}» قبلاً برای فرم دیگری ثبت شده است.`);
      return false;
    }
    setSaving(true);
    try {
      const saved = await saveAdminForm(definition);
      await reload();
      setEditing(null);
      setEditorOpen(false);
      setNotice(`فرم «${saved.title}» ذخیره شد.`);
      return true;
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (form: FormDefinition) => {
    if (form.status === "draft" || form.status === "archived") return;
    const nextStatus: ProcessStatus = form.status === "active" ? "inactive" : "active";
    setOpenMenu(null);
    try {
      await setAdminFormStatus(form.id, nextStatus);
      setNotice(`فرم «${form.title}» ${nextStatus === "active" ? "فعال" : "غیرفعال"} شد.`);
      await reload();
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "تغییر وضعیت فرم ناموفق بود.",
      );
    }
  };

  const archive = async () => {
    if (!archiveTarget) return;
    try {
      await archiveAdminForm(archiveTarget.id);
      setNotice(`فرم «${archiveTarget.title}» به بایگانی منتقل شد.`);
      setArchiveTarget(null);
      await reload();
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : "انتقال فرم به بایگانی ناموفق بود.",
      );
    }
  };

  const departmentOptions = useMemo(
    () => Array.from(new Set(forms.map((form) => form.department))).sort((a, b) => a.localeCompare(b, "fa")),
    [forms]
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fa");
    return forms.filter((form) => {
      if (form.status === "archived") return false;
      if (department !== "all" && form.department !== department) return false;
      if (status !== "all" && form.status !== status) return false;
      if (!normalizedQuery) return true;
      return `${form.title} ${form.code} ${form.department}`.toLocaleLowerCase("fa").includes(normalizedQuery);
    });
  }, [department, forms, query, status]);

  const matchLayout = useMemo(() => {
    const fieldStarts = new Map<string, number>();
    let total = 0;
    if (!query) return { fieldStarts, total };
    filtered.forEach((form, formIndex) => {
      const searchableFields = [
        ["title", form.title],
        ["code", form.code],
        ["department", form.department],
      ] as const;
      searchableFields.forEach(([fieldKey, text]) => {
        const matches = countSearchMatches(text, query);
        if (!matches) return;
        fieldStarts.set(`${formIndex}:${fieldKey}`, total);
        total += matches;
      });
    });
    return { fieldStarts, total };
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
    const targetTop = container.scrollTop + elementRect.top - containerRect.top - container.clientHeight / 2 + elementRect.height / 2;
    container.scrollTo({ top: targetTop, behavior: "smooth" });
  }, [activeMatch, matchLayout, query]);

  const navigateMatches = (direction: -1 | 1) => {
    if (!matchLayout.total) return;
    setActiveMatch((current) => (current + direction + matchLayout.total) % matchLayout.total);
  };

  const counts = useMemo(
    () => ({
      active: forms.filter((f) => f.status === "active").length,
      inactive: forms.filter((f) => f.status === "inactive").length,
      draft: forms.filter((f) => f.status === "draft").length,
    }),
    [forms]
  );


  const surface = isDarkMode ? "border-white/10 bg-[#193632]" : "border-[#e1e6df] bg-[#f6f7f4]";
  const field = isDarkMode
    ? "border-white/10 bg-white/[0.06] text-white placeholder:text-white/40"
    : "border-[#e1e6df] bg-white text-[#28443d] placeholder:text-[#8c9587]";
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";

  return (
    <div dir="rtl" className={`w-full ${isDarkMode ? "text-white" : "text-[#28443d]"}`}>
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-xl font-black">
          <ShieldCheck className="h-7 w-7 text-[#15554f]" />
          مدیریت فرم‌ها
        </h1>
        <p className={`mt-1 text-xs ${muted}`}>ایجاد فرم‌های قابل استفاده‌ی مجدد و اختصاص‌دادن آن‌ها به مراحل مختلف گردش کار</p>
      </div>

      {notice && (
        <div role="status" className={`mb-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-xs ${isDarkMode ? "text-emerald-300" : "text-emerald-700"}`}>
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{notice}</span>
          <button type="button" aria-label="بستن پیام" onClick={() => setNotice("")}><X className="h-4 w-4" /></button>
        </div>
      )}
      {error && <p role="alert" className="mb-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-600">{error}</p>}

      <section className={`sticky top-0 z-30 mb-4 rounded-2xl border p-3 shadow-sm ${surface}`}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { setEditing(null); setEditorOpen(true); setNotice(""); }}
            disabled={saving || loading}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#15554f] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#246b61] disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" />ثبت فرم جدید
          </button>
          <button
            type="button"
            onClick={() => setGatewaysModalOpen(true)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
              isDarkMode ? "border-white/15 bg-white/[0.05] text-white/85 hover:bg-white/10" : "border-[#e1e6df] bg-[#fafbf9] text-[#40584e] hover:bg-[#f6f7f4]"
            }`}
          >
            <Landmark className="h-3.5 w-3.5 text-[#15554f]" />درگاه‌های پرداخت
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
              placeholder="جستجوی عنوان، کد یا واحد... (Enter بعدی، Shift+Enter قبلی)"
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
                {departmentOptions.map((item) => <option key={item} value={item} style={{ background: "#fff", color: "#111827" }}>{item}</option>)}
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

          <span className={`mr-auto rounded-full px-3 py-2 text-[0.68rem] ${isDarkMode ? "bg-white/[0.05]" : "bg-white/70"} ${muted}`}>{formatPersianNumber(filtered.length)} فرم</span>
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
          {filtered.map((form, formIndex) => (
            <article key={form.id} className={`relative rounded-2xl border p-4 shadow-sm transition hover:shadow-md ${isDarkMode ? "border-white/10 bg-[#193632]" : "border-[#e1e6df] bg-white"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${isDarkMode ? "bg-[#15554f]/25 text-[#8bd0bf]" : "bg-[#e2eee8] text-[#15554f]"}`}>
                    <IconForForm formType={form.formType} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold" title={form.title}>
                      <SearchMatchText text={form.title} query={query} startIndex={matchLayout.fieldStarts.get(`${formIndex}:title`) ?? 0} activeIndex={activeMatch} registerRef={(index, element) => { matchRefs.current[index] = element; }} />
                    </h2>
                    <p className={`mt-1 flex items-center gap-1 text-[0.68rem] ${muted}`}>
                      <SearchMatchText text={form.department} query={query} startIndex={matchLayout.fieldStarts.get(`${formIndex}:department`) ?? 0} activeIndex={activeMatch} registerRef={(index, element) => { matchRefs.current[index] = element; }} />
                      {" · "}{TYPE_LABEL[form.formType]}
                    </p>
                  </div>
                </div>
                <div className="relative">
                  <button type="button" aria-label={`عملیات ${form.title}`} aria-expanded={openMenu === form.id} onClick={() => setOpenMenu(openMenu === form.id ? null : form.id)} className={`rounded-lg border p-1.5 ${isDarkMode ? "border-white/10 hover:bg-white/[0.06]" : "border-[#e1e6df] hover:bg-[#f6f7f4]"}`}>
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {openMenu === form.id && (
                    <div className={`absolute left-0 top-full z-20 mt-1 w-48 rounded-xl border p-1.5 shadow-xl ${isDarkMode ? "border-white/10 bg-[#122925]" : "border-[#e1e6df] bg-white"}`}>
                      <button type="button" onClick={() => { setEditing(form); setEditorOpen(true); setOpenMenu(null); setNotice(""); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-right text-xs hover:bg-[#15554f]/10"><Pencil className="h-3.5 w-3.5" />ویرایش / ایجاد نسخه</button>
                      <button type="button" onClick={() => { setPreview(form); setOpenMenu(null); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-right text-xs hover:bg-[#15554f]/10"><ClipboardList className="h-3.5 w-3.5" />پیش‌نمایش جزئیات</button>
                      <button type="button" disabled={form.status === "draft"} onClick={() => void toggleStatus(form)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-right text-xs hover:bg-[#15554f]/10 disabled:cursor-not-allowed disabled:opacity-40">
                        {form.status === "active" ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                        {form.status === "active" ? "غیرفعال‌کردن سریع" : form.status === "draft" ? "ابتدا فرم را منتشر کنید" : "فعال‌کردن"}
                      </button>
                      <button type="button" onClick={() => { setArchiveTarget(form); setOpenMenu(null); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-right text-xs text-rose-600 hover:bg-rose-500/10"><Archive className="h-3.5 w-3.5" />انتقال به بایگانی</button>
                    </div>
                  )}
                </div>
              </div>

              <p className={`mt-3 line-clamp-2 min-h-10 text-xs leading-5 ${muted}`}>{form.description || "بدون توضیحات"}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[0.65rem] ${statusStyle(form.status, isDarkMode)}`}>{STATUS_LABEL[form.status]}</span>
                <span className={`rounded-full px-2.5 py-1 text-[0.65rem] ${isDarkMode ? "bg-white/[0.06] text-white/65" : "bg-[#f6f7f4] text-[#68766c]"}`}>نسخه {form.version}</span>
                <span className={`rounded-full px-2.5 py-1 text-[0.65rem] ${isDarkMode ? "bg-white/[0.06] text-white/65" : "bg-[#f6f7f4] text-[#68766c]"}`}>
                  <span dir="ltr"><SearchMatchText text={form.code} query={query} startIndex={matchLayout.fieldStarts.get(`${formIndex}:code`) ?? 0} activeIndex={activeMatch} registerRef={(index, element) => { matchRefs.current[index] = element; }} /></span>
                </span>
              </div>

              <div className={`mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-[0.68rem] ${isDarkMode ? "border-white/10 text-white/55" : "border-[#e6e9e3] text-[#68766c]"}`}>
                <span className="inline-flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5" />قوانین: {formatPersianNumber(form.rules.length)}</span>
                <span className="inline-flex items-center gap-1.5">فیلدها: {formatPersianNumber(countLeafFields(form.fields))}</span>
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatFormDate(form.updatedAt)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={`rounded-2xl border border-dashed p-10 text-center ${muted} ${isDarkMode ? "border-white/15" : "border-[#cfd6ce]"}`}>
          {loading ? (
            <>
              <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin opacity-40" />
              <p className="text-sm font-semibold">در حال بارگذاری فرم‌ها از پایگاه داده…</p>
            </>
          ) : (
            <>
              <Search className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm font-semibold">فرمی با این فیلترها پیدا نشد</p>
              <button type="button" onClick={() => { setQuery(""); setDepartment("all"); setStatus("all"); }} className="mt-3 text-xs font-semibold text-[#15554f] hover:underline">پاک کردن فیلترها</button>
            </>
          )}
        </div>
      )}

      <FormEditorModal
        open={editorOpen}
        initial={editing}
        gateways={paymentGateways}
        onClose={() => { setEditorOpen(false); setEditing(null); }}
        onSave={saveDefinition}
      />
      {preview && <FormPreview form={preview} gateways={paymentGateways} onClose={() => setPreview(null)} />}
      <PaymentGatewayManagerModal
        open={gatewaysModalOpen}
        gateways={paymentGateways}
        loading={gatewaysLoading}
        error={gatewayError}
        onReload={reloadGateways}
        onClose={() => setGatewaysModalOpen(false)}
      />
      <ConfirmModal
        open={Boolean(archiveTarget)}
        title="انتقال فرم به بایگانی"
        message={archiveTarget ? `«${archiveTarget.title}» از فهرست فعال خارج و به بایگانی منتقل می‌شود. پروسه‌هایی که نسخه‌ی فعلی این فرم را قفل کرده‌اند، تحت‌تأثیر قرار نمی‌گیرند. ادامه می‌دهید؟` : ""}
        confirmLabel="انتقال به بایگانی"
        danger
        onConfirm={() => void archive()}
        onClose={() => setArchiveTarget(null)}
      />
    </div>
  );
}