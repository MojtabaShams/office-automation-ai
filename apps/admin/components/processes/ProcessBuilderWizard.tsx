"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CircleHelp,
  FileText,
  GripVertical,
  Plus,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useTheme } from "../../theme-context";
import { PROCESS_DEPARTMENTS, type ComputedProcessField, type FormDefinition, type ProcessDefinition, type ProcessField, type ProcessStage, type StageRouteRule } from "../../app/lib/mock-processes";
import ConditionFormulaEditor, { type ConditionValue, type ConditionVariable, type FormulaValue } from "../ConditionFormulaEditor";
import { UNIT_CATEGORIES, UNIT_LABELS } from "../../app/lib/units";
import { initialEmployees } from "../../app/lib/mock-employees";
import Modal from "../Modal";

const STEPS = [
  "اطلاعات پایه",
  "مراحل گردش کار",
  "متغیرهای محاسباتی و مسیر پروسه",
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
      { id: `stage-${Date.now()}-1`, title: "ثبت درخواست", assigneeType: "applicant", assigneeRole: "متقاضی", slaDays: 1, formIds: [] },
      { id: `stage-${Date.now()}-2`, title: "بررسی کارشناس", assigneeType: "employee", assigneeRole: "کارشناس اداری", slaDays: 3, formIds: [] },
    ],
    fields: [],
    rules: [],
    applicantGuidance: "",
    payment: { mode: "none", provider: "", amount: 0, formula: "" },
    computedFields: [],
    publishedVersions: [],
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

function flattenFormFields(fields: ProcessField[]): ProcessField[] {
  return fields.flatMap((field) => [field, ...flattenFormFields(field.subFields ?? [])]);
}

function formVariables(forms: FormDefinition[], formIds: string[], onlyNumeric = false): ConditionVariable[] {
  return formIds.flatMap((formId) => {
    const form = forms.find((item) => item.id === formId);
    if (!form) return [];
    return flattenFormFields(form.fields)
      .filter((field) => !onlyNumeric || field.type === "number")
      .map((field) => ({
        id: `${form.id}:${field.id}`,
        label: `${form.title} → ${field.label}`,
        type: field.type,
        unit: field.unit,
        unitCategory: field.unitCategory,
      }));
  });
}

function emptyCondition(): ConditionValue {
  return { logic: "and", clauses: [{ variableId: "", operator: "equals", value: "" }] };
}

export default function ProcessBuilderWizard({
  open,
  initial,
  availableForms,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: ProcessDefinition | null;
  availableForms: FormDefinition[];
  onClose: () => void;
  onSave: (process: ProcessDefinition, publish: boolean) => boolean;
}) {
  const { isDarkMode } = useTheme();
  const [draft, setDraft] = useState<ProcessDefinition>(() => initial ? structuredClone(initial) : createEmptyProcess());
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [draggedStageId, setDraggedStageId] = useState<string | null>(null);
  const [draggedForm, setDraggedForm] = useState<{ stageId: string; formId: string } | null>(null);
  const [openFormStageId, setOpenFormStageId] = useState<string | null>(null);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({});
  const [previewRepeaterRows, setPreviewRepeaterRows] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open) return;
    setDraft(initial ? structuredClone(initial) : createEmptyProcess());
    setStep(0);
    setErrors([]);
    setOpenFormStageId(null);
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
  const publishedForms = useMemo(() => availableForms.filter((form) => form.status === "active"), [availableForms]);

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
    if (step === 2) {
      for (const field of draft.computedFields ?? []) {
        const available = numericVariablesBefore(field.destinationStageId ?? "");
        const references = field.formula.tokens.filter((token) => token.kind === "variable");
        if (!field.name.trim()) issues.push("نام همه‌ی متغیرهای محاسباتی را تکمیل کنید.");
        if (!field.destinationStageId) issues.push(`برای «${field.name || "فیلد محاسباتی"}» مرحله‌ی مقصد تعیین کنید.`);
        if (!references.length || references.some((token) => token.kind === "variable" && !available.some((variable) => variable.id === token.variableId))) {
          issues.push(`فرمول «${field.name || "فیلد محاسباتی"}» باید به متغیرهای عددی مرحله‌های قبل ارجاع دهد.`);
        }
        if (field.destination === "form" && !field.destinationFormId) issues.push(`فرم مقصد «${field.name || "فیلد محاسباتی"}» را انتخاب کنید.`);
        if (field.destination === "form" && field.destinationFormId && publishedForms.find((form) => form.id === field.destinationFormId)?.formType !== "payment" && !field.destinationFieldId) {
          issues.push(`فیلد مقصد «${field.name || "فیلد محاسباتی"}» را انتخاب کنید.`);
        }
      }
      draft.stages.forEach((stage, index) => {
        for (const rule of stage.routeRules ?? []) {
          if (!rule.condition.clauses.some((clause) => clause.variableId && routingVariablesAt(index).some((variable) => variable.id === clause.variableId))) {
            issues.push(`برای قانون مسیر مرحله‌ی «${stage.title}» شرط معتبر انتخاب کنید.`);
          }
          if (!draft.stages.slice(index + 1).some((nextStage) => nextStage.id === rule.nextStageId)) {
            issues.push(`مرحله‌ی مقصد یکی از قانون‌های مسیر «${stage.title}» معتبر نیست.`);
          }
        }
        if (stage.defaultNextStageId && !draft.stages.slice(index + 1).some((nextStage) => nextStage.id === stage.defaultNextStageId)) {
          issues.push(`مسیر پیش‌فرض مرحله‌ی «${stage.title}» باید به یک مرحله‌ی بعدی برود.`);
        }
      });
    }
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
    if (publish) {
      for (const field of draft.computedFields ?? []) {
        const available = numericVariablesBefore(field.destinationStageId ?? "");
        const references = field.formula.tokens.filter((token) => token.kind === "variable");
        if (!field.name.trim() || !field.destinationStageId || !references.length || references.some((token) => token.kind === "variable" && !available.some((variable) => variable.id === token.variableId))) {
          issues.push(`فیلد محاسباتی «${field.name || "بدون نام"}» مقصد یا فرمول معتبر ندارد.`);
        }
      }
      draft.stages.forEach((stage, index) => {
        if ((stage.routeRules ?? []).some((rule) => !rule.condition.clauses.some((clause) => clause.variableId && routingVariablesAt(index).some((variable) => variable.id === clause.variableId)) || !draft.stages.slice(index + 1).some((nextStage) => nextStage.id === rule.nextStageId))) {
          issues.push(`قانون مسیر مرحله‌ی «${stage.title}» کامل نیست.`);
        }
      });
    }
    if (issues.length) {
      setErrors(issues);
      setStep(issues.some((item) => item.includes("عنوان پروسه") || item.includes("کد شناسه")) ? 0 : 1);
      return;
    }
    const lockedStages = draft.stages.map((stage) => ({
      ...stage,
      formVersions: Object.fromEntries((stage.formIds ?? []).flatMap((formId) => {
        const form = publishedForms.find((item) => item.id === formId);
        return form ? [[formId, form.version]] : stage.formVersions?.[formId] ? [[formId, stage.formVersions[formId]]] : [];
      })),
    }));
    const previousVersions = initial?.publishedVersions ?? [];
    const publishedVersions = publish && initial?.status === "active"
      ? [...previousVersions.filter((item) => item.version !== initial.version), {
          version: initial.version,
          publishedAt: initial.updatedAt,
          stages: structuredClone(initial.stages),
          fields: structuredClone(initial.fields),
          payment: structuredClone(initial.payment),
        }]
      : previousVersions;
    const [majorRaw, minorRaw] = (initial?.version ?? "1.0").split(".");
    const major = Number(majorRaw) || 1;
    const minor = Number(minorRaw) || 0;
    const nextVersion = !initial || initial.status !== "active"
      ? (draft.version === "0.1" ? "1.0" : draft.version)
      : `${major}.${minor + 1}`;
    const saved = onSave({
      ...draft,
      stages: publish ? lockedStages : draft.stages,
      publishedVersions,
      status: publish ? "active" : "draft",
      version: publish ? nextVersion : draft.version,
      updatedAt: new Date().toISOString(),
    }, publish);
    if (saved) onClose();
  };

  const inputClass = `w-full rounded-xl border px-3 py-2.5 text-xs outline-none transition focus:border-[#15554f] ${t.field}`;
  const labelClass = "mb-1.5 block text-xs font-semibold";
  const sectionClass = `rounded-2xl border p-4 sm:p-5 ${t.card}`;

  const conditionIsVisible = (field: ProcessField) => {
    const condition = field.condition;
    if (!condition) return true;
    const clauses = condition.clauses ?? (condition.fieldKey && condition.operator
      ? [{ variableId: condition.fieldKey, operator: condition.operator, value: condition.value ?? "" }]
      : []);
    if (!clauses.length) return true;
    const results = clauses.map((clause) => {
      const sourceId = clause.variableId.includes(":") ? clause.variableId.split(":").at(-1) ?? clause.variableId : clause.variableId;
      const source = draft.fields.find((candidate) => candidate.slug === sourceId || candidate.id === sourceId);
      const actual = previewValues[source?.id ?? sourceId] ?? "";
      switch (clause.operator) {
        case "equals": return actual === clause.value;
        case "notEquals": return actual !== clause.value;
        case "contains": return actual.includes(clause.value);
        case "isEmpty": return actual.trim() === "";
        case "greaterThan": return Number(actual) > Number(clause.value);
        case "lessThan": return Number(actual) < Number(clause.value);
      }
    });
    return condition.logic === "or" ? results.some(Boolean) : results.every(Boolean);
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
    const input = field.type === "select" || field.type === "radio" || field.type === "boolean" ? (
      <span className="relative mt-1.5 block">
        <select value={currentValue} onChange={(event) => setPreviewValues((values) => ({ ...values, [valueKey]: event.target.value }))} className={`${inputClass} appearance-none pl-8`}>
          <option value="" style={{ background: "#fff", color: "#111827" }}>انتخاب کنید</option>
          {(field.type === "boolean" ? ["بله", "خیر"] : field.options?.length ? field.options : ["گزینه اول", "گزینه دوم"]).map((option) => <option key={option} value={option} style={{ background: "#fff", color: "#111827" }}>{option}</option>)}
        </select>
        <ChevronDown aria-hidden="true" className={`pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${t.muted}`} />
      </span>
    ) : (
      <span className="relative mt-1.5 block">
        <input type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "file" ? "file" : "text"} value={field.type === "file" ? undefined : currentValue} onChange={(event) => setPreviewValues((values) => ({ ...values, [valueKey]: event.target.value }))} className={inputClass} />
        {field.unit && field.type !== "file" && <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[0.62rem] ${t.muted}`}>{UNIT_LABELS[field.unit] ?? field.unit}</span>}
      </span>
    );
    return (
      <label key={valueKey} className="block text-xs font-semibold">
        {field.label || "فیلد بدون عنوان"} {field.required && <span className="text-rose-500">*</span>}
        {input}
      </label>
    );
  };

  const numericVariablesBefore = (targetStageId: string) => {
    const targetIndex = draft.stages.findIndex((stage) => stage.id === targetStageId);
    const formIds = draft.stages.slice(0, Math.max(0, targetIndex)).flatMap((stage) => stage.formIds ?? []);
    const previousCalculations = (draft.computedFields ?? [])
      .filter((field) => draft.stages.findIndex((stage) => stage.id === field.destinationStageId) < targetIndex)
      .map((field) => ({ id: `calc:${field.id}`, label: field.name, type: "number", unit: field.unit }));
    return [...formVariables(publishedForms, formIds, true), ...previousCalculations];
  };
  const routingVariablesAt = (stageIndex: number) => {
    const formIds = draft.stages.slice(0, stageIndex + 1).flatMap((stage) => stage.formIds ?? []);
    const calculations = (draft.computedFields ?? [])
      .filter((field) => draft.stages.findIndex((stage) => stage.id === field.destinationStageId) <= stageIndex)
      .map((field) => ({ id: `calc:${field.id}`, label: field.name, type: "number", unit: field.unit }));
    return [...formVariables(publishedForms, formIds), ...calculations];
  };
  const updateComputedField = (fieldId: string, patch: Partial<ComputedProcessField>) =>
    update("computedFields", (draft.computedFields ?? []).map((field) => field.id === fieldId ? { ...field, ...patch } : field));
  const addComputedField = () => {
    const defaultDestination = draft.stages[1]?.id ?? draft.stages[0]?.id ?? "";
    const newField: ComputedProcessField = {
      id: `calculation-${crypto.randomUUID()}`,
      name: "",
      formula: { tokens: [] },
      destination: "internal",
      destinationStageId: defaultDestination,
    };
    update("computedFields", [...(draft.computedFields ?? []), newField]);
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
            <button type="button" onClick={() => update("stages", [...draft.stages, { id: `stage-${Date.now()}`, title: "", assigneeType: "employee", assigneeRole: "کارشناس اداری", slaDays: 3, formIds: [], guidance: "" }])} className="inline-flex items-center gap-1.5 rounded-xl bg-[#15554f] px-3 py-2 text-xs font-semibold text-white hover:bg-[#246b61]"><Plus className="h-4 w-4" />افزودن مرحله</button>
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
                className={`grid items-center gap-2 rounded-xl border p-3 md:grid-cols-[auto_minmax(180px,1fr)_190px_150px_120px_auto] ${t.panel}`}
              >
                <GripVertical className={`hidden h-4 w-4 cursor-grab md:block ${t.muted}`} />
                <label className="text-[0.68rem] font-semibold">مرحله {index + 1}
                  <input value={item.title} onChange={(event) => update("stages", draft.stages.map((stage, i) => i === index ? { ...stage, title: event.target.value } : stage))} className={`${inputClass} mt-1.5`} placeholder="عنوان مرحله" />
                </label>
                <div className="relative min-w-0">
                  <label className="mb-1.5 block text-[0.68rem] font-semibold">فرم‌های این مرحله</label>
                  <button
                    type="button"
                    aria-expanded={openFormStageId === item.id}
                    aria-label={`انتخاب فرم برای مرحله ${index + 1}`}
                    onClick={() => setOpenFormStageId((current) => current === item.id ? null : item.id)}
                    disabled={!publishedForms.length}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-right text-xs disabled:cursor-not-allowed disabled:opacity-60 ${t.quiet}`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {item.formIds?.length
                        ? item.formIds.map((formId) => publishedForms.find((form) => form.id === formId)?.title ?? "فرم حذف‌شده").join("، ")
                        : publishedForms.length ? "انتخاب فرم‌ها" : "فرم منتشرشده‌ای برای انتخاب وجود ندارد"}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className={`rounded-full px-1.5 py-0.5 text-[0.6rem] ${isDarkMode ? "bg-white/[0.07] text-white/70" : "bg-[#edf0eb] text-[#40584e]"}`}>
                        {(item.formIds?.length ?? 0).toLocaleString("fa-IR")}
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openFormStageId === item.id ? "rotate-180" : ""} ${t.muted}`} />
                    </span>
                  </button>
                  {openFormStageId === item.id && publishedForms.length > 0 && (
                    <div role="listbox" aria-multiselectable="true" aria-label={`فرم‌های مرحله ${index + 1}`} className={`absolute right-0 top-full z-30 mt-1 max-h-56 w-max min-w-full max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border p-1.5 shadow-xl ${isDarkMode ? "border-white/10 bg-[#122925]" : "border-[#d5dad4] bg-white"}`}>
                      {publishedForms.map((form) => {
                        const selected = (item.formIds ?? []).includes(form.id);
                        return (
                          <button
                            key={form.id}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => update("stages", draft.stages.map((stage) => stage.id === item.id ? {
                              ...stage,
                              formIds: selected
                                ? (stage.formIds ?? []).filter((id) => id !== form.id)
                                : [...(stage.formIds ?? []), form.id],
                              formVersions: selected
                                ? Object.fromEntries(Object.entries(stage.formVersions ?? {}).filter(([id]) => id !== form.id))
                                : { ...(stage.formVersions ?? {}), [form.id]: form.version },
                            } : stage))}
                            className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-right text-xs transition ${selected ? "bg-[#15554f]/10 text-[#15554f]" : isDarkMode ? "text-white/80 hover:bg-white/[0.06]" : "text-[#40584e] hover:bg-[#edf0eb]"}`}
                          >
                            <span className="min-w-0 max-w-[calc(100vw-5rem)]">
                              <span className="block whitespace-normal break-words font-semibold">{form.title}</span>
                              <span className={`mt-0.5 block text-[0.62rem] ${t.muted}`}>{form.department}</span>
                            </span>
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? "border-[#15554f] bg-[#15554f] text-white" : "border-current"}`}>
                              {selected && <Check className="h-3 w-3" />}
                            </span>
                          </button>
                        );
                      })}
                      {(item.formIds ?? []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(item.formIds ?? []).map((formId, formIndex) => {
                            const linkedForm = publishedForms.find((form) => form.id === formId);
                            if (!linkedForm) return null;
                            const lockedVersion = item.formVersions?.[formId] ?? linkedForm.version;
                            const snapshot = linkedForm.versions.find((version) => version.version === lockedVersion);
                            const changedFields = snapshot
                              ? Math.abs(flattenFormFields(linkedForm.fields).length - flattenFormFields(snapshot.fields).length)
                              : 0;
                            return (
                              <span key={formId} draggable onDragStart={() => setDraggedForm({ stageId: item.id, formId })} onDragOver={(event) => event.preventDefault()} onDrop={() => {
                                if (draggedForm?.stageId !== item.id) return;
                                const from = (item.formIds ?? []).indexOf(draggedForm.formId);
                                const to = (item.formIds ?? []).indexOf(formId);
                                if (from >= 0 && to >= 0) update("stages", draft.stages.map((stage) => stage.id === item.id ? { ...stage, formIds: move(stage.formIds ?? [], from, to) } : stage));
                                setDraggedForm(null);
                              }} className="inline-flex cursor-grab items-center gap-1 rounded-full border border-[#15554f]/20 bg-[#15554f]/10 px-2 py-1 text-[0.62rem] text-[#15554f]">
                                <GripVertical className="h-3 w-3" />{formIndex + 1}. {linkedForm.title} · v{lockedVersion}
                                {lockedVersion !== linkedForm.version && <button type="button" className="mr-1 underline" onClick={() => {
                                  const latestSnapshot = linkedForm.versions.find((version) => version.version === linkedForm.version);
                                  const oldFieldCount = snapshot ? flattenFormFields(snapshot.fields).length : 0;
                                  const nextFieldCount = latestSnapshot ? flattenFormFields(latestSnapshot.fields).length : flattenFormFields(linkedForm.fields).length;
                                  const diff = `نسخه ${lockedVersion} ← ${linkedForm.version}\nتعداد فیلدها: ${oldFieldCount} ← ${nextFieldCount}\nقوانین: ${snapshot?.rules.length ?? 0} ← ${latestSnapshot?.rules.length ?? linkedForm.rules.length}`;
                                  if (window.confirm(`تفاوت نسخه فرم:\n${diff}\n\nنسخه پروسه را به‌روزرسانی می‌کنید؟`)) {
                                    update("stages", draft.stages.map((stage) => stage.id === item.id ? { ...stage, formVersions: { ...(stage.formVersions ?? {}), [formId]: linkedForm.version } } : stage));
                                  }
                                }}>مقایسه و به‌روزرسانی</button>}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
                <label className="col-span-full text-[0.68rem] font-semibold">راهنمای کلی این مرحله
                  <textarea value={item.guidance ?? ""} onChange={(event) => update("stages", draft.stages.map((stage, i) => i === index ? { ...stage, guidance: event.target.value } : stage))} rows={2} className={`${inputClass} mt-1.5`} placeholder="راهنمای کلی برای آشنایی کاربر با این مرحله..." />
                </label>
              </div>
            ))}
          </div>
        </section>
      );
    }
    if (step === 2) {
      return (
        <div className="space-y-5">
          <section className={sectionClass}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="text-sm font-bold">فیلدهای محاسباتی</h3><p className={`mt-1 text-[0.68rem] ${t.muted}`}>فرمول فقط به فیلدهای مراحل پیشین دسترسی دارد و در زمان ورود به مرحله‌ی مقصد محاسبه می‌شود.</p></div>
              <button type="button" onClick={addComputedField} className="inline-flex items-center gap-1.5 rounded-xl bg-[#15554f] px-3 py-2 text-xs font-semibold text-white"><Plus className="h-4 w-4" />افزودن فیلد محاسباتی</button>
            </div>
            <div className="space-y-4">
              {(draft.computedFields ?? []).map((field) => {
                const stageIndex = draft.stages.findIndex((stage) => stage.id === field.destinationStageId);
                const variables = numericVariablesBefore(field.destinationStageId ?? "");
                const targetStage = draft.stages[stageIndex];
                const targetForm = publishedForms.find((form) => form.id === field.destinationFormId);
                return (
                  <article key={field.id} className={`space-y-3 rounded-xl border p-3 ${t.panel}`}>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className={labelClass}>نام متغیر
                        <input className={`${inputClass} mt-1.5`} value={field.name} placeholder="مثلاً هزینه بررسی" onChange={(event) => updateComputedField(field.id, { name: event.target.value })} />
                      </label>
                      <label className={labelClass}>زمان/مرحله‌ی مقصد محاسبه
                        <select className={`${inputClass} mt-1.5`} value={field.destinationStageId ?? ""} onChange={(event) => updateComputedField(field.id, { destinationStageId: event.target.value })}>
                          {draft.stages.map((stage, index) => <option key={stage.id} value={stage.id} disabled={index === 0 && draft.stages.length > 1}>{stage.title || `مرحله ${index + 1}`}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem]">
                      <label className={labelClass}>مقصد خروجی
                        <select className={`${inputClass} mt-1.5`} value={field.destination} onChange={(event) => updateComputedField(field.id, { destination: event.target.value as "internal" | "form", destinationFormId: undefined, destinationFieldId: undefined })}>
                          <option value="internal">متغیر داخلی پروسه</option><option value="form">فیلد فقط‌خواندنی در یک فرم</option>
                        </select>
                      </label>
                      <label className={labelClass}>واحد خروجی
                        <select className={`${inputClass} mt-1.5`} value={field.unit ?? ""} onChange={(event) => updateComputedField(field.id, { unit: event.target.value || undefined })}>
                          <option value="">بدون واحد</option>{UNIT_CATEGORIES.flatMap((category) => category.units.map((unit) => <option key={unit.id} value={unit.id}>{category.label} · {unit.label}</option>))}
                        </select>
                      </label>
                    </div>
                    {field.destination === "form" && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className={labelClass}>فرم مقصد
                          <select className={`${inputClass} mt-1.5`} value={field.destinationFormId ?? ""} onChange={(event) => updateComputedField(field.id, { destinationFormId: event.target.value, destinationFieldId: undefined })}>
                            <option value="">انتخاب فرم</option>{publishedForms.filter((form) => form.formType === "payment" || draft.stages[stageIndex]?.formIds?.includes(form.id)).map((form) => <option key={form.id} value={form.id}>{form.title}{form.formType === "payment" ? " (پرداخت)" : ""}</option>)}
                          </select>
                        </label>
                        {targetForm?.formType === "payment"
                          ? <p className={`self-end rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs leading-5 ${t.muted}`}>این نقطه، محل تعریف فرمول مبلغ این فرم پرداخت است.</p>
                          : <label className={labelClass}>فیلد خروجی
                              <select className={`${inputClass} mt-1.5`} value={field.destinationFieldId ?? ""} onChange={(event) => updateComputedField(field.id, { destinationFieldId: event.target.value })}>
                                <option value="">انتخاب فیلد عددی</option>{targetForm && flattenFormFields(targetForm.fields).filter((item) => item.type === "number").map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                              </select>
                            </label>}
                      </div>
                    )}
                    {variables.length > 0
                      ? <ConditionFormulaEditor mode="formula" variables={variables} value={field.formula} onChange={(formula: FormulaValue) => updateComputedField(field.id, { formula })} />
                      : <p className={`rounded-xl border border-dashed p-3 text-xs ${t.muted}`}>برای این مرحله متغیر عددی از مراحل قبل در دسترس نیست؛ مرحله‌ی قبلی را به یک فرم عددی متصل کنید.</p>}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[0.68rem] text-amber-700 dark:text-amber-300">وضعیت نمونه: {stageIndex > 0 ? "در انتظار تکمیل مرحله‌ی قبل؛ با ورود به مقصد محاسبه می‌شود." : "پس از تکمیل داده‌های مبدأ محاسبه می‌شود."}</p>
                      <button type="button" onClick={() => update("computedFields", (draft.computedFields ?? []).filter((item) => item.id !== field.id))} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-600"><Trash2 className="h-3.5 w-3.5" />حذف</button>
                    </div>
                  </article>
                );
              })}
              {(draft.computedFields ?? []).length === 0 && <p className={`rounded-xl border border-dashed p-6 text-center text-xs ${t.muted}`}>فیلد محاسباتی تعریف نشده است.</p>}
            </div>
          </section>

          <section className={sectionClass}>
            <h3 className="text-sm font-bold">قوانین مسیر مرحله</h3>
            <p className={`mb-4 mt-1 text-[0.68rem] ${t.muted}`}>قانون‌ها به ترتیب بررسی می‌شوند؛ اگر هیچ شرطی برقرار نباشد مسیر پیش‌فرض اجرا خواهد شد.</p>
            <div className="space-y-4">
              {draft.stages.map((stage, index) => {
                const variables = routingVariablesAt(index);
                const rules = stage.routeRules ?? [];
                const updateStage = (patch: Partial<ProcessStage>) => update("stages", draft.stages.map((item) => item.id === stage.id ? { ...item, ...patch } : item));
                return (
                  <article key={stage.id} className={`space-y-3 rounded-xl border p-3 ${t.panel}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-bold">مرحله {index + 1}: {stage.title}</h4>{index < draft.stages.length - 1 && <button type="button" onClick={() => updateStage({ routeRules: [...rules, { id: `route-${crypto.randomUUID()}`, condition: emptyCondition(), nextStageId: draft.stages[index + 1]?.id ?? "" }] })} className="text-xs font-semibold text-[#4f7aab]">افزودن قانون مسیر</button>}</div>
                    {rules.map((rule: StageRouteRule) => (
                      <div key={rule.id} className="grid gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-950/40 lg:grid-cols-[minmax(0,1fr)_13rem_auto]">
                        {variables.length
                          ? <ConditionFormulaEditor mode="condition" variables={variables} value={rule.condition} onChange={(condition: ConditionValue) => updateStage({ routeRules: rules.map((item) => item.id === rule.id ? { ...item, condition } : item) })} />
                          : <p className={`self-center text-xs ${t.muted}`}>فیلدی برای شرط‌گذاری در دسترس نیست.</p>}
                        <label className={labelClass}>در صورت برقرار بودن برو به
                          <select className={`${inputClass} mt-1.5`} value={rule.nextStageId} onChange={(event) => updateStage({ routeRules: rules.map((item) => item.id === rule.id ? { ...item, nextStageId: event.target.value } : item) })}>
                            {draft.stages.slice(index + 1).map((nextStage) => <option key={nextStage.id} value={nextStage.id}>{nextStage.title || "مرحله بدون عنوان"}</option>)}
                          </select>
                        </label>
                        <button type="button" onClick={() => updateStage({ routeRules: rules.filter((item) => item.id !== rule.id) })} className="self-center rounded-lg p-2 text-rose-600" aria-label="حذف قانون مسیر"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                    <label className={labelClass}>مسیر پیش‌فرض
                      <select className={`${inputClass} mt-1.5 max-w-sm`} value={stage.defaultNextStageId ?? ""} onChange={(event) => updateStage({ defaultNextStageId: event.target.value })}>
                        <option value="">پایان پروسه / بدون انتقال</option>{draft.stages.slice(index + 1).map((nextStage) => <option key={nextStage.id} value={nextStage.id}>{nextStage.title || "مرحله بدون عنوان"}</option>)}
                      </select>
                    </label>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      );
    }
    if (step === 3) {
      return (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <section className={sectionClass}>
          <div className="mb-4 flex items-center justify-between gap-2"><div><h3 className="text-sm font-bold">پیش‌نمایش پروسه</h3><p className={`mt-1 text-[0.68rem] ${t.muted}`}>نمای کلی مرحله‌ها و فرم‌های انتخاب‌شده قبل از انتشار</p></div><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[0.65rem] text-emerald-700">آماده انتشار</span></div>
          {draft.description && <p className={`mb-4 rounded-xl border p-3 text-xs leading-5 ${t.panel} ${t.muted}`}>{draft.description}</p>}
          <div className="space-y-3">
            {draft.stages.map((stage, index) => (
              <div key={stage.id} className={`rounded-xl border p-3 ${t.panel}`}>
                <p className="mb-2 text-[0.68rem] font-bold">مرحله {index + 1}: {stage.title || "بدون عنوان"}</p>
                <div className="flex flex-wrap gap-1.5">
                  {(stage.formIds?.length ? stage.formIds.map((formId) => `${publishedForms.find((form) => form.id === formId)?.title ?? "فرم حذف‌شده"} · نسخه ${stage.formVersions?.[formId] ?? publishedForms.find((form) => form.id === formId)?.version ?? "نامشخص"}`) : ["هیچ فرم انتخاب نشده است"]).map((label, labelIndex) => (
                    <span key={`${stage.id}-${label}-${labelIndex}`} className={`rounded-full border px-2 py-1 text-[0.62rem] ${label === "هیچ فرم انتخاب نشده است" ? `${t.muted} border-dashed` : "border-[#15554f]/20 bg-[#15554f]/10 text-[#15554f]"}`}>
                      {label}
                    </span>
                  ))}
                </div>
                {stage.guidance && <p className={`mt-2 text-[0.65rem] ${t.muted}`}>{stage.guidance}</p>}
              </div>
            ))}
          </div>
        </section>
        <section className={sectionClass}>
          <h3 className="mb-3 text-sm font-bold">خلاصه پروسه</h3>
          <dl className={`space-y-3 text-xs ${t.muted}`}>
            <div><dt className="font-semibold">عنوان</dt><dd className="mt-1">{draft.title || "—"}</dd></div>
            <div><dt className="font-semibold">کد شناسه</dt><dd className="mt-1" dir="ltr">{draft.code || "—"}</dd></div>
            <div><dt className="font-semibold">واحد</dt><dd className="mt-1">{draft.department}</dd></div>
            <div><dt className="font-semibold">تعداد مراحل</dt><dd className="mt-1">{draft.stages.length}</dd></div>
            <div><dt className="font-semibold">فرم‌های انتخاب‌شده</dt><dd className="mt-1">{draft.stages.reduce((sum, stage) => sum + (stage.formIds?.length ?? 0), 0)}</dd></div>
            <div><dt className="font-semibold">پرداخت</dt><dd className="mt-1">{draft.payment.mode === "none" ? "ندارد" : draft.payment.mode === "fixed" ? `${new Intl.NumberFormat("fa-IR").format(draft.payment.amount)} ریال` : draft.payment.formula || "فرمول تنظیم نشده"}</dd></div>
            <div><dt className="font-semibold">فیلدهای محاسباتی</dt><dd className="mt-1">{(draft.computedFields ?? []).length || "تعریف نشده"}</dd></div>
          </dl>
          <h4 className="mb-2 mt-5 text-xs font-bold">مراحل</h4>
          <ol className={`space-y-2 text-[0.68rem] ${t.muted}`}>{draft.stages.map((item, index) => <li key={item.id} className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#15554f]/10 text-[0.6rem] text-[#15554f]">{index + 1}</span>{item.title || "مرحله بدون عنوان"} · {item.assigneeRole} · {item.slaDays} روز</li>)}</ol>
        </section>
      </div>
    );
    }
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
