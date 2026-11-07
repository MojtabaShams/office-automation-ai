import type { FormulaValue } from "../../components/ConditionFormulaEditor";
import type { PaymentAmountSource, ProcessField, ProcessStatus } from "./mock-processes";

export type FormType = "standard" | "document" | "payment";

export type ValidationRule = {
  id: string;
  text: string;
  source?: { fileName: string; pageOrClause?: string };
  relatedFieldIds?: string[];
};

/**
 * قانون ساخت‌یافته. `id` و `source` در ویرایش حفظ می‌شوند تا ردیابی سند گم نشود.
 * قوانین متنی فقط راهنمای عامل هوشمند هستند؛ قیود مکانیکی در `field.validation` است.
 */
export type StructuredRule = ValidationRule;

export type FormVersionSnapshot = {
  version: string;
  publishedAt: string;
  formType: FormType;
  fields: ProcessField[];
  rules: ValidationRule[];
  payment?: FormPaymentProjection;
  lockedAt?: string;
};

/* ------------------------------------------------------- اسناد مرجع فرم (H5) */

export type DocumentExtractionStatus =
  | "pending"
  | "processing"
  | "done"
  | "failed"
  | "unsupported";

export type ReferenceDocument = {
  id: string;
  formId: string;
  fileName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  uploadedAt: string;
  uploadedBy?: string;
  extractionStatus: DocumentExtractionStatus;
  extractedText?: string;
  pageCount?: number;
};

/**
 * Projection of the first payment field, kept in sync by the form editor so every
 * existing consumer (forms list, process preview, request processing) keeps showing a
 * configured gateway instead of "gateway not selected".
 */
export type FormPaymentProjection = {
  gatewayId: string;
  defaultAmount?: number;
  amountSource?: PaymentAmountSource;
  amountFormula?: FormulaValue;
  processVariableId?: string;
  /** id of the payment field this projection mirrors */
  fieldId?: string;
};

export type FormDefinition = {
  id: string;
  code: string;
  title: string;
  department: string;
  description: string;
  icon: string;
  status: ProcessStatus;
  version: string;
  updatedAt: string;
  formType: FormType;
  fields: ProcessField[];
  rules: ValidationRule[];
  applicantGuidance: string;
  payment?: FormPaymentProjection;
  sourceFileName?: string;
  directiveFileNames: string[];
  referenceDocuments?: ReferenceDocument[];
  versions: FormVersionSnapshot[];
};

const makeVersion = (
  version: string,
  formType: FormType,
  fields: ProcessField[],
  rules: ValidationRule[],
  payment?: FormPaymentProjection,
): FormVersionSnapshot => ({
  version,
  publishedAt: "2026-10-01T09:00:00.000Z",
  formType,
  fields: structuredClone(fields),
  rules: structuredClone(rules),
  ...(payment ? { payment: structuredClone(payment) } : {}),
});

const initialFormEntries = [
  {
    id: "form-construction-application",
    code: "FORM-URB-001",
    title: "فرم درخواست صدور پروانه ساختمانی",
    department: "شهرسازی",
    description: "فرم استاندارد دریافت اطلاعات مالک، مشخصات ملک و مدارک پشتیبان.",
    icon: "file",
    status: "active",
    version: "1.0",
    updatedAt: "2026-10-02T10:00:00.000Z",
    formType: "standard",
    fields: [
      {
        id: "construction-section-property",
        label: "مشخصات ملک",
        type: "section",
        required: false,
        subFields: [
          { id: "owner-name", label: "نام مالک", type: "text", required: true, slug: "owner_name" },
          { id: "property-area", label: "مساحت زمین", type: "number", required: true, slug: "property_area", unit: "square-meter", unitCategory: "area" },
          { id: "property-address", label: "آدرس ملک", type: "text", required: true, slug: "property_address" },
        ],
      },
      {
        id: "construction-section-documents",
        label: "مدارک",
        type: "section",
        required: false,
        subFields: [
          { id: "ownership-doc", label: "سند مالکیت", type: "file", required: true, slug: "ownership_doc", allowedFileTypes: ["application/pdf", "image/*"], maxFileSizeMb: 10, minFiles: 1, maxFiles: 3 },
        ],
      },
    ],
    rules: [
      { id: "construction-rule-id", text: "کد ملی مالک باید ۱۰ رقم باشد.", source: { fileName: "فرم-پروانه-ساختمانی.docx", pageOrClause: "بند ۲" } },
      { id: "construction-rule-ownership", text: "در صورت وجود اختلاف مالکیت، مدارک تکمیلی لازم است." },
    ],
    applicantGuidance: "در این فرم، اطلاعات مالک و آدرس ملک را دقیق درج کنید و سند مالکیت را بارگذاری نمایید.",
    sourceFileName: "فرم-پروانه-ساختمانی.docx",
    directiveFileNames: [],
    versions: [],
  },
  {
    id: "form-hr-leave",
    code: "FORM-HR-021",
    title: "فرم درخواست مرخصی",
    department: "منابع انسانی",
    description: "فرم ثبت درخواست مرخصی استحقاقی و جمع‌آوری اطلاعات لازم برای بررسی.",
    icon: "file",
    status: "active",
    version: "1.1",
    updatedAt: "2026-10-03T12:00:00.000Z",
    formType: "standard",
    fields: [
      {
        id: "leave-section-details",
        label: "جزئیات مرخصی",
        type: "section",
        required: false,
        subFields: [
          { id: "employee-name", label: "نام کارمند", type: "text", required: true, slug: "employee_name" },
          { id: "leave-from", label: "تاریخ شروع مرخصی", type: "date", required: true, slug: "leave_from" },
          { id: "leave-to", label: "تاریخ پایان مرخصی", type: "date", required: true, slug: "leave_to" },
          { id: "leave-type", label: "نوع مرخصی", type: "radio", required: true, options: ["استحقاقی", "استعلاجی", "سایر"], slug: "leave_type" },
          {
            id: "leave-family",
            label: "اعضای خانواده تحت تکفل",
            type: "repeater",
            required: false,
            slug: "family_members",
            minRows: 0,
            maxRows: 8,
            subFields: [
              { id: "family-first-name", label: "نام", type: "text", required: true, slug: "first_name" },
              { id: "family-last-name", label: "نام خانوادگی", type: "text", required: true, slug: "last_name" },
              { id: "family-relation", label: "نسبت", type: "text", required: true, slug: "relation" },
              { id: "family-birth-date", label: "تاریخ تولد", type: "date", required: true, slug: "birth_date" },
            ],
          },
        ],
      },
    ],
    rules: [
      { id: "leave-rule-date", text: "تاریخ پایان مرخصی باید بعد از تاریخ شروع باشد." },
      { id: "leave-rule-approval", text: "تأیید نهایی توسط مدیر واحد الزامی است." },
    ],
    applicantGuidance: "تاریخ شروع و پایان مرخصی را مشخص کنید و نوع درخواست را انتخاب نمایید.",
    sourceFileName: "فرم-مرخصی.pdf",
    directiveFileNames: [],
    versions: [],
  },
  {
    id: "form-payment-fee",
    code: "FORM-FIN-001",
    title: "فرم پرداخت هزینه بررسی",
    department: "مالی",
    description: "پرداخت هزینه بررسی پرونده پس از اتصال به پروسه‌ی مربوط.",
    icon: "wallet",
    status: "active",
    version: "1.0",
    updatedAt: "2026-10-04T10:00:00.000Z",
    formType: "payment",
    fields: [],
    rules: [],
    applicantGuidance: "",
    payment: { gatewayId: "", defaultAmount: 500000 },
    directiveFileNames: [],
    versions: [],
  },
 ] satisfies FormDefinition[];

export const initialForms: FormDefinition[] = initialFormEntries.map((form) => ({
  ...form,
  versions: [makeVersion(form.version, form.formType, form.fields, form.rules, form.payment)],
}));

export function ensureFormVersions(forms: FormDefinition[]) {
  return forms.map((form) => {
    const formType = form.formType ?? "standard";
    const fields = form.fields ?? [];
    const hierarchicalFields = fields.some((field) => field.type === "section")
      ? fields
      : fields.length
        ? [{
            id: `${form.id}-legacy-section`,
            label: "اطلاعات فرم",
            type: "section" as const,
            required: false,
            subFields: fields,
          }]
        : [];
    const rules = Array.isArray(form.rules)
      ? form.rules.map((rule, index) => typeof rule === "string"
        ? { id: `${form.id}-legacy-rule-${index}`, text: rule }
        : rule)
      : [];
    const normalizedFields = hierarchicalFields.map(normalizeFormField);
    return {
      ...form,
      formType,
      fields: normalizedFields,
      rules,
      payment: derivePaymentProjection(normalizedFields, form.payment),
      versions: form.versions?.length
        ? form.versions
        : form.status === "active"
          ? [makeVersion(form.version, formType, hierarchicalFields, rules, form.payment)]
          : [],
    };
  });
}

/* ------------------------------------------------------------------ migration */

/**
 * نگاشت تحمل‌پذیر فیلد.
 * نسخه‌ی قدیمی تنظیمات پرداخت را مستقیم روی فیلد (`gatewayId`, `defaultAmount`,
 * `amountFormula`) ذخیره می‌کرد؛ اینجا به `field.payment` منتقل می‌شود.
 */
export function normalizeFormField(field: ProcessField): ProcessField {
  const legacy = field as ProcessField & {
    gatewayId?: string;
    defaultAmount?: number;
    amountFormula?: FormulaValue;
  };
  const base: ProcessField = { ...field };
  const loose = base as unknown as Record<string, unknown>;
  delete loose.gatewayId;
  delete loose.defaultAmount;
  delete loose.amountFormula;
  if (base.subFields) base.subFields = base.subFields.map(normalizeFormField);
  if (base.type === "payment") {
    const payment = base.payment ?? {};
    const legacyFormula = legacy.amountFormula;
    const hasLegacyFormula = Array.isArray(legacyFormula?.tokens) && legacyFormula.tokens.length > 0;
    base.payment = {
      gatewayId: payment.gatewayId ?? legacy.gatewayId ?? "",
      amountSource:
        payment.amountSource ??
        (legacy.defaultAmount != null ? "fixed" : hasLegacyFormula ? "form_formula" : "fixed"),
      ...(payment.defaultAmount ?? legacy.defaultAmount) != null
        ? { defaultAmount: payment.defaultAmount ?? legacy.defaultAmount }
        : {},
      ...(payment.amountFormula ?? (hasLegacyFormula ? legacyFormula : undefined))
        ? { amountFormula: payment.amountFormula ?? legacyFormula }
        : {},
      ...(payment.processVariableId ? { processVariableId: payment.processVariableId } : {}),
    };
  }
  return base;
}

/**
 * اولین فیلد پرداخت واقعی فرم (در بخش‌های تودرتو، نه ستون‌های جدول تکراری).
 */
function findPaymentField(fields: ProcessField[]): ProcessField | undefined {
  for (const field of fields) {
    if (field.type === "payment") return field;
    if (field.type === "section" && Array.isArray(field.subFields)) {
      const nested = findPaymentField(field.subFields);
      if (nested) return nested;
    }
  }
  return undefined;
}

/**
 * یکسان‌سازی `form.payment` با فیلد پرداخت (M4).
 * اگر فیلدی وجود داشته باشد، منبع حقیقت همان فیلد است؛ در غیر این صورت برآمد قبلی
 * دست‌نخورده می‌ماند تا فرم‌های قدیمی داده‌ی خود را از دست ندهند.
 */
export function derivePaymentProjection(
  fields: ProcessField[],
  current?: FormPaymentProjection,
): FormPaymentProjection | undefined {
  const paymentField = findPaymentField(fields);
  if (!paymentField) return current;
  const config = paymentField.payment ?? {};
  const hasFormula = Array.isArray(config.amountFormula?.tokens) && config.amountFormula.tokens.length > 0;
  const amountSource: PaymentAmountSource =
    config.amountSource ??
    current?.amountSource ??
    (config.processVariableId ? "process_variable" : hasFormula ? "form_formula" : "fixed");
  return {
    gatewayId: config.gatewayId ?? current?.gatewayId ?? "",
    amountSource,
    fieldId: paymentField.id,
    ...(config.defaultAmount != null
      ? { defaultAmount: config.defaultAmount }
      : current?.defaultAmount != null
        ? { defaultAmount: current.defaultAmount }
        : {}),
    ...(hasFormula && config.amountFormula ? { amountFormula: config.amountFormula } : {}),
    ...(config.processVariableId ? { processVariableId: config.processVariableId } : {}),
  };
}

/** خواننده‌ی تحمل‌پذیر فرم‌های ذخیره‌شده (شامل فیلدهای پرداخت پهن). */
export function normalizeForm(raw: Partial<FormDefinition>): FormDefinition {
  const fields = (Array.isArray(raw.fields) ? raw.fields : []).map((field) =>
    normalizeFormField(field),
  );
  const rules: ValidationRule[] = Array.isArray(raw.rules)
    ? raw.rules.map((rule, index) =>
        typeof rule === "string"
          ? { id: `${raw.id ?? "form"}-legacy-rule-${index}`, text: rule }
          : rule,
      )
    : [];
  const payment = derivePaymentProjection(fields, raw.payment);
  const hasPaymentProjection = !!payment && (!!payment.gatewayId || payment.defaultAmount != null);
  return {
    id: raw.id ?? `form-${Date.now()}`,
    code: raw.code ?? "",
    title: raw.title ?? "",
    department: raw.department ?? "عمومی",
    description: raw.description ?? "",
    icon: raw.icon ?? "file",
    status: raw.status === "active" || raw.status === "inactive" || raw.status === "archived" ? raw.status : "draft",
    version: raw.version ?? "0.1",
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    formType: raw.formType ?? "standard",
    fields,
    rules,
    applicantGuidance: raw.applicantGuidance ?? "",
    ...(hasPaymentProjection && payment ? { payment } : {}),
    ...(raw.sourceFileName ? { sourceFileName: raw.sourceFileName } : {}),
    directiveFileNames: Array.isArray(raw.directiveFileNames) ? raw.directiveFileNames : [],
    referenceDocuments: Array.isArray(raw.referenceDocuments) ? raw.referenceDocuments : [],
    versions: Array.isArray(raw.versions) ? raw.versions : [],
  };
}