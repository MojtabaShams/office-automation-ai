"use client";

import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTheme } from "../../theme-context";
import ConditionFormulaEditor, { type ConditionValue, type ConditionVariable } from "../ConditionFormulaEditor";
import { UNIT_CATEGORIES, type UnitCategoryId } from "../../app/lib/units";
import type { ProcessField, ProcessFieldType } from "../../app/lib/mock-processes";

type Props = {
  fields: ProcessField[];
  onChange: (fields: ProcessField[]) => void;
};

const FIELD_TYPES: { value: ProcessFieldType; label: string }[] = [
  { value: "text", label: "متن" },
  { value: "number", label: "عدد" },
  { value: "date", label: "تاریخ شمسی" },
  { value: "select", label: "انتخابی (فهرست)" },
  { value: "radio", label: "انتخابی (گزینه‌ای)" },
  { value: "boolean", label: "بله / خیر" },
  { value: "file", label: "بارگذاری فایل" },
  { value: "repeater", label: "گروه تکرارشونده (جدول)" },
];

function collectVariables(fields: ProcessField[], numericOnly = false): ConditionVariable[] {
  const variables: ConditionVariable[] = [];
  const visit = (field: ProcessField) => {
    if (!numericOnly || field.type === "number") {
      variables.push({
        id: field.id,
        label: field.label || "فیلد بدون عنوان",
        type: field.type,
        unit: field.unit,
        unitCategory: field.unitCategory,
      });
    }
    field.subFields?.forEach(visit);
  };
  fields.forEach(visit);
  return variables;
}

function createField(type: ProcessFieldType = "text"): ProcessField {
  return {
    id: `field-${crypto.randomUUID()}`,
    label: "",
    type,
    required: false,
    ...(type === "repeater" ? { subFields: [], minRows: 0, maxRows: 10 } : {}),
    ...(type === "file" ? { allowedFileTypes: ["application/pdf"], maxFileSizeMb: 10, minFiles: 1, maxFiles: 1 } : {}),
  };
}

type Tokens = {
  input: string;
  label: string;
  border: string;
  cardBg: string;
  subHeaderBg: string;
  nestedBg: string;
  dashedBorder: string;
  dangerHover: string;
  accentText: string;
};

function FieldConfig({ field, onUpdate, t }: { field: ProcessField; onUpdate: (patch: Partial<ProcessField>) => void; t: Tokens }) {
  const category = UNIT_CATEGORIES.find((item) => item.id === field.unitCategory);
  return (
    <div className={`grid gap-3 border-t pt-3 sm:grid-cols-2 ${t.border}`}>
      {field.type === "number" && (
        <>
          <label className={`space-y-1 text-xs ${t.label}`}>
            <span>دسته‌ی واحد</span>
            <select
              className={t.input}
              value={field.unitCategory ?? ""}
              onChange={(event) => {
                const nextCategory = UNIT_CATEGORIES.find((item) => item.id === event.target.value);
                onUpdate({ unitCategory: nextCategory?.id as UnitCategoryId | undefined, unit: nextCategory?.units[0]?.id });
              }}
            >
              <option value="">بدون واحد</option>
              {UNIT_CATEGORIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {category && (
            <label className={`space-y-1 text-xs ${t.label}`}>
              <span>واحد</span>
              <select className={t.input} value={field.unit ?? ""} onChange={(event) => onUpdate({ unit: event.target.value })}>
                {category.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
      {(field.type === "select" || field.type === "radio") && (
        <label className={`space-y-1 text-xs sm:col-span-2 ${t.label}`}>
          <span>گزینه‌ها (هر گزینه در یک خط)</span>
          <textarea
            className={t.input}
            rows={3}
            value={(field.options ?? []).join("\n")}
            onChange={(event) => onUpdate({ options: event.target.value.split("\n").map((option) => option.trim()).filter(Boolean) })}
          />
        </label>
      )}
      {field.type === "file" && (
        <>
          <label className={`space-y-1 text-xs ${t.label}`}>
            <span>فرمت‌های مجاز (با ویرگول)</span>
            <input
              className={t.input}
              value={(field.allowedFileTypes ?? []).join(", ")}
              onChange={(event) => onUpdate({ allowedFileTypes: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })}
            />
          </label>
          <label className={`space-y-1 text-xs ${t.label}`}>
            <span>حداکثر حجم (مگابایت)</span>
            <input className={t.input} type="number" min={1} value={field.maxFileSizeMb ?? 10} onChange={(event) => onUpdate({ maxFileSizeMb: Number(event.target.value) })} />
          </label>
          <label className={`space-y-1 text-xs ${t.label}`}>
            <span>حداقل تعداد فایل</span>
            <input className={t.input} type="number" min={0} value={field.minFiles ?? 0} onChange={(event) => onUpdate({ minFiles: Number(event.target.value) })} />
          </label>
          <label className={`space-y-1 text-xs ${t.label}`}>
            <span>حداکثر تعداد فایل</span>
            <input className={t.input} type="number" min={1} value={field.maxFiles ?? 1} onChange={(event) => onUpdate({ maxFiles: Number(event.target.value) })} />
          </label>
        </>
      )}
      {field.type === "repeater" && (
        <>
          <label className={`space-y-1 text-xs ${t.label}`}>
            <span>حداقل ردیف</span>
            <input className={t.input} type="number" min={0} value={field.minRows ?? 0} onChange={(event) => onUpdate({ minRows: Number(event.target.value) })} />
          </label>
          <label className={`space-y-1 text-xs ${t.label}`}>
            <span>حداکثر ردیف</span>
            <input className={t.input} type="number" min={1} value={field.maxRows ?? 10} onChange={(event) => onUpdate({ maxRows: Number(event.target.value) })} />
          </label>
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <span className={`text-xs font-semibold ${t.label}`}>زیرفیلدهای هر ردیف</span>
              <button type="button" className={`text-xs font-semibold ${t.accentText}`} onClick={() => onUpdate({ subFields: [...(field.subFields ?? []), createField()] })}>
                افزودن زیرفیلد
              </button>
            </div>
            {(field.subFields ?? []).map((subField, index) => (
              <div key={subField.id} className="flex gap-2">
                <input
                  className={t.input}
                  value={subField.label}
                  placeholder={`عنوان زیرفیلد ${index + 1}`}
                  onChange={(event) =>
                    onUpdate({ subFields: field.subFields?.map((item) => (item.id === subField.id ? { ...item, label: event.target.value } : item)) })
                  }
                />
                <select
                  className={`${t.input} max-w-40`}
                  value={subField.type}
                  onChange={(event) =>
                    onUpdate({ subFields: field.subFields?.map((item) => (item.id === subField.id ? { ...item, type: event.target.value as ProcessFieldType } : item)) })
                  }
                >
                  {FIELD_TYPES.filter((item) => item.value !== "repeater").map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <button type="button" aria-label="حذف زیرفیلد" className={`rounded-lg p-2 text-rose-500 ${t.dangerHover}`} onClick={() => onUpdate({ subFields: field.subFields?.filter((item) => item.id !== subField.id) })}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function FormSchemaBuilder({ fields, onChange }: Props) {
  const { isDarkMode } = useTheme();

  const t: Tokens = isDarkMode
    ? {
        input: "w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-[#15554f]",
        label: "text-white/55",
        border: "border-white/10",
        cardBg: "border-white/10 bg-[#193632]/50",
        subHeaderBg: "bg-white/[0.04]",
        nestedBg: "bg-white/[0.03]",
        dashedBorder: "border-white/15",
        dangerHover: "hover:bg-rose-500/10",
        accentText: "text-[#8bd0bf]",
      }
    : {
        input: "w-full rounded-xl border border-[#d5dad4] bg-white px-3 py-2 text-sm text-[#28443d] outline-none focus:border-[#15554f]",
        label: "text-[#68766c]",
        border: "border-[#e1e6df]",
        cardBg: "border-[#e1e6df] bg-white",
        subHeaderBg: "bg-[#f6f7f4]",
        nestedBg: "bg-[#f6f7f4]",
        dashedBorder: "border-[#cfd6ce]",
        dangerHover: "hover:bg-rose-50",
        accentText: "text-[#15554f]",
      };

  const sections = useMemo(() => fields.filter((field) => field.type === "section"), [fields]);

  const updateSection = (sectionId: string, update: (section: ProcessField) => ProcessField) => {
    onChange(fields.map((field) => (field.id === sectionId ? update(field) : field)));
  };
  const updateNested = (sectionId: string, fieldId: string, patch: Partial<ProcessField>) => {
    updateSection(sectionId, (section) => ({
      ...section,
      subFields: section.subFields?.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
    }));
  };
  const addSection = () =>
    onChange([
      ...fields,
      { id: `section-${crypto.randomUUID()}`, label: `بخش ${sections.length + 1}`, type: "section", required: false, subFields: [] },
    ]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold">فرم‌ساز ساخت‌یافته</h3>
          <p className={`mt-1 text-xs ${t.label}`}>فیلدها را داخل بخش‌ها بسازید؛ ترتیب بخش‌ها و فیلدها در فرم نهایی حفظ می‌شود.</p>
        </div>
        <button type="button" onClick={addSection} className="inline-flex items-center gap-2 rounded-xl bg-[#15554f] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#246b61]">
          <Plus size={16} /> افزودن بخش
        </button>
      </div>

      {sections.length === 0 && (
        <div className={`rounded-2xl border border-dashed p-8 text-center text-sm ${t.label} ${t.dashedBorder}`}>برای شروع یک بخش اضافه کنید.</div>
      )}

      {sections.map((section) => {
        const priorVariables = collectVariables(fields.slice(0, fields.findIndex((field) => field.id === section.id)));
        return (
          <details key={section.id} open className={`overflow-hidden rounded-2xl border ${t.cardBg}`}>
            <summary className={`flex cursor-pointer list-none items-center gap-2 px-4 py-3 ${t.subHeaderBg}`}>
              <input
                className={`${t.input} max-w-md font-semibold`}
                aria-label="عنوان بخش"
                value={section.label}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => updateSection(section.id, (item) => ({ ...item, label: event.target.value }))}
              />
              <span className={`mr-auto text-xs ${t.label}`}>{section.subFields?.length ?? 0} فیلد</span>
              <button
                type="button"
                aria-label="حذف بخش"
                className={`rounded-lg p-2 text-rose-500 ${t.dangerHover}`}
                onClick={(event) => {
                  event.preventDefault();
                  onChange(fields.filter((item) => item.id !== section.id));
                }}
              >
                <Trash2 size={16} />
              </button>
            </summary>
            <div className="space-y-3 p-4">
              {(section.subFields ?? []).map((field) => {
                const sectionFields = section.subFields ?? [];
                const earlierWithinSection = sectionFields.slice(0, sectionFields.findIndex((item) => item.id === field.id));
                const allowedVariables = [...priorVariables, ...collectVariables(earlierWithinSection)];
                const conditionValue: ConditionValue =
                  field.condition?.logic && field.condition.clauses ? { logic: field.condition.logic, clauses: field.condition.clauses } : { logic: "and", clauses: [] };
                return (
                  <article key={field.id} className={`space-y-3 rounded-xl border p-3 ${t.border}`}>
                    <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto_auto]">
                      <input className={t.input} placeholder="عنوان فیلد" value={field.label} onChange={(event) => updateNested(section.id, field.id, { label: event.target.value })} />
                      <select
                        className={t.input}
                        value={field.type}
                        onChange={(event) =>
                          updateNested(section.id, field.id, { ...createField(event.target.value as ProcessFieldType), id: field.id, label: field.label, required: field.required })
                        }
                      >
                        {FIELD_TYPES.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                      <label className={`flex items-center gap-2 whitespace-nowrap text-xs ${t.label}`}>
                        <input type="checkbox" checked={field.required} onChange={(event) => updateNested(section.id, field.id, { required: event.target.checked })} /> اجباری
                      </label>
                      <button
                        type="button"
                        aria-label="حذف فیلد"
                        className={`rounded-lg p-2 text-rose-500 ${t.dangerHover}`}
                        onClick={() => updateSection(section.id, (item) => ({ ...item, subFields: item.subFields?.filter((child) => child.id !== field.id) }))}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <FieldConfig field={field} onUpdate={(patch) => updateNested(section.id, field.id, patch)} t={t} />
                    <details className={`rounded-xl p-3 ${t.nestedBg}`}>
                      <summary className={`cursor-pointer text-xs font-semibold ${t.label}`}>نمایش شرطی (اختیاری)</summary>
                      <div className="mt-3">
                        {allowedVariables.length === 0 ? (
                          <p className={`text-xs ${t.label}`}>برای جلوگیری از وابستگی حلقه‌ای، باید پیش از این فیلد یک فیلد قرار داشته باشد.</p>
                        ) : (
                          <ConditionFormulaEditor mode="condition" variables={allowedVariables} value={conditionValue} onChange={(condition) => updateNested(section.id, field.id, { condition })} />
                        )}
                      </div>
                    </details>
                  </article>
                );
              })}
              <button
                type="button"
                onClick={() => updateSection(section.id, (item) => ({ ...item, subFields: [...(item.subFields ?? []), createField()] }))}
                className={`inline-flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm font-semibold ${t.accentText}`}
                style={{ borderColor: "#15554f" }}
              >
                <Plus size={16} /> افزودن فیلد به این بخش
              </button>
              <details className={`rounded-xl p-3 ${t.nestedBg}`}>
                <summary className={`cursor-pointer text-xs font-semibold ${t.label}`}>شرط نمایش بخش (اختیاری)</summary>
                <div className="mt-3">
                  {priorVariables.length === 0 ? (
                    <p className={`text-xs ${t.label}`}>این بخش در ابتدای فرم است و فیلد پیشینی برای شرط نمایش ندارد.</p>
                  ) : (
                    <ConditionFormulaEditor
                      mode="condition"
                      variables={priorVariables}
                      value={section.condition?.logic && section.condition.clauses ? { logic: section.condition.logic, clauses: section.condition.clauses } : { logic: "and", clauses: [] }}
                      onChange={(condition) => updateSection(section.id, (item) => ({ ...item, condition }))}
                    />
                  )}
                </div>
              </details>
            </div>
          </details>
        );
      })}
    </div>
  );
}