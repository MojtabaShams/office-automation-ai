/**
 * اعتبارسنجی انتشار پروسه (H1/H2/H3 + بخشی از M6).
 *
 * خروجی، خطاهای ساخت‌یافته و قابل کلیک است: هر خطا می‌داند مربوط به کدام
 * مرحله/فرم است تا پنل راست روی همان بخش باز شود.
 */

import type { ConditionValue, FormulaValue } from "../../components/ConditionFormulaEditor";
import {
  ROUTE_COMPLETE,
  ROUTE_REJECT,
  isAssigneeUnresolved,
  type Assignee,
  type ComputedProcessField,
  type ProcessDefinition,
  type ProcessField,
  type ProcessStage,
} from "./mock-processes";
import type { FormDefinition } from "./mock-forms";
import { getUnitCategoryId, unitLabelOf } from "./units";
import {
  findInvalidConditionReferences,
  isValidationConfigValid,
  walkFields,
} from "./field-validation";

export type ProcessIssuePanel = "process" | "stage" | "logic" | "form";

export type ProcessIssue = {
  id: string;
  severity: "error" | "warning";
  message: string;
  panel: ProcessIssuePanel;
  stageId?: string;
  formId?: string;
  fieldId?: string;
};

export type ProcessVariable = {
  id: string;
  label: string;
  type: string;
  unit?: string;
  unitCategory?: string;
  /** محاسبات پروسه‌ای */
  computed?: boolean;
};

const STAGE_CODE_RE = /^[A-Za-z0-9-]{2,20}$/;

export function formulaHasTokens(formula: FormulaValue | undefined): boolean {
  return Array.isArray(formula?.tokens) && formula.tokens.length > 0;
}

export function conditionHasVariable(condition: ConditionValue | undefined): boolean {
  return Boolean(condition?.clauses?.some((clause) => clause.variableId));
}

/** ایندکس مرحله با پشتیبانی از پایانه‌ها. */
export function stageIndexById(process: ProcessDefinition, stageId: string | undefined): number {
  if (!stageId) return -1;
  return process.stages.findIndex((stage) => stage.id === stageId);
}

export function routeTargetLabel(process: ProcessDefinition, target: string): string {
  if (target === ROUTE_COMPLETE) return "پایان موفق";
  if (target === ROUTE_REJECT) return "رد نهایی";
  const index = stageIndexById(process, target);
  if (index < 0) return "مقصد نامعتبر";
  return `${index + 1}. ${process.stages[index]?.title || "بدون عنوان"}`;
}

export function isRouteTargetForward(
  process: ProcessDefinition,
  fromStageId: string,
  target: string,
): boolean {
  if (target === ROUTE_COMPLETE || target === ROUTE_REJECT) return true;
  const from = stageIndexById(process, fromStageId);
  const to = stageIndexById(process, target);
  return from >= 0 && to > from;
}

/* -------------------------------------------------------- متغیرهای فرمول/شرط */

function formFields(form: FormDefinition | undefined): ProcessField[] {
  return form?.fields ?? [];
}

/** همه‌ی فیلدهای قابل ارجاع یک فرم (به‌جز بخش‌ها). */
export function formLeafFields(form: FormDefinition | undefined): ProcessField[] {
  return walkFields(formFields(form))
    .filter((entry) => entry.field.type !== "section")
    .map((entry) => entry.field);
}

/**
 * متغیرهای قابل استفاده در یک مرحله: فرم‌های همان مرحله و مراحل قبل،
 * به‌علاوه محاسباتی که مقصدشان قبل از این مرحله است.
 */
export function variablesAtStage(
  process: ProcessDefinition,
  forms: FormDefinition[],
  stageIndex: number,
  options: { numericOnly?: boolean } = {},
): ProcessVariable[] {
  if (stageIndex < 0) return [];
  const formIds = process.stages
    .slice(0, stageIndex + 1)
    .flatMap((item) => item.formIds ?? []);

  const fromForms: ProcessVariable[] = formIds.flatMap((formId) => {
    const form = forms.find((item) => item.id === formId);
    if (!form) return [];
    return formLeafFields(form)
      .filter((field) => !options.numericOnly || field.type === "number" || field.type === "computed")
      .map((field) => ({
        id: `${form.id}:${field.id}`,
        label: `${form.title} → ${field.label || "بدون عنوان"}`,
        type: field.type === "computed" ? "number" : field.type,
        unit: unitLabelOf(field.unit),
        unitCategory: field.unitCategory,
      }));
  });

  const computed: ProcessVariable[] = (process.computedFields ?? [])
    .filter((field) => {
      const destination = field.destination;
      if (destination.kind === "internal") return false;
      const destinationIndex = stageIndexById(process, destination.stageId);
      return destinationIndex >= 0 && destinationIndex <= stageIndex;
    })
    .map((field) => ({
      id: `calc:${field.id}`,
      label: `محاسبه: ${field.name || "بدون نام"}`,
      type: "number",
      unit: unitLabelOf(field.unit),
      unitCategory: field.unitCategory,
      computed: true,
    }));

  return [...fromForms, ...computed];
}

/** متغیرهای عددی قبل از یک مرحله (برای فرمول محاسبه در همان مرحله). */
export function numericVariablesBeforeStage(
  process: ProcessDefinition,
  forms: FormDefinition[],
  stageId: string,
): ProcessVariable[] {
  const index = stageIndexById(process, stageId);
  if (index < 0) return [];
  const formIds = process.stages
    .slice(0, index)
    .flatMap((item) => item.formIds ?? []);
  const fromForms = formIds.flatMap((formId) => {
    const form = forms.find((item) => item.id === formId);
    if (!form) return [];
    return walkFields(formFields(form))
      .filter((entry) => entry.field.type === "number" || entry.field.type === "computed")
      .map((entry) => ({
        id: `${form.id}:${entry.field.id}`,
        label: `${form.title} → ${entry.field.label || "بدون عنوان"}`,
        type: "number",
        unit: unitLabelOf(entry.field.unit),
        unitCategory: entry.field.unitCategory,
      }));
  });
  const computed = (process.computedFields ?? [])
    .filter((field) => {
      if (field.destination.kind === "internal") return false;
      const destinationIndex = stageIndexById(process, field.destination.stageId);
      return destinationIndex >= 0 && destinationIndex < index;
    })
    .map((field) => ({
      id: `calc:${field.id}`,
      label: `محاسبه: ${field.name || "بدون نام"}`,
      type: "number",
      unit: unitLabelOf(field.unit),
      unitCategory: field.unitCategory,
      computed: true,
    }));
  return [...fromForms, ...computed];
}

/* --------------------------------------------------------- اعتبارسنجی انتشار */

export function validateProcessForPublish(
  process: ProcessDefinition,
  forms: FormDefinition[],
): ProcessIssue[] {
  const issues: ProcessIssue[] = [];
  const add = (issue: Omit<ProcessIssue, "id">) =>
    issues.push({ ...issue, id: `${issue.panel}-${issue.stageId ?? ""}-${issue.message}` });

  if (!process.title.trim()) {
    add({ severity: "error", message: "عنوان پروسه را وارد کنید.", panel: "process" });
  }
  if (!STAGE_CODE_RE.test(process.code.trim())) {
    add({
      severity: "error",
      message: "کد شناسه باید ۲ تا ۲۰ نویسه انگلیسی، عدد یا خط تیره باشد.",
      panel: "process",
    });
  }
  if (!process.stages.length) {
    add({ severity: "error", message: "حداقل یک مرحله تعریف کنید.", panel: "process" });
    return issues;
  }

  process.stages.forEach((stage, index) => {
    const stageLabel = `مرحله ${index + 1} (${stage.title || "بدون عنوان"})`;

    if (!stage.title.trim()) {
      add({
        severity: "error",
        message: `عنوان ${stageLabel} را وارد کنید.`,
        panel: "stage",
        stageId: stage.id,
      });
    }

    if (stage.assignee.kind !== "applicant" && isAssigneeUnresolved(stage.assignee)) {
      const legacy = stage.legacyAssigneeLabel
        ? ` برچسب قدیمی: «${stage.legacyAssigneeLabel}».`
        : "";
      add({
        severity: "error",
        message: `مسئول ${stageLabel} انتخاب نشده است.${legacy}`,
        panel: "stage",
        stageId: stage.id,
      });
    }

    if (!(stage.formIds ?? []).length && !(stage.guidance ?? "").trim()) {
      add({
        severity: "error",
        message: `${stageLabel} نه فرم دارد و نه راهنمای متقاضی.`,
        panel: "stage",
        stageId: stage.id,
      });
    }

    for (const formId of stage.formIds ?? []) {
      const form = forms.find((item) => item.id === formId);
      if (!form) {
        add({
          severity: "error",
          message: `${stageLabel} به فرم حذف‌شده «${formId}» وصل است.`,
          panel: "stage",
          stageId: stage.id,
          formId,
        });
        continue;
      }
      if (form.status !== "active") {
        add({
          severity: "error",
          message: `فرم «${form.title}» در ${stageLabel} غیرفعال یا آرشیو شده است.`,
          panel: "stage",
          stageId: stage.id,
          formId: form.id,
        });
      }
      const lockedVersion = stage.formVersions?.[form.id];
      if (!lockedVersion) {
        add({
          severity: "warning",
          message: `نسخه‌ی قفل‌شده‌ی فرم «${form.title}» در ${stageLabel} ثبت نشده است.`,
          panel: "stage",
          stageId: stage.id,
          formId: form.id,
        });
      }
    }

    for (const rule of stage.routeRules ?? []) {
      if (!conditionHasVariable(rule.condition)) {
        add({
          severity: "error",
          message: `قانون مسیر ${stageLabel} شرط معتبر ندارد.`,
          panel: "stage",
          stageId: stage.id,
        });
      }
      for (const clause of rule.condition.clauses ?? []) {
        if (!clause.variableId) continue;
        const available = variablesAtStage(process, forms, index).map((item) => item.id);
        if (!available.includes(clause.variableId)) {
          add({
            severity: "error",
            message: `قانون مسیر ${stageLabel} به متغیر «${clause.variableId}» اشاره می‌کند که در این مرحله در دسترس نیست.`,
            panel: "stage",
            stageId: stage.id,
          });
        }
      }
      if (!isRouteTargetForward(process, stage.id, rule.nextStageId)) {
        add({
          severity: "error",
          message: `مقصد قانون مسیر ${stageLabel} باید یکی از مراحل بعدی یا پایانه باشد.`,
          panel: "stage",
          stageId: stage.id,
        });
      }
    }

    if (stage.defaultNextStageId && !isRouteTargetForward(process, stage.id, stage.defaultNextStageId)) {
      add({
        severity: "error",
        message: `مسیر پیش‌فرض ${stageLabel} باید یکی از مراحل بعدی یا پایانه باشد.`,
        panel: "stage",
        stageId: stage.id,
      });
    }

    if (stage.escalation) {
      if (isAssigneeUnresolved(stage.escalation.to)) {
        add({
          severity: "error",
          message: `مقصد ارجاع ${stageLabel} انتخاب نشده است.`,
          panel: "stage",
          stageId: stage.id,
        });
      }
      if (stage.escalation.afterDays > stage.slaDays) {
        add({
          severity: "warning",
          message: `زمان ارجاع ${stageLabel} (${stage.escalation.afterDays} روز) از مهلت مرحله (${stage.slaDays} روز) بیشتر است.`,
          panel: "stage",
          stageId: stage.id,
        });
      }
    }
  });

  /* ------------------------------------------------------------- محاسبات */
  (process.computedFields ?? []).forEach((field) => {
    validateComputed(process, forms, field, add);
  });

  /* ------------------------------------------- فرم‌ها: پرداخت/اعتبارسنجی */
  for (const form of forms) {
    if (!(process.stages.some((stage) => (stage.formIds ?? []).includes(form.id)))) continue;
    for (const entry of walkFields(formFields(form))) {
      const { field } = entry;
      if (field.type === "payment") {
        if (!field.payment?.gatewayId) {
          add({
            severity: "error",
            message: `فیلد پرداخت «${field.label}» در فرم «${form.title}» درگاه ندارد.`,
            panel: "form",
            formId: form.id,
            fieldId: field.id,
          });
        }
        if (!field.payment?.amountSource) {
          add({
            severity: "error",
            message: `منبع مبلغ فیلد پرداخت «${field.label}» در فرم «${form.title}» مشخص نیست.`,
            panel: "form",
            formId: form.id,
            fieldId: field.id,
          });
        }
        if (field.payment?.amountSource === "process_variable") {
          const target = field.payment.processVariableId;
          const exists = (process.computedFields ?? []).some(
            (computed) =>
              computed.id === target &&
              computed.destination.kind !== "internal" &&
              computed.destination.formId === form.id,
          );
          if (!exists) {
            add({
              severity: "error",
              message: `فیلد پرداخت «${field.label}» به محاسبه‌ای اشاره می‌کند که مقصدش این فرم نیست.`,
              panel: "form",
              formId: form.id,
              fieldId: field.id,
            });
          }
        }
      }
      if (!isValidationConfigValid(field.validation)) {
        add({
          severity: "error",
          message: `قواعد اعتبارسنجی «${field.label}» در فرم «${form.title}» ناسازگار است (حداقل بزرگ‌تر از حداکثر یا الگوی نامعتبر).`,
          panel: "form",
          formId: form.id,
          fieldId: field.id,
        });
      }
      if (field.type === "file" && field.minFiles != null && field.maxFiles != null && field.minFiles > field.maxFiles) {
        add({
          severity: "error",
          message: `حداقل تعداد فایل «${field.label}» از حداکثر آن بیشتر است.`,
          panel: "form",
          formId: form.id,
          fieldId: field.id,
        });
      }
      if (field.type === "repeater" && field.minRows != null && field.maxRows != null && field.minRows > field.maxRows) {
        add({
          severity: "error",
          message: `حداقل ردیف «${field.label}» از حداکثر آن بیشتر است.`,
          panel: "form",
          formId: form.id,
          fieldId: field.id,
        });
      }
    }

    for (const broken of findInvalidConditionReferences(formFields(form))) {
      add({
        severity: "error",
        message: `شرط فیلد «${broken.fieldLabel}» در فرم «${form.title}» به فیلد نامعتبر یا جلوتر اشاره می‌کند.`,
        panel: "form",
        formId: form.id,
        fieldId: broken.fieldId,
      });
    }
  }

  return dedupeIssues(issues);
}

function validateComputed(
  process: ProcessDefinition,
  forms: FormDefinition[],
  field: ComputedProcessField,
  add: (issue: Omit<ProcessIssue, "id">) => void,
) {
  const name = field.name || "بدون نام";
  if (!field.name.trim()) {
    add({ severity: "error", message: "نام همه‌ی فیلدهای محاسباتی الزامی است.", panel: "logic" });
  }
  if (!formulaHasTokens(field.formula)) {
    add({
      severity: "error",
      message: `فرمول محاسبه «${name}» خالی است.`,
      panel: "logic",
    });
  }

  const destination = field.destination;
  if (destination.kind === "internal") {
    const unitCategory = field.unitCategory ?? getUnitCategoryId(field.unit);
    if (field.unit && !unitCategory) {
      add({
        severity: "warning",
        message: `واحد «${name}» در فهرست واحدهای شناخته‌شده نیست.`,
        panel: "logic",
      });
    }
    return;
  }

  const stageIndex = stageIndexById(process, destination.stageId);
  if (stageIndex < 0) {
    add({
      severity: "error",
      message: `مرحله مقصد محاسبه «${name}» وجود ندارد.`,
      panel: "logic",
    });
    return;
  }
  const form = forms.find((item) => item.id === destination.formId);
  if (!form) {
    add({
      severity: "error",
      message: `فرم مقصد محاسبه «${name}» وجود ندارد.`,
      panel: "logic",
    });
    return;
  }
  const stage = process.stages[stageIndex];
  if (!(stage?.formIds ?? []).includes(form.id)) {
    add({
      severity: "error",
      message: `فرم مقصد محاسبه «${name}» به مرحله مقصد وصل نیست.`,
      panel: "logic",
    });
  }

  const targetField = formLeafFields(form).find((item) => item.id === destination.fieldId);
  if (!targetField) {
    add({
      severity: "error",
      message: `فیلد مقصد محاسبه «${name}» در فرم «${form.title}» پیدا نشد.`,
      panel: "logic",
    });
    return;
  }
  if (destination.kind === "payment_amount" && targetField.type !== "payment") {
    add({
      severity: "error",
      message: `محاسبه «${name}» باید به یک فیلد پرداخت متصل شود.`,
      panel: "logic",
    });
  }
  if (destination.kind === "form_field" && targetField.type === "payment") {
    add({
      severity: "warning",
      message: `محاسبه «${name}» روی فیلد پرداخت نوشته می‌شود؛ آیا منظور «مبلغ پرداخت» بوده است؟`,
      panel: "logic",
    });
  }

  // متغیرهای فرمول باید مربوط به مراحل قبل باشند.
  const available = new Set(numericVariablesBeforeStage(process, forms, destination.stageId).map((item) => item.id));
  for (const token of field.formula?.tokens ?? []) {
    if (token.kind !== "variable") continue;
    if (!available.has(token.variableId)) {
      add({
        severity: "error",
        message: `فرمول «${name}» به متغیر «${token.variableId}» اشاره می‌کند که مربوط به مراحل قبل نیست.`,
        panel: "logic",
      });
    }
  }
}

function dedupeIssues(issues: ProcessIssue[]): ProcessIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.panel}|${issue.stageId ?? ""}|${issue.formId ?? ""}|${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** متن کوتاه برای نمایش روی کارت پروسه. */
export function inactiveLinkedForms(
  process: ProcessDefinition,
  forms: FormDefinition[],
): FormDefinition[] {
  const linked = new Set(process.stages.flatMap((stage) => stage.formIds ?? []));
  return forms.filter((form) => linked.has(form.id) && form.status !== "active");
}

/**
 * برچسب خوانا برای مسئول مرحله.
 * نام واقعی نقش/کارمند در صورت وجود انتخاب می‌شود؛ وگرنه برچسب عمومی نوع مسئول.
 */
export function assigneeLabelOf(
  assignee: Assignee | undefined,
  lookup: { roleName?: (id: string) => string | undefined; employeeName?: (id: string) => string | undefined } = {},
): string {
  if (!assignee || assignee.kind === "applicant") return "متقاضی";
  if (assignee.kind === "role") {
    const name = assignee.accessLevelId ? lookup.roleName?.(assignee.accessLevelId) : undefined;
    return name || (assignee.accessLevelId ? "نقش انتخاب‌نشده" : "نقش سازمانی (انتخاب نشده)");
  }
  const name = assignee.employeeId ? lookup.employeeName?.(assignee.employeeId) : undefined;
  return name || (assignee.employeeId ? "کارمند انتخاب‌نشده" : "کارمند (انتخاب نشده)");
}

export type StageOutcomeSummary = {
  rejectLabel: string;
  escalationLabel?: string;
};

export function describeStageOutcome(
  process: ProcessDefinition,
  stage: ProcessStage,
): StageOutcomeSummary {
  const rejectLabel =
    stage.assignee.kind === "applicant"
      ? "مرحله متقاضی — امکان رد ندارد"
      : stage.onReject === "reject_final"
        ? "رد نهایی پرونده"
        : "بازگشت به آخرین مرحله متقاضی";
  const escalation = stage.escalation;
  const escalationLabel = escalation
    ? `پس از ${escalation.afterDays} روز → ${assigneeLabelOf(escalation.to)}`
    : undefined;
  void process;
  return { rejectLabel, escalationLabel };
}
