"use client";

import { useMemo, useState } from "react";
import { evaluate, parse, type MathNode } from "mathjs";
import { Check, Plus, Search, Trash2, X, AlertTriangle } from "lucide-react";
import { useTheme } from "../theme-context";
import { UNIT_LABELS, getUnitCategoryId } from "../app/lib/units";

export type ConditionVariable = {
  id: string;
  label: string;
  type: string;
  unit?: string;
  unitCategory?: string;
};

export type ConditionOperator =
  | "equals"
  | "notEquals"
  | "contains"
  | "isEmpty"
  | "greaterThan"
  | "lessThan";

export type ConditionClause = {
  variableId: string;
  operator: ConditionOperator;
  value: string;
};

export type ConditionValue = {
  logic: "and" | "or";
  clauses: ConditionClause[];
};

export type FormulaToken =
  | { kind: "variable"; variableId: string }
  | { kind: "number"; value: string }
  | { kind: "operator"; value: "+" | "-" | "*" | "/" | "(" | ")" }
  | { kind: "function"; value: "sin" | "cos" | "tan" | "sqrt" | "pow" | "round" | "abs" | "min" | "max" }
  | { kind: "separator"; value: "," };

export type FormulaValue = {
  tokens: FormulaToken[];
};

type SharedProps = {
  variables: ConditionVariable[];
  isDarkMode?: boolean;
};

type ConditionEditorProps = SharedProps & {
  mode: "condition";
  value: ConditionValue;
  onChange: (value: ConditionValue) => void;
};

type FormulaEditorProps = SharedProps & {
  mode: "formula";
  value: FormulaValue;
  onChange: (value: FormulaValue) => void;
};

type Props = ConditionEditorProps | FormulaEditorProps;

const CONDITION_OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: "equals", label: "برابر با" },
  { value: "notEquals", label: "نابرابر با" },
  { value: "contains", label: "شامل" },
  { value: "isEmpty", label: "خالی است" },
  { value: "greaterThan", label: "بزرگ‌تر از" },
  { value: "lessThan", label: "کوچک‌تر از" },
];

const FORMULA_FUNCTIONS = [
  "sin", "cos", "tan", "sqrt", "pow", "round", "abs", "min", "max",
] as const;

const FORMULA_OPERATORS: Exclude<FormulaToken, { kind: "variable" | "number" | "function" }>[] = [
  { kind: "operator", value: "+" },
  { kind: "operator", value: "-" },
  { kind: "operator", value: "*" },
  { kind: "operator", value: "/" },
  { kind: "operator", value: "(" },
  { kind: "operator", value: ")" },
  { kind: "separator", value: "," },
];

function formulaTokenText(token: FormulaToken) {
  switch (token.kind) {
    case "variable": return `{{${token.variableId}}}`;
    case "number": return token.value;
    case "function": return `${token.value}(`;
    case "operator":
    case "separator": return token.value;
  }
}

function validateMathNode(node: MathNode, variables: Set<string>): boolean {
  if (node.type === "ConstantNode" && "value" in node) {
    return typeof node.value === "number";
  }
  if (node.type === "SymbolNode" && "name" in node) {
    return typeof node.name === "string" && variables.has(node.name);
  }
  if (node.type === "ParenthesisNode" && "content" in node) {
    return isMathNode(node.content) && validateMathNode(node.content, variables);
  }
  if (node.type === "OperatorNode" && "op" in node && "args" in node) {
    return typeof node.op === "string"
      && ["+", "-", "*", "/"].includes(node.op)
      && Array.isArray(node.args)
      && node.args.every((argument) => isMathNode(argument) && validateMathNode(argument, variables));
  }
  if (node.type === "FunctionNode" && "fn" in node && "args" in node) {
    const fn = node.fn;
    return isMathNode(fn)
      && fn.type === "SymbolNode"
      && "name" in fn
      && typeof fn.name === "string"
      && FORMULA_FUNCTIONS.some((name) => name === fn.name)
      && Array.isArray(node.args)
      && node.args.every((argument) => isMathNode(argument) && validateMathNode(argument, variables));
  }
  return false;
}

function isMathNode(value: unknown): value is MathNode {
  return typeof value === "object"
    && value !== null
    && "type" in value
    && "isNode" in value
    && value.isNode === true;
}

function tokenUsesUnitMismatch(tokens: FormulaToken[], variableById: Map<string, ConditionVariable>) {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.kind !== "operator" || (token.value !== "+" && token.value !== "-")) continue;
    const before = tokens[index - 1];
    const after = tokens[index + 1];
    if (before?.kind !== "variable" || after?.kind !== "variable") continue;
    const first = variableById.get(before.variableId);
    const second = variableById.get(after.variableId);
    const firstCategory = first?.unitCategory ?? getUnitCategoryId(first?.unit);
    const secondCategory = second?.unitCategory ?? getUnitCategoryId(second?.unit);
    if (firstCategory && secondCategory && firstCategory !== secondCategory) return true;
  }
  return false;
}

export default function ConditionFormulaEditor(props: Props) {
  const theme = useTheme();
  const isDarkMode = props.isDarkMode ?? theme.isDarkMode;
  const t = isDarkMode
    ? {
        card: "border-white/10 bg-white/[0.035]",
        input: "border-white/10 bg-white/[0.06] text-white placeholder:text-white/35",
        muted: "text-white/55",
        quiet: "border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.08]",
      }
    : {
        card: "border-[#e1e6df] bg-[#f6f7f4]",
        input: "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]",
        muted: "text-[#68766c]",
        quiet: "border-[#d5dad4] bg-white text-[#40584e] hover:bg-[#edf0eb]",
      };
  const inputClass = `rounded-lg border px-2.5 py-2 text-xs outline-none focus:border-[#4f7aab] ${t.input}`;

  if (props.mode === "condition") {
    return <ConditionEditor {...props} isDarkMode={isDarkMode} inputClass={inputClass} themeClasses={t} />;
  }
  return <FormulaEditor {...props} isDarkMode={isDarkMode} inputClass={inputClass} themeClasses={t} />;
}

function ConditionEditor({
  variables,
  value,
  onChange,
  inputClass,
  themeClasses,
}: ConditionEditorProps & {
  isDarkMode: boolean;
  inputClass: string;
  themeClasses: { card: string; input: string; muted: string; quiet: string };
}) {
  const [searches, setSearches] = useState<Record<number, string>>({});
  const updateClause = (index: number, patch: Partial<ConditionClause>) =>
    onChange({ ...value, clauses: value.clauses.map((clause, clauseIndex) => clauseIndex === index ? { ...clause, ...patch } : clause) });

  return (
    <section className={`space-y-3 rounded-xl border p-3 ${themeClasses.card}`} dir="rtl">
      {value.clauses.map((clause, index) => {
        const query = searches[index] ?? "";
        const filtered = variables.filter((variable) => variable.label.toLocaleLowerCase("fa").includes(query.toLocaleLowerCase("fa")));
        return (
          <div key={`condition-${index}`} className="space-y-2">
            {index > 0 && (
              <select
                aria-label="ترکیب شرط‌ها"
                value={value.logic}
                onChange={(event) => onChange({ ...value, logic: event.target.value as ConditionValue["logic"] })}
                className={inputClass}
              >
                <option value="and">و (AND)</option>
                <option value="or">یا (OR)</option>
              </select>
            )}
            <div className="grid gap-2 sm:grid-cols-[minmax(140px,1.2fr)_minmax(110px,0.8fr)_minmax(100px,1fr)_auto]">
              <div>
                <label className={`mb-1 block text-[0.68rem] ${themeClasses.muted}`}>فیلد مرجع</label>
                <div className="relative">
                  <Search className={`absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${themeClasses.muted}`} />
                  <input value={query} onChange={(event) => setSearches((current) => ({ ...current, [index]: event.target.value }))} className={`w-full pr-8 ${inputClass}`} placeholder="جستجوی فیلد" />
                </div>
                <div className="mt-1 flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                  {filtered.map((variable) => (
                    <button key={variable.id} type="button" onClick={() => updateClause(index, { variableId: variable.id })} className={`rounded-full border px-2 py-1 text-[0.62rem] ${clause.variableId === variable.id ? "border-[#4f7aab] bg-[#4f7aab]/10 text-[#315d8a]" : themeClasses.quiet}`}>
                      {variable.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className={`text-[0.68rem] ${themeClasses.muted}`}>عملگر
                <select value={clause.operator} onChange={(event) => updateClause(index, { operator: event.target.value as ConditionOperator })} className={`mt-1 w-full ${inputClass}`}>
                  {CONDITION_OPERATORS.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
                </select>
              </label>
              {clause.operator !== "isEmpty" && (
                <label className={`text-[0.68rem] ${themeClasses.muted}`}>مقدار
                  <input value={clause.value} onChange={(event) => updateClause(index, { value: event.target.value })} className={`mt-1 w-full ${inputClass}`} />
                </label>
              )}
              <button type="button" aria-label="حذف شرط" disabled={value.clauses.length === 1} onClick={() => onChange({ ...value, clauses: value.clauses.filter((_, clauseIndex) => clauseIndex !== index) })} className="self-end rounded-lg p-2 text-rose-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={() => onChange({ ...value, clauses: [...value.clauses, { variableId: "", operator: "equals", value: "" }] })} className="inline-flex items-center gap-1 rounded-lg border border-[#4f7aab]/25 px-2.5 py-1.5 text-xs text-[#4f7aab]">
        <Plus className="h-3.5 w-3.5" />افزودن شرط
      </button>
    </section>
  );
}

function FormulaEditor({
  variables,
  value,
  onChange,
  inputClass,
  themeClasses,
}: FormulaEditorProps & {
  isDarkMode: boolean;
  inputClass: string;
  themeClasses: { card: string; input: string; muted: string; quiet: string };
}) {
  const [numberDraft, setNumberDraft] = useState("");
  const [sampleValues, setSampleValues] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<{ text: string; error: boolean } | null>(null);
  const numericVariables = variables.filter((variable) => variable.type === "number");
  const variableById = useMemo(() => new Map(variables.map((variable) => [variable.id, variable])), [variables]);
  const usedVariables = useMemo(() => {
    const ids = new Set(value.tokens.filter((token) => token.kind === "variable").map((token) => token.variableId));
    return numericVariables.filter((variable) => ids.has(variable.id));
  }, [numericVariables, value.tokens]);
  const variableIndexes = useMemo(() => new Map(
    numericVariables.map((variable, index) => [variable.id, `v_${index}`]),
  ), [numericVariables]);
  const expression = useMemo(() => value.tokens.map(formulaTokenText).join(" "), [value.tokens]);
  const unitMismatch = tokenUsesUnitMismatch(value.tokens, variableById);
  const appendToken = (token: FormulaToken) => onChange({ tokens: [...value.tokens, token] });
  const runFormulaTest = () => {
    try {
      const referencePattern = /\{\{([^}]+)\}\}/g;
      const names = new Map<string, string>();
      const normalized = expression.replace(referencePattern, (_match, variableId: string) => {
        const name = variableIndexes.get(variableId);
        if (!name) throw new Error("فرمول به فیلدی عددی و معتبر ارجاع نمی‌دهد.");
        names.set(name, variableId);
        return name;
      });
      if (!normalized.trim()) throw new Error("ابتدا متغیر و عملگرهای فرمول را اضافه کنید.");
      const tree = parse(normalized);
      const allowedSymbols = new Set([...names.keys(), ...FORMULA_FUNCTIONS]);
      if (!validateMathNode(tree, allowedSymbols)) throw new Error("فرمول شامل نماد یا عملگر غیرمجاز است.");
      const scope = Object.fromEntries([...names].map(([name, variableId]) => {
        const raw = sampleValues[variableId] ?? "";
        const parsed = Number(raw);
        if (!raw.trim() || !Number.isFinite(parsed)) throw new Error(`مقدار نمونه برای «${variableById.get(variableId)?.label ?? "فیلد"}» معتبر نیست.`);
        return [name, parsed];
      }));
      const result = evaluate(tree.toString(), scope);
      if (typeof result !== "number" || !Number.isFinite(result)) throw new Error("نتیجه فرمول یک عدد معتبر نیست.");
      setTestResult({ text: `نتیجه: ${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 8 }).format(result)}`, error: false });
    } catch (error) {
      setTestResult({ text: error instanceof Error ? error.message : "ارزیابی فرمول ناموفق بود.", error: true });
    }
  };

  return (
    <section className={`space-y-3 rounded-xl border p-3 ${themeClasses.card}`} dir="rtl">
      <div>
        <p className={`mb-2 text-xs font-semibold ${themeClasses.muted}`}>متغیرهای عددی در دسترس</p>
        <div className="flex flex-wrap gap-1.5">
          {numericVariables.map((variable) => (
            <button key={variable.id} type="button" onClick={() => appendToken({ kind: "variable", variableId: variable.id })} className="rounded-full border border-[#4f7aab]/25 bg-[#4f7aab]/10 px-2.5 py-1.5 text-[0.68rem] text-[#315d8a]">
              {variable.label}{variable.unit ? ` (${UNIT_LABELS[variable.unit] ?? variable.unit})` : ""}
            </button>
          ))}
          {!numericVariables.length && <span className={`text-[0.68rem] ${themeClasses.muted}`}>متغیر عددی در دسترس نیست.</span>}
        </div>
      </div>
      <div>
        <label className={`mb-1 block text-[0.68rem] ${themeClasses.muted}`}>عدد ثابت</label>
        <div className="flex gap-2">
          <input type="number" value={numberDraft} onChange={(event) => setNumberDraft(event.target.value)} className={`min-w-0 flex-1 ${inputClass}`} placeholder="مثلاً ۱۰" />
          <button type="button" disabled={!numberDraft || !Number.isFinite(Number(numberDraft))} onClick={() => { appendToken({ kind: "number", value: numberDraft }); setNumberDraft(""); }} className={`rounded-lg border px-3 text-xs disabled:opacity-40 ${themeClasses.quiet}`}>افزودن عدد</button>
        </div>
      </div>
      <div>
        <p className={`mb-1.5 text-[0.68rem] ${themeClasses.muted}`}>توابع و عملگرهای مجاز</p>
        <div className="flex flex-wrap gap-1.5">
          {FORMULA_FUNCTIONS.map((fn) => <button key={fn} type="button" onClick={() => appendToken({ kind: "function", value: fn })} className={`rounded-lg border px-2 py-1 text-xs ${themeClasses.quiet}`}>{fn}()</button>)}
          {FORMULA_OPERATORS.map((operator, index) => <button key={`${operator.kind}-${operator.value}-${index}`} type="button" onClick={() => appendToken(operator)} className={`rounded-lg border px-2 py-1 text-xs ${themeClasses.quiet}`}>{operator.value === "*" ? "×" : operator.value === "/" ? "÷" : operator.value}</button>)}
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className={`text-[0.68rem] ${themeClasses.muted}`}>پیش‌نمایش فرمول (توالی توکن‌ها):</p>
          <button type="button" disabled={!value.tokens.length} onClick={() => { onChange({ tokens: value.tokens.slice(0, -1) }); setTestResult(null); }} className={`rounded-lg border p-1.5 disabled:opacity-40 ${themeClasses.quiet}`} aria-label="حذف آخرین جزء فرمول"><X className="h-3.5 w-3.5" /></button>
        </div>
        <div className={`flex min-h-12 flex-wrap gap-1.5 rounded-lg border p-2 ${themeClasses.input}`} dir="ltr">
          {value.tokens.map((token, index) => (
            <span key={`${token.kind}-${index}`} className={`rounded-md px-2 py-1 text-xs ${token.kind === "variable" ? "bg-[#4f7aab]/15 text-[#315d8a]" : "bg-black/[0.05]"}`}>
              {token.kind === "variable" ? variableById.get(token.variableId)?.label ?? "فیلد حذف‌شده" : token.kind === "function" ? `${token.value}(` : token.value}
            </span>
          ))}
          {!value.tokens.length && <span className={`text-xs ${themeClasses.muted}`} dir="rtl">برای ساخت فرمول روی متغیرها یا عملگرها کلیک کنید.</span>}
        </div>
      </div>
      {unitMismatch && (
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[0.68rem] text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>این دو فیلد واحد همخوانی ندارند، مطمئن هستید؟</span>
        </div>
      )}
      {!!usedVariables.length && (
        <div className="grid gap-2 sm:grid-cols-2">
          {usedVariables.map((variable) => (
            <label key={variable.id} className={`text-[0.68rem] ${themeClasses.muted}`}>
              مقدار نمونه: {variable.label}{variable.unit ? ` (${UNIT_LABELS[variable.unit] ?? variable.unit})` : ""}
              <input type="number" value={sampleValues[variable.id] ?? ""} onChange={(event) => setSampleValues((current) => ({ ...current, [variable.id]: event.target.value }))} className={`mt-1 w-full ${inputClass}`} />
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={runFormulaTest} className="inline-flex items-center gap-1.5 rounded-lg bg-[#4f7aab] px-3 py-2 text-xs font-semibold text-white hover:bg-[#416b98]"><Check className="h-3.5 w-3.5" />تست فرمول</button>
        {testResult && <p role={testResult.error ? "alert" : "status"} className={`text-xs ${testResult.error ? "text-rose-600" : "text-emerald-700"}`}>{testResult.text}</p>}
      </div>
    </section>
  );
}