"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import ThemedSelect from "../ThemedSelect";
import type { ProcessConditionOperator, ProcessField, ProcessFieldType } from "../../app/lib/mock-processes";
import { UNIT_CATEGORIES, getUnitCategoryId } from "../../app/lib/units";

const FIELD_TYPES: { value: ProcessFieldType; label: string }[] = [
  { value: "text", label: "متن" },
  { value: "number", label: "عدد" },
  { value: "date", label: "تاریخ" },
  { value: "file", label: "بارگذاری فایل" },
  { value: "select", label: "فهرست انتخاب" },
  { value: "repeater", label: "جدول / لیست تکرارشونده" },
  { value: "section", label: "بخش / گروه فیلدها" },
];

const OPERATORS: { value: ProcessConditionOperator; label: string }[] = [
  { value: "equals", label: "برابر با" },
  { value: "notEquals", label: "برابر نباشد با" },
  { value: "contains", label: "شامل" },
  { value: "greaterThan", label: "بزرگ‌تر از" },
  { value: "lessThan", label: "کوچک‌تر از" },
];

const INPUT = {
  light: "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]",
  dark: "border-white/10 bg-white/[0.06] text-white placeholder:text-white/35",
};

function slugify(label: string, fallback: string) {
  const transliteration: Record<string, string> = {
    ا: "a", آ: "a", ب: "b", پ: "p", ت: "t", ث: "s", ج: "j", چ: "ch", ح: "h", خ: "kh",
    د: "d", ذ: "z", ر: "r", ز: "z", ژ: "zh", س: "s", ش: "sh", ص: "s", ض: "z", ط: "t",
    ظ: "z", ع: "a", غ: "gh", ف: "f", ق: "gh", ک: "k", گ: "g", ل: "l", م: "m", ن: "n",
    و: "v", ه: "h", ی: "y",
  };
  const commonWords: Record<string, string> = {
    مساحت: "area", زمین: "land", تعداد: "count", طبقه: "floor", طبقات: "floors",
    عضو: "member", اعضا: "members", خانواده: "family", نام: "name", مبلغ: "amount",
    قیمت: "price", وزن: "weight", تاریخ: "date", آدرس: "address", شماره: "number",
  };
  const parts = label.toLocaleLowerCase("fa").match(/[\u0600-\u06ff]+|[a-z]+|\d+/g) ?? [];
  const result = parts.map((part) => commonWords[part] ?? [...part].map((character) => transliteration[character] ?? character).join("")).join("_");
  return (result.replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || fallback).slice(0, 48);
}

function uniqueSlug(label: string, fallback: string, fields: ProcessField[], currentId: string) {
  const base = slugify(label, fallback);
  const taken = new Set(fields.filter((field) => field.id !== currentId).map((field) => field.slug).filter(Boolean));
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

function uniqueSlugValue(value: string, fields: ProcessField[], currentId: string) {
  const base = value.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (!base) return "";
  const taken = new Set(fields.filter((field) => field.id !== currentId).map((field) => field.slug).filter(Boolean));
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

export default function ProcessFieldBuilder({
  fields,
  isDarkMode,
  onChange,
}: {
  fields: ProcessField[];
  isDarkMode: boolean;
  onChange: (fields: ProcessField[]) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const inputClass = `w-full rounded-lg border px-2.5 py-2 text-[0.68rem] outline-none focus:border-[#15554f] ${isDarkMode ? INPUT.dark : INPUT.light}`;
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";
  const card = isDarkMode ? "border-white/10 bg-[#122925]/65" : "border-[#e1e6df] bg-[#f6f7f4]";

  const patchField = (index: number, patch: Partial<ProcessField>) =>
    onChange(fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field));

  const addField = () => {
    const id = `field-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onChange([...fields, { id, label: "", type: "text", required: false, slug: "" }]);
  };

  const addSubField = (index: number) => {
    const parent = fields[index]!;
    const current = parent.subFields ?? [];
    const id = `subfield-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const child: ProcessField = { id, label: "", type: "text", required: false, slug: "" };
    patchField(index, { subFields: [...current, child] });
    setExpanded((currentExpanded) => ({ ...currentExpanded, [parent.id]: true }));
  };

  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${isDarkMode ? "border-white/10 bg-white/[0.035]" : "border-[#e1e6df] bg-white"}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">فرم متقاضی</h3>
          <p className={`mt-1 text-[0.68rem] ${muted}`}>{fields.length} فیلد اصلی · شناسه‌ها برای فرمول قابل استفاده‌اند</p>
        </div>
        <button type="button" onClick={addField} className="inline-flex items-center gap-1 rounded-xl border border-[#15554f]/25 px-3 py-2 text-xs font-semibold text-[#15554f] hover:bg-[#15554f]/10">
          <Plus className="h-3.5 w-3.5" />افزودن فیلد
        </button>
      </div>

      <div className="space-y-3">
        {fields.map((field, index) => {
          const isContainer = field.type === "section" || field.type === "repeater";
          const isExpanded = expanded[field.id] ?? true;
          const validConditionFields = fields.filter((other) => other.id !== field.id && other.type !== "section" && other.type !== "repeater");
          return (
            <article key={field.id} className={`rounded-xl border p-3 ${card}`}>
              <div className="grid items-end gap-2 sm:grid-cols-[minmax(140px,1fr)_minmax(150px,0.8fr)_minmax(130px,0.7fr)_auto]">
                <label className={`text-[0.68rem] font-semibold ${muted}`}>عنوان فیلد
                  <input
                    value={field.label}
                    onChange={(event) => {
                      const label = event.target.value;
                      patchField(index, {
                        label,
                        slug: !field.slug || field.slug === uniqueSlug(field.label, `field_${index + 1}`, fields, field.id)
                          ? uniqueSlug(label, `field_${index + 1}`, fields, field.id)
                          : field.slug,
                      });
                    }}
                    className={`${inputClass} mt-1`}
                    placeholder="مثلاً مساحت ملک"
                  />
                </label>
                <label className={`text-[0.68rem] font-semibold ${muted}`}>نوع فیلد
                  <ThemedSelect
                    value={field.type}
                    onChange={(event) => patchField(index, { type: event.target.value as ProcessFieldType, ...(event.target.value === "repeater" && !field.subFields ? { subFields: [] } : {}) })}
                    className={`${inputClass} mt-1 pl-8`}
                    arrowClassName={`left-2.5 ${muted}`}
                  >
                    {FIELD_TYPES.map((type) => <option key={type.value} value={type.value} style={{ background: "#fff", color: "#111827" }}>{type.label}</option>)}
                  </ThemedSelect>
                </label>
                <label className={`text-[0.68rem] font-semibold ${muted}`}>کلید متغیر
                  <input
                    value={field.slug ?? ""}
                    onChange={(event) => patchField(index, { slug: uniqueSlugValue(event.target.value, fields, field.id) })}
                    className={`${inputClass} mt-1`}
                    dir="ltr"
                    placeholder="property_area"
                  />
                </label>
                <div className="flex items-center gap-1">
                  {isContainer && (
                    <button type="button" aria-label={isExpanded ? "بستن زیرفیلدها" : "بازکردن زیرفیلدها"} onClick={() => setExpanded((value) => ({ ...value, [field.id]: !isExpanded }))} className={`rounded-lg border p-2 ${isDarkMode ? "border-white/10" : "border-[#d5dad4]"}`}>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  )}
                  {field.type !== "section" && (
                    <label className={`flex items-center gap-1 whitespace-nowrap px-1 text-[0.65rem] ${muted}`}>
                      <input type="checkbox" checked={field.required} onChange={(event) => patchField(index, { required: event.target.checked })} className="accent-[#15554f]" />اجباری
                    </label>
                  )}
                  <button type="button" disabled={fields.length <= 1} aria-label="حذف فیلد" onClick={() => onChange(fields.filter((_, fieldIndex) => fieldIndex !== index))} className="rounded-lg p-2 text-rose-600 hover:bg-rose-500/10 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>

              {!isContainer && field.type === "number" && (
                <div className="mt-2 grid max-w-xl gap-2 sm:grid-cols-2">
                  <label className={`text-[0.68rem] font-semibold ${muted}`}>دسته واحد
                    <ThemedSelect
                      value={field.unitCategory ?? getUnitCategoryId(field.unit) ?? ""}
                      onChange={(event) => {
                        const category = UNIT_CATEGORIES.find((item) => item.id === event.target.value);
                        patchField(index, {
                          unitCategory: category?.id,
                          unit: category?.units[0]?.id ?? "",
                        });
                      }}
                      className={`${inputClass} mt-1 pl-8`}
                      arrowClassName={`left-2.5 ${muted}`}
                    >
                      <option value="" style={{ background: "#fff", color: "#111827" }}>انتخاب دسته</option>
                      {UNIT_CATEGORIES.map((category) => <option key={category.id} value={category.id} style={{ background: "#fff", color: "#111827" }}>{category.label}</option>)}
                    </ThemedSelect>
                  </label>
                  <label className={`text-[0.68rem] font-semibold ${muted}`}>واحد
                    <ThemedSelect
                      value={field.unit ?? ""}
                      onChange={(event) => patchField(index, { unit: event.target.value })}
                      disabled={!field.unitCategory && !getUnitCategoryId(field.unit)}
                      className={`${inputClass} mt-1 pl-8`}
                      arrowClassName={`left-2.5 ${muted}`}
                    >
                      <option value="" style={{ background: "#fff", color: "#111827" }}>انتخاب واحد</option>
                      {UNIT_CATEGORIES.find((category) => category.id === (field.unitCategory ?? getUnitCategoryId(field.unit)))?.units.map((unit) => <option key={unit.id} value={unit.id} style={{ background: "#fff", color: "#111827" }}>{unit.label}</option>)}
                    </ThemedSelect>
                  </label>
                </div>
              )}

              {!isContainer && field.type !== "number" && field.type !== "file" && field.type !== "date" && field.type !== "section" && (
                <label className={`mt-2 block max-w-xs text-[0.68rem] font-semibold ${muted}`}>واحد، پیشوند یا پسوند (اختیاری)
                  <input value={field.unit ?? ""} onChange={(event) => patchField(index, { unit: event.target.value })} className={`${inputClass} mt-1`} placeholder="متن واحد" />
                </label>
              )}

              {field.type === "select" && (
                <label className={`mt-2 block text-[0.68rem] font-semibold ${muted}`}>گزینه‌ها (با ویرگول جدا کنید)
                  <input value={(field.options ?? []).join("، ")} onChange={(event) => patchField(index, { options: event.target.value.split(/[،,]/).map((option) => option.trim()).filter(Boolean) })} className={`${inputClass} mt-1`} placeholder="گزینه اول، گزینه دوم" />
                </label>
              )}

              {field.condition && (
                <div className="mt-3 rounded-lg border border-dashed border-[#15554f]/25 p-2.5">
                  <p className={`mb-2 text-[0.68rem] font-semibold ${muted}`}>نمایش شرطی</p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_0.8fr_1fr_auto]">
                    <ThemedSelect
                      value={field.condition.fieldKey}
                      onChange={(event) => patchField(index, { condition: { ...field.condition!, fieldKey: event.target.value } })}
                      className={inputClass}
                      arrowClassName={`left-2.5 ${muted}`}
                    >
                      <option value="" style={{ background: "#fff", color: "#111827" }}>انتخاب فیلد</option>
                      {validConditionFields.map((candidate) => <option key={candidate.id} value={candidate.slug || candidate.id} style={{ background: "#fff", color: "#111827" }}>{candidate.label || "بدون عنوان"}</option>)}
                    </ThemedSelect>
                    <ThemedSelect
                      value={field.condition.operator}
                      onChange={(event) => patchField(index, { condition: { ...field.condition!, operator: event.target.value as ProcessConditionOperator } })}
                      className={inputClass}
                      arrowClassName={`left-2.5 ${muted}`}
                    >
                      {OPERATORS.map((operator) => <option key={operator.value} value={operator.value} style={{ background: "#fff", color: "#111827" }}>{operator.label}</option>)}
                    </ThemedSelect>
                    <input value={field.condition.value} onChange={(event) => patchField(index, { condition: { ...field.condition!, value: event.target.value } })} className={inputClass} placeholder="مقدار شرط" />
                    <button type="button" onClick={() => patchField(index, { condition: undefined })} aria-label="حذف شرط" className="rounded-lg p-2 text-rose-600 hover:bg-rose-500/10"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              )}
              {!field.condition && validConditionFields.length > 0 && (
                <button type="button" onClick={() => patchField(index, { condition: { fieldKey: validConditionFields[0]?.slug || validConditionFields[0]!.id, operator: "equals", value: "" } })} className={`mt-2 text-[0.68rem] font-semibold ${isDarkMode ? "text-[#8bd0bf]" : "text-[#15554f]"}`}>
                  + افزودن شرط نمایش
                </button>
              )}

              {isContainer && isExpanded && (
                <div className={`mt-3 border-r-2 pr-3 ${isDarkMode ? "border-white/10" : "border-[#d5dad4]"}`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[0.68rem] font-semibold">{field.type === "section" ? "فیلدهای این بخش" : "ستون‌های جدول تکرارشونده"}</p>
                      <p className={`mt-0.5 text-[0.62rem] ${muted}`}>{field.type === "repeater" ? "متقاضی می‌تواند چند ردیف به این فهرست اضافه کند." : "این فیلدها به‌صورت یک گروه نمایش داده می‌شوند."}</p>
                    </div>
                    <button type="button" onClick={() => addSubField(index)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#15554f]/25 px-2 py-1.5 text-[0.65rem] text-[#15554f] hover:bg-[#15554f]/10"><Plus className="h-3 w-3" />افزودن زیرفیلد</button>
                  </div>
                  <div className="space-y-2">
                    {(field.subFields ?? []).map((subField, subIndex) => (
                      <div key={subField.id} className="grid items-center gap-2 sm:grid-cols-[1fr_120px_1fr_1fr_auto_auto]">
                        <input value={subField.label} onChange={(event) => {
                          const label = event.target.value;
                          const next = [...(field.subFields ?? [])];
                          const previousAutoSlug = uniqueSlug(subField.label, `item_${subIndex + 1}`, next, subField.id);
                          next[subIndex] = { ...subField, label, slug: !subField.slug || subField.slug === previousAutoSlug ? uniqueSlug(label, `item_${subIndex + 1}`, next, subField.id) : subField.slug };
                          patchField(index, { subFields: next });
                        }} className={inputClass} placeholder="عنوان زیرفیلد" />
                        <ThemedSelect value={subField.type} onChange={(event) => {
                          const next = [...(field.subFields ?? [])];
                          next[subIndex] = { ...subField, type: event.target.value as ProcessFieldType };
                          patchField(index, { subFields: next });
                        }} className={inputClass} arrowClassName={`left-2.5 ${muted}`}>
                          {FIELD_TYPES.filter((item) => item.value !== "section" && item.value !== "repeater").map((type) => <option key={type.value} value={type.value} style={{ background: "#fff", color: "#111827" }}>{type.label}</option>)}
                        </ThemedSelect>
                        <input value={subField.slug ?? ""} onChange={(event) => {
                          const next = [...(field.subFields ?? [])];
                          next[subIndex] = { ...subField, slug: uniqueSlugValue(event.target.value, field.subFields ?? [], subField.id) };
                          patchField(index, { subFields: next });
                        }} className={inputClass} dir="ltr" placeholder="variable_key" />
                        {subField.type === "number" ? (
                          <div className="grid gap-1">
                            <ThemedSelect value={subField.unitCategory ?? getUnitCategoryId(subField.unit) ?? ""} onChange={(event) => {
                              const category = UNIT_CATEGORIES.find((item) => item.id === event.target.value);
                              const next = [...(field.subFields ?? [])];
                              next[subIndex] = { ...subField, unitCategory: category?.id, unit: category?.units[0]?.id ?? "" };
                              patchField(index, { subFields: next });
                            }} className={inputClass} arrowClassName={`left-2.5 ${muted}`}>
                              <option value="" style={{ background: "#fff", color: "#111827" }}>دسته</option>
                              {UNIT_CATEGORIES.map((category) => <option key={category.id} value={category.id} style={{ background: "#fff", color: "#111827" }}>{category.label}</option>)}
                            </ThemedSelect>
                            <ThemedSelect value={subField.unit ?? ""} onChange={(event) => {
                              const next = [...(field.subFields ?? [])];
                              next[subIndex] = { ...subField, unit: event.target.value };
                              patchField(index, { subFields: next });
                            }} className={inputClass} arrowClassName={`left-2.5 ${muted}`}>
                              <option value="" style={{ background: "#fff", color: "#111827" }}>واحد</option>
                              {UNIT_CATEGORIES.find((category) => category.id === (subField.unitCategory ?? getUnitCategoryId(subField.unit)))?.units.map((unit) => <option key={unit.id} value={unit.id} style={{ background: "#fff", color: "#111827" }}>{unit.label}</option>)}
                            </ThemedSelect>
                          </div>
                        ) : (
                          <input value={subField.unit ?? ""} onChange={(event) => {
                            const next = [...(field.subFields ?? [])];
                            next[subIndex] = { ...subField, unit: event.target.value };
                            patchField(index, { subFields: next });
                          }} className={inputClass} placeholder="واحد" />
                        )}
                        <label className={`flex items-center gap-1 whitespace-nowrap text-[0.62rem] ${muted}`}>
                          <input type="checkbox" checked={subField.required} onChange={(event) => {
                            const next = [...(field.subFields ?? [])];
                            next[subIndex] = { ...subField, required: event.target.checked };
                            patchField(index, { subFields: next });
                          }} className="accent-[#15554f]" />اجباری
                        </label>
                        <button type="button" aria-label="حذف زیرفیلد" onClick={() => patchField(index, { subFields: (field.subFields ?? []).filter((_, itemIndex) => itemIndex !== subIndex) })} className="rounded-lg p-2 text-rose-600 hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                    {!field.subFields?.length && <p className={`rounded-lg border border-dashed p-3 text-center text-[0.65rem] ${muted}`}>هنوز زیرفیلدی اضافه نشده است.</p>}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
