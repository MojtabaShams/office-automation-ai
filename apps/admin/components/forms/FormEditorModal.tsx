"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CalendarDays,
  Check,
  CreditCard,
  Download,
  FileText,
  Hash,
  List,
  Loader2,
  Paperclip,
  Plus,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-react";
import { useTheme } from "../../theme-context";
import Modal from "../Modal";
import ConfirmModal from "../ConfirmModal";
import ThemedSelect from "../ThemedSelect";
import ConditionFormulaEditor, {
  type ConditionValue,
  type ConditionVariable,
} from "../ConditionFormulaEditor";
import AssistantProposalReview from "./AssistantProposalReview";
import type {
  FormAssistantChange,
  FormAssistantProposal,
  FormAssistantRequest,
} from "./assistant-types";
import { UNIT_CATEGORIES, unitLabelOf, type UnitCategoryId } from "../../app/lib/units";
import type {
  FormDefinition,
  FormType,
  ReferenceDocument,
  ValidationRule,
} from "../../app/lib/mock-forms";
import type {
  ComputedFieldConfig,
  FieldValidation,
  PaymentAmountSource,
  PaymentFieldConfig,
  ProcessField,
  ProcessFieldType,
  ValidationPreset,
} from "../../app/lib/mock-processes";
import type { PaymentGateway } from "../../app/lib/payment-gateways";
import {
  VALIDATION_PRESETS,
  allowedConditionSources,
  applyValidationPreset,
  describeValidation,
  findInvalidConditionReferences,
  isValidationConfigValid,
  normalizeDigits,
  numericFieldsBefore,
  stripInvalidConditions,
  validateFieldValue,
} from "../../app/lib/field-validation";
import {
  deleteFormDocument,
  downloadFormDocument,
  listFormDocuments,
  suggestRulesFromDocument,
  uploadFormDocument,
} from "../../app/lib/form-documents-api";

/** متغیر محاسبه‌شده‌ی سطح پروسه که می‌تواند مبلغ پرداخت را تغذیه کند. */
export type ProcessVariableOption = { id: string; name: string };

type Props = {
  open: boolean;
  initial: FormDefinition | null;
  gateways: PaymentGateway[];
  /** متغیرهای محاسبه‌شده‌ی پروسه‌هایی که این فرم در آن‌ها استفاده شده است. */
  processVariables?: ProcessVariableOption[];
  onClose: () => void;
  /** Returns ``false`` to keep the editor open; a rejection shows its message inline. */
  onSave: (form: FormDefinition) => boolean | Promise<boolean>;
  /** اختیاری: اتصال به سرویس AI برای پیشنهاد ساخت‌یافته */
  onRequestAssistantProposal?: (
    request: FormAssistantRequest,
  ) => Promise<FormAssistantProposal[]>;
};

type PanelMode = "none" | "meta" | "field" | "assistant";

type ExtendedFieldType = ProcessFieldType;

type ChatEntry = { id: string; text: string; files: string[] };

/** پرداخت: تنها یک منبع حقیقت در ``field.payment`` نگه داشته می‌شود. */
function paymentOf(field: ProcessField): PaymentFieldConfig {
  return field.payment ?? {};
}

function computedOf(field: ProcessField): ComputedFieldConfig {
  return field.computed ?? {};
}

const SUPPORTED_FILES =
  ".png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.pdf,.doc,.docx,.xls,.xlsx";

const DOCUMENT_FILES = ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp";

const PALETTE: {
  type: ProcessFieldType;
  label: string;
  icon: typeof Type;
}[] = [
  { type: "text", label: "متن", icon: Type },
  { type: "number", label: "عدد", icon: Hash },
  { type: "date", label: "تاریخ", icon: CalendarDays },
  { type: "select", label: "انتخاب", icon: List },
  { type: "file", label: "آپلود فایل", icon: Upload },
  { type: "repeater", label: "تکرارشونده", icon: Table2 },
  { type: "computed", label: "محاسبه‌ای", icon: Calculator },
  { type: "payment", label: "پرداخت", icon: CreditCard },
  { type: "section", label: "بخش", icon: FileText },
];

const PAYMENT_SOURCES: {
  value: PaymentAmountSource;
  label: string;
  hint: string;
}[] = [
  { value: "fixed", label: "مبلغ ثابت", hint: "مبلغ از پیش تعیین‌شده در همین فیلد" },
  {
    value: "form_formula",
    label: "فرمول همین فرم",
    hint: "محاسبه از فیلدهای عددی همین فرم",
  },
  {
    value: "process_variable",
    label: "متغیر پروسه",
    hint: "خواندن یک مقدار محاسبه‌شده‌ی سطح پروسه",
  },
];

const EXTRACTION_LABEL: Record<ReferenceDocument["extractionStatus"], string> = {
  pending: "در انتظار استخراج",
  processing: "در حال استخراج متن",
  done: "متن استخراج شد",
  failed: "استخراج ناموفق",
  unsupported: "قالب پشتیبانی نمی‌شود",
};

function createEmptyForm(): FormDefinition {
  return {
    id: `form-${crypto.randomUUID()}`,
    code: `FORM-${Date.now().toString().slice(-6)}`,
    title: "",
    department: "عمومی",
    description: "",
    icon: "file",
    status: "draft",
    version: "0.1",
    updatedAt: new Date().toISOString(),
    formType: "standard",
    fields: [],
    rules: [],
    applicantGuidance: "",
    directiveFileNames: [],
    versions: [],
  };
}

function createField(type: ExtendedFieldType = "text"): ProcessField {
  const base: ProcessField = {
    id: `field-${crypto.randomUUID()}`,
    label: type === "payment" ? "پرداخت" : "",
    type: type as ProcessFieldType,
    required: type === "payment",
  };
  if (type === "repeater") {
    return { ...base, subFields: [], minRows: 0, maxRows: 10 };
  }
  if (type === "file") {
    return {
      ...base,
      allowedFileTypes: ["application/pdf"],
      maxFileSizeMb: 10,
      minFiles: 1,
      maxFiles: 1,
    };
  }
  if (type === "section") {
    return { ...base, subFields: [] };
  }
  if (type === "payment") {
    return {
      ...base,
      payment: { gatewayId: "", amountSource: "fixed", amountFormula: { tokens: [] } },
    };
  }
  if (type === "computed") {
    return {
      ...base,
      label: "مقدار محاسبه‌شده",
      computed: { formula: { tokens: [] } },
      unitCategory: "currency",
      unit: "rial",
    };
  }
  return base;
}

function variableOf(field: ProcessField): ConditionVariable {
  return {
    id: field.id,
    label: field.label || "فیلد بدون عنوان",
    type: field.type,
    unit: unitLabelOf(field.unit),
    unitCategory: field.unitCategory,
  };
}

/** فیلدهای قابل استفاده در محاسبه/شرط (بدون بخش و پرداخت). */
function collectVariables(
  fields: ProcessField[],
  numericOnly = false,
): ConditionVariable[] {
  const variables: ConditionVariable[] = [];
  const visit = (field: ProcessField) => {
    const usable = field.type !== "section" && field.type !== "payment";
    const numeric = field.type === "number" || field.type === "computed";
    if (usable && (!numericOnly || numeric)) variables.push(variableOf(field));
    field.subFields?.forEach(visit);
  };
  fields.forEach(visit);
  return variables;
}

/** همه‌ی گره‌ها (شامل بخش و جدول). */
function flattenAll(fields: ProcessField[]): ProcessField[] {
  const output: ProcessField[] = [];
  const visit = (field: ProcessField) => {
    output.push(field);
    field.subFields?.forEach(visit);
  };
  fields.forEach(visit);
  return output;
}

/** فقط فیلدهای برگ (بدون بخش و بدون ردیف جدول). */
function flattenLeaves(fields: ProcessField[]): ProcessField[] {
  const output: ProcessField[] = [];
  const visit = (field: ProcessField) => {
    if (field.type === "section" || field.type === "repeater") {
      (field.subFields ?? []).forEach(visit);
      return;
    }
    output.push(field);
  };
  fields.forEach(visit);
  return output;
}

function findField(
  fields: ProcessField[],
  id: string,
): ProcessField | undefined {
  for (const f of fields) {
    if (f.id === id) return f;
    if (f.subFields) {
      const found = findField(f.subFields, id);
      if (found) return found;
    }
  }
  return undefined;
}

function mapFields(
  fields: ProcessField[],
  id: string,
  fn: (f: ProcessField) => ProcessField,
): ProcessField[] {
  return fields.map((f) => {
    if (f.id === id) return fn(f);
    if (f.subFields) return { ...f, subFields: mapFields(f.subFields, id, fn) };
    return f;
  });
}

function removeField(fields: ProcessField[], id: string): ProcessField[] {
  return fields
    .filter((f) => f.id !== id)
    .map((f) =>
      f.subFields ? { ...f, subFields: removeField(f.subFields, id) } : f,
    );
}

function updateFieldTree(
  fields: ProcessField[],
  fieldId: string,
  patch: Partial<ProcessField>,
): ProcessField[] {
  return fields.map((field) =>
    field.id === fieldId
      ? { ...field, ...patch }
      : field.subFields
        ? { ...field, subFields: updateFieldTree(field.subFields, fieldId, patch) }
        : field,
  );
}

function countLeaves(fields: ProcessField[]): number {
  return fields.reduce((sum, f) => {
    if (f.type === "section" || f.type === "repeater")
      return sum + countLeaves(f.subFields ?? []);
    return sum + 1;
  }, 0);
}

function normalizeRuleSource(
  source: { fileName?: string; pageOrClause?: string } | undefined,
): ValidationRule["source"] {
  if (!source) return undefined;
  const fileName = (source.fileName ?? "").trim();
  const pageOrClause = (source.pageOrClause ?? "").trim();
  if (!fileName && !pageOrClause) return undefined;
  return { fileName, ...(pageOrClause ? { pageOrClause } : {}) };
}

function unitLabel(unit: string | undefined): string {
  return unitLabelOf(unit);
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(value);
}

function formatBytes(size: number): string {
  if (!size) return "۰ بایت";
  if (size < 1024) return `${formatAmount(size)} بایت`;
  if (size < 1024 * 1024) return `${formatAmount(Math.round(size / 1024))} کیلوبایت`;
  return `${formatAmount(Math.round((size / (1024 * 1024)) * 10) / 10)} مگابایت`;
}

export default function FormEditorModal({
  open,
  initial,
  gateways,
  processVariables = [],
  onClose,
  onSave,
  onRequestAssistantProposal,
}: Props) {
  const { isDarkMode } = useTheme();
  const [draft, setDraft] = useState<FormDefinition>(createEmptyForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelMode>("none");
  const [errors, setErrors] = useState<string[]>([]);

  // L3: محافظت از تغییرات ذخیره‌نشده و حذف بخش دارای محتوا
  const [dirty, setDirty] = useState(false);
  const [askClose, setAskClose] = useState(false);
  const [fieldToDelete, setFieldToDelete] = useState<ProcessField | null>(null);

  const [validationSample, setValidationSample] = useState("");

  // اسناد مرجع (H5)
  const [documents, setDocuments] = useState<ReferenceDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsBusy, setDocsBusy] = useState(false);
  const [docsError, setDocsError] = useState("");
  const [docToDelete, setDocToDelete] = useState<ReferenceDocument | null>(null);
  const [suggestingId, setSuggestingId] = useState<string | null>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // دستیار هوشمند
  const [chatText, setChatText] = useState("");
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [proposals, setProposals] = useState<FormAssistantProposal[]>([]);
  const [proposalDecisions, setProposalDecisions] = useState<
    Record<string, "accepted" | "rejected">
  >({});
  const [assistantError, setAssistantError] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const next = initial ? structuredClone(initial) : createEmptyForm();
    setDraft(next);
    setSelectedId(null);
    setErrors([]);
    setDirty(false);
    setAskClose(false);
    setFieldToDelete(null);
    setPanel(initial ? "none" : "meta");
    setValidationSample("");
    setDocuments(next.referenceDocuments ?? []);
    setDocsError("");
    setDocsLoading(false);
    setDocsBusy(false);
    setDocToDelete(null);
    setSuggestingId(null);
    setChatText("");
    setChatLog([]);
    setFiles([]);
    setProposals([]);
    setProposalDecisions({});
    setAssistantError("");
    setAssistantBusy(false);
  }, [initial, open]);

  // فهرست اسناد از سرور (فرم‌های تازه‌ساخته هم شناسه دارند و بک‌اند FK ندارد).
  const draftId = open ? draft.id : "";
  useEffect(() => {
    if (!open || !draftId) return;
    let cancelled = false;
    setDocsLoading(true);
    listFormDocuments(draftId)
      .then((items) => {
        if (!cancelled) setDocuments(items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDocsError(
          err instanceof Error
            ? `فهرست اسناد از سرور خوانده نشد: ${err.message}`
            : "فهرست اسناد از سرور خوانده نشد.",
        );
      })
      .finally(() => {
        if (!cancelled) setDocsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draftId, open]);

  const t = isDarkMode
    ? {
        field:
          "border-white/10 bg-white/[0.06] text-white placeholder:text-white/35",
        muted: "text-white/55",
        card: "border-white/10 bg-white/[0.035]",
        panel: "border-white/10 bg-[#122925]",
        quiet:
          "border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.08]",
        divider: "border-white/10",
        canvas: "bg-[#0f1f1c]",
        selected: "border-[#15554f] ring-2 ring-[#15554f]/25",
        arrow: "text-white/45",
        amberBox: "bg-amber-400/10 text-amber-300",
        roseBox: "bg-rose-500/10 text-rose-300",
        successBox: "bg-emerald-500/10 text-emerald-300",
        infoBox: "bg-[#15554f]/20 text-[#8bd0bf]",
        chip: "bg-white/[0.06]",
      }
    : {
        field:
          "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]",
        muted: "text-[#68766c]",
        card: "border-[#e1e6df] bg-white",
        panel: "border-[#d5dad4] bg-[#f6f7f4]",
        quiet: "border-[#d5dad4] bg-white text-[#40584e] hover:bg-[#edf0eb]",
        divider: "border-[#e1e6df]",
        canvas: "bg-[#f3f5f1]",
        selected: "border-[#15554f] ring-2 ring-[#15554f]/20",
        arrow: "text-[#8c9587]",
        amberBox: "bg-amber-50 text-amber-800",
        roseBox: "bg-rose-50 text-rose-700",
        successBox: "bg-emerald-50 text-emerald-700",
        infoBox: "bg-[#e2eee8] text-[#15554f]",
        chip: "bg-[#edf0eb]",
      };

  const inputClass = `w-full rounded-xl border px-3 py-2 text-xs outline-none focus:border-[#15554f] ${t.field}`;
  const selectClass = `w-full rounded-xl border py-2 pl-9 pr-3 text-xs outline-none focus:border-[#15554f] ${t.field}`;
  const labelClass = `mb-1 block text-[0.68rem] font-semibold ${t.muted}`;
  const hintClass = `text-[0.62rem] leading-5 ${t.muted}`;

  const selected = selectedId ? findField(draft.fields, selectedId) : undefined;
  const allNodes = useMemo(() => flattenAll(draft.fields), [draft.fields]);
  const leaves = useMemo(() => flattenLeaves(draft.fields), [draft.fields]);
  const paymentFields = useMemo(
    () => leaves.filter((field) => field.type === "payment"),
    [leaves],
  );
  const hasPaymentField = paymentFields.length > 0;

  const update = <K extends keyof FormDefinition>(
    key: K,
    value: FormDefinition[K],
  ) => {
    setDirty(true);
    setDraft((c) => ({ ...c, [key]: value }));
  };

  const patchSelected = (patch: Partial<ProcessField>) => {
    if (!selectedId) return;
    update(
      "fields",
      mapFields(draft.fields, selectedId, (f) => ({ ...f, ...patch }) as ProcessField),
    );
  };

  const patchPayment = (patch: Partial<PaymentFieldConfig>) => {
    if (!selected) return;
    patchSelected({ payment: { ...paymentOf(selected), ...patch } });
  };

  const patchComputed = (patch: Partial<ComputedFieldConfig>) => {
    if (!selected) return;
    patchSelected({ computed: { ...computedOf(selected), ...patch } });
  };

  const patchValidation = (patch: Partial<FieldValidation>) => {
    if (!selected) return;
    const merged: FieldValidation = { ...(selected.validation ?? {}), ...patch };
    const cleaned: FieldValidation = {};
    if (merged.minLength != null) cleaned.minLength = merged.minLength;
    if (merged.maxLength != null) cleaned.maxLength = merged.maxLength;
    if (merged.min != null) cleaned.min = merged.min;
    if (merged.max != null) cleaned.max = merged.max;
    if (merged.pattern?.trim()) cleaned.pattern = merged.pattern.trim();
    if (merged.patternMessage?.trim())
      cleaned.patternMessage = merged.patternMessage.trim();
    if (merged.preset) cleaned.preset = merged.preset;
    patchSelected({
      validation: Object.keys(cleaned).length ? cleaned : undefined,
    });
  };

  const addFromPalette = (type: ExtendedFieldType | "section") => {
    const field = createField(type === "section" ? "section" : type);
    if (type === "section") {
      field.label = `بخش ${draft.fields.filter((f) => f.type === "section").length + 1}`;
      update("fields", [...draft.fields, field]);
      setSelectedId(field.id);
      setPanel("field");
      return;
    }
    const sections = draft.fields.filter((f) => f.type === "section");
    if (!sections.length) {
      const section = createField("section");
      section.label = "بخش 1";
      section.subFields = [field];
      update("fields", [...draft.fields, section]);
    } else {
      const last = sections[sections.length - 1];
      if (!last) return;
      update(
        "fields",
        draft.fields.map((f) =>
          f.id === last.id
            ? { ...f, subFields: [...(f.subFields ?? []), field] }
            : f,
        ),
      );
    }
    setSelectedId(field.id);
    setPanel("field");
  };

  /** فیلدهایی که طبق ترتیب سند مجاز به استفاده در شرط این فیلد هستند (H6). */
  const variablesForCondition = useMemo<ConditionVariable[]>(() => {
    if (!selected) return [];
    return allowedConditionSources(draft.fields, selected.id).map(variableOf);
  }, [draft.fields, selected]);

  const numericVariables = useMemo(
    () => collectVariables(draft.fields, true),
    [draft.fields],
  );

  const sameFormNumericVariables = useMemo<ConditionVariable[]>(() => {
    if (!selected) return [];
    if (selected.type === "computed") {
      return numericFieldsBefore(draft.fields, selected.id).map(variableOf);
    }
    return numericVariables;
  }, [draft.fields, numericVariables, selected]);

  const invalidConditions = useMemo(
    () => findInvalidConditionReferences(draft.fields),
    [draft.fields],
  );

  const selectedInvalidConditions = useMemo(
    () =>
      selected
        ? invalidConditions.filter((item) => item.fieldId === selected.id)
        : [],
    [invalidConditions, selected],
  );

  /* ------------------------------------------------------- اسناد مرجع (H5) */

  const uploadDocuments = async (fileList: FileList | File[]) => {
    const chosen = Array.from(fileList);
    if (!chosen.length) return;
    setDocsBusy(true);
    setDocsError("");
    try {
      for (const file of chosen) {
        const created = await uploadFormDocument(draft.id, file);
        setDocuments((current) => {
          const rest = current.filter((item) => item.id !== created.id);
          return [...rest, created];
        });
      }
    } catch (err) {
      setDocsError(
        err instanceof Error ? err.message : "بارگذاری سند ناموفق بود.",
      );
    } finally {
      setDocsBusy(false);
    }
  };

  const handleDownloadDocument = async (document: ReferenceDocument) => {
    setDocsError("");
    try {
      const blob = await downloadFormDocument(draft.id, document.id);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = document.fileName;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : "دریافت سند ناموفق بود.");
    }
  };

  const handleDeleteDocument = async (document: ReferenceDocument) => {
    setDocsBusy(true);
    setDocsError("");
    try {
      await deleteFormDocument(draft.id, document.id);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : "حذف سند ناموفق بود.");
    } finally {
      setDocsBusy(false);
    }
  };

  const handleSuggestRules = async (document: ReferenceDocument) => {
    setSuggestingId(document.id);
    setDocsError("");
    try {
      const suggested = await suggestRulesFromDocument(draft.id, document.id);
      if (!suggested.length) {
        setDocsError("از این سند قانون قابل استخراجی پیدا نشد.");
        return;
      }
      const proposal: FormAssistantProposal = {
        id: `doc-proposal-${document.id}-${Date.now()}`,
        summary: `${formatAmount(suggested.length)} قانون پیشنهادی از سند «${document.fileName}»`,
        changes: suggested.map((rule) => {
          const ruleSource = normalizeRuleSource({
            fileName: document.fileName,
            pageOrClause: rule.pageOrClause,
          });
          return {
            id: `change-${crypto.randomUUID()}`,
            kind: "add-rule" as const,
            rule: {
              id: `rule-${crypto.randomUUID()}`,
              text: rule.text,
              ...(ruleSource ? { source: ruleSource } : {}),
            },
            summary: `افزودن قانون: ${rule.text}`,
            ...(ruleSource ? { source: ruleSource } : {}),
          };
        }),
      };
      setProposals((current) => [...current, proposal]);
      setPanel("assistant");
    } catch (err) {
      setDocsError(
        err instanceof Error ? err.message : "پیشنهاد قانون از سند ناموفق بود.",
      );
    } finally {
      setSuggestingId(null);
    }
  };

  /* ------------------------------------------------------ قوانین ساخت‌یافته */

  const addRule = () => {
    update("rules", [
      ...draft.rules,
      { id: `rule-${crypto.randomUUID()}`, text: "" },
    ]);
  };

  const updateRule = (ruleId: string, patch: Partial<ValidationRule>) => {
    update(
      "rules",
      draft.rules.map((rule) => {
        if (rule.id !== ruleId) return rule;
        const next: ValidationRule = { ...rule, ...patch, id: rule.id };
        if ("source" in patch) next.source = normalizeRuleSource(patch.source);
        return next;
      }),
    );
  };

  const removeRule = (ruleId: string) =>
    update("rules", draft.rules.filter((rule) => rule.id !== ruleId));

  const toggleRuleField = (ruleId: string, fieldId: string) => {
    update(
      "rules",
      draft.rules.map((rule) => {
        if (rule.id !== ruleId) return rule;
        const current = rule.relatedFieldIds ?? [];
        const next = current.includes(fieldId)
          ? current.filter((id) => id !== fieldId)
          : [...current, fieldId];
        return {
          ...rule,
          ...(next.length ? { relatedFieldIds: next } : { relatedFieldIds: undefined }),
        };
      }),
    );
  };

  /* ------------------------------------------------------------- ذخیره‌سازی */

  const save = async () => {
    const issues: string[] = [];
    if (!draft.title.trim()) issues.push("عنوان فرم را وارد کنید.");
    if (!/^[A-Za-z0-9-]{2,30}$/.test(draft.code.trim()))
      issues.push("کد فرم باید حروف انگلیسی، عدد یا خط تیره باشد.");
    if (!draft.fields.some((f) => f.type === "section"))
      issues.push("حداقل یک بخش بسازید.");
    if (paymentFields.length > 1)
      issues.push(
        "هر فرم می‌تواند فقط یک فیلد پرداخت داشته باشد؛ تنظیمات پرداخت فرم از همان فیلد خوانده می‌شود.",
      );

    const visit = (list: ProcessField[]) => {
      for (const field of list) {
        if (!field.label.trim())
          issues.push("عنوان همه بخش‌ها و فیلدها الزامی است.");
        if (field.type === "payment") {
          const payment = paymentOf(field);
          if (!payment.gatewayId)
            issues.push(
              `درگاه پرداخت فیلد «${field.label || "پرداخت"}» را انتخاب کنید.`,
            );
          const source = payment.amountSource ?? "fixed";
          if (source === "fixed" && payment.defaultAmount == null)
            issues.push(
              `برای فیلد «${field.label || "پرداخت"}» مبلغ ثابت را وارد کنید یا منبع مبلغ را تغییر دهید.`,
            );
          if (source === "form_formula" && !payment.amountFormula?.tokens?.length)
            issues.push(
              `فرمول مبلغ برای فیلد «${field.label || "پرداخت"}» تعریف نشده است.`,
            );
          if (source === "process_variable" && !payment.processVariableId)
            issues.push(
              `متغیر پروسه برای فیلد «${field.label || "پرداخت"}» انتخاب نشده است.`,
            );
        }
        if (field.type === "computed" && !field.computed?.formula?.tokens?.length)
          issues.push(
            `فرمول فیلد محاسبه‌شده «${field.label || "بدون عنوان"}» تعریف نشده است.`,
          );
        if (field.type === "file") {
          const minFiles = field.minFiles ?? 1;
          const maxFiles = field.maxFiles ?? 1;
          if (minFiles > maxFiles)
            issues.push(
              `در فیلد «${field.label || "فایل"}» حداقل تعداد فایل از حداکثر بیشتر است.`,
            );
        }
        if (!isValidationConfigValid(field.validation))
          issues.push(
            `تنظیمات اعتبارسنجی فیلد «${field.label || "بدون عنوان"}» ناسازگار است.`,
          );
        if (field.subFields) visit(field.subFields);
      }
    };
    visit(draft.fields);

    if (issues.length) {
      setErrors(issues);
      setPanel("meta");
      return;
    }

    const firstPayment = paymentFields[0];
    const projection = firstPayment ? paymentOf(firstPayment) : undefined;
    // پروجکشن پرداخت فرم از فیلد پرداخت مشتق می‌شود تا فهرست فرم‌ها هرگز
    // «درگاه انتخاب نشده» را برای فرم پیکربندی‌شده نشان ندهد (M4).
    const payment = projection
      ? {
          fieldId: firstPayment?.id ?? "",
          gatewayId: projection.gatewayId ?? "",
          amountSource: projection.amountSource ?? "fixed",
          ...(projection.defaultAmount != null
            ? { defaultAmount: projection.defaultAmount }
            : {}),
          ...(projection.amountFormula?.tokens?.length
            ? { amountFormula: projection.amountFormula }
            : {}),
          ...(projection.processVariableId
            ? { processVariableId: projection.processVariableId }
            : {}),
        }
      : undefined;

    // نوع فرم دیگر در پنل قابل انتخاب «پرداخت» نیست و بی‌صدا تبدیل نمی‌شود؛
    // اگر فیلد پرداخت وجود داشته باشد، نوع مؤثر «پرداخت» است.
    const resolvedType: FormType = hasPaymentField
      ? "payment"
      : draft.formType === "payment"
        ? "standard"
        : draft.formType;

    let ok = false;
    try {
      ok = await onSave({
        ...draft,
        formType: resolvedType,
        ...(payment ? { payment } : { payment: undefined }),
        referenceDocuments: documents,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      // Server-side validation (duplicate title, bad field...) stays visible here.
      setErrors([
        error instanceof Error ? error.message : "ذخیره فرم ناموفق بود.",
      ]);
      setPanel("meta");
      return;
    }
    if (ok) onClose();
  };

  /* ------------------------------------------------ L3: بستن و حذف ایمن */

  const requestClose = () => {
    if (dirty) {
      setAskClose(true);
      return;
    }
    onClose();
  };

  const deleteFieldNow = (field: ProcessField) => {
    update("fields", removeField(draft.fields, field.id));
    if (selectedId === field.id) {
      setSelectedId(null);
      setPanel("none");
    }
    setFieldToDelete(null);
  };

  const requestDeleteSelected = () => {
    if (!selected) return;
    const nested = countLeaves([selected]);
    if ((selected.type === "section" || selected.type === "repeater") && nested > 0) {
      // حذف بخش/جدول دارای محتوا فقط با تأیید صریح انجام می‌شود.
      setFieldToDelete(selected);
      return;
    }
    deleteFieldNow(selected);
  };

  const selectField = (id: string) => {
    setSelectedId(id);
    setPanel("field");
    setValidationSample("");
  };

  /* ---------- دستیار هوشمند ---------- */
  const addMessage = async () => {
    if (!chatText.trim() && files.length === 0) return;
    const prompt = chatText.trim();
    const attachedFiles = [...files];
    setChatLog((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        text: prompt || "فایل پیوست‌شده",
        files: attachedFiles.map((file) => file.name),
      },
    ]);
    setChatText("");
    setFiles([]);
    setAssistantError("");

    if (onRequestAssistantProposal) {
      setAssistantBusy(true);
      try {
        const result = await onRequestAssistantProposal({
          prompt,
          files: attachedFiles,
          currentForm: {
            id: draft.id,
            title: draft.title,
            formType: draft.formType,
            fields: draft.fields,
            rules: draft.rules,
          },
        });
        if (
          !Array.isArray(result) ||
          result.some((p) => !p.id || !Array.isArray(p.changes))
        ) {
          throw new Error("پاسخ دستیار با ساختار پیشنهادهای فرم سازگار نیست.");
        }
        setProposals((current) => [...current, ...result]);
      } catch (err) {
        console.error("دستیار فرم:", err);
        setAssistantError(
          err instanceof Error ? err.message : "دریافت پیشنهاد از دستیار ناموفق بود.",
        );
      } finally {
        setAssistantBusy(false);
      }
    }
  };

  const acceptProposalChange = (change: FormAssistantChange) => {
    if (change.kind === "add-field") {
      const section = draft.fields.find(
        (field) => field.id === change.sectionId && field.type === "section",
      );
      if (!section || allNodes.some((f) => f.id === change.field.id)) {
        setAssistantError("پیشنهاد فیلد معتبر نیست یا بخش مقصد پیدا نشد.");
        return;
      }
      update(
        "fields",
        draft.fields.map((field) =>
          field.id === section.id
            ? {
                ...field,
                subFields: [...(field.subFields ?? []), change.field],
              }
            : field,
        ),
      );
    } else if (change.kind === "update-field") {
      if (!allNodes.some((f) => f.id === change.fieldId)) {
        setAssistantError("فیلد پیشنهادی برای ویرایش پیدا نشد.");
        return;
      }
      update("fields", updateFieldTree(draft.fields, change.fieldId, change.after));
    } else {
      if (draft.rules.some((rule) => rule.id === change.rule.id)) {
        setAssistantError("شناسه قانون پیشنهادی تکراری است.");
        return;
      }
      const rule: ValidationRule = {
        ...change.rule,
        source:
          normalizeRuleSource(change.rule.source) ??
          normalizeRuleSource(change.source),
      };
      update("rules", [
        ...draft.rules,
        { ...rule, ...(rule.source ? {} : { source: undefined }) },
      ]);
    }
    setProposalDecisions((current) => ({ ...current, [change.id]: "accepted" }));
    setAssistantError("");
  };

  /* ---------- بوم ---------- */
  const renderCanvasField = (field: ProcessField) => {
    const active = field.id === selectedId && panel === "field";
    const isPay = field.type === "payment";
    const validationCount = describeValidation(field.validation).length;

    if (field.type === "section") {
      return (
        <div
          key={field.id}
          className={`rounded-2xl border p-3 ${t.card} ${active ? t.selected : ""}`}
        >
          <button
            type="button"
            onClick={() => selectField(field.id)}
            className="mb-3 flex w-full items-center justify-between text-right"
          >
            <span className="text-sm font-bold">
              {field.label || "بخش بدون عنوان"}
            </span>
            <span className={`text-[0.62rem] ${t.muted}`}>
              {(field.subFields ?? []).length} فیلد
            </span>
          </button>
          <div className="space-y-2">
            {(field.subFields ?? []).map((c) => renderCanvasField(c))}
          </div>
          <button
            type="button"
            onClick={() => {
              const nf = createField("text");
              update(
                "fields",
                mapFields(draft.fields, field.id, (s) => ({
                  ...s,
                  subFields: [...(s.subFields ?? []), nf],
                })),
              );
              selectField(nf.id);
            }}
            className={`mt-2 w-full rounded-xl border border-dashed py-2 text-[0.68rem] font-semibold text-[#15554f] ${t.divider}`}
          >
            + افزودن فیلد به این بخش
          </button>
        </div>
      );
    }

    if (field.type === "repeater") {
      return (
        <button
          key={field.id}
          type="button"
          onClick={() => selectField(field.id)}
          className={`w-full rounded-xl border p-3 text-right ${t.card} ${
            active ? t.selected : "hover:border-[#15554f]/35"
          }`}
        >
          <p className="mb-2 text-xs font-bold">
            {field.label || "جدول تکرارشونده"}
            {field.required ? " *" : ""}
          </p>
          <div className={`overflow-hidden rounded-lg border text-[0.65rem] ${t.divider}`}>
            <div
              className={`grid grid-cols-3 gap-px ${isDarkMode ? "bg-white/10" : "bg-[#e1e6df]"}`}
            >
              {(field.subFields ?? []).slice(0, 3).map((c) => (
                <div
                  key={c.id}
                  className={`p-1.5 ${isDarkMode ? "bg-[#122925]" : "bg-[#f6f7f4]"}`}
                >
                  {c.label || "ستون"}
                </div>
              ))}
              {!(field.subFields ?? []).length && (
                <div className={`col-span-3 p-2 ${t.muted}`}>ستون تعریف نشده</div>
              )}
            </div>
          </div>
        </button>
      );
    }

    if (isPay) {
      const p = paymentOf(field);
      const gwName = gateways.find((g) => g.id === p.gatewayId)?.bankName;
      const source = p.amountSource ?? (p.defaultAmount != null ? "fixed" : "form_formula");
      const sourceLabel = PAYMENT_SOURCES.find((item) => item.value === source)?.label ?? "";
      return (
        <button
          key={field.id}
          type="button"
          onClick={() => selectField(field.id)}
          className={`w-full rounded-xl border p-3 text-right ${t.card} ${
            active ? t.selected : "hover:border-[#15554f]/35"
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-[#15554f]" />
            <span className="text-xs font-bold">
              {field.label || "پرداخت"}
              {field.required ? " *" : ""}
            </span>
          </div>
          <p className={`text-[0.68rem] ${t.muted}`}>
            درگاه: {gwName ?? "انتخاب نشده"} · منبع مبلغ: {sourceLabel}
            {source === "fixed" && p.defaultAmount != null
              ? ` (${formatAmount(p.defaultAmount)} ریال)`
              : ""}
          </p>
        </button>
      );
    }

    if (field.type === "computed") {
      const formulaLength = computedOf(field).formula?.tokens?.length ?? 0;
      return (
        <button
          key={field.id}
          type="button"
          onClick={() => selectField(field.id)}
          className={`w-full rounded-xl border p-2.5 text-right ${t.card} ${
            active ? t.selected : "hover:border-[#15554f]/35"
          }`}
        >
          <span className={`mb-1 flex items-center gap-1.5 text-[0.68rem] font-semibold ${t.muted}`}>
            <Calculator className="h-3.5 w-3.5 text-[#15554f]" />
            {field.label || "مقدار محاسبه‌شده"}
          </span>
          <div className={`rounded-lg border px-2 py-2 text-[0.68rem] ${t.infoBox} ${t.divider}`}>
            مقدار محاسبه‌شده (فقط خواندنی)
            {field.unit ? ` · ${unitLabel(field.unit)}` : ""}
            {formulaLength ? "" : " · فرمول تعریف نشده"}
          </div>
        </button>
      );
    }

    return (
      <button
        key={field.id}
        type="button"
        onClick={() => selectField(field.id)}
        className={`block w-full rounded-xl border p-2.5 text-right ${t.card} ${
          active ? t.selected : "hover:border-[#15554f]/35"
        }`}
      >
        <span className={`mb-1 flex items-center gap-1 text-[0.68rem] font-semibold ${t.muted}`}>
          {field.label || "فیلد بدون عنوان"}
          {field.required ? " *" : ""}
          {validationCount > 0 && (
            <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.55rem] ${t.chip}`}>
              <ShieldCheck className="h-2.5 w-2.5" />
              {formatAmount(validationCount)}
            </span>
          )}
        </span>
        {field.type === "select" ||
        field.type === "radio" ||
        field.type === "boolean" ? (
          <div className={`rounded-lg border px-2 py-2 text-[0.68rem] ${t.field}`}>
            انتخاب کنید
          </div>
        ) : field.type === "file" ? (
          <div
            className={`rounded-lg border border-dashed px-2 py-3 text-center text-[0.65rem] ${t.muted} ${t.divider}`}
          >
            بارگذاری فایل
          </div>
        ) : (
          <div className={`rounded-lg border px-2 py-2 text-[0.68rem] ${t.field}`}>
            {field.type === "number" && field.unit
              ? `عدد · ${unitLabel(field.unit)}`
              : field.type === "date"
                ? "تاریخ شمسی"
                : "متن را وارد کنید..."}
          </div>
        )}
      </button>
    );
  };

  /* ---------- کشوی اطلاعات پایه ---------- */
  const displayFormType: FormType =
    draft.formType === "payment" ? "standard" : draft.formType;

  const renderMetaDrawer = () => (
    <div className="space-y-3 p-4">
      <label className={labelClass}>
        عنوان فرم *
        <input
          value={draft.title}
          onChange={(e) => update("title", e.target.value)}
          className={`${inputClass} mt-1`}
          placeholder="مثلاً فرم مشخصات ملک"
        />
      </label>
      <label className={labelClass}>
        واحد متولی
        <input
          value={draft.department}
          onChange={(e) => update("department", e.target.value)}
          className={`${inputClass} mt-1`}
        />
      </label>

      <div>
        <span className={labelClass}>نوع فرم</span>
        {hasPaymentField ? (
          <p className={`rounded-xl border px-3 py-2 text-[0.68rem] ${t.infoBox} ${t.divider}`}>
            پرداخت — چون این فرم فیلد پرداخت دارد
          </p>
        ) : (
          <ThemedSelect
            value={displayFormType}
            onChange={(e) => update("formType", e.target.value as FormType)}
            className={selectClass}
            arrowClassName={`left-3 ${t.arrow}`}
            wrapperClassName="block w-full"
          >
            <option value="standard">عادی</option>
            <option value="document">بارگذاری مدرک</option>
          </ThemedSelect>
        )}
        {draft.formType === "payment" && !hasPaymentField && (
          <p className={`mt-1.5 rounded-lg px-2 py-1 text-[0.62rem] ${t.amberBox}`}>
            این فرم قبلاً از نوع «پرداخت» بوده اما فیلد پرداخت ندارد؛ با ذخیره به
            «عادی» تبدیل می‌شود.
          </p>
        )}
        {hasPaymentField && (
          <p className={`mt-1.5 ${hintClass}`}>
            تنظیمات درگاه و مبلغ از فیلد پرداخت خوانده می‌شود و فهرست فرم‌ها را
            خودکار هم‌گام نگه می‌دارد.
          </p>
        )}
      </div>

      <label className={labelClass}>
        توضیحات
        <textarea
          rows={3}
          value={draft.description}
          onChange={(e) => update("description", e.target.value)}
          className={`${inputClass} mt-1 resize-y`}
        />
      </label>
      <label className={labelClass}>
        راهنمای تکمیل برای متقاضی
        <textarea
          rows={3}
          value={draft.applicantGuidance}
          onChange={(e) => update("applicantGuidance", e.target.value)}
          className={`${inputClass} mt-1 resize-y`}
        />
      </label>

      {/* اسناد مرجع (H5) */}
      <section className={`space-y-2 rounded-xl border p-3 ${t.panel}`}>
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[0.7rem] font-bold">
            <Paperclip className="h-3.5 w-3.5 text-[#15554f]" />
            اسناد مرجع
          </p>
          {docsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin opacity-60" />}
        </div>
        <p className={hintClass}>
          بخشنامه، دستورالعمل یا نمونه‌ی تکمیل‌شده را بارگذاری کنید؛ متن سند در
          پس‌زمینه استخراج می‌شود و می‌توانید از آن پیشنهاد قانون بگیرید.
        </p>

        <input
          ref={docInputRef}
          className="hidden"
          type="file"
          multiple
          accept={DOCUMENT_FILES}
          onChange={(e) => {
            const chosen = e.target.files;
            e.currentTarget.value = "";
            if (chosen) void uploadDocuments(chosen);
          }}
        />
        <button
          type="button"
          disabled={docsBusy}
          onClick={() => docInputRef.current?.click()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#15554f]/40 py-2 text-[0.68rem] font-semibold text-[#15554f] disabled:opacity-50"
        >
          {docsBusy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          بارگذاری PDF / Word / تصویر
        </button>

        {documents.length > 0 && (
          <ul className="space-y-1.5">
            {documents.map((document) => (
              <li
                key={document.id}
                className={`rounded-lg border p-2 ${t.card}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[0.68rem] font-semibold" title={document.fileName}>
                      {document.fileName}
                    </p>
                    <p className={`mt-0.5 text-[0.6rem] ${t.muted}`}>
                      {formatBytes(document.size)} · {EXTRACTION_LABEL[document.extractionStatus]}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      aria-label={`پیشنهاد قانون از ${document.fileName}`}
                      title="پیشنهاد قانون از این سند"
                      disabled={suggestingId === document.id}
                      onClick={() => void handleSuggestRules(document)}
                      className="rounded-md p-1 text-[#15554f] hover:bg-[#15554f]/10 disabled:opacity-40"
                    >
                      {suggestingId === document.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label={`دریافت ${document.fileName}`}
                      title="دریافت سند"
                      onClick={() => void handleDownloadDocument(document)}
                      className="rounded-md p-1 text-[#15554f] hover:bg-[#15554f]/10"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`حذف ${document.fileName}`}
                      title="حذف سند"
                      onClick={() => setDocToDelete(document)}
                      className="rounded-md p-1 text-rose-600 hover:bg-rose-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!documents.length && !docsLoading && (
          <p className={`text-center text-[0.62rem] ${t.muted}`}>سندی ثبت نشده است.</p>
        )}
        {docsError && (
          <p role="alert" className={`rounded-lg p-2 text-[0.62rem] ${t.roseBox}`}>
            {docsError}
          </p>
        )}
      </section>

      {/* قوانین ساخت‌یافته (H4) */}
      <section className={`space-y-2 rounded-xl border p-3 ${t.panel}`}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.7rem] font-bold">قوانین و مستندات</p>
          <button
            type="button"
            onClick={addRule}
            className="inline-flex items-center gap-1 text-[0.65rem] font-semibold text-[#15554f]"
          >
            <Plus className="h-3 w-3" />
            قانون
          </button>
        </div>
        <p className={hintClass}>
          قوانین متنی راهنمای عامل هوشمند هستند؛ محدودیت‌های قطعی را در بخش
          «اعتبارسنجی» هر فیلد تعریف کنید.
        </p>
        {draft.rules.map((rule, index) => (
          <article key={rule.id} className={`space-y-1.5 rounded-lg border p-2 ${t.card}`}>
            <div className="flex items-start gap-1.5">
              <span className={`mt-1.5 w-4 shrink-0 text-center text-[0.6rem] ${t.muted}`}>
                {formatAmount(index + 1)}
              </span>
              <textarea
                rows={2}
                value={rule.text}
                onChange={(event) => updateRule(rule.id, { text: event.target.value })}
                className={`${inputClass} resize-y`}
                placeholder="مثلاً کد ملی باید ۱۰ رقم باشد."
              />
              <button
                type="button"
                aria-label="حذف قانون"
                onClick={() => removeRule(rule.id)}
                className="mt-1 rounded-md p-1 text-rose-600 hover:bg-rose-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                value={rule.source?.fileName ?? ""}
                onChange={(event) =>
                  updateRule(rule.id, {
                    source: {
                      fileName: event.target.value,
                      pageOrClause: rule.source?.pageOrClause,
                    },
                  })
                }
                className={inputClass}
                placeholder="نام سند منبع"
              />
              <input
                value={rule.source?.pageOrClause ?? ""}
                onChange={(event) =>
                  updateRule(rule.id, {
                    source: {
                      fileName: rule.source?.fileName ?? "",
                      pageOrClause: event.target.value,
                    },
                  })
                }
                className={inputClass}
                placeholder="صفحه / بند"
              />
            </div>
            <details>
              <summary className={`cursor-pointer text-[0.62rem] ${t.muted}`}>
                فیلدهای مرتبط
                {(rule.relatedFieldIds ?? []).length > 0
                  ? ` (${formatAmount((rule.relatedFieldIds ?? []).length)})`
                  : ""}
              </summary>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {leaves
                  .filter((field) => field.type !== "payment")
                  .map((field) => {
                    const active = (rule.relatedFieldIds ?? []).includes(field.id);
                    return (
                      <button
                        key={field.id}
                        type="button"
                        onClick={() => toggleRuleField(rule.id, field.id)}
                        className={`rounded-full border px-2 py-0.5 text-[0.6rem] transition ${
                          active
                            ? "border-[#15554f] bg-[#15554f]/10 text-[#15554f]"
                            : t.quiet
                        }`}
                      >
                        {field.label || "بدون عنوان"}
                      </button>
                    );
                  })}
              </div>
            </details>
          </article>
        ))}
        {!draft.rules.length && (
          <p className={`text-center text-[0.62rem] ${t.muted}`}>
            هنوز قانونی ثبت نشده است.
          </p>
        )}
      </section>

      <p className={`text-[0.62rem] ${t.muted}`} dir="ltr">
        کد: {draft.code}
      </p>
    </div>
  );

  /* ---------- کشوی فرم‌ساز هوشمند ---------- */
  const renderAssistantDrawer = () => (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className={`rounded-xl border p-3 text-[0.68rem] leading-5 ${t.amberBox}`}>
          {onRequestAssistantProposal
            ? "فایل نمونه (PDF، Word، تصویر) یا توضیح متنی بفرستید تا پیشنهاد فیلد و قانون ساخته شود. بعد از بررسی، تأیید کنید تا روی بوم اعمال شود."
            : "سرویس هوش مصنوعی هنوز پیکربندی نشده است. فایل‌ها و پیام‌ها فقط در همین جلسه نگه داشته می‌شوند. برای فعال‌سازی، onRequestAssistantProposal را به مودال پاس دهید."}
        </div>

        {/* ناحیه آپلود */}
        <div
          className={`rounded-xl border border-dashed p-4 text-center ${t.divider}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = Array.from(e.dataTransfer.files ?? []);
            if (dropped.length) setFiles((c) => [...c, ...dropped]);
          }}
        >
          <Upload className="mx-auto mb-2 h-6 w-6 text-[#15554f]" />
          <p className={`text-[0.7rem] font-semibold ${t.muted}`}>
            PDF · Word · Excel · تصویر
          </p>
          <p className={`mt-1 text-[0.62rem] ${t.muted}`}>
            بکشید و رها کنید یا انتخاب کنید
          </p>
          <input
            ref={fileRef}
            className="hidden"
            type="file"
            multiple
            accept={SUPPORTED_FILES}
            onChange={(e) => {
              setFiles((c) => [...c, ...Array.from(e.target.files ?? [])]);
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-[#15554f]/30 bg-[#15554f]/10 px-3 py-1.5 text-[0.68rem] font-semibold text-[#15554f]"
          >
            <Paperclip className="h-3.5 w-3.5" />
            انتخاب فایل
          </button>
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {files.map((file) => (
              <span
                key={`${file.name}-${file.lastModified}`}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.65rem] ${t.chip}`}
              >
                {file.name}
                <button
                  type="button"
                  aria-label={`حذف ${file.name}`}
                  className="text-rose-500"
                  onClick={() =>
                    setFiles((c) => c.filter((item) => item !== file))
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {chatLog.map((entry) => (
          <div key={entry.id} className={`rounded-xl p-3 text-xs ${t.chip}`}>
            <p>{entry.text}</p>
            {entry.files.length > 0 && (
              <p className={`mt-1.5 ${t.muted}`}>
                پیوست: {entry.files.join("، ")}
              </p>
            )}
          </div>
        ))}

        <AssistantProposalReview
          proposals={proposals}
          decisions={proposalDecisions}
          onAccept={acceptProposalChange}
          onReject={(changeId) =>
            setProposalDecisions((c) => ({ ...c, [changeId]: "rejected" }))
          }
        />

        {assistantError && (
          <p role="alert" className={`rounded-lg p-2 text-xs ${t.roseBox}`}>
            {assistantError}
          </p>
        )}
      </div>

      {/* ورودی پایین کشو */}
      <div className={`shrink-0 space-y-2 border-t p-3 ${t.divider}`}>
        <textarea
          className={inputClass}
          rows={2}
          placeholder="مثلاً: از این بخشنامه فیلدهای فرم ثبت ملک را استخراج کن..."
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void addMessage();
            }
          }}
        />
        <button
          type="button"
          onClick={() => void addMessage()}
          disabled={assistantBusy || (!chatText.trim() && files.length === 0)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#15554f] px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-[#246b61] disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          {assistantBusy
            ? "در حال دریافت پیشنهاد..."
            : onRequestAssistantProposal
              ? "ارسال برای ساخت خودکار"
              : "ثبت پیام محلی"}
        </button>
      </div>
    </div>
  );

  const replaceSelected = (next: ProcessField) => {
    if (!selectedId) return;
    update("fields", mapFields(draft.fields, selectedId, () => next));
  };

  const renderUnitPicker = (field: ProcessField) => {
    const category = UNIT_CATEGORIES.find((c) => c.id === field.unitCategory);
    return (
      <>
        <label className={labelClass}>
          دسته واحد
          <ThemedSelect
            value={field.unitCategory ?? ""}
            onChange={(e) => {
              const next = UNIT_CATEGORIES.find((c) => c.id === e.target.value);
              patchSelected({
                unitCategory: next?.id as UnitCategoryId | undefined,
                unit: next?.units[0]?.id,
              });
            }}
            className={selectClass}
            arrowClassName={`left-3 ${t.arrow}`}
            wrapperClassName="mt-1 block w-full"
          >
            <option value="">بدون واحد</option>
            {UNIT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </ThemedSelect>
        </label>
        {category && (
          <label className={labelClass}>
            واحد
            <ThemedSelect
              value={field.unit ?? ""}
              onChange={(e) => patchSelected({ unit: e.target.value })}
              className={selectClass}
              arrowClassName={`left-3 ${t.arrow}`}
              wrapperClassName="mt-1 block w-full"
            >
              {category.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </ThemedSelect>
          </label>
        )}
      </>
    );
  };

  /* ---------- کشوی تنظیمات فیلد ---------- */
  const renderFieldDrawer = () => {
    if (!selected) {
      return (
        <p className={`p-4 text-xs leading-6 ${t.muted}`}>
          یک فیلد یا بخش را از بوم انتخاب کنید، یا از پالت نوع جدید اضافه کنید.
        </p>
      );
    }

    const isPay = selected.type === "payment";
    const isComputed = selected.type === "computed";
    const pay = paymentOf(selected);
    const amountSource: PaymentAmountSource =
      pay.amountSource ?? (pay.defaultAmount != null ? "fixed" : "form_formula");
    const validation = selected.validation ?? {};
    const preset = VALIDATION_PRESETS.find((item) => item.id === validation.preset);
    const sampleError =
      validationSample.trim() && selected.type !== "file"
        ? validateFieldValue(selected, validationSample)
        : null;

    const conditionValue: ConditionValue =
      selected.condition?.logic && selected.condition.clauses
        ? {
            logic: selected.condition.logic,
            clauses: selected.condition.clauses,
          }
        : { logic: "and", clauses: [] };

    return (
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold">تنظیمات فیلد</h3>
          <button
            type="button"
            onClick={requestDeleteSelected}
            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-500/10"
            aria-label="حذف"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <label className={labelClass}>
          برچسب
          <input
            value={selected.label}
            onChange={(e) => patchSelected({ label: e.target.value })}
            className={`${inputClass} mt-1`}
          />
        </label>

        {/* L2: متن راهنما زیر فیلد برای متقاضی نمایش داده می‌شود. */}
        <label className={labelClass}>
          متن راهنما برای متقاضی
          <textarea
            rows={2}
            value={selected.helpText ?? ""}
            onChange={(e) =>
              patchSelected({ helpText: e.target.value.trim() ? e.target.value : undefined })
            }
            className={`${inputClass} mt-1 resize-y`}
            placeholder="مثلاً شماره را بدون خط تیره وارد کنید."
          />
        </label>

        {selected.type !== "section" && (
          <>
            <label className={labelClass}>
              نوع
              <ThemedSelect
                value={selected.type}
                onChange={(e) => {
                  const type = e.target.value as ExtendedFieldType;
                  const base = createField(type);
                  replaceSelected({
                    ...base,
                    id: selected.id,
                    label: selected.label,
                    required: type === "payment" ? true : selected.required,
                    ...(selected.condition ? { condition: selected.condition } : {}),
                    ...(selected.validation ? { validation: selected.validation } : {}),
                  });
                }}
                className={selectClass}
                arrowClassName={`left-3 ${t.arrow}`}
                wrapperClassName="mt-1 block w-full"
              >
                {PALETTE.filter((p) => p.type !== "section").map((p) => (
                  <option key={p.type} value={p.type}>
                    {p.label}
                  </option>
                ))}
              </ThemedSelect>
            </label>

            <label className={`flex items-center gap-2 text-xs ${t.muted}`}>
              <input
                type="checkbox"
                className="accent-[#15554f]"
                checked={selected.required}
                disabled={isPay}
                onChange={(e) => patchSelected({ required: e.target.checked })}
              />
              اجباری
              {isPay && <span className={hintClass}>(فیلد پرداخت همیشه اجباری است)</span>}
            </label>
          </>
        )}

        {isComputed && (
          <div className={`space-y-3 rounded-xl border p-3 ${t.panel}`}>
            <p className="flex items-center gap-1.5 text-[0.7rem] font-bold text-[#15554f]">
              <Calculator className="h-3.5 w-3.5" />
              محاسبه در همین فرم
            </p>
            <p className={hintClass}>
              مقدار این فیلد فقط خواندنی است و در زمان تکمیل فرم از فیلدهای عددی
              قبلی همین فرم محاسبه می‌شود. محاسبه بین فرم‌ها در سطح پروسه انجام
              می‌شود.
            </p>
            <div>
              <p className={`mb-1.5 text-[0.68rem] font-semibold ${t.muted}`}>
                فرمول
              </p>
              <ConditionFormulaEditor
                mode="formula"
                variables={sameFormNumericVariables}
                value={computedOf(selected).formula ?? { tokens: [] }}
                onChange={(formula) => patchComputed({ formula })}
              />
            </div>
            {!sameFormNumericVariables.length && (
              <p className={`rounded-lg p-2 text-[0.62rem] ${t.amberBox}`}>
                برای استفاده در فرمول، ابتدا یک فیلد عددی بالاتر از این فیلد
                بسازید.
              </p>
            )}
            {renderUnitPicker(selected)}
          </div>
        )}

        {isPay && (
          <div className={`space-y-3 rounded-xl border p-3 ${t.panel}`}>
            <p className="flex items-center gap-1.5 text-[0.7rem] font-bold text-[#15554f]">
              <CreditCard className="h-3.5 w-3.5" />
              تنظیمات درگاه و مبلغ
            </p>
            <label className={labelClass}>
              درگاه پرداخت *
              <ThemedSelect
                value={pay.gatewayId ?? ""}
                onChange={(e) => patchPayment({ gatewayId: e.target.value })}
                className={selectClass}
                arrowClassName={`left-3 ${t.arrow}`}
                wrapperClassName="mt-1 block w-full"
              >
                <option value="">انتخاب درگاه</option>
                {gateways.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.bankName}
                  </option>
                ))}
              </ThemedSelect>
            </label>

            <div>
              <p className={`mb-1.5 text-[0.68rem] font-semibold ${t.muted}`}>
                منبع مبلغ *
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {PAYMENT_SOURCES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    title={option.hint}
                    onClick={() => patchPayment({ amountSource: option.value })}
                    className={`rounded-lg border px-1.5 py-1.5 text-[0.62rem] transition ${
                      amountSource === option.value
                        ? "border-[#15554f] bg-[#15554f]/10 text-[#15554f]"
                        : t.quiet
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {amountSource === "fixed" && (
              <label className={labelClass}>
                مبلغ ثابت (ریال) *
                <input
                  type="number"
                  min={0}
                  value={pay.defaultAmount ?? ""}
                  onChange={(e) =>
                    patchPayment({
                      defaultAmount:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                  className={`${inputClass} mt-1`}
                  placeholder="مثلاً ۲۵۰۰۰۰۰"
                />
              </label>
            )}

            {amountSource === "form_formula" && (
              <div>
                <p className={`mb-1.5 text-[0.68rem] font-semibold ${t.muted}`}>
                  فرمول مبلغ (فیلدهای عددی همین فرم)
                </p>
                <ConditionFormulaEditor
                  mode="formula"
                  variables={numericVariables}
                  value={pay.amountFormula ?? { tokens: [] }}
                  onChange={(amountFormula) => patchPayment({ amountFormula })}
                />
              </div>
            )}

            {amountSource === "process_variable" && (
              <label className={labelClass}>
                متغیر محاسبه‌شده‌ی پروسه *
                {processVariables.length ? (
                  <ThemedSelect
                    value={pay.processVariableId ?? ""}
                    onChange={(e) =>
                      patchPayment({
                        processVariableId: e.target.value || undefined,
                      })
                    }
                    className={selectClass}
                    arrowClassName={`left-3 ${t.arrow}`}
                    wrapperClassName="mt-1 block w-full"
                  >
                    <option value="">انتخاب متغیر</option>
                    {processVariables.map((variable) => (
                      <option key={variable.id} value={variable.id}>
                        {variable.name}
                      </option>
                    ))}
                  </ThemedSelect>
                ) : (
                  <input
                    value={pay.processVariableId ?? ""}
                    onChange={(e) =>
                      patchPayment({
                        processVariableId: e.target.value || undefined,
                      })
                    }
                    className={`${inputClass} mt-1`}
                    placeholder="شناسه متغیر محاسبه‌شده در پروسه"
                    dir="ltr"
                  />
                )}
              </label>
            )}

            <p className={hintClass}>
              مبلغ این فیلد یا عددی ثابت است، یا از فرمول فیلدهای عددی همین فرم
              محاسبه می‌شود، یا از یک مقدار محاسبه‌شده‌ی سطح پروسه خوانده
              می‌شود؛ حالت سوم فقط وقتی معتبر است که همان متغیر در پروسه به این
              فیلد پرداخت متصل شده باشد.
            </p>
          </div>
        )}

        {selected.type === "number" && (
          <>{renderUnitPicker(selected)}</>
        )}

        {(selected.type === "select" || selected.type === "radio") && (
          <label className={labelClass}>
            گزینه‌ها (هر خط یک گزینه)
            <textarea
              rows={3}
              value={(selected.options ?? []).join("\n")}
              onChange={(e) =>
                patchSelected({
                  options: e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              className={`${inputClass} mt-1 resize-y`}
            />
          </label>
        )}

        {selected.type === "file" && (
          <>
            <label className={labelClass}>
              فرمت‌های مجاز (با کاما)
              <input
                value={(selected.allowedFileTypes ?? []).join(", ")}
                onChange={(e) =>
                  patchSelected({
                    allowedFileTypes: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                className={`${inputClass} mt-1`}
                dir="ltr"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className={labelClass}>
                حداقل تعداد فایل
                <input
                  type="number"
                  min={0}
                  value={selected.minFiles ?? 1}
                  onChange={(e) =>
                    patchSelected({ minFiles: Number(e.target.value) })
                  }
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className={labelClass}>
                حداکثر تعداد فایل
                <input
                  type="number"
                  min={1}
                  value={selected.maxFiles ?? 1}
                  onChange={(e) =>
                    patchSelected({ maxFiles: Number(e.target.value) })
                  }
                  className={`${inputClass} mt-1`}
                />
              </label>
            </div>
            <label className={labelClass}>
              حداکثر حجم هر فایل (MB)
              <input
                type="number"
                min={1}
                value={selected.maxFileSizeMb ?? 10}
                onChange={(e) =>
                  patchSelected({ maxFileSizeMb: Number(e.target.value) })
                }
                className={`${inputClass} mt-1`}
              />
            </label>
            {(selected.minFiles ?? 1) > (selected.maxFiles ?? 1) && (
              <p className={`rounded-lg p-2 text-[0.62rem] ${t.roseBox}`}>
                حداقل تعداد فایل نباید از حداکثر بیشتر باشد.
              </p>
            )}
          </>
        )}

        {selected.type === "repeater" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className={labelClass}>
                حداقل ردیف
                <input
                  type="number"
                  min={0}
                  value={selected.minRows ?? 0}
                  onChange={(e) =>
                    patchSelected({ minRows: Number(e.target.value) })
                  }
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className={labelClass}>
                حداکثر ردیف
                <input
                  type="number"
                  min={1}
                  value={selected.maxRows ?? 10}
                  onChange={(e) =>
                    patchSelected({ maxRows: Number(e.target.value) })
                  }
                  className={`${inputClass} mt-1`}
                />
              </label>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className={labelClass}>ستون‌های جدول</span>
                <button
                  type="button"
                  onClick={() =>
                    patchSelected({
                      subFields: [...(selected.subFields ?? []), createField()],
                    })
                  }
                  className="text-[0.65rem] font-semibold text-[#15554f]"
                >
                  + ستون
                </button>
              </div>
              <div className="space-y-1.5">
                {(selected.subFields ?? []).map((sub) => (
                  <div key={sub.id} className="flex gap-1.5">
                    <input
                      value={sub.label}
                      placeholder="عنوان ستون"
                      onChange={(e) =>
                        patchSelected({
                          subFields: (selected.subFields ?? []).map((s) =>
                            s.id === sub.id
                              ? { ...s, label: e.target.value }
                              : s,
                          ),
                        })
                      }
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        patchSelected({
                          subFields: (selected.subFields ?? []).filter(
                            (s) => s.id !== sub.id,
                          ),
                        })
                      }
                      aria-label="حذف ستون"
                      className="rounded-lg p-2 text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {!(selected.subFields ?? []).length && (
                  <p className={`text-[0.62rem] ${t.muted}`}>
                    ستونی تعریف نشده است.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {!isPay && !isComputed && selected.type !== "section" && (
          <details className={`rounded-xl border p-2.5 ${t.panel}`}>
            <summary className={`cursor-pointer text-[0.68rem] font-semibold ${t.muted}`}>
              اعتبارسنجی ماشین‌خوان
              {describeValidation(validation).length > 0
                ? ` (${formatAmount(describeValidation(validation).length)})`
                : ""}
            </summary>
            <div className="mt-2 space-y-2">
              <p className={hintClass}>
                این قیود هم در پیش‌نمایش و هم در سرور (فرم متقاضی و عامل هوشمند)
                یکسان اعمال می‌شوند.
              </p>
              <label className={labelClass}>
                قالب آماده
                <ThemedSelect
                  value={validation.preset ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) {
                      patchSelected({ validation: undefined });
                      return;
                    }
                    patchSelected({
                      validation: applyValidationPreset(value as ValidationPreset),
                    });
                  }}
                  className={selectClass}
                  arrowClassName={`left-3 ${t.arrow}`}
                  wrapperClassName="mt-1 block w-full"
                >
                  <option value="">بدون قالب</option>
                  {VALIDATION_PRESETS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </ThemedSelect>
              </label>
              {preset && (
                <p className={`rounded-lg px-2 py-1 text-[0.62rem] ${t.infoBox}`}>
                  {preset.label}: {preset.hint}
                </p>
              )}

              {selected.type === "number" ? (
                <div className="grid grid-cols-2 gap-1.5">
                  <label className={labelClass}>
                    حداقل مقدار
                    <input
                      type="number"
                      value={validation.min ?? ""}
                      onChange={(e) =>
                        patchValidation({
                          min:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </label>
                  <label className={labelClass}>
                    حداکثر مقدار
                    <input
                      type="number"
                      value={validation.max ?? ""}
                      onChange={(e) =>
                        patchValidation({
                          max:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </label>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  <label className={labelClass}>
                    حداقل نویسه
                    <input
                      type="number"
                      min={0}
                      value={validation.minLength ?? ""}
                      onChange={(e) =>
                        patchValidation({
                          minLength:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </label>
                  <label className={labelClass}>
                    حداکثر نویسه
                    <input
                      type="number"
                      min={0}
                      value={validation.maxLength ?? ""}
                      onChange={(e) =>
                        patchValidation({
                          maxLength:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                      className={`${inputClass} mt-1`}
                    />
                  </label>
                </div>
              )}

              <label className={labelClass}>
                الگوی سفارشی (RegEx)
                <input
                  value={validation.pattern ?? ""}
                  onChange={(e) => patchValidation({ pattern: e.target.value })}
                  className={`${inputClass} mt-1`}
                  dir="ltr"
                  placeholder="^09\d{9}$"
                />
              </label>
              {validation.pattern && (
                <label className={labelClass}>
                  پیام خطای الگو
                  <input
                    value={validation.patternMessage ?? ""}
                    onChange={(e) =>
                      patchValidation({ patternMessage: e.target.value })
                    }
                    className={`${inputClass} mt-1`}
                    placeholder="قالب وارد شده معتبر نیست."
                  />
                </label>
              )}

              {!isValidationConfigValid(validation) && (
                <p className={`rounded-lg p-2 text-[0.62rem] ${t.roseBox}`}>
                  تنظیمات اعتبارسنجی ناسازگار است (حداقل بزرگ‌تر از حداکثر یا
                  الگوی نامعتبر).
                </p>
              )}

              <div>
                <p className={`mb-1 text-[0.62rem] font-semibold ${t.muted}`}>
                  آزمایش مقدار
                </p>
                <div className="flex items-center gap-1.5">
                  <input
                    value={validationSample}
                    onChange={(e) => setValidationSample(e.target.value)}
                    className={inputClass}
                    dir="ltr"
                    placeholder="مقدار نمونه"
                  />
                  <span
                    className={`shrink-0 rounded-lg px-2 py-1 text-[0.6rem] ${
                      sampleError
                        ? t.roseBox
                        : validationSample.trim()
                          ? t.successBox
                          : t.chip
                    }`}
                  >
                    {sampleError ?? (validationSample.trim() ? "معتبر" : "—")}
                  </span>
                </div>
              </div>
            </div>
          </details>
        )}

        <details
          className={`rounded-xl border p-2.5 ${t.panel}`}
          open={selectedInvalidConditions.length > 0}
        >
          <summary className={`cursor-pointer text-[0.68rem] font-semibold ${t.muted}`}>
            شرط نمایش (اختیاری)
          </summary>
          <div className="mt-2 space-y-2">
            {selectedInvalidConditions.length > 0 && (
              <div className={`space-y-1.5 rounded-lg p-2 text-[0.62rem] ${t.amberBox}`}>
                <p className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  این شرط به فیلدی ارجاع می‌دهد که قبل از این فیلد نیست.
                </p>
                <button
                  type="button"
                  onClick={() => patchSelected({ condition: undefined })}
                  className="rounded-lg border border-current/30 px-2 py-1 font-semibold"
                >
                  حذف این شرط
                </button>
              </div>
            )}
            {variablesForCondition.length ? (
              <ConditionFormulaEditor
                mode="condition"
                variables={variablesForCondition}
                value={conditionValue}
                onChange={(condition) => patchSelected({ condition })}
              />
            ) : (
              <p className={`text-[0.65rem] ${t.muted}`}>
                فیلد مجازی قبل از این مورد برای شرط وجود ندارد.
              </p>
            )}
            <p className={hintClass}>
              فقط فیلدهای قبلی در ترتیب سند قابل ارجاع هستند تا وابستگی چرخه‌ای
              ایجاد نشود.
            </p>
          </div>
        </details>
      </div>
    );
  };

  const drawerOpen =
    panel === "meta" || panel === "field" || panel === "assistant";
  const drawerTitle =
    panel === "meta"
      ? "اطلاعات پایه فرم"
      : panel === "assistant"
        ? "فرم‌ساز هوشمند"
        : panel === "field"
          ? "تنظیمات فیلد"
          : "";

  const modalTitle = initial ? "ویرایش فرم" : "ثبت فرم جدید";
  const brokenFieldIds = Array.from(
    new Set(invalidConditions.map((item) => item.fieldId)),
  );

  return (
    <Modal open={open} onClose={requestClose} title={modalTitle} fullScreen>
      <div className="flex min-h-0 flex-1 flex-col" dir="rtl">
        {/* نوار ابزار */}
        <div
          className={`mb-3 flex shrink-0 flex-wrap items-center gap-2 border-b pb-3 ${t.divider}`}
        >
          <button
            type="button"
            onClick={() => setPanel(panel === "meta" ? "none" : "meta")}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs ${
              panel === "meta"
                ? "border-[#15554f] bg-[#15554f]/10 text-[#15554f]"
                : t.quiet
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            اطلاعات پایه
          </button>
          <button
            type="button"
            onClick={() =>
              setPanel(panel === "assistant" ? "none" : "assistant")
            }
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs ${
              panel === "assistant"
                ? "border-[#15554f] bg-[#15554f]/10 text-[#15554f]"
                : t.quiet
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            فرم‌ساز هوشمند
          </button>
          <span className={`text-[0.65rem] ${t.muted}`} dir="ltr">
            {draft.code}
          </span>
          <span className={`mr-auto text-[0.65rem] ${t.muted}`}>
            {formatAmount(countLeaves(draft.fields))} فیلد ·{" "}
            {formatAmount(draft.rules.length)} قانون
          </span>
        </div>

        {errors.length > 0 && (
          <div
            role="alert"
            className="mb-3 shrink-0 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-600"
          >
            {errors.map((e) => (
              <p key={e}>• {e}</p>
            ))}
          </div>
        )}

        <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
          {/* پالت */}
          <aside
            className={`flex w-28 shrink-0 flex-col overflow-hidden rounded-2xl border sm:w-36 ${t.card}`}
          >
            <div
              className={`border-b px-2 py-2.5 text-center text-[0.7rem] font-bold sm:text-xs ${t.divider}`}
            >
              انواع فیلد
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
              {PALETTE.map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addFromPalette(type)}
                  className={`flex w-full flex-col items-center gap-1 rounded-xl border px-1.5 py-2 text-[0.65rem] transition sm:flex-row sm:text-right sm:text-[0.7rem] ${t.quiet}`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-[#15554f]" />
                  <span className="leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </aside>

          {/* بوم */}
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            {invalidConditions.length > 0 && (
              <div
                className={`shrink-0 rounded-xl border p-2.5 text-[0.68rem] ${t.amberBox} ${t.divider}`}
              >
                <p className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {formatAmount(invalidConditions.length)} ارجاع نامعتبر در
                  شرط‌های نمایش
                </p>
                <p className={`mt-1 ${hintClass}`}>
                  این شرط‌ها به فیلدی اشاره می‌کنند که قبل از فیلد هدف نیست یا
                  خارج از دامنه‌ی مجاز است. ذخیره بلاک نمی‌شود؛ با یک کلیک
                  می‌توانید شرط‌های نامعتبر را حذف کنید.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    update("fields", stripInvalidConditions(draft.fields, brokenFieldIds))
                  }
                  className="mt-2 rounded-lg border border-current/30 px-2.5 py-1 font-semibold"
                >
                  حذف {formatAmount(brokenFieldIds.length)} شرط نامعتبر
                </button>
              </div>
            )}

            <div
              className={`min-h-0 min-h-[min(24rem,50dvh)] flex-1 overflow-y-auto rounded-2xl border p-4 ${t.canvas} ${t.divider}`}
            >
              <div className="mb-4 text-center">
                <h3 className="text-base font-bold">
                  {draft.title || "عنوان فرم"}
                </h3>
                <p className={`mt-1 text-[0.68rem] ${t.muted}`}>
                  {draft.description || "توضیحات فرم اینجا دیده می‌شود"}
                </p>
              </div>
              <div className="mx-auto max-w-lg space-y-3">
                {draft.fields.map((f) => renderCanvasField(f))}
                {!draft.fields.length && (
                  <div
                    className={`rounded-2xl border border-dashed py-12 text-center text-xs ${t.muted} ${t.divider}`}
                  >
                    از ستون راست فیلد اضافه کنید یا با «فرم‌ساز هوشمند» از روی
                    فایل بسازید
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* کشو چپ */}
          {drawerOpen && (
            <aside
              className={`flex w-full max-w-sm shrink-0 flex-col overflow-hidden rounded-2xl border ${t.card}`}
            >
              <div
                className={`flex items-center justify-between border-b px-4 py-3 ${t.divider}`}
              >
                <span className="flex items-center gap-1.5 text-xs font-bold">
                  {panel === "assistant" && (
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  )}
                  {drawerTitle}
                </span>
                <button
                  type="button"
                  aria-label="بستن پنل"
                  onClick={() => setPanel("none")}
                  className={`rounded-lg p-1 ${t.quiet}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {panel === "meta" && (
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {renderMetaDrawer()}
                  </div>
                )}
                {panel === "field" && (
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {renderFieldDrawer()}
                  </div>
                )}
                {panel === "assistant" && renderAssistantDrawer()}
              </div>
            </aside>
          )}
        </div>

        <div
          className={`mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-1 pb-4 pt-3 sm:pb-5 ${t.divider}`}
        >
          <button
            type="button"
            onClick={requestClose}
            className={`rounded-xl border px-4 py-2 text-xs ${t.quiet}`}
          >
            انصراف
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#15554f] px-5 py-2 text-xs font-semibold text-white hover:bg-[#246b61]"
            >
              <Check className="h-3.5 w-3.5" />
              ذخیره فرم
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={Boolean(docToDelete)}
        title="حذف سند مرجع"
        message={
          docToDelete
            ? `«${docToDelete.fileName}» و متن استخراج‌شده‌ی آن حذف می‌شود. قوانینی که قبلاً از این سند ساخته شده‌اند حذف نمی‌شوند. ادامه می‌دهید؟`
            : ""
        }
        confirmLabel="حذف سند"
        danger
        onConfirm={() => {
          if (docToDelete) void handleDeleteDocument(docToDelete);
        }}
        onClose={() => setDocToDelete(null)}
      />

      <ConfirmModal
        open={Boolean(fieldToDelete)}
        title="حذف بخش دارای محتوا"
        message={
          fieldToDelete
            ? `«${fieldToDelete.label}» شامل ${formatAmount(countLeaves([fieldToDelete]))} فیلد است. با حذف آن، فیلدها، شرط‌ها و اعتبارسنجی‌های زیرمجموعه نیز حذف می‌شوند. ادامه می‌دهید؟`
            : ""
        }
        confirmLabel="حذف بخش"
        danger
        onConfirm={() => {
          if (fieldToDelete) deleteFieldNow(fieldToDelete);
        }}
        onClose={() => setFieldToDelete(null)}
      />

      <Modal
        open={askClose}
        onClose={() => setAskClose(false)}
        title="تغییرات ذخیره‌نشده"
        maxWidthClass="max-w-md"
      >
        <p className={`text-xs leading-6 ${t.muted}`}>
          تغییرات این فرم هنوز ذخیره نشده است. اگر خارج شوید از دست می‌روند.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setAskClose(false)}
            className={`rounded-xl border px-4 py-2 text-xs ${t.quiet}`}
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={() => {
              setAskClose(false);
              setDirty(false);
              onClose();
            }}
            className="rounded-xl border border-rose-500/40 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-500/10"
          >
            دور ریختن
          </button>
          <button
            type="button"
            onClick={() => {
              setAskClose(false);
              void save();
            }}
            className="rounded-xl bg-[#15554f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#246b61]"
          >
            ذخیره پیش‌نویس
          </button>
        </div>
      </Modal>
    </Modal>
  );
}
