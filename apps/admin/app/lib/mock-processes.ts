import type { UnitCategoryId } from "./units";
import { initialForms, type FormDefinition } from "./mock-forms";

export { initialForms, saveForms } from "./mock-forms";
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
  | "section";
export type ProcessConditionOperator = "equals" | "notEquals" | "contains" | "isEmpty" | "greaterThan" | "lessThan";

export type ProcessFieldCondition = {
  logic?: "and" | "or";
  clauses?: { variableId: string; operator: ProcessConditionOperator; value: string }[];
  fieldKey?: string;
  operator?: ProcessConditionOperator;
  value?: string;
};
export type StageAssigneeType = "applicant" | "employee";
export type PaymentMode = "none" | "fixed" | "formula";

export type ProcessStage = {
  id: string;
  title: string;
  assigneeType: StageAssigneeType;
  assigneeRole: string;
  slaDays: number;
  formIds?: string[];
  formVersions?: Record<string, string>;
  guidance?: string;
  routeRules?: StageRouteRule[];
  defaultNextStageId?: string;
};

export type StageRouteRule = {
  id: string;
  condition: import("../../components/ConditionFormulaEditor").ConditionValue;
  nextStageId: string;
};

export type ComputedProcessField = {
  id: string;
  name: string;
  formula: import("../../components/ConditionFormulaEditor").FormulaValue;
  unit?: string;
  destination: "internal" | "form";
  destinationStageId?: string;
  destinationFormId?: string;
  destinationFieldId?: string;
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
};

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
  publishedVersions?: { version: string; publishedAt: string; stages: ProcessStage[]; fields: ProcessField[]; payment: ProcessDefinition["payment"] }[];
  sourceFileName?: string;
  directiveFileNames: string[];
};

export const PROCESS_STORAGE_KEY = "office-admin-process-definitions-v1";
export { FORM_STORAGE_KEY } from "./mock-forms";
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
    assigneeType: index === 0 ? "applicant" : "employee",
    assigneeRole: index === 0 ? "متقاضی" : role,
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
      destination: "form",
      destinationStageId: constructionStages[2]!.id,
      destinationFormId: "form-payment-fee",
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

export function saveProcesses(processes: ProcessDefinition[]) {
  window.localStorage.setItem(PROCESS_STORAGE_KEY, JSON.stringify(processes));
}

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
