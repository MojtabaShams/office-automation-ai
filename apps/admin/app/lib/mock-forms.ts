import type { ProcessField, ProcessStatus } from "./mock-processes";

export type FormType = "standard" | "document" | "payment";

export type ValidationRule = {
  id: string;
  text: string;
  source?: { fileName: string; pageOrClause?: string };
};

export type FormVersionSnapshot = {
  version: string;
  publishedAt: string;
  formType: FormType;
  fields: ProcessField[];
  rules: ValidationRule[];
  payment?: { gatewayId: string; defaultAmount?: number };
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
  payment?: { gatewayId: string; defaultAmount?: number };
  sourceFileName?: string;
  directiveFileNames: string[];
  versions: FormVersionSnapshot[];
};

export const FORM_STORAGE_KEY = "office-admin-form-definitions-v1";

const makeVersion = (
  version: string,
  formType: FormType,
  fields: ProcessField[],
  rules: ValidationRule[],
  payment?: FormDefinition["payment"],
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

export function saveForms(forms: FormDefinition[]) {
  window.localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(forms));
}

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
    return {
      ...form,
      formType,
      fields: hierarchicalFields,
      rules,
      versions: form.versions?.length
        ? form.versions
        : form.status === "active"
          ? [makeVersion(form.version, formType, hierarchicalFields, rules, form.payment)]
          : [],
    };
  });
}
