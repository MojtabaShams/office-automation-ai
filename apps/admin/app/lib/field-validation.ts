/**
 * قواعد اعتبارسنجی ماشین‌خوان فیلدها (H4).
 *
 * این ماژول تنها منبع حقیقت در فرانت‌اند است و دقیقاً همان JSON Schema را
 * تولید می‌کند که `ai-agent/app/services/form_service.py` هم اجرا می‌کند؛
 * بنابراین اعتبارسنجی پیش‌نمایش، فرم متقاضی و سرور یکسان رفتار می‌کنند.
 */

import type {
  FieldValidation,
  ProcessField,
  ValidationPreset,
} from "./mock-processes";

export type ValidationPresetDefinition = {
  id: ValidationPreset;
  label: string;
  pattern: string;
  patternMessage: string;
  minLength?: number;
  maxLength?: number;
  /** نمایش انسانی برای راهنمای فیلد */
  hint: string;
  normalize?: (value: string) => string;
};

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** ارقام فارسی/عربی را به لاتین تبدیل می‌کند تا regex پایین ساده بماند. */
export function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

export const VALIDATION_PRESETS: readonly ValidationPresetDefinition[] = [
  {
    id: "national_id",
    label: "کد ملی",
    pattern: "^\\d{10}$",
    patternMessage: "کد ملی باید دقیقاً ۱۰ رقم باشد.",
    minLength: 10,
    maxLength: 10,
    hint: "۱۰ رقم بدون خط تیره",
    normalize: normalizeDigits,
  },
  {
    id: "mobile_ir",
    label: "شماره موبایل",
    pattern: "^09\\d{9}$",
    patternMessage: "شماره موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد.",
    minLength: 11,
    maxLength: 11,
    hint: "مثال: ۰۹۱۲۳۴۵۶۷۸۹",
    normalize: normalizeDigits,
  },
  {
    id: "postal_code_ir",
    label: "کد پستی",
    pattern: "^\\d{10}$",
    patternMessage: "کد پستی باید دقیقاً ۱۰ رقم باشد.",
    minLength: 10,
    maxLength: 10,
    hint: "۱۰ رقم",
    normalize: normalizeDigits,
  },
  {
    id: "iban_ir",
    label: "شماره شبا",
    pattern: "^IR\\d{24}$",
    patternMessage: "شبا باید با IR شروع شود و ۲۴ رقم داشته باشد.",
    minLength: 26,
    maxLength: 26,
    hint: "مثال: IR۰۶۰۰…",
    normalize: (value) => normalizeDigits(value).replace(/\s+/g, "").toUpperCase(),
  },
];

export function getValidationPreset(
  id: ValidationPreset | undefined,
): ValidationPresetDefinition | undefined {
  if (!id) return undefined;
  return VALIDATION_PRESETS.find((preset) => preset.id === id);
}

/** اعمال یک preset روی فیلد و پر کردن قیود متناظر. */
export function applyValidationPreset(
  presetId: ValidationPreset,
): FieldValidation {
  const preset = getValidationPreset(presetId);
  if (!preset) return {};
  return {
    preset: preset.id,
    pattern: preset.pattern,
    patternMessage: preset.patternMessage,
    ...(preset.minLength != null ? { minLength: preset.minLength } : {}),
    ...(preset.maxLength != null ? { maxLength: preset.maxLength } : {}),
  };
}

export function describeValidation(validation: FieldValidation | undefined): string[] {
  if (!validation) return [];
  const lines: string[] = [];
  const preset = getValidationPreset(validation.preset);
  if (preset) lines.push(`قالب ${preset.label} (${preset.hint})`);
  if (validation.minLength != null) lines.push(`حداقل ${validation.minLength} نویسه`);
  if (validation.maxLength != null) lines.push(`حداکثر ${validation.maxLength} نویسه`);
  if (validation.min != null) lines.push(`حداقل مقدار ${validation.min}`);
  if (validation.max != null) lines.push(`حداکثر مقدار ${validation.max}`);
  if (validation.pattern && !preset) lines.push(`الگوی سفارشی: ${validation.pattern}`);
  return lines;
}

/**
 * اعتبارسنجی یک مقدار؛ `null` یعنی معتبر است.
 * پیام‌ها فارسی و قابل نمایش مستقیم به متقاضی هستند.
 */
export function validateFieldValue(
  field: ProcessField,
  rawValue: unknown,
): string | null {
  const validation = field.validation;
  const label = field.label || "این فیلد";
  if (!validation) return null;

  if (field.type === "file") return null;

  const raw = rawValue == null ? "" : String(rawValue).trim();
  if (!raw) return null; // «اجباری بودن» جداگانه بررسی می‌شود

  const preset = getValidationPreset(validation.preset);
  const value = preset?.normalize ? preset.normalize(raw) : raw;

  if (field.type === "number") {
    const number = Number(value);
    if (Number.isNaN(number)) return `${label} باید یک عدد باشد.`;
    if (validation.min != null && number < validation.min) {
      return `${label} نباید کمتر از ${validation.min} باشد.`;
    }
    if (validation.max != null && number > validation.max) {
      return `${label} نباید بیشتر از ${validation.max} باشد.`;
    }
    return null;
  }

  if (validation.minLength != null && value.length < validation.minLength) {
    return `${label} باید حداقل ${validation.minLength} نویسه باشد.`;
  }
  if (validation.maxLength != null && value.length > validation.maxLength) {
    return `${label} باید حداکثر ${validation.maxLength} نویسه باشد.`;
  }

  if (validation.pattern) {
    try {
      if (!new RegExp(validation.pattern, "u").test(value)) {
        return validation.patternMessage || `قالب ${label} معتبر نیست.`;
      }
    } catch {
      // الگوی نادرست نباید ذخیره را قفل کند؛ در اعتبارسنجی انتشار گزارش می‌شود.
      return null;
    }
  }

  return null;
}

export function isValidationConfigValid(validation: FieldValidation | undefined): boolean {
  if (!validation) return true;
  const { minLength, maxLength, min, max, pattern } = validation;
  if (minLength != null && maxLength != null && minLength > maxLength) return false;
  if (min != null && max != null && min > max) return false;
  if (pattern) {
    try {
      new RegExp(pattern, "u");
    } catch {
      return false;
    }
  }
  return true;
}

/* ------------------------------------------------- ترتیب سند و دامنه تکرارشونده */

export type FieldScopeEntry = {
  field: ProcessField;
  /** اندیس در ترتیب سند (عمق-اول) */
  index: number;
  /** شناسه repeater والد اگر فیلد داخل یک ردیف باشد */
  rowId?: string;
  sectionId?: string;
};

/** پیمایش عمق-اول با نگه‌داشتن دامنه (section / repeater) هر فیلد. */
export function walkFields(
  fields: ProcessField[],
  options: { sectionId?: string; rowId?: string; startIndex?: number } = {},
): FieldScopeEntry[] {
  const output: FieldScopeEntry[] = [];
  let index = options.startIndex ?? 0;
  const visit = (list: ProcessField[], sectionId?: string, rowId?: string) => {
    for (const field of list) {
      output.push({ field, index, sectionId, rowId });
      index += 1;
      if (field.subFields?.length) {
        visit(
          field.subFields,
          field.type === "section" ? field.id : sectionId,
          field.type === "repeater" ? field.id : rowId,
        );
      }
    }
  };
  visit(fields, options.sectionId, options.rowId);
  return output;
}

/**
 * آیا فیلد `sourceId` مجاز است در شرط فیلد `targetId` استفاده شود؟
 * قاعده: فقط فیلدهای قبلی در ترتیب سند؛ و اگر فیلد هدف داخل repeater است،
 * منبع هم باید داخل همان repeater باشد.
 */
export function isConditionReferenceAllowed(
  entries: FieldScopeEntry[],
  sourceId: string,
  targetId: string,
): boolean {
  const source = entries.find((entry) => entry.field.id === sourceId);
  const target = entries.find((entry) => entry.field.id === targetId);
  if (!source || !target) return false;
  if (source.index >= target.index) return false;
  if (target.rowId && source.rowId !== target.rowId) return false;
  return true;
}

/** فیلدهای مجاز برای شرط یک فیلد مشخص (برای پر کردن لیست متغیرها). */
export function allowedConditionSources(
  fields: ProcessField[],
  targetId: string,
): ProcessField[] {
  const entries = walkFields(fields);
  return entries
    .filter(
      (entry) =>
        entry.field.type !== "section" &&
        entry.field.id !== targetId &&
        isConditionReferenceAllowed(entries, entry.field.id, targetId),
    )
    .map((entry) => entry.field);
}

export type InvalidConditionReference = {
  fieldId: string;
  fieldLabel: string;
  variableId: string;
};

/** ارجاع‌های جلو‌رو یا خارج از دامنه در شروط فیلدها/بخش‌ها (H6). */
export function findInvalidConditionReferences(
  fields: ProcessField[],
): InvalidConditionReference[] {
  const entries = walkFields(fields);
  const known = new Set(entries.map((entry) => entry.field.id));
  const issues: InvalidConditionReference[] = [];
  for (const entry of entries) {
    const clauses = entry.field.condition?.clauses ?? [];
    for (const clause of clauses) {
      if (!clause.variableId) continue;
      const isKnown = known.has(clause.variableId);
      const allowed =
        isKnown && isConditionReferenceAllowed(entries, clause.variableId, entry.field.id);
      if (!allowed) {
        issues.push({
          fieldId: entry.field.id,
          fieldLabel: entry.field.label || "بدون عنوان",
          variableId: clause.variableId,
        });
      }
    }
  }
  return issues;
}

/** حذف یک شرط نامعتبر با یک کلیک (بدون از دست رفتن فیلد). */
export function stripInvalidConditions(
  fields: ProcessField[],
  brokenFieldIds: string[],
): ProcessField[] {
  const broken = new Set(brokenFieldIds);
  const visit = (list: ProcessField[]): ProcessField[] =>
    list.map((field) => ({
      ...field,
      ...(broken.has(field.id) ? { condition: undefined } : {}),
      ...(field.subFields ? { subFields: visit(field.subFields) } : {}),
    }));
  return visit(fields);
}

/** فیلدهای عددی قبل از یک فیلد (برای محاسبه‌ی same-form). */
export function numericFieldsBefore(
  fields: ProcessField[],
  targetId: string,
): ProcessField[] {
  const entries = walkFields(fields);
  const target = entries.find((entry) => entry.field.id === targetId);
  if (!target) return [];
  return entries
    .filter(
      (entry) =>
        entry.index < target.index &&
        entry.field.type === "number" &&
        (!target.rowId || entry.rowId === target.rowId),
    )
    .map((entry) => entry.field);
}
