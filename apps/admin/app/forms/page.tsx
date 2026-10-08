"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, CheckCircle2, FileText, Pencil, Plus, Search, Trash2 } from "lucide-react";
import ConfirmModal from "../../components/ConfirmModal";
import FormEditorModal from "../../components/forms/FormEditorModal";
import { useTheme } from "../../theme-context";
import { initialForms, saveForms, ensureFormVersions, type FormDefinition } from "../lib/mock-forms";
import { initialProcesses, PROCESS_DEPARTMENTS, PROCESS_STORAGE_KEY, type ProcessDefinition, type ProcessStatus } from "../lib/mock-processes";
import type { ProcessField } from "../lib/mock-processes";
import { PAYMENT_GATEWAYS_STORAGE_KEY, type PaymentGateway } from "../lib/payment-gateways";

const statusLabel: Record<ProcessStatus, string> = {
  active: "منتشرشده",
  inactive: "غیرفعال",
  draft: "پیش‌نویس",
  archived: "بایگانی‌شده",
};

function allFields(fields: ProcessField[]): ProcessField[] {
  return fields.flatMap((field) => [field, ...allFields(field.subFields ?? [])]);
}

export default function FormsPage() {
  const { isDarkMode } = useTheme();
  const [forms, setForms] = useState<FormDefinition[]>(initialForms);
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState<"all" | ProcessStatus>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<FormDefinition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FormDefinition | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("office-admin-form-definitions-v1");
      if (stored) setForms(ensureFormVersions(JSON.parse(stored) as FormDefinition[]));
    } catch (storageError) {
      console.error("بارگذاری فرم‌های ذخیره‌شده ناموفق بود:", storageError);
      setError("فرم‌های ذخیره‌شده بارگذاری نشدند؛ داده‌های نمونه نمایش داده می‌شوند.");
    }
    try {
      const stored = window.localStorage.getItem(PAYMENT_GATEWAYS_STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (!Array.isArray(parsed) || !parsed.every((item) => item && typeof item.id === "string" && typeof item.bankName === "string")) {
          throw new Error("ساختار فهرست درگاه‌های ذخیره‌شده معتبر نیست.");
        }
        setGateways(parsed as PaymentGateway[]);
      }
    } catch (storageError) {
      console.error("بارگذاری درگاه‌های پرداخت ناموفق بود:", storageError);
      setError("درگاه‌های پرداخت بارگذاری نشدند.");
    }
  }, []);

  const persist = (next: FormDefinition[], message: string) => {
    try {
      saveForms(next);
      setForms(next);
      setError("");
      setNotice(message);
      return true;
    } catch (storageError) {
      console.error("ذخیره فرم‌ها ناموفق بود:", storageError);
      setError("تغییرات فرم ذخیره نشدند.");
      return false;
    }
  };

  const saveForm = (form: FormDefinition) => {
    const current = forms.find((item) => item.id === form.id);
    if (current) {
      let processes = initialProcesses;
      try {
        const stored = window.localStorage.getItem(PROCESS_STORAGE_KEY);
        if (stored) processes = JSON.parse(stored) as ProcessDefinition[];
      } catch (storageError) {
        console.error("بررسی فرمول‌های وابسته به فرم ناموفق بود:", storageError);
        setError("امکان بررسی وابستگی‌های این فرم به فرمول‌های پروسه وجود نداشت؛ ذخیره لغو شد.");
        return false;
      }
      const nextFieldIds = new Set(allFields(form.fields).map((field) => field.id));
      const removedIds = allFields(current.fields).filter((field) => !nextFieldIds.has(field.id)).map((field) => field.id);
      const brokenCalculations = processes.flatMap((process) => (process.computedFields ?? [])
        .filter((computed) => computed.formula.tokens.some((token) =>
          token.kind === "variable" && removedIds.some((fieldId) =>
            token.variableId === fieldId || token.variableId === `${current.id}:${fieldId}`,
          ),
        ))
        .map((computed) => `${process.title} → ${computed.name || "بدون نام"}`));
      if (brokenCalculations.length > 0) {
        setError(`این فیلد در ${new Intl.NumberFormat("fa-IR").format(brokenCalculations.length)} فرمول محاسباتی استفاده شده است (${brokenCalculations.join("، ")}). ابتدا وابستگی فرمول‌ها را اصلاح کنید؛ تغییر ذخیره نشد.`);
        return false;
      }
    }
    let nextForm = form;
    if (current?.status === "active") {
      const [majorRaw, minorRaw] = current.version.split(".");
      const major = Number(majorRaw) || 1;
      const minor = Number(minorRaw) || 0;
      const previousSnapshot = current.versions.find((item) => item.version === current.version) ?? {
        version: current.version,
        publishedAt: current.updatedAt,
        formType: current.formType,
        fields: structuredClone(current.fields),
        rules: structuredClone(current.rules),
        ...(current.payment ? { payment: structuredClone(current.payment) } : {}),
      };
      const nextVersion = `${major}.${minor + 1}`;
      const publishedSnapshot = {
        version: nextVersion,
        publishedAt: new Date().toISOString(),
        formType: form.formType,
        fields: structuredClone(form.fields),
        rules: structuredClone(form.rules),
        ...(form.payment ? { payment: structuredClone(form.payment) } : {}),
      };
      nextForm = {
        ...form,
        status: "active",
        version: nextVersion,
        versions: [...current.versions.filter((item) => item.version !== previousSnapshot.version), previousSnapshot, publishedSnapshot],
      };
    }
    const next = current
      ? forms.map((item) => item.id === form.id ? nextForm : item)
      : [...forms, nextForm];
    return persist(next, current?.status === "active" ? "نسخه‌ی جدید فرم منتشر شد؛ نسخه‌های قفل‌شده‌ی پروسه‌های قبلی حفظ شده‌اند." : "فرم ذخیره شد.");
  };

  const publish = (form: FormDefinition) => {
    const publishedVersion = form.status === "draft" && form.version === "0.1" ? "1.0" : form.version;
    const snapshot = {
      version: publishedVersion,
      publishedAt: new Date().toISOString(),
      formType: form.formType,
      fields: structuredClone(form.fields),
      rules: structuredClone(form.rules),
      ...(form.payment ? { payment: structuredClone(form.payment) } : {}),
    };
    const updated: FormDefinition = {
      ...form,
      status: "active",
      version: publishedVersion,
      versions: [...form.versions.filter((item) => item.version !== publishedVersion), snapshot],
      updatedAt: new Date().toISOString(),
    };
    persist(forms.map((item) => item.id === form.id ? updated : item), "نسخه‌ی فرم منتشر و قفل شد.");
  };

  const removeOrArchive = (form: FormDefinition) => {
    let processes: ProcessDefinition[] = initialProcesses;
    try {
      const raw = window.localStorage.getItem(PROCESS_STORAGE_KEY);
      if (raw) processes = JSON.parse(raw) as ProcessDefinition[];
    } catch (storageError) {
      console.error("بررسی استفاده‌ی فرم در پروسه‌ها ناموفق بود:", storageError);
      setError("امکان بررسی اتصال فرم به پروسه‌ها وجود نداشت؛ حذف انجام نشد.");
      setDeleteTarget(null);
      return;
    }
    const isPinned = processes.some((process) => process.stages.some((stage) => stage.formIds?.includes(form.id)));
    const next = isPinned
      ? forms.map((item) => item.id === form.id ? { ...item, status: "archived" as const, updatedAt: new Date().toISOString() } : item)
      : forms.filter((item) => item.id !== form.id);
    persist(next, isPinned ? "فرم متصل به پروسه بایگانی شد تا نسخه‌ی قفل‌شده حفظ شود." : "فرم حذف شد.");
    setDeleteTarget(null);
  };

  const departments = useMemo(() => [...new Set([...PROCESS_DEPARTMENTS, ...forms.map((form) => form.department).filter(Boolean)])], [forms]);
  const filteredForms = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return forms.filter((form) => {
      const matchesQuery = !normalized || [form.title, form.code, form.department].some((item) => item.toLocaleLowerCase().includes(normalized));
      return matchesQuery && (department === "all" || form.department === department) && (status === "all" || form.status === status);
    });
  }, [department, forms, query, status]);
  const textClass = isDarkMode ? "text-white" : "text-slate-800";
  const mutedClass = isDarkMode ? "text-white/55" : "text-slate-500";
  const controlClass = `rounded-xl border px-3 py-2 text-sm outline-none ${isDarkMode ? "border-white/10 bg-white/[0.04] text-white" : "border-slate-200 bg-white text-slate-700"}`;

  return (
    <main className={`mx-auto max-w-7xl space-y-5 p-4 md:p-6 ${textClass}`} dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold">مدیریت فرم‌ها</h1><p className={`mt-1 text-sm ${mutedClass}`}>ساخت، نسخه‌بندی و انتشار فرم‌های مورد استفاده در پروسه‌ها</p></div>
        <button type="button" onClick={() => { setEditing(null); setEditorOpen(true); }} className="inline-flex items-center gap-2 rounded-xl bg-[#4f7aab] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#41698f]"><Plus size={17} /> ثبت فرم جدید</button>
      </header>

      <section className={`flex flex-wrap items-center gap-2 rounded-2xl border p-3 ${isDarkMode ? "border-white/10 bg-white/[0.025]" : "border-slate-200 bg-slate-50"}`}>
        <div className="relative min-w-52 flex-1">
          <Search className={`absolute right-3 top-1/2 -translate-y-1/2 ${mutedClass}`} size={16} />
          <input className={`w-full rounded-xl border py-2.5 pr-9 pl-3 text-sm outline-none ${isDarkMode ? "border-white/10 bg-[#122925] text-white" : "border-slate-200 bg-white text-slate-800"}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جستجوی نام، کد یا واحد..." />
        </div>
        <span className={`order-last ml-auto whitespace-nowrap text-xs font-semibold ${mutedClass}`}>{new Intl.NumberFormat("fa-IR").format(forms.length)} مورد</span>
        <select className={controlClass} value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">همه واحدها</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select className={controlClass} value={status} onChange={(event) => setStatus(event.target.value as "all" | ProcessStatus)}><option value="all">همه وضعیت‌ها</option><option value="active">منتشرشده</option><option value="draft">پیش‌نویس</option><option value="inactive">غیرفعال</option><option value="archived">بایگانی‌شده</option></select>
      </section>

      {notice && <div role="status" className="rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</div>}
      {error && <div role="alert" className="rounded-xl border border-rose-300/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredForms.map((form) => {
          const fieldCount = allFields(form.fields).filter((field) => field.type !== "section").length;
          return (
            <article key={form.id} className={`rounded-2xl border p-4 shadow-sm ${isDarkMode ? "border-white/10 bg-[#122925]" : "border-slate-200 bg-white"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`rounded-xl p-2.5 ${isDarkMode ? "bg-[#4f7aab]/20 text-blue-200" : "bg-blue-50 text-[#41698f]"}`}><FileText size={20} /></span>
                  <div className="min-w-0"><h2 className="font-bold">{form.title}</h2><p className={`mt-1 text-xs ${mutedClass}`}>{form.code}</p></div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.68rem] ${form.status === "active" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : form.status === "draft" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-slate-500/10 text-slate-600 dark:text-slate-300"}`}>{statusLabel[form.status]}</span>
              </div>
              <p className={`mt-3 line-clamp-2 min-h-10 text-xs leading-5 ${mutedClass}`}>{form.description || "توضیحاتی ثبت نشده است."}</p>
              <div className={`mt-3 grid grid-cols-2 gap-2 text-xs ${mutedClass}`}>
                <span>واحد: <b className={textClass}>{form.department}</b></span>
                <span>نسخه: <b className={textClass}>{form.version}</b></span>
                <span>بخش/فیلد: <b className={textClass}>{new Intl.NumberFormat("fa-IR").format(fieldCount)}</b></span>
                <span>قوانین: <b className={textClass}>{new Intl.NumberFormat("fa-IR").format(form.rules.length)}</b></span>
                <span>نوع: <b className={textClass}>{form.formType === "payment" ? "پرداخت" : form.formType === "document" ? "بارگذاری مدرک" : "عادی"}</b></span>
                <span>نسخه‌های قفل‌شده: <b className={textClass}>{new Intl.NumberFormat("fa-IR").format(form.versions.length)}</b></span>
              </div>
              {form.versions.length > 0 && <details className="mt-3 rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-900/50"><summary className="cursor-pointer font-semibold">تاریخچه نسخه‌ها</summary><div className="mt-2 space-y-1">{form.versions.map((version) => <p key={version.version}>نسخه {version.version} · {new Intl.DateTimeFormat("fa-IR").format(new Date(version.publishedAt))}</p>)}</div></details>}
              <footer className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-white/10">
                <button type="button" onClick={() => { setEditing(form); setEditorOpen(true); }} disabled={form.status === "archived"} className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40 ${isDarkMode ? "bg-white/5 text-white/80 hover:bg-white/10" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}><Pencil size={14} /> ویرایش</button>
                {form.status !== "active" && form.status !== "archived" && <button type="button" onClick={() => publish(form)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"><CheckCircle2 size={14} /> انتشار نسخه</button>}
                <button type="button" onClick={() => setDeleteTarget(form)} className="mr-auto inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30">{form.status === "active" ? <Archive size={14} /> : <Trash2 size={14} />}{form.status === "active" ? "بایگانی / حذف" : "حذف"}</button>
              </footer>
            </article>
          );
        })}
      </div>
      {filteredForms.length === 0 && <div className={`rounded-2xl border border-dashed p-12 text-center text-sm ${mutedClass}`}>فرمی با این جستجو و فیلتر پیدا نشد.</div>}

      <FormEditorModal open={editorOpen} initial={editing} gateways={gateways} onClose={() => { setEditorOpen(false); setEditing(null); }} onSave={saveForm} />
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={deleteTarget?.status === "active" ? "بایگانی یا حذف فرم" : "حذف فرم"}
        message="اگر این فرم به پروسه‌ای متصل باشد، به‌جای حذف بایگانی می‌شود تا نسخه‌های مورد استفاده‌ی پروسه‌ها محفوظ بمانند. در غیر این صورت فرم حذف خواهد شد."
        confirmLabel={deleteTarget?.status === "active" ? "ادامه" : "حذف فرم"}
        danger
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) removeOrArchive(deleteTarget); }}
      />
    </main>
  );
}
