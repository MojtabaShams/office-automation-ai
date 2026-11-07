"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleDollarSign,
  Clock3,
  FileText,
  Info,
  Loader2,
  Lock,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import { useTheme } from "../theme-context";
import JalaliDateField from "./JalaliDateField";
import ThemedSelect from "./ThemedSelect";
import {
  postApplicantSubmit,
  type ProcessField,
  type ProcessForm,
  type ProcessStep,
  type ProcessStepperPayload,
  type SubmitApplicationResult,
} from "../lib/agent-api";

/** ``{form_id: {field_name: value}}`` exactly as the submit endpoint expects. */
type Values = Record<string, Record<string, unknown>>;
type Errors = Record<string, string>;

function nameOf(field: ProcessField, index: number): string {
  return field.slug || field.id || `field-${index + 1}`;
}

function typeOf(field: ProcessField): string {
  return field.type ?? "text";
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

/** Mirrors ``process_flow_service._validate_fields`` so the wizard fails politely. */
function validateFields(fields: ProcessField[], values: Record<string, unknown>, errors: Errors, prefix = ""): void {
  fields.forEach((field, index) => {
    const type = typeOf(field);
    const name = nameOf(field, index);
    const label = field.label || name;

    if (type === "section") {
      validateFields(field.subFields ?? [], values, errors, prefix);
      return;
    }

    if (type === "payment" || type === "computed") return;

    if (type === "repeater") {
      const rows = Array.isArray(values[name]) ? (values[name] as Record<string, unknown>[]) : [];
      if (field.required && rows.length === 0) {
        errors[`${prefix}${name}`] = `«${label}» باید حداقل یک ردیف داشته باشد.`;
      }
      rows.forEach((row, rowIndex) => {
        validateFields(field.subFields ?? [], row, errors, `${prefix}${name}[${rowIndex + 1}].`);
      });
      return;
    }

    const value = values[name];
    const key = `${prefix}${name}`;

    if (type === "boolean") {
      if (field.required && value !== true) errors[key] = `«${label}» باید تأیید شود.`;
      return;
    }

    if (isEmptyValue(value)) {
      if (field.required) errors[key] = `«${label}» الزامی است.`;
      return;
    }

    if (type === "number") {
      const num = Number(value);
      if (Number.isNaN(num)) {
        errors[key] = `«${label}» باید عدد باشد.`;
        return;
      }
      if (field.validation?.min !== undefined && num < field.validation.min) {
        errors[key] = `«${label}» نباید کمتر از ${field.validation.min} باشد.`;
        return;
      }
      if (field.validation?.max !== undefined && num > field.validation.max) {
        errors[key] = `«${label}» نباید بیشتر از ${field.validation.max} باشد.`;
        return;
      }
      return;
    }

    const options = (field.options ?? []).filter((option) => option !== "");
    if ((type === "select" || type === "radio") && options.length > 0 && !options.includes(String(value))) {
      errors[key] = `«${label}» باید یکی از گزینه‌های مجاز باشد.`;
      return;
    }

    if (type === "file") {
      const files = Array.isArray(value) ? value : [value];
      if (field.maxFiles && files.length > field.maxFiles) {
        errors[key] = `تعداد فایل‌های «${label}» نباید بیشتر از ${field.maxFiles} باشد.`;
        return;
      }
      if (field.minFiles && files.length < field.minFiles) {
        errors[key] = `«${label}» باید حداقل ${field.minFiles} فایل داشته باشد.`;
        return;
      }
      return;
    }

    const text = String(value);
    if (field.validation?.minLength && text.length < field.validation.minLength) {
      errors[key] = `«${label}» باید حداقل ${field.validation.minLength} کاراکتر باشد.`;
      return;
    }
    if (field.validation?.maxLength && text.length > field.validation.maxLength) {
      errors[key] = `«${label}» نباید بیشتر از ${field.validation.maxLength} کاراکتر باشد.`;
      return;
    }
    if (field.validation?.pattern) {
      try {
        if (!new RegExp(field.validation.pattern).test(text)) {
          errors[key] = `قالب «${label}» معتبر نیست.`;
        }
      } catch {
        /* an invalid pattern in the builder must not block the applicant */
      }
    }
  });
}

function validateForm(form: ProcessForm, values: Record<string, unknown>): Errors {
  const errors: Errors = {};
  validateFields(form.fields ?? [], values, errors);
  return errors;
}

function firstRowError(errors: Errors, name: string, row: number): string | undefined {
  const prefix = `${name}[${row + 1}].`;
  return Object.entries(errors).find(([key]) => key.startsWith(prefix))?.[1];
}

function FieldControl({
  field,
  index,
  value,
  error,
  isDarkMode,
  onChange,
}: {
  field: ProcessField;
  index: number;
  value: unknown;
  error?: string;
  isDarkMode: boolean;
  onChange: (next: unknown) => void;
}) {
  const type = typeOf(field);
  const name = nameOf(field, index);
  const label = field.label || name;
  const inputCls = `mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none transition-colors ${
    error
      ? "border-rose-500 focus:border-rose-500"
      : isDarkMode
        ? "border-white/10 bg-white/[0.06] text-white placeholder:text-white/35 focus:border-[#4f8f83]"
        : "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587] focus:border-[#15554f]"
  }`;
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";

  if (type === "hidden") return null;

  if (type === "section") {
    return (
      <div
        className={`rounded-2xl border p-3 ${
          isDarkMode ? "border-white/10 bg-white/[0.03]" : "border-[#e2e6e0] bg-[#fafbf8]"
        }`}
      >
        {label ? <p className="mb-2 text-xs font-bold">{label}</p> : null}
        <div className="space-y-3">
          {(field.subFields ?? []).map((child, childIndex) => (
            <FieldControl
              key={nameOf(child, childIndex)}
              field={child}
              index={childIndex}
              value={(value as Record<string, unknown> | undefined)?.[nameOf(child, childIndex)]}
              isDarkMode={isDarkMode}
              onChange={(next) => {
                const current = (value as Record<string, unknown> | undefined) ?? {};
                onChange({ ...current, [nameOf(child, childIndex)]: next });
              }}
            />
          ))}
      </div>
      </div>
    );
  }

  if (type === "payment") {
    const amount = field.payment?.defaultAmount;
    return (
      <div
        className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
          isDarkMode ? "border-amber-300/20 bg-amber-300/10 text-amber-100" : "border-amber-300/50 bg-amber-50 text-[#7a5a12]"
        }`}
      >
        <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {label}
          {typeof amount === "number" ? ` — ${amount.toLocaleString("fa-IR")} تومان` : " — مبلغ هنگام ثبت محاسبه می‌شود"}
        </span>
      </div>
    );
  }

  if (type === "computed") {
    return (
      <p className={`text-xs ${muted}`}>
        {label}: به‌صورت خودکار توسط سامانه محاسبه می‌شود.
      </p>
    );
  }

  if (type === "date") {
    return (
      <div className="block text-xs font-semibold">
        <p>
          {label}
          {field.required ? " *" : ""}
        </p>
        <div className="mt-1">
          <JalaliDateField
            value={typeof value === "string" ? value : ""}
            onChange={(next) => onChange(next)}
            invalid={Boolean(error)}
            placeholder={field.placeholder ?? "انتخاب تاریخ شمسی"}
          />
        </div>
        {error ? <p className="mt-1 text-[0.65rem] font-medium text-rose-500">{error}</p> : null}
        {field.helpText && !error ? <p className={`mt-1 text-[0.65rem] font-normal ${muted}`}>{field.helpText}</p> : null}
      </div>
    );
  }

  if (type === "boolean") {
    return (
      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#15554f]"
        />
        <span>
          {label}
          {field.required ? " *" : ""}
          {field.helpText ? <span className={`mt-0.5 block text-[0.65rem] ${muted}`}>{field.helpText}</span> : null}
          {error ? <span className="mt-0.5 block text-[0.65rem] text-rose-500">{error}</span> : null}
        </span>
      </label>
    );
  }

  if (type === "repeater") {
    const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
    const canAdd = !field.maxRows || rows.length < field.maxRows;
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold">
            {label}
            {field.required ? " *" : ""}
          </p>
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => onChange([...rows, {}])}
            className="rounded-lg border border-[#15554f]/30 px-2 py-1 text-[0.7rem] font-semibold text-[#15554f] transition-colors hover:bg-[#15554f]/10 disabled:opacity-40"
          >
            افزودن ردیف
          </button>
        </div>
        {rows.length === 0 ? (
          <p className={`text-[0.7rem] ${muted}`}>هنوز ردیفی اضافه نشده است.</p>
        ) : null}
        {rows.map((row, rowIndex) => (
          <div
            key={`${name}-row-${rowIndex}`}
            className={`rounded-xl border p-3 ${
              isDarkMode ? "border-white/10 bg-white/[0.04]" : "border-[#e2e6e0] bg-[#fafbf8]"
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className={`text-[0.7rem] font-semibold ${muted}`}>ردیف {rowIndex + 1}</span>
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, position) => position !== rowIndex))}
                className="text-[0.7rem] text-rose-500 hover:underline"
              >
                حذف
              </button>
            </div>
            <div className="space-y-3">
              {(field.subFields ?? []).map((child, childIndex) => (
                <FieldControl
                  key={nameOf(child, childIndex)}
                  field={child}
                  index={childIndex}
                  value={row[nameOf(child, childIndex)]}
                  isDarkMode={isDarkMode}
                  onChange={(next) =>
                    onChange(rows.map((item, position) => (position === rowIndex ? { ...item, [nameOf(child, childIndex)]: next } : item)))
                  }
                />
              ))}
            </div>
            {firstRowError({ ...(error ? { [`${name}[${rowIndex + 1}].`]: error } : {}) }, name, rowIndex) ? (
              <p className="mt-1 text-[0.65rem] text-rose-500">{firstRowError({ ...(error ? { [`${name}[${rowIndex + 1}].`]: error } : {}) }, name, rowIndex)}</p>
            ) : null}
          </div>
        ))}
        {error ? <p className="text-[0.65rem] text-rose-500">{error}</p> : null}
      </div>
    );
  }

  if (type === "radio" && (field.options ?? []).length > 0) {
    return (
      <div>
        <p className="text-xs font-semibold">
          {label}
          {field.required ? " *" : ""}
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          {(field.options ?? []).map((option) => (
            <label
              key={option}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${
                value === option
                  ? "border-[#15554f] bg-[#15554f]/10"
                  : isDarkMode
                    ? "border-white/10 bg-white/[0.04]"
                    : "border-[#d5dad4] bg-white"
              }`}
            >
              <input
                type="radio"
                name={name}
                checked={value === option}
                onChange={() => onChange(option)}
                className="h-3.5 w-3.5 accent-[#15554f]"
              />
              {option}
            </label>
          ))}
        </div>
        {error ? <p className="mt-1 text-[0.65rem] text-rose-500">{error}</p> : null}
      </div>
    );
  }

  if (type === "file") {
    const files = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div>
        <p className="text-xs font-semibold">
          {label}
          {field.required ? " *" : ""}
        </p>
        <label
          className={`mt-1 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs ${
            isDarkMode ? "border-white/20 text-white/70 hover:bg-white/[0.06]" : "border-[#c6cec4] text-[#40584e] hover:bg-[#f2f5ef]"
          }`}
        >
          <Paperclip className="h-3.5 w-3.5" />
          انتخاب فایل
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? []).map((file) => file.name);
              onChange(picked);
            }}
          />
        </label>
        {files.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {files.map((file) => (
              <span
                key={file}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[0.65rem] ${
                  isDarkMode ? "border-white/15 bg-white/[0.06]" : "border-[#d5dad4] bg-[#f6f7f4]"
                }`}
              >
                <FileText className="h-3 w-3" />
                {file}
                <button type="button" onClick={() => onChange(files.filter((item) => item !== file))} aria-label={`حذف ${file}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {error ? <p className="mt-1 text-[0.65rem] text-rose-500">{error}</p> : null}
      </div>
    );
  }

  if (type === "select" && (field.options ?? []).length > 0) {
    /** Native dropdown lists ignore the closed select's classes; force readable colors. */
    const optionStyle = {
      background: isDarkMode ? "#17332f" : "#ffffff",
      color: isDarkMode ? "#ffffff" : "#28443d",
    };
    return (
      <label className="block text-xs font-semibold">
        {label}
        {field.required ? " *" : ""}
        <ThemedSelect
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputCls} pl-9`}
          arrowClassName={`left-3 ${muted}`}
          wrapperClassName="block w-full"
        >
          <option value="" style={optionStyle}>انتخاب کنید</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option} style={optionStyle}>
              {option}
            </option>
          ))}
        </ThemedSelect>
        {error ? <span className="mt-1 block text-[0.65rem] font-medium text-rose-500">{error}</span> : null}
      </label>
    );
  }

  if (type === "textarea") {
    return (
      <label className="block text-xs font-semibold">
        {label}
        {field.required ? " *" : ""}
        <textarea
          rows={3}
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputCls} resize-y`}
        />
        {error ? <span className="mt-1 block text-[0.65rem] font-medium text-rose-500">{error}</span> : null}
        {field.helpText && !error ? <span className={`mt-1 block text-[0.65rem] font-normal ${muted}`}>{field.helpText}</span> : null}
      </label>
    );
  }

  const inputType =
    type === "number" ? "number" : type === "time" ? "time" : type === "email" ? "email" : type === "tel" ? "tel" : "text";
  const ltr = ["number", "time", "tel", "email"].includes(type);

  return (
    <label className="block text-xs font-semibold">
      {label}
      {field.required ? " *" : ""}
      <input
        type={inputType}
        dir={ltr ? "ltr" : "rtl"}
        placeholder={field.placeholder}
        value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
        onChange={(event) => onChange(event.target.value)}
        className={inputCls}
      />
      {error ? <span className="mt-1 block text-[0.65rem] font-medium text-rose-500">{error}</span> : null}
      {field.helpText && !error ? <span className={`mt-1 block text-[0.65rem] font-normal ${muted}`}>{field.helpText}</span> : null}
    </label>
  );
}

export default function ProcessStepper({
  payload,
  sessionId,
  onClose,
  onSubmitted,
}: {
  payload: ProcessStepperPayload;
  sessionId?: string | null;
  onClose: () => void;
  onSubmitted?: (result: SubmitApplicationResult) => void;
}) {
  const { isDarkMode } = useTheme();
  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(
      payload.steps.flatMap((step) =>
        step.forms.map((form) => [form.form_id, form.prefill ?? {}]),
      ),
    ),
  );
  const [errors, setErrors] = useState<Record<string, Errors>>({});
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<SubmitApplicationResult | null>(null);

  useEffect(() => {
    setValues(Object.fromEntries(
      payload.steps.flatMap((step) =>
        step.forms.map((form) => [form.form_id, form.prefill ?? {}]),
      ),
    ));
    setErrors({});
    setIndex(0);
  }, [payload]);

  const collecting = useMemo(() => payload.steps.filter((step) => step.collectsInput), [payload.steps]);
  const staffSteps = useMemo(() => payload.steps.filter((step) => !step.collectsInput), [payload.steps]);
  const current: ProcessStep | undefined = collecting[index];
  const isLast = index >= collecting.length - 1;

  const cardBg = isDarkMode ? "rgba(20,45,42,0.98)" : "#fbfcf9";
  const border = isDarkMode ? "border-white/10" : "border-[#dfe4dc]";
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";
  const soft = isDarkMode ? "bg-white/[0.05]" : "bg-[#f2f5ef]";

  const setFieldValue = (formId: string, name: string, next: unknown) => {
    setValues((prev) => ({
      ...prev,
      [formId]: { ...(prev[formId] ?? {}), [name]: next },
    }));
    setErrors((prev) => {
      const formErrors = prev[formId];
      if (!formErrors || !formErrors[name]) return prev;
      const nextErrors = { ...formErrors };
      delete nextErrors[name];
      return { ...prev, [formId]: nextErrors };
    });
  };

  const validateStep = (step: ProcessStep): boolean => {
    const nextErrors: Record<string, Errors> = { ...errors };
    let valid = true;
    step.forms.forEach((form) => {
      const formErrors = validateForm(form, values[form.form_id] ?? {});
      if (Object.keys(formErrors).length > 0) {
        nextErrors[form.form_id] = formErrors;
        valid = false;
      } else {
        delete nextErrors[form.form_id];
      }
    });
    setErrors(nextErrors);
    return valid;
  };

  const goNext = () => {
    if (!current) return;
    if (!validateStep(current)) {
      setSubmitError("برای ادامه، فیلدهای الزامی این مرحله را تکمیل کنید.");
      return;
    }
    setSubmitError("");
    setIndex((value) => Math.min(value + 1, collecting.length - 1));
  };

  const goBack = () => {
    setSubmitError("");
    setIndex((value) => Math.max(value - 1, 0));
  };

  const submit = async () => {
    if (busy) return;
    const invalid: Record<string, Errors> = {};
    collecting.forEach((step) => {
      step.forms.forEach((form) => {
        const formErrors = validateForm(form, values[form.form_id] ?? {});
        if (Object.keys(formErrors).length > 0) invalid[form.form_id] = formErrors;
      });
    });
    if (Object.keys(invalid).length > 0) {
      setErrors(invalid);
      setSubmitError("برخی فیلدهای الزامی تکمیل نشده‌اند؛ مراحل را بررسی کنید.");
      return;
    }
    setBusy(true);
    setSubmitError("");
    try {
      const response = await postApplicantSubmit(payload.process_id, values, sessionId);
      setResult(response);
      onSubmitted?.(response);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "ثبت درخواست ناموفق بود.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border shadow-xl ${border}`}
      style={{ background: cardBg }}
      aria-label={`فرایند ${payload.title}`}
    >
        {/* header */}
        <div className={`flex items-start justify-between gap-3 border-b px-4 py-3 ${border}`}>
          <div className="min-w-0">
            <p className="truncate text-sm font-black">{payload.title}</p>
            <div className={`mt-1 flex flex-wrap items-center gap-2 text-[0.65rem] ${muted}`}>
              {payload.department ? (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {payload.department}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <ChevronLeft className="h-3 w-3" />
                {payload.steps.length} مرحله
              </span>
              {payload.version ? <span>نسخه {payload.version}</span> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن فرایند"
            className={`rounded-full border p-1.5 transition-colors ${border} ${isDarkMode ? "hover:bg-white/10" : "hover:bg-[#eef2ea]"}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {result ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            <p className="text-base font-black">درخواست شما ثبت شد</p>
            <p className={`text-xs ${muted}`}>{result.message}</p>
            {result.trackingCode ? (
              <p className={`rounded-xl px-3 py-2 text-sm font-bold ${soft}`} dir="ltr">
                {result.trackingCode}
              </p>
            ) : null}
            {result.case?.currentStageTitle ? (
              <p className={`text-xs ${muted}`}>مرحله فعلی: {String(result.case.currentStageTitle)}</p>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-xl bg-[#15554f] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#246b61]"
            >
              بستن
            </button>
          </div>
        ) : (
          <>
            {/* progress rail */}
            <div className={`flex items-center gap-1.5 overflow-x-auto border-b px-4 py-2.5 ${border}`}>
              {collecting.map((step, position) => {
                const done = position < index;
                const active = position === index;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => {
                      if (position <= index) setIndex(position);
                    }}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.65rem] transition-colors ${
                      active
                        ? "border-[#15554f] bg-[#15554f] text-white"
                        : done
                          ? "border-[#15554f]/40 bg-[#15554f]/10 text-[#15554f]"
                          : isDarkMode
                            ? "border-white/10 text-white/50"
                            : "border-[#dfe4dc] text-[#8c9587]"
                    }`}
                  >
                    {done ? <Check className="h-3 w-3" /> : <span className="font-bold">{position + 1}</span>}
                    <span className="max-w-[8rem] truncate">{step.title}</span>
                  </button>
                );
              })}
              {staffSteps.map((step) => (
                <span
                  key={step.id}
                  className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[0.6rem] ${
                    isDarkMode ? "border-white/10 text-white/35" : "border-[#e6eae3] text-[#98a29a]"
                  }`}
                  title={`این مرحله توسط ${step.responsibleUnit} انجام می‌شود`}
                >
                  <Lock className="h-2.5 w-2.5" />
                  {step.title}
                </span>
              ))}
            </div>

            {/* body */}
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {payload.guidance ? (
                <div className={`flex items-start gap-2 rounded-xl px-3 py-2 text-[0.7rem] leading-5 ${soft}`}>
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#15554f]" />
                  <span>{payload.guidance}</span>
                </div>
              ) : null}

              {current ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-black">
                      مرحله {current.index}: {current.title}
                    </h2>
                    <div className={`flex items-center gap-2 text-[0.65rem] ${muted}`}>
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {current.responsibleUnit}
                      </span>
                      {current.slaDays > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="h-3 w-3" />
                          {current.slaDays} روز
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {current.guidance ? (
                    <div
                      className={`rounded-xl border-r-4 border-[#15554f] px-3 py-2 text-[0.72rem] leading-6 ${
                        isDarkMode ? "bg-white/[0.04]" : "bg-[#f6f8f3]"
                      }`}
                    >
                      راهنمای این مرحله: {current.guidance}
                    </div>
                  ) : null}

                  {current.forms.length === 0 ? (
                    <p className={`text-xs ${muted}`}>این مرحله فرمی برای تکمیل ندارد.</p>
                  ) : null}

                  {current.forms.map((form) => (
                    <section
                      key={form.form_id}
                      className={`rounded-2xl border p-3 ${border} ${isDarkMode ? "bg-white/[0.02]" : "bg-white"}`}
                    >
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-black">{form.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[0.6rem] ${soft}`}>فرم مرحله</span>
                      </div>
                      {form.description ? <p className={`mb-2 text-[0.68rem] leading-5 ${muted}`}>{form.description}</p> : null}
                      {form.guidance ? (
                        <p
                          className={`mb-2 rounded-lg border px-2 py-1.5 text-[0.68rem] leading-5 ${
                            isDarkMode ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-100" : "border-cyan-200 bg-cyan-50 text-[#15554f]"
                          }`}
                        >
                          راهنمای فرم: {form.guidance}
                        </p>
                      ) : null}
                      {form.missing ? (
                        <p className="text-[0.68rem] text-rose-500">این فرم در سامانه یافت نشد؛ با پشتیبانی تماس بگیرید.</p>
                      ) : null}
                      {form.rules && form.rules.length > 0 ? (
                        <ul className={`mb-2 list-disc space-y-0.5 pr-4 text-[0.65rem] ${muted}`}>
                          {form.rules.map((rule) => (
                            <li key={rule}>{rule}</li>
                          ))}
                        </ul>
                      ) : null}

                      <div className="space-y-3">
                        {(form.fields ?? []).map((field, fieldIndex) => {
                          const fieldName = nameOf(field, fieldIndex);
                          return (
                            <FieldControl
                              key={`${form.form_id}-${fieldName}`}
                              field={field}
                              index={fieldIndex}
                              value={(values[form.form_id] ?? {})[fieldName]}
                              error={errors[form.form_id]?.[fieldName]}
                              isDarkMode={isDarkMode}
                              onChange={(next) => setFieldValue(form.form_id, fieldName, next)}
                            />
                          );
                        })}
                      </div>
                    </section>
                  ))}

                  {staffSteps.length > 0 ? (
                    <div className={`rounded-xl border border-dashed px-3 py-2 text-[0.65rem] leading-5 ${border} ${muted}`}>
                      پس از ثبت:{" "}
                      {staffSteps.map((step) => `${step.title} (${step.responsibleUnit})`).join(" ← ")}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className={`text-xs ${muted}`}>فرمی برای تکمیل در این فرایند تعریف نشده است.</p>
              )}
            </div>

            {/* footer */}
            <div className={`space-y-2 border-t px-4 py-3 ${border}`}>
              {payload.submittedToday ? (
                <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[0.68rem] text-amber-700">
                  شما امروز یک درخواست ثبت کرده‌اید؛ هر کاربر در هر روز فقط یک درخواست می‌تواند ثبت کند.
                </p>
              ) : null}
              {submitError ? (
                <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-1.5 text-[0.68rem] text-rose-600">{submitError}</p>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={index === 0 || busy}
                  className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-40 ${border} ${
                    isDarkMode ? "hover:bg-white/10" : "hover:bg-[#eef2ea]"
                  }`}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  مرحله قبل
                </button>

                <span className={`text-[0.65rem] ${muted}`}>
                  {collecting.length > 0 ? `${index + 1} از ${collecting.length}` : "—"}
                </span>

                {isLast ? (
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={busy || payload.submittedToday === true}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#15554f] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#246b61] disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    ثبت نهایی درخواست
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#15554f] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#246b61] disabled:opacity-60"
                  >
                    مرحله بعد
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
  );
}
