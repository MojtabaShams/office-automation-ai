"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Banknote,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleHelp,
  FileText,
  Files,
  GripVertical,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { useTheme } from "../../theme-context";
import { PROCESS_DEPARTMENTS, type ProcessDefinition, type ProcessField, type ProcessStage } from "../../app/lib/mock-processes";
import type { PaymentGateway } from "../../app/lib/payment-gateways";
import { initialEmployees } from "../../app/lib/mock-employees";
import Modal from "../Modal";
import ProcessFieldBuilder from "./ProcessFieldBuilder";
import PaymentFormulaBuilder from "./PaymentFormulaBuilder";

const STEPS = [
  "اطلاعات پایه",
  "مراحل گردش کار",
  "فرم متقاضی",
  "قوانین و راهنما",
  "تنظیمات پرداخت",
  "پیش‌نمایش و انتشار",
];
const ICON_OPTIONS = [
  { value: "building", label: "ساختمان", icon: Building2 },
  { value: "file", label: "فرم", icon: FileText },
  { value: "wallet", label: "مالی", icon: Wallet },
  { value: "calendar", label: "تقویم", icon: CalendarDays },
];

function createEmptyProcess(): ProcessDefinition {
  return {
    id: `proc-${Date.now()}`,
    code: "",
    title: "",
    department: PROCESS_DEPARTMENTS[0]!,
    description: "",
    icon: "file",
    status: "draft",
    version: "0.1",
    activeCases: 0,
    updatedAt: new Date().toISOString(),
    stages: [
      { id: `stage-${Date.now()}-1`, title: "ثبت درخواست", assigneeType: "applicant", assigneeRole: "متقاضی", slaDays: 1 },
      { id: `stage-${Date.now()}-2`, title: "بررسی کارشناس", assigneeType: "employee", assigneeRole: "کارشناس اداری", slaDays: 3 },
    ],
    fields: [{ id: `field-${Date.now()}`, label: "نام و نام خانوادگی", type: "text", required: true, slug: "full_name" }],
    rules: [],
    applicantGuidance: "",
    payment: { mode: "none", provider: "", amount: 0, formula: "" },
    directiveFileNames: [],
  };
}

function move<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

export default function ProcessBuilderWizard({
  open,
  initial,
  paymentGateways,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: ProcessDefinition | null;
  paymentGateways: PaymentGateway[];
  onClose: () => void;
  onSave: (process: ProcessDefinition, publish: boolean) => boolean;
}) {
  const { isDarkMode } = useTheme();
  const [draft, setDraft] = useState<ProcessDefinition>(() => initial ? structuredClone(initial) : createEmptyProcess());
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [assistantMessage, setAssistantMessage] = useState("");
  const [draggedStageId, setDraggedStageId] = useState<string | null>(null);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});
  const [previewRepeaterRows, setPreviewRepeaterRows] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open) return;
    setDraft(initial ? structuredClone(initial) : createEmptyProcess());
    setStep(0);
    setErrors([]);
    setAssistantMessage("");
    setPreviewValues({});
    setPreviewRepeaterRows({});
  }, [initial, open]);

  const t = isDarkMode
    ? {
        panel: "border-white/10 bg-[#122925]",
        card: "border-white/10 bg-white/[0.035]",
        field: "border-white/10 bg-white/[0.06] text-white placeholder:text-white/35",
        muted: "text-white/55",
        quiet: "border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.08]",
        divider: "border-white/10",
      }
    : {
        panel: "border-[#d5dad4] bg-[#f6f7f4]",
        card: "border-[#e1e6df] bg-white",
        field: "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]",
        muted: "text-[#68766c]",
        quiet: "border-[#d5dad4] bg-white text-[#40584e] hover:bg-[#edf0eb]",
        divider: "border-[#e1e6df]",
      };

  const update = <K extends keyof ProcessDefinition>(key: K, value: ProcessDefinition[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const validateStep = () => {
    const issues: string[] = [];
    if (step === 0) {
      if (!draft.title.trim()) issues.push("عنوان پروسه را وارد کنید.");
      if (!/^[A-Za-z0-9-]{2,20}$/.test(draft.code.trim())) issues.push("کد شناسه باید ۲ تا ۲۰ نویسه انگلیسی، عدد یا خط تیره باشد.");
    }
    if (step === 1) {
      if (!draft.stages.length) issues.push("حداقل یک مرحله تعریف کنید.");
      if (draft.stages.some((item) => !item.title.trim())) issues.push("عنوان همه مراحل را تکمیل کنید.");
    }
    if (step === 2 && draft.fields.some((field) => !field.label.trim())) issues.push("عنوان همه فیلدهای فرم را تکمیل کنید.");
    setErrors(issues);
    return issues.length === 0;
  };

  const next = () => {
    if (validateStep()) setStep((current) => Math.min(STEPS.length - 1, current + 1));
  };

  const save = (publish: boolean) => {
    const issues: string[] = [];
    if (!draft.title.trim()) issues.push("عنوان پروسه را وارد کنید.");
    if (!/^[A-Za-z0-9-]{2,20}$/.test(draft.code.trim())) issues.push("کد شناسه پروسه معتبر نیست.");
    if (!draft.stages.length || draft.stages.some((item) => !item.title.trim())) issues.push("حداقل یک مرحله با عنوان معتبر تعریف کنید.");
    if (issues.length) {
      setErrors(issues);
      setStep(issues.some((item) => item.includes("عنوان پروسه") || item.includes("کد شناسه")) ? 0 : 1);
      return;
    }
    const saved = onSave({
      ...draft,
      status: publish ? "active" : "draft",
      version: publish && initial
        ? `${Number(initial.version.split(".")[0]) + 1}.0`
        : draft.version,
      updatedAt: new Date().toISOString(),
    }, publish);
    if (saved) onClose();
  };

  const handleFile = (file: File | undefined, kind: "form" | "directive") => {
    if (!file) return;
    if (kind === "form") {
      update("sourceFileName", file.name);
      setAssistantMessage("");
    } else {
      update("directiveFileNames", [...draft.directiveFileNames, file.name]);
    }
  };

  const extractFields = () => {
    if (!draft.sourceFileName) {
      setAssistantMessage("ابتدا فایل Word یا PDF فرم را بارگذاری کنید.");
      return;
    }
    const extracted: ProcessField[] = [
      { id: `extracted-${Date.now()}-1`, label: "نام و نام خانوادگی", type: "text", required: true },
      { id: `extracted-${Date.now()}-2`, label: "کد ملی", type: "text", required: true },
      { id: `extracted-${Date.now()}-3`, label: "تاریخ درخواست", type: "date", required: true },
      { id: `extracted-${Date.now()}-4`, label: "مدرک پشتیبان", type: "file", required: false },
    ];
    update("fields", extracted);
    setAssistantMessage("نمونه اولیه فرم از فایل استخراج شد؛ آن را بازبینی و ویرایش کنید.");
  };

  const inputClass = `w-full rounded-xl border px-3 py-2.5 text-xs outline-none transition focus:border-[#15554f] ${t.field}`;
  const labelClass = "mb-1.5 block text-xs font-semibold";
  const sectionClass = `rounded-2xl border p-4 sm:p-5 ${t.card}`;
  const bankGatewaySelect = (
    <label className={labelClass}>درگاه بانکی
      <span className="relative mt-1.5 block">
        <select value={draft.payment.provider} onChange={(event) => update("payment", { ...draft.payment, provider: event.target.value })} className={`${inputClass} appearance-none pl-8`}>
          <option value="" style={{ background: "#fff", color: "#111827" }}>انتخاب درگاه بانکی</option>
          {draft.payment.provider && !paymentGateways.some((gateway) => gateway.id === draft.payment.provider) && (
            <option value={draft.payment.provider} style={{ background: "#fff", color: "#111827" }}>درگاه قبلی: {draft.payment.provider}</option>
          )}
          {paymentGateways.map((gateway) => <option key={gateway.id} value={gateway.id} style={{ background: "#fff", color: "#111827" }}>{gateway.bankName}</option>)}
          {!paymentGateways.length && !draft.payment.provider && <option value="" disabled style={{ background: "#fff", color: "#111827" }}>ابتدا درگاه پرداخت جدید ایجاد کنید</option>}
        </select>
        <ChevronDown aria-hidden="true" className={`pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${t.muted}`} />
      </span>
    </label>
  );

  const conditionIsVisible = (field: ProcessField) => {
    const condition = field.condition;
    if (!condition) return true;
    const source = draft.fields.find((candidate) => candidate.slug === condition.fieldKey || candidate.id === condition.fieldKey);
    if (!source) return false;
    const actual = previewValues[source.id] ?? "";
    const expected = condition.value;
    switch (condition.operator) {
      case "equals": return actual === expected;
      case "notEquals": return actual !== expected;
      case "contains": return actual.includes(expected);
      case "greaterThan": return Number(actual) > Number(expected);
      case "lessThan": return Number(actual) < Number(expected);
    }
  };

  const renderPreviewField = (field: ProcessField, valueKey = field.id) => {
    if (!conditionIsVisible(field)) return null;
    if (field.type === "section") {
      return (
        <fieldset key={valueKey} className={`rounded-xl border p-3 ${t.panel}`}>
          <legend className="px-1 text-xs font-bold">{field.label || "بخش جدید"}</legend>
          <div className="space-y-3">{(field.subFields ?? []).map((child) => renderPreviewField(child))}</div>
        </fieldset>
      );
    }
    if (field.type === "repeater") {
      const rowCount = previewRepeaterRows[field.id] ?? 1;
      return (
        <section key={valueKey} className={`rounded-xl border p-3 ${t.panel}`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold">{field.label || "فهرست تکرارشونده"}</h4>
            <button type="button" onClick={() => setPreviewRepeaterRows((rows) => ({ ...rows, [field.id]: (rows[field.id] ?? 1) + 1 }))} className="rounded-lg border border-[#15554f]/25 px-2 py-1 text-[0.65rem] text-[#15554f]">+ افزودن ردیف</button>
          </div>
          <div className="space-y-2">
            {Array.from({ length: rowCount }, (_, rowIndex) => (
              <div key={`${field.id}-${rowIndex}`} className={`rounded-lg border p-2 ${t.card}`}>
                <div className="mb-2 flex items-center justify-between text-[0.65rem]">
                  <span>ردیف {rowIndex + 1}</span>
                  {rowCount > 1 && <button type="button" onClick={() => setPreviewRepeaterRows((rows) => ({ ...rows, [field.id]: Math.max(1, (rows[field.id] ?? 1) - 1) }))} className="text-rose-600">حذف ردیف</button>}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">{(field.subFields ?? []).map((child) => renderPreviewField(child, `${field.id}-${rowIndex}-${child.id}`))}</div>
              </div>
            ))}
          </div>
        </section>
      );
    }

    const currentValue = previewValues[valueKey] ?? "";
    const input = field.type === "select" ? (
      <span className="relative mt-1.5 block">
        <select value={currentValue} onChange={(event) => setPreviewValues((values) => ({ ...values, [valueKey]: event.target.value }))} className={`${inputClass} appearance-none pl-8`}>
          <option value="" style={{ background: "#fff", color: "#111827" }}>انتخاب کنید</option>
          {(field.options?.length ? field.options : ["گزینه اول", "گزینه دوم"]).map((option) => <option key={option} value={option} style={{ background: "#fff", color: "#111827" }}>{option}</option>)}
        </select>
        <ChevronDown aria-hidden="true" className={`pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${t.muted}`} />
      </span>
    ) : (
      <span className="relative mt-1.5 block">
        <input type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "file" ? "file" : "text"} value={field.type === "file" ? undefined : currentValue} onChange={(event) => setPreviewValues((values) => ({ ...values, [valueKey]: event.target.value }))} className={inputClass} />
        {field.unit && field.type !== "file" && <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[0.62rem] ${t.muted}`}>{field.unit}</span>}
      </span>
    );
    return (
      <label key={valueKey} className="block text-xs font-semibold">
        {field.label || "فیلد بدون عنوان"} {field.required && <span className="text-rose-500">*</span>}
        {input}
      </label>
    );
  };

  const renderStep = () => {
    if (step === 0) {
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <section className={sectionClass}>
            <h3 className="mb-4 text-sm font-bold">مشخصات عمومی</h3>
            <label className={labelClass}>عنوان پروسه *
              <input value={draft.title} onChange={(event) => update("title", event.target.value)} className={`${inputClass} mt-1.5`} placeholder="مثلاً ثبت پروانه ساختمانی" />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>کد شناسه *
                <input value={draft.code} onChange={(event) => update("code", event.target.value.toUpperCase())} className={`${inputClass} mt-1.5`} placeholder="URB-001" dir="ltr" />
              </label>
              <label className={labelClass}>واحد متولی
                <span className="relative mt-1.5 block">
                <select value={draft.department} onChange={(event) => update("department", event.target.value)} className={`${inputClass} appearance-none pl-8`}>
                  {PROCESS_DEPARTMENTS.map((department) => <option key={department} value={department} style={{ background: "#fff", color: "#111827" }}>{department}</option>)}
                </select>
                <ChevronDown aria-hidden="true" className={`pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${t.muted}`} />
                </span>
              </label>
            </div>
            <label className={`${labelClass} mt-3`}>توضیحات برای متقاضی
              <textarea value={draft.description} onChange={(event) => update("description", event.target.value)} rows={4} className={`${inputClass} mt-1.5 resize-y`} placeholder="توضیح کوتاه درباره هدف و شرایط پروسه..." />
            </label>
          </section>
          <section className={sectionClass}>
            <h3 className="mb-4 text-sm font-bold">نماد پروسه</h3>
            <div className="grid grid-cols-2 gap-2">
              {ICON_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button key={value} type="button" onClick={() => update("icon", value)} className={`flex items-center gap-2 rounded-xl border p-3 text-xs ${draft.icon === value ? "border-[#15554f] bg-[#15554f]/10 text-[#15554f]" : t.quiet}`}>
                  <Icon className="h-5 w-5" />{label}
                </button>
              ))}
            </div>
            <div className={`mt-5 rounded-xl border p-3 ${t.panel}`}>
              <p className={`mb-2 flex items-center gap-2 text-[0.68rem] ${t.muted}`}><CircleHelp className="h-4 w-4" />راهنما</p>
              <p className={`text-xs leading-6 ${t.muted}`}>کد شناسه باید یکتا باشد. هنگام ویرایش، انتشار تغییرات نسخه‌ی جدیدی از پروسه ایجاد می‌کند.</p>
            </div>
          </section>
        </div>
      );
    }

    if (step === 1) {
      return (
        <section className={sectionClass}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold">زنجیره مراحل</h3>
              <p className={`mt-1 text-[0.68rem] ${t.muted}`}>برای مرتب‌سازی، مرحله را بکشید؛ یا از دکمه‌های بالا و پایین استفاده کنید.</p>
            </div>
            <button type="button" onClick={() => update("stages", [...draft.stages, { id: `stage-${Date.now()}`, title: "", assigneeType: "employee", assigneeRole: "کارشناس اداری", slaDays: 3 }])} className="inline-flex items-center gap-1.5 rounded-xl bg-[#15554f] px-3 py-2 text-xs font-semibold text-white hover:bg-[#246b61]"><Plus className="h-4 w-4" />افزودن مرحله</button>
          </div>
          <div className="space-y-2">
            {draft.stages.map((item, index) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => setDraggedStageId(item.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  const from = draft.stages.findIndex((stage) => stage.id === draggedStageId);
                  if (from >= 0) update("stages", move(draft.stages, from, index));
                  setDraggedStageId(null);
                }}
                onDragEnd={() => setDraggedStageId(null)}
                className={`grid items-center gap-2 rounded-xl border p-3 md:grid-cols-[auto_1fr_150px_120px_auto] ${t.panel}`}
              >
                <GripVertical className={`hidden h-4 w-4 cursor-grab md:block ${t.muted}`} />
                <label className="text-[0.68rem] font-semibold">مرحله {index + 1}
                  <input value={item.title} onChange={(event) => update("stages", draft.stages.map((stage, i) => i === index ? { ...stage, title: event.target.value } : stage))} className={`${inputClass} mt-1.5`} placeholder="عنوان مرحله" />
                </label>
                <label className="text-[0.68rem] font-semibold">مسئول
                  <span className="relative mt-1.5 block">
                  <select value={item.assigneeType === "applicant" ? "applicant" : item.assigneeRole} onChange={(event) => update("stages", draft.stages.map((stage, i) => i === index ? event.target.value === "applicant" ? { ...stage, assigneeType: "applicant", assigneeRole: "متقاضی" } : { ...stage, assigneeType: "employee", assigneeRole: event.target.value } : stage))} className={`${inputClass} appearance-none pl-8`}>
                    <option value="applicant" style={{ background: "#fff", color: "#111827" }}>متقاضی</option>
                    {[...new Set(initialEmployees.map((employee) => employee.role))].map((role) => <option key={role} value={role} style={{ background: "#fff", color: "#111827" }}>{role}</option>)}
                  </select>
                  <ChevronDown aria-hidden="true" className={`pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${t.muted}`} />
                  </span>
                </label>
                <label className="text-[0.68rem] font-semibold">مهلت (روز)
                  <input type="number" min={1} max={365} value={item.slaDays} onChange={(event) => update("stages", draft.stages.map((stage, i) => i === index ? { ...stage, slaDays: Math.max(1, Number(event.target.value) || 1) } : stage))} className={`${inputClass} mt-1.5`} />
                </label>
                <div className="flex items-center gap-1">
                  <button type="button" disabled={index === 0} aria-label="انتقال مرحله به بالا" onClick={() => update("stages", move(draft.stages, index, index - 1))} className={`rounded-lg border p-2 disabled:opacity-30 ${t.quiet}`}><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" disabled={index === draft.stages.length - 1} aria-label="انتقال مرحله به پایین" onClick={() => update("stages", move(draft.stages, index, index + 1))} className={`rounded-lg border p-2 disabled:opacity-30 ${t.quiet}`}><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" disabled={draft.stages.length <= 1} aria-label="حذف مرحله" onClick={() => update("stages", draft.stages.filter((_, i) => i !== index))} className="rounded-lg p-2 text-rose-600 hover:bg-rose-500/10 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    }

    if (step === 2) {
      return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <section className={sectionClass}>
            <h3 className="mb-2 text-sm font-bold">استخراج فرم از فایل</h3>
            <p className={`mb-4 text-xs leading-5 ${t.muted}`}>فایل Word یا PDF فرم را اضافه کنید. استخراج فعلاً شبیه‌سازی شده است و فیلدهای پیشنهادی قابل ویرایش هستند.</p>
            <label className={`flex cursor-pointer flex-col items-center rounded-2xl border border-dashed p-6 text-center ${t.quiet}`}>
              <Upload className="mb-2 h-7 w-7 text-[#15554f]" />
              <span className="text-xs font-semibold">{draft.sourceFileName ?? "انتخاب فایل Word یا PDF"}</span>
              <span className={`mt-1 text-[0.65rem] ${t.muted}`}>DOC, DOCX, PDF</span>
              <input type="file" accept=".doc,.docx,.pdf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(event) => handleFile(event.target.files?.[0], "form")} />
            </label>
            <button type="button" onClick={extractFields} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#15554f] px-3 py-2.5 text-xs font-semibold text-white hover:bg-[#246b61]"><Sparkles className="h-4 w-4" />استخراج فرم با ایجنت هوشمند</button>
            {assistantMessage && <p role="status" className={`mt-3 text-xs ${t.muted}`}>{assistantMessage}</p>}
          </section>
          <ProcessFieldBuilder fields={draft.fields} isDarkMode={isDarkMode} onChange={(fields) => update("fields", fields)} />
        </div>
      );
    }

    if (step === 3) {
      return (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={sectionClass}>
            <h3 className="mb-3 text-sm font-bold">بخشنامه‌ها و دستورالعمل‌ها</h3>
            <label className={`flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 ${t.quiet}`}>
              <Upload className="h-5 w-5 text-[#15554f]" />
              <span className="text-xs">بارگذاری فایل PDF یا Word</span>
              <input type="file" multiple accept=".doc,.docx,.pdf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(event) => {
                const names = Array.from(event.target.files ?? []).map((file) => file.name);
                if (names.length) update("directiveFileNames", [...draft.directiveFileNames, ...names]);
              }} />
            </label>
            {draft.directiveFileNames.length > 0 && (
              <ul className="mt-3 space-y-2">
                {draft.directiveFileNames.map((name, index) => <li key={`${name}-${index}`} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${t.panel}`}><span className="flex min-w-0 items-center gap-2 truncate"><Files className="h-4 w-4 shrink-0 text-[#15554f]" />{name}</span><button type="button" aria-label="حذف بخشنامه" onClick={() => update("directiveFileNames", draft.directiveFileNames.filter((_, i) => i !== index))} className="text-rose-600"><X className="h-4 w-4" /></button></li>)}
              </ul>
            )}
            <label className={`${labelClass} mt-4`}>راهنمای گام‌به‌گام متقاضی
              <textarea value={draft.applicantGuidance} onChange={(event) => update("applicantGuidance", event.target.value)} rows={5} className={`${inputClass} mt-1.5 resize-y`} placeholder="مراحل انجام درخواست و راهنمای تکمیل را بنویسید..." />
            </label>
          </section>
          <section className={sectionClass}>
            <div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-bold">شروط و اعتبارسنجی</h3><p className={`mt-1 text-[0.68rem] ${t.muted}`}>قوانینی که فرم و دستیار باید رعایت کنند</p></div><button type="button" onClick={() => update("rules", [...draft.rules, ""])} className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs ${t.quiet}`}><Plus className="h-3.5 w-3.5" />افزودن شرط</button></div>
            <div className="space-y-2">
              {draft.rules.map((rule, index) => <div key={`${index}-${rule}`} className="flex gap-2"><input value={rule} onChange={(event) => update("rules", draft.rules.map((item, i) => i === index ? event.target.value : item))} className={inputClass} placeholder="مثلاً کد ملی باید ۱۰ رقم باشد" /><button type="button" aria-label="حذف شرط" onClick={() => update("rules", draft.rules.filter((_, i) => i !== index))} className="rounded-lg p-2 text-rose-600 hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button></div>)}
              {draft.rules.length === 0 && <p className={`rounded-xl border border-dashed p-5 text-center text-xs ${t.muted} ${t.panel}`}>هنوز شرطی ثبت نشده است.</p>}
            </div>
          </section>
        </div>
      );
    }

    if (step === 4) {
      return (
        <section className={sectionClass}>
          <div className="mb-4 flex items-start gap-3"><span className="rounded-xl bg-[#15554f]/10 p-2 text-[#15554f]"><Banknote className="h-5 w-5" /></span><div><h3 className="text-sm font-bold">تنظیمات پرداخت</h3><p className={`mt-1 text-xs ${t.muted}`}>اگر این پروسه نیاز به دریافت وجه ندارد، گزینه‌ی بدون پرداخت را نگه دارید.</p></div></div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[{ value: "none", title: "بدون پرداخت" }, { value: "fixed", title: "مبلغ ثابت" }, { value: "formula", title: "فرمول محاسباتی" }].map((option) => (
              <button key={option.value} type="button" onClick={() => update("payment", { ...draft.payment, mode: option.value as ProcessDefinition["payment"]["mode"] })} className={`rounded-xl border p-4 text-right text-xs ${draft.payment.mode === option.value ? "border-[#15554f] bg-[#15554f]/10 text-[#15554f]" : t.quiet}`}>{option.title}</button>
            ))}
          </div>
          {draft.payment.mode !== "none" && (
            <div className="mt-4">
              {draft.payment.mode === "fixed" && (
                <div className="grid gap-3 sm:grid-cols-2">
                {bankGatewaySelect}
                <label className={labelClass}>مبلغ ثابت (ریال)
                  <input type="number" min={0} value={draft.payment.amount} onChange={(event) => update("payment", { ...draft.payment, amount: Math.max(0, Number(event.target.value) || 0) })} className={`${inputClass} mt-1.5`} />
                </label>
                </div>
              )}
            </div>
          )}
          {draft.payment.mode === "formula" && (
            <div className="mt-4 space-y-4">
              <div className="max-w-md">{bankGatewaySelect}</div>
              <PaymentFormulaBuilder
                fields={draft.fields}
                formula={draft.payment.formula}
                isDarkMode={isDarkMode}
                onChange={(formula) => update("payment", { ...draft.payment, formula })}
              />
            </div>
          )}
        </section>
      );
    }

    return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <section className={sectionClass}>
          <div className="mb-4 flex items-center justify-between gap-2"><div><h3 className="text-sm font-bold">پیش‌نمایش فرم متقاضی</h3><p className={`mt-1 text-[0.68rem] ${t.muted}`}>نمای تعاملیِ نمایشی پیش از انتشار</p></div><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[0.65rem] text-emerald-700">آماده انتشار</span></div>
          {draft.description && <p className={`mb-4 rounded-xl border p-3 text-xs leading-5 ${t.panel} ${t.muted}`}>{draft.description}</p>}
          <div className="space-y-3">
            {draft.fields.map((field) => renderPreviewField(field))}
          </div>
          <button type="button" className="mt-4 rounded-xl bg-[#15554f] px-4 py-2 text-xs font-semibold text-white">ارسال درخواست (پیش‌نمایش)</button>
        </section>
        <section className={sectionClass}>
          <h3 className="mb-3 text-sm font-bold">خلاصه پروسه</h3>
          <dl className={`space-y-3 text-xs ${t.muted}`}>
            <div><dt className="font-semibold">عنوان</dt><dd className="mt-1">{draft.title || "—"}</dd></div>
            <div><dt className="font-semibold">کد شناسه</dt><dd className="mt-1" dir="ltr">{draft.code || "—"}</dd></div>
            <div><dt className="font-semibold">واحد</dt><dd className="mt-1">{draft.department}</dd></div>
            <div><dt className="font-semibold">تعداد مراحل</dt><dd className="mt-1">{draft.stages.length}</dd></div>
            <div><dt className="font-semibold">فیلدهای فرم</dt><dd className="mt-1">{draft.fields.length}</dd></div>
            <div><dt className="font-semibold">پرداخت</dt><dd className="mt-1">{draft.payment.mode === "none" ? "ندارد" : draft.payment.mode === "fixed" ? `${new Intl.NumberFormat("fa-IR").format(draft.payment.amount)} ریال` : draft.payment.formula || "فرمول تنظیم نشده"}</dd></div>
          </dl>
          <h4 className="mb-2 mt-5 text-xs font-bold">مراحل</h4>
          <ol className={`space-y-2 text-[0.68rem] ${t.muted}`}>{draft.stages.map((item, index) => <li key={item.id} className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#15554f]/10 text-[0.6rem] text-[#15554f]">{index + 1}</span>{item.title || "مرحله بدون عنوان"} · {item.assigneeRole} · {item.slaDays} روز</li>)}</ol>
        </section>
      </div>
    );
  };

  const title = initial ? `ویرایش پروسه: ${initial.title}` : "ایجاد پروسه جدید";
  const stepStatus = useMemo(() => STEPS.map((label, index) => ({ label, index, done: index < step, current: index === step })), [step]);

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidthClass="max-w-6xl">
      <div className={`-mx-1 mb-4 overflow-x-auto border-b pb-3 ${t.divider}`}>
        <ol className="flex min-w-max items-center gap-1">
          {stepStatus.map(({ label, index, done, current }) => (
            <li key={label} className="flex items-center gap-1">
              <button type="button" onClick={() => { if (index <= step) { setStep(index); setErrors([]); } }} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-[0.68rem] transition ${current ? "bg-[#15554f] text-white" : done ? "text-[#15554f]" : t.muted}`}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[0.65rem] ${current ? "bg-white/20" : done ? "bg-emerald-500/10" : isDarkMode ? "bg-white/10" : "bg-[#e7eae5]"}`}>{done ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                {label}
              </button>
              {index < STEPS.length - 1 && <ChevronLeft className={`h-3.5 w-3.5 ${t.muted}`} />}
            </li>
          ))}
        </ol>
      </div>

      {errors.length > 0 && <div role="alert" className="mb-3 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-600">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
      <div className="max-h-[55vh] overflow-y-auto px-0.5 pb-2">{renderStep()}</div>

      <div className={`mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 ${t.divider}`}>
        <button type="button" onClick={onClose} className={`rounded-xl border px-4 py-2 text-xs ${t.quiet}`}>انصراف</button>
        <div className="flex flex-wrap justify-end gap-2">
          {step > 0 && <button type="button" onClick={() => { setStep((current) => Math.max(0, current - 1)); setErrors([]); }} className={`inline-flex items-center gap-1 rounded-xl border px-4 py-2 text-xs ${t.quiet}`}><ChevronRight className="h-4 w-4" />قبلی</button>}
          {step < STEPS.length - 1 ? (
            <>
              <button type="button" onClick={() => save(false)} className={`rounded-xl border px-4 py-2 text-xs font-semibold ${t.quiet}`}>ذخیره پیش‌نویس</button>
              <button type="button" onClick={next} className="inline-flex items-center gap-1 rounded-xl bg-[#15554f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#246b61]">بعدی<ChevronLeft className="h-4 w-4" /></button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => save(false)} className={`rounded-xl border px-4 py-2 text-xs font-semibold ${t.quiet}`}>ذخیره پیش‌نویس</button>
              <button type="button" onClick={() => save(true)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"><Check className="h-4 w-4" />ثبت و انتشار نهایی پروسه</button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
