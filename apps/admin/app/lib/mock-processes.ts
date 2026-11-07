import type { UnitCategoryId } from "./units";
import { initialForms } from "./mock-forms";

export type { FormDefinition, FormType, FormVersionSnapshot, ValidationRule } from "./mock-forms";

export type ProcessStatus = "active" | "inactive" | "draft" | "archived";
export type ProcessFieldType =
  | "text"
  | "number"
  | "date"
  | "file"
  | "select"
  | "radio"
  | "boolean"
  | "repeater"
  | "section"
  | "payment"
  | "computed";
export type ProcessConditionOperator = "equals" | "notEquals" | "contains" | "isEmpty" | "greaterThan" | "lessThan";

export type ProcessFieldCondition = {
  logic?: "and" | "or";
  clauses?: { variableId: string; operator: ProcessConditionOperator; value: string }[];
  /** @deprecated نگه‌داری برای داده‌های قدیمی؛ در نرمال‌سازی خوانده می‌شود. */
  fieldKey?: string;
  /** @deprecated */
  operator?: ProcessConditionOperator;
  /** @deprecated */
  value?: string;
};

/* ------------------------------------------------------------ اعتبارسنجی فیلد */

export type ValidationPreset =
  | "national_id"
  | "mobile_ir"
  | "postal_code_ir"
  | "iban_ir";

/**
 * قواعد ماشین‌خوان فیلد. این شیء همان چیزی است که بک‌اند نیز اعتبارسنجی می‌کند.
 */
export type FieldValidation = {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  patternMessage?: string;
  preset?: ValidationPreset;
};

/* ---------------------------------------------------------------- مسئول مرحله */

export type Assignee =
  | { kind: "applicant" }
  | { kind: "role"; accessLevelId: string }
  | { kind: "employee"; employeeId: string };

/** @deprecated فقط برای سازگاری با داده‌های قدیمی. */
export type StageAssigneeType = "applicant" | "employee";
export type PaymentMode = "none" | "fixed" | "formula";

/* ------------------------------------------------------ خروجی و مهلت مرحله */

export type RejectPolicy = "return_to_applicant" | "reject_final";

export type StageEscalation = {
  afterDays: number;
  to: Assignee;
};

/** پایانه‌های مسیر: مرحله بعدی یا یکی از این دو مقدار. */
export const ROUTE_COMPLETE = "__complete__";
export const ROUTE_REJECT = "__reject__";
export type RouteTarget = string;

export type ProcessStage = {
  id: string;
  title: string;
  assignee: Assignee;
  slaDays: number;
  formIds?: string[];
  formVersions?: Record<string, string>;
  guidance?: string;
  routeRules?: StageRouteRule[];
  defaultNextStageId?: string;
  /** پیش‌فرض مراحل کارشناسی: return_to_applicant */
  onReject?: RejectPolicy;
  escalation?: StageEscalation;
  /** @deprecated برچسب متنی قدیمی؛ پس از نرمال‌سازی فقط برای نمایش نگه داشته می‌شود. */
  assigneeRole?: string;
  /** برچسب متنی كه قابل نگاشت به نقش/کارمند نبوده و باید در انتشار رفع شود. */
  legacyAssigneeLabel?: string;
  /** @deprecated */
  assigneeType?: StageAssigneeType;
};

export type StageRouteRule = {
  id: string;
  condition: import("../../components/ConditionFormulaEditor").ConditionValue;
  nextStageId: RouteTarget;
};

export type ComputedDestination =
  | { kind: "internal" }
  | { kind: "form_field"; stageId: string; formId: string; fieldId: string }
  | { kind: "payment_amount"; stageId: string; formId: string; fieldId: string };

export type ComputedProcessField = {
  id: string;
  name: string;
  formula: import("../../components/ConditionFormulaEditor").FormulaValue;
  unit?: string;
  unitCategory?: UnitCategoryId;
  destination: ComputedDestination;
};

export type PaymentAmountSource = "fixed" | "form_formula" | "process_variable";

export type PaymentFieldConfig = {
  gatewayId?: string;
  amountSource?: PaymentAmountSource;
  defaultAmount?: number;
  amountFormula?: import("../../components/ConditionFormulaEditor").FormulaValue;
  /** فقط وقتی amountSource = process_variable */
  processVariableId?: string;
};

export type ComputedFieldConfig = {
  formula?: import("../../components/ConditionFormulaEditor").FormulaValue;
};

export type ProcessField = {
  id: string;
  label: string;
  type: ProcessFieldType;
  required: boolean;
  options?: string[];
  unit?: string;
  unitCategory?: UnitCategoryId;
  slug?: string;
  condition?: ProcessFieldCondition;
  subFields?: ProcessField[];
  minRows?: number;
  maxRows?: number;
  allowedFileTypes?: string[];
  maxFileSizeMb?: number;
  minFiles?: number;
  maxFiles?: number;
  /** قواعد ماشین‌خوان (H4) */
  validation?: FieldValidation;
  /** متن راهنمای متقاضی که زیر فیلد نمایش داده می‌شود (L2) */
  helpText?: string;
  /** فقط type = "payment" */
  payment?: PaymentFieldConfig;
  /** فقط type = "computed" — همان فرم، فیلدهای عددی قبلی */
  computed?: ComputedFieldConfig;
};

export function isPaymentField(field: ProcessField): boolean {
  return field.type === "payment";
}

export function isComputedField(field: ProcessField): boolean {
  return field.type === "computed";
}

export type ProcessDefinition = {
  id: string;
  code: string;
  title: string;
  department: string;
  description: string;
  icon: string;
  status: ProcessStatus;
  version: string;
  activeCases: number;
  updatedAt: string;
  stages: ProcessStage[];
  fields: ProcessField[];
  rules: string[];
  applicantGuidance: string;
  payment: { mode: PaymentMode; provider: string; amount: number; formula: string };
  computedFields?: ComputedProcessField[];
  publishedVersions?: ProcessPublishedVersion[];
  sourceFileName?: string;
  directiveFileNames: string[];
  /** بازنویسی دستی خلاصه مشاوره متقاضی (L4) */
  consultation?: ProcessConsultation;
};

/** متن‌های بازنویسی‌شده‌ی خلاصه مشاوره؛ فقط بخش‌های واردشده جایگزین می‌شوند. */
export type ProcessConsultation = {
  requiredDocumentsText?: string;
  feesText?: string;
  estimatedDurationDays?: number;
  prerequisites?: string;
};

/**
 * عکس فوری نسخه منتشرشده. همه‌ی اجزای اجرایی مرحله (مسئول، خروجی، مهلت،
 * قواعد مسیر و محاسبات) در آن قفل می‌شوند تا نسخه‌های قدیمی از کار نیفتند.
 */
export type ProcessPublishedVersion = {
  version: string;
  publishedAt: string;
  stages: ProcessStage[];
  fields: ProcessField[];
  payment: ProcessDefinition["payment"];
  computedFields?: ComputedProcessField[];
  formVersions?: Record<string, string>;
  lockedForms?: { formId: string; version: string; title: string }[];
  /** خلاصه مشاوره‌ی زمان انتشار (L4) */
  consultation?: ProcessConsultation;
};

export const PROCESS_DEPARTMENTS = [
  "شهرسازی",
  "منابع انسانی",
  "مالی",
  "امور اداری",
  "فناوری اطلاعات",
  "حقوقی",
];

const fields: ProcessField[] = [
  { id: "full-name", label: "نام و نام خانوادگی", type: "text", required: true },
  { id: "national-id", label: "کد ملی", type: "text", required: true },
  { id: "phone", label: "شماره تماس", type: "text", required: true },
  { id: "document", label: "مدرک پشتیبان", type: "file", required: false },
];

const stages = (titles: string[], role: string): ProcessStage[] =>
  titles.map((title, index) => ({
    id: `${index + 1}-${title.replace(/\s+/g, "-")}`,
    title,
    assignee: index === 0 ? { kind: "applicant" } : { kind: "role", accessLevelId: "" },
    assigneeRole: index === 0 ? "متقاضی" : role,
    onReject: index === 0 ? "reject_final" : "return_to_applicant",
    slaDays: index === 0 ? 1 : 3,
    formIds: [],
    guidance: "",
  }));

const configuredStages = (titles: string[], role: string, assignments: string[][]): ProcessStage[] =>
  stages(titles, role).map((stage, index) => {
    const formIds = assignments[index] ?? [];
    return {
      ...stage,
      formIds,
      formVersions: Object.fromEntries(formIds.flatMap((id) => {
        const form = initialForms.find((item) => item.id === id);
        return form ? [[id, form.version]] : [];
      })),
    };
  });

const constructionStages = configuredStages(
  ["ثبت اطلاعات متقاضی", "بارگذاری مدارک", "بررسی کارشناس شهرسازی", "تأیید مدیر واحد"],
  "کارشناس شهرسازی",
  [["form-construction-application"], [], ["form-payment-fee"], []],
);
constructionStages[0] = {
  ...constructionStages[0]!,
  routeRules: [{
    id: "route-large-property",
    condition: { logic: "and", clauses: [{ variableId: "form-construction-application:property-area", operator: "greaterThan", value: "200" }] },
    nextStageId: constructionStages[2]!.id,
  }],
  defaultNextStageId: constructionStages[1]!.id,
};

const employmentStages = configuredStages(
  ["تکمیل درخواست", "بررسی منابع انسانی", "تأیید مدیر واحد", "صدور گواهی"],
  "کارشناس منابع انسانی",
  [[], [], [], []],
);
const leaveStages = configuredStages(
  ["ثبت بازه مرخصی", "بررسی مانده", "تأیید سرپرست"],
  "سرپرست واحد",
  [["form-hr-leave"], [], []],
);

export const initialProcesses: ProcessDefinition[] = [
  {
    id: "proc-construction-license",
    code: "URB-001",
    title: "ثبت پروانه ساختمانی",
    department: "شهرسازی",
    description: "ثبت و بررسی درخواست صدور پروانه ساختمانی و کنترل مدارک مالکیت.",
    icon: "building",
    status: "active",
    version: "1.2",
    activeCases: 12,
    updatedAt: "2026-10-02T11:00:00",
    stages: constructionStages,
    fields: [
      { id: "owner", label: "نام مالک", type: "text", required: true },
      { id: "national-id", label: "کد ملی مالک", type: "text", required: true },
      { id: "property-area", label: "مساحت زمین (متر مربع)", type: "number", required: true },
      { id: "property-address", label: "نشانی ملک", type: "text", required: true },
      { id: "ownership-doc", label: "سند مالکیت", type: "file", required: true },
    ],
    rules: ["کد ملی باید ۱۰ رقم باشد.", "شماره تماس باید ۱۱ رقم باشد.", "مساحت زمین باید عددی بزرگ‌تر از صفر باشد."],
    applicantGuidance: "ابتدا اطلاعات مالک و ملک را وارد کنید، سپس تصویر خوانای سند مالکیت را بارگذاری کنید.",
    payment: { mode: "fixed", provider: "درگاه پرداخت بانکی", amount: 2500000, formula: "" },
    computedFields: [{
      id: "calc-construction-fee",
      name: "هزینه بررسی",
      formula: { tokens: [{ kind: "variable", variableId: "form-construction-application:property-area" }, { kind: "operator", value: "*" }, { kind: "number", value: "2500" }] },
      unit: "rial",
      unitCategory: "currency",
      destination: { kind: "payment_amount", stageId: constructionStages[2]!.id, formId: "form-payment-fee", fieldId: "payment" },
    }],
    publishedVersions: [],
    sourceFileName: "فرم-پروانه-ساختمانی.docx",
    directiveFileNames: ["بخشنامه-شهرسازی-۱۴۰۵.pdf"],
  },
  {
    id: "proc-employment-letter",
    code: "HR-014",
    title: "صدور گواهی اشتغال به کار",
    department: "منابع انسانی",
    description: "دریافت، بررسی و صدور گواهی اشتغال به کار برای کارکنان.",
    icon: "file",
    status: "active",
    version: "2.0",
    activeCases: 8,
    updatedAt: "2026-09-29T14:30:00",
    stages: employmentStages,
    fields: [
      { id: "purpose", label: "علت درخواست گواهی", type: "select", required: true, options: ["ارائه به بانک", "ارائه به سفارت", "سایر"] },
      { id: "recipient", label: "نام سازمان مقصد", type: "text", required: true },
      { id: "phone", label: "شماره تماس", type: "text", required: true },
    ],
    rules: ["شماره تماس باید ۱۱ رقم باشد.", "فقط کارکنان فعال امکان ثبت درخواست دارند."],
    applicantGuidance: "علت درخواست و سازمان مقصد را مشخص کنید. نتیجه پس از تأیید مدیر در همین سامانه قابل دریافت است.",
    payment: { mode: "none", provider: "", amount: 0, formula: "" },
    computedFields: [],
    publishedVersions: [],
    sourceFileName: "فرم-گواهی-اشتغال.pdf",
    directiveFileNames: [],
  },
  {
    id: "proc-emergency-loan",
    code: "FIN-006",
    title: "درخواست وام ضروری",
    department: "مالی",
    description: "ثبت درخواست وام ضروری و بررسی شرایط و مدارک متقاضی.",
    icon: "wallet",
    status: "draft",
    version: "0.4",
    activeCases: 0,
    updatedAt: "2026-10-03T09:15:00",
    stages: stages(["ثبت درخواست", "بررسی مدارک مالی", "تصویب کمیته مالی", "پرداخت وام"], "کارشناس مالی"),
    fields: [
      { id: "amount", label: "مبلغ درخواستی", type: "number", required: true },
      { id: "reason", label: "شرح نیاز", type: "text", required: true },
      { id: "salary-slip", label: "فیش حقوقی", type: "file", required: true },
    ],
    rules: ["مبلغ درخواستی نباید از سقف مصوب بیشتر باشد.", "فیش حقوقی باید مربوط به سه ماه اخیر باشد."],
    applicantGuidance: "مبلغ و دلیل درخواست را ثبت کنید و فیش حقوقی سه ماه اخیر را بارگذاری کنید.",
    payment: { mode: "formula", provider: "درگاه پرداخت بانکی", amount: 0, formula: "مبلغ اقساط = مبلغ وام / تعداد اقساط" },
    directiveFileNames: ["آیین‌نامه-وام-کارکنان.pdf"],
  },
  {
    id: "proc-it-equipment",
    code: "IT-008",
    title: "درخواست تجهیزات اداری",
    department: "فناوری اطلاعات",
    description: "دریافت و بررسی درخواست تجهیزات مورد نیاز کارکنان.",
    icon: "monitor",
    status: "inactive",
    version: "1.1",
    activeCases: 0,
    updatedAt: "2026-08-15T10:00:00",
    stages: stages(["شرح نیاز", "بررسی موجودی", "تأیید مدیر", "تحویل تجهیزات"], "کارشناس فناوری اطلاعات"),
    fields,
    rules: ["شرح نیاز باید حداقل ۲۰ نویسه داشته باشد."],
    applicantGuidance: "نوع تجهیزات و دلیل نیاز را توضیح دهید.",
    payment: { mode: "none", provider: "", amount: 0, formula: "" },
    directiveFileNames: [],
  },
  {
    id: "proc-leave",
    code: "HR-021",
    title: "درخواست مرخصی استحقاقی",
    department: "منابع انسانی",
    description: "ثبت و تأیید درخواست مرخصی مطابق مانده مرخصی کارمند.",
    icon: "calendar",
    status: "active",
    version: "1.0",
    activeCases: 5,
    updatedAt: "2026-09-20T08:20:00",
    stages: leaveStages,
    fields: [
      { id: "from-date", label: "از تاریخ", type: "date", required: true },
      { id: "to-date", label: "تا تاریخ", type: "date", required: true },
      { id: "reason", label: "توضیحات", type: "text", required: false },
    ],
    rules: ["درخواست باید پیش از شروع بازه ثبت شود.", "بازه درخواست نباید از مانده مرخصی بیشتر باشد."],
    applicantGuidance: "بازه‌ی مرخصی درخواستی را انتخاب کنید.",
    payment: { mode: "none", provider: "", amount: 0, formula: "" },
    directiveFileNames: ["دستورالعمل-مرخصی.pdf"],
  },
];

export function formatProcessDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function formatPersianNumber(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value);
}

/* ------------------------------------------------------------------ migration */

const APPLICANT_LABELS = new Set(["متقاضی", "applicant", "کاربر", "مراجع"]);

export function isAssigneeUnresolved(assignee: Assignee | undefined): boolean {
  if (!assignee) return true;
  if (assignee.kind === "applicant") return false;
  if (assignee.kind === "role") return !assignee.accessLevelId;
  return !assignee.employeeId;
}

/**
 * نگاشت تحمل‌پذیر مسئول مرحله.
 * مراحل قدیمی فقط `assigneeRole` متنی داشتند: «متقاضی» به متقاضی نگاشت می‌شود و
 * بقیه به‌عنوان برچسب نا‌حل‌شده نگه داشته می‌شوند تا در اعتبارسنجی انتشار دیده شوند.
 */
export function normalizeAssignee(raw: Partial<ProcessStage>): {
  assignee: Assignee;
  legacyAssigneeLabel?: string;
} {
  const current = raw.assignee;
  if (current && current.kind) {
    if (current.kind === "applicant") return { assignee: { kind: "applicant" } };
    if (current.kind === "role") {
      return { assignee: { kind: "role", accessLevelId: current.accessLevelId ?? "" } };
    }
    return { assignee: { kind: "employee", employeeId: current.employeeId ?? "" } };
  }
  const label = (raw.assigneeRole ?? "").trim();
  if (raw.assigneeType === "applicant" || APPLICANT_LABELS.has(label)) {
    return { assignee: { kind: "applicant" } };
  }
  return {
    assignee: { kind: "role", accessLevelId: "" },
    ...(label ? { legacyAssigneeLabel: label } : {}),
  };
}

export function normalizeStage(raw: Partial<ProcessStage>): ProcessStage {
  const { assignee, legacyAssigneeLabel } = normalizeAssignee(raw);
  const defaults: RejectPolicy = assignee.kind === "applicant" ? "reject_final" : "return_to_applicant";
  const escalation = raw.escalation;
  return {
    id: raw.id ?? `stage-${crypto.randomUUID()}`,
    title: raw.title ?? "",
    assignee,
    slaDays: Math.max(1, Number(raw.slaDays) || 1),
    formIds: Array.isArray(raw.formIds) ? [...raw.formIds] : [],
    formVersions: raw.formVersions ? { ...raw.formVersions } : {},
    guidance: raw.guidance ?? "",
    routeRules: Array.isArray(raw.routeRules)
      ? raw.routeRules.map((rule) => ({
          id: rule.id ?? `route-${crypto.randomUUID()}`,
          condition: {
            logic: rule.condition?.logic === "or" ? "or" : "and",
            clauses: Array.isArray(rule.condition?.clauses) ? rule.condition.clauses : [],
          },
          nextStageId: rule.nextStageId ?? "",
        }))
      : [],
    defaultNextStageId: raw.defaultNextStageId ?? "",
    onReject: raw.onReject === "reject_final" || raw.onReject === "return_to_applicant" ? raw.onReject : defaults,
    ...(escalation
      ? {
          escalation: {
            afterDays: Math.max(1, Number(escalation.afterDays) || Math.max(1, Number(raw.slaDays) || 1)),
            to: normalizeAssignee({ assignee: escalation.to }).assignee,
          },
        }
      : {}),
    ...(raw.assigneeRole ? { assigneeRole: raw.assigneeRole } : {}),
    ...(legacyAssigneeLabel ? { legacyAssigneeLabel } : {}),
  };
}

/** سازگاری با نسخه‌ای که `destination` رشته‌ای بود (`internal` | `form`). */
export function ensureComputedDestination(raw: ComputedProcessField | (Record<string, unknown> & {
  id: string;
  name: string;
  formula?: ComputedProcessField["formula"];
})): ComputedDestination {
  const destination = (raw as { destination?: unknown }).destination;
  if (destination && typeof destination === "object" && "kind" in destination) {
    const candidate = destination as ComputedDestination;
    if (candidate.kind === "internal") return { kind: "internal" };
    if (candidate.kind === "form_field" || candidate.kind === "payment_amount") return candidate;
  }
  const legacy = raw as unknown as {
    destination?: string;
    destinationStageId?: string;
    destinationFormId?: string;
    destinationFieldId?: string;
  };
  if (legacy.destination === "form" && legacy.destinationStageId && legacy.destinationFormId) {
    return {
      kind: "form_field",
      stageId: legacy.destinationStageId,
      formId: legacy.destinationFormId,
      fieldId: legacy.destinationFieldId ?? "",
    };
  }
  return { kind: "internal" };
}

export function normalizeComputedField(raw: ComputedProcessField): ComputedProcessField {
  return {
    id: raw.id,
    name: raw.name ?? "",
    formula: raw.formula ?? { tokens: [] },
    unit: raw.unit,
    unitCategory: raw.unitCategory,
    destination: ensureComputedDestination(raw),
  };
}

/** خواننده‌ی تحمل‌پذیر بازنویسی خلاصه مشاوره؛ فقط مقادیر معتبر نگه داشته می‌شوند. */
export function normalizeConsultation(raw: ProcessConsultation): ProcessConsultation {
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;
  const requiredDocumentsText = text(raw.requiredDocumentsText);
  const feesText = text(raw.feesText);
  const prerequisites = text(raw.prerequisites);
  const days = Number(raw.estimatedDurationDays);
  return {
    ...(requiredDocumentsText ? { requiredDocumentsText } : {}),
    ...(feesText ? { feesText } : {}),
    ...(Number.isFinite(days) && days > 0
      ? { estimatedDurationDays: Math.round(days) }
      : {}),
    ...(prerequisites ? { prerequisites } : {}),
  };
}

/** خواننده‌ی تحمل‌پذیر پروسه‌های ذخیره‌شده (شامل شکل‌های قدیمی). */
export function normalizeProcess(raw: Partial<ProcessDefinition>): ProcessDefinition {
  return {
    id: raw.id ?? `proc-${crypto.randomUUID()}`,
    code: raw.code ?? "",
    title: raw.title ?? "",
    department: raw.department ?? PROCESS_DEPARTMENTS[0]!,
    description: raw.description ?? "",
    icon: raw.icon ?? "file",
    status: raw.status === "active" || raw.status === "inactive" || raw.status === "archived" ? raw.status : "draft",
    version: raw.version ?? "0.1",
    activeCases: Number(raw.activeCases) || 0,
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    stages: Array.isArray(raw.stages) ? raw.stages.map((stage) => normalizeStage(stage)) : [],
    fields: Array.isArray(raw.fields) ? raw.fields : [],
    rules: Array.isArray(raw.rules) ? raw.rules : [],
    applicantGuidance: raw.applicantGuidance ?? "",
    payment: {
      mode: raw.payment?.mode ?? "none",
      provider: raw.payment?.provider ?? "",
      amount: Number(raw.payment?.amount) || 0,
      formula: raw.payment?.formula ?? "",
    },
    ...(raw.consultation ? { consultation: normalizeConsultation(raw.consultation) } : {}),
    computedFields: Array.isArray(raw.computedFields)
      ? raw.computedFields.map((field) => normalizeComputedField(field))
      : [],
    publishedVersions: Array.isArray(raw.publishedVersions) ? raw.publishedVersions : [],
    ...(raw.sourceFileName ? { sourceFileName: raw.sourceFileName } : {}),
    directiveFileNames: Array.isArray(raw.directiveFileNames) ? raw.directiveFileNames : [],
  };
}