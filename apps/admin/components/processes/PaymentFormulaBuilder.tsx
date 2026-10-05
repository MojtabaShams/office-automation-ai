"use client";

import { useMemo, useRef, useState } from "react";
import { AtSign, Plus } from "lucide-react";
import type { ProcessField } from "../../app/lib/mock-processes";

const OPERATORS = ["+", "-", "*", "/", "(", ")"];

export default function PaymentFormulaBuilder({
  fields,
  formula,
  isDarkMode,
  onChange,
}: {
  fields: ProcessField[];
  formula: string;
  isDarkMode: boolean;
  onChange: (formula: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [caretPosition, setCaretPosition] = useState<number | null>(null);
  const [autocompleteQuery, setAutocompleteQuery] = useState("");

  const numericFields = useMemo(
    () => fields.filter((field) => field.type === "number"),
    [fields]
  );
  const suggestions = numericFields.filter((field) =>
    !autocompleteQuery
    || field.slug?.toLowerCase().includes(autocompleteQuery.toLowerCase())
    || field.label.toLocaleLowerCase("fa").includes(autocompleteQuery.toLocaleLowerCase("fa"))
  );
  const inputClass = isDarkMode
    ? "border-white/10 bg-[#102623] text-white placeholder:text-white/35"
    : "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]";
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";
  const surface = isDarkMode ? "border-white/10 bg-[#122925]" : "border-[#e1e6df] bg-[#f6f7f4]";

  const insertAt = (token: string, position?: number) => {
    const input = inputRef.current;
    const start = position ?? input?.selectionStart ?? formula.length;
    const end = position === undefined ? input?.selectionEnd ?? start : start;
    const next = `${formula.slice(0, start)}${token}${formula.slice(end)}`;
    onChange(next);
    setShowSuggestions(false);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const insertVariable = (field: ProcessField) => insertAt(`{${field.slug || field.id.replace(/[^a-zA-Z0-9_]/g, "_")}}`);

  return (
    <div className="mt-4 space-y-4">
      <section className={`rounded-xl border p-3 ${surface}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold">متغیرهای عددی فرم</h4>
            <p className={`mt-1 text-[0.65rem] ${muted}`}>انتخاب متغیر، شناسه‌ی آن را داخل فرمول قرار می‌دهد.</p>
          </div>
          <AtSign className="h-4 w-4 text-[#15554f]" />
        </div>
        {numericFields.length ? (
          <div className="flex flex-wrap gap-2">
            {numericFields.map((field) => (
              <button key={field.id} type="button" onClick={() => insertVariable(field)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.68rem] transition hover:border-[#15554f]/50 hover:bg-[#15554f]/10 ${isDarkMode ? "border-white/10 bg-white/[0.04] text-white/80" : "border-[#d5dad4] bg-white text-[#40584e]"}`}>
                <Plus className="h-3 w-3 text-[#15554f]" />
                {field.label || "فیلد عددی"} <code dir="ltr" className="rounded bg-black/5 px-1">{field.slug || field.id}</code>
              </button>
            ))}
          </div>
        ) : (
          <p className={`rounded-lg border border-dashed p-3 text-[0.68rem] ${muted}`}>فیلد عددی‌ای پیدا نشد. یک فیلد از نوع «عدد» در گام ۳ تعریف کنید تا در اینجا نمایش داده شود.</p>
        )}
      </section>

      <section className={`rounded-xl border p-3 ${surface}`}>
        <h4 className="mb-2 text-xs font-bold">ویرایشگر فرمول</h4>
        <div className="relative">
          <input
            ref={inputRef}
            value={formula}
            onChange={(event) => {
              onChange(event.target.value);
              const atIndex = event.target.value.lastIndexOf("@", event.target.selectionStart ?? event.target.value.length);
              const cursor = event.target.selectionStart ?? event.target.value.length;
              const hasClosedToken = atIndex >= 0 && !/\s/.test(event.target.value.slice(atIndex + 1, cursor));
              setShowSuggestions(hasClosedToken);
              setCaretPosition(cursor);
              setAutocompleteQuery(hasClosedToken ? event.target.value.slice(atIndex + 1, cursor) : "");
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setShowSuggestions(false);
              if (event.key === "@" || (event.key === "2" && event.shiftKey)) setShowSuggestions(true);
            }}
            onClick={(event) => {
              const target = event.currentTarget;
              const cursor = target.selectionStart ?? target.value.length;
              const atIndex = target.value.lastIndexOf("@", cursor);
              const hasOpenToken = atIndex >= 0 && !/\s/.test(target.value.slice(atIndex + 1, cursor));
              setShowSuggestions(hasOpenToken);
              setCaretPosition(cursor);
              setAutocompleteQuery(hasOpenToken ? target.value.slice(atIndex + 1, cursor) : "");
            }}
            dir="ltr"
            className={`w-full rounded-xl border px-3 py-3 font-mono text-sm outline-none focus:border-[#15554f] ${inputClass}`}
            placeholder="مثلاً {property_area} * 200000"
          />
          {showSuggestions && numericFields.length > 0 && (
            <div className={`absolute left-0 top-full z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border p-1.5 shadow-xl ${isDarkMode ? "border-white/10 bg-[#17332f]" : "border-[#d5dad4] bg-white"}`}>
              {suggestions.map((field) => (
                <button key={field.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => {
                  const input = inputRef.current;
                  const cursor = caretPosition ?? input?.selectionStart ?? formula.length;
                  const atIndex = formula.lastIndexOf("@", cursor);
                  const insertionPoint = atIndex >= 0 ? atIndex : cursor;
                  const replacement = `{${field.slug || field.id.replace(/[^a-zA-Z0-9_]/g, "_")}}`;
                  const next = `${formula.slice(0, insertionPoint)}${replacement}${formula.slice(cursor)}`;
                  onChange(next);
                  setShowSuggestions(false);
                  requestAnimationFrame(() => {
                    input?.focus();
                    input?.setSelectionRange(insertionPoint + replacement.length, insertionPoint + replacement.length);
                  });
                }} className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-right text-xs ${isDarkMode ? "hover:bg-white/[0.06]" : "hover:bg-[#edf0eb]"}`}>
                  <span>{field.label}</span><code dir="ltr" className={muted}>{field.slug || field.id}</code>
                </button>
              ))}
              {!suggestions.length && <p className={`px-2.5 py-2 text-xs ${muted}`}>متغیری با این شناسه پیدا نشد.</p>}
            </div>
          )}
        </div>
        <p className={`mt-1.5 text-[0.62rem] ${muted}`}>برای پیشنهاد متغیرها، @ را تایپ کنید. قالب شناسه متغیر در فرمول: {"{variable_key}"}.</p>
        <div className="mt-2 flex flex-wrap gap-1.5" dir="ltr">
          {OPERATORS.map((operator) => <button key={operator} type="button" onClick={() => insertAt(` ${operator} `)} className={`min-w-9 rounded-lg border px-2 py-1.5 font-mono text-xs ${isDarkMode ? "border-white/10 bg-white/[0.05] hover:bg-white/10" : "border-[#d5dad4] bg-white hover:bg-[#edf0eb]"}`}>{operator}</button>)}
        </div>
      </section>

    </div>
  );
}
