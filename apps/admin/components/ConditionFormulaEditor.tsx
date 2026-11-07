"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, FlaskConical, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getUnitCategoryId } from "../app/lib/units";
import { useTheme } from "../theme-context";

/* ----------------------------------------------------------------------- */
/* انواع داده                                                              */
/* ----------------------------------------------------------------------- */

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
  | { kind: "operator"; value: string }
  | { kind: "function"; value: string }
  | { kind: "number"; value: string };

export type FormulaValue = {
  tokens: FormulaToken[];
};

export type ConditionVariable = {
  id: string;
  label: string;
  type: string; // "number" | "text" | "date" | ...
  unit?: string;
  unitCategory?: string;
};

type Props =
  | {
      mode: "condition";
      variables: ConditionVariable[];
      value: ConditionValue | undefined;
      onChange: (value: ConditionValue) => void;
    }
  | {
      mode: "formula";
      variables: ConditionVariable[];
      value: FormulaValue | undefined;
      onChange: (value: FormulaValue) => void;
    };

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals: "برابر است با",
  notEquals: "نابرابر است با",
  contains: "شامل می‌شود",
  isEmpty: "خالی است",
  greaterThan: "بزرگ‌تر از",
  lessThan: "کوچک‌تر از",
};

const MATH_FUNCTIONS = ["sin", "cos", "tan", "sqrt", "pow", "round", "abs", "min", "max"];

const emptyClause = (): ConditionClause => ({ variableId: "", operator: "equals", value: "" });

/* ----------------------------------------------------------------------- */
/* ارزیابی‌کننده‌ی امن فرمول (بدون eval؛ فقط عملگرهای ریاضی و توابع مجاز)     */
/* ----------------------------------------------------------------------- */

function tokensToExpression(tokens: FormulaToken[], scope: Record<string, number>): string {
  return tokens
    .map((t) => {
      if (t.kind === "variable") {
        const v = scope[t.variableId];
        return typeof v === "number" && !Number.isNaN(v) ? String(v) : "0";
      }
      return t.value;
    })
    .join(" ");
}

/** ارزیابی امن یک عبارت ریاضی ساده (توکنایزر + پارسر بازگشتی دستی، بدون eval) */
function safeEvaluate(expression: string): number {
  let pos = 0;
  const src = expression.replace(/\s+/g, "");

  function peek() {
    return src[pos];
  }
  function error(msg: string): never {
    throw new Error(msg);
  }

  function parseNumber(): number {
    const start = pos;
    while (pos < src.length && /[0-9.]/.test(src[pos]!)) pos += 1;
    if (pos === start) error("عدد نامعتبر در فرمول");
    return parseFloat(src.slice(start, pos));
  }

  function parseIdentifier(): string {
    const start = pos;
    while (pos < src.length && /[a-zA-Z]/.test(src[pos]!)) pos += 1;
    return src.slice(start, pos);
  }

  function parseArgs(): number[] {
    const args: number[] = [];
    if (peek() === ")") return args;
    args.push(parseExpr());
    while (peek() === ",") {
      pos += 1;
      args.push(parseExpr());
    }
    return args;
  }

  function applyFn(name: string, args: number[]): number {
    switch (name) {
      case "sin":
        return Math.sin(args[0] ?? 0);
      case "cos":
        return Math.cos(args[0] ?? 0);
      case "tan":
        return Math.tan(args[0] ?? 0);
      case "sqrt":
        return Math.sqrt(args[0] ?? 0);
      case "pow":
        return Math.pow(args[0] ?? 0, args[1] ?? 0);
      case "round":
        return Math.round(args[0] ?? 0);
      case "abs":
        return Math.abs(args[0] ?? 0);
      case "min":
        return Math.min(...args);
      case "max":
        return Math.max(...args);
      default:
        error(`تابع ناشناخته: ${name}`);
    }
  }

  function parseAtom(): number {
    if (peek() === "(") {
      pos += 1;
      const v = parseExpr();
      if (peek() !== ")") error("پرانتز بسته‌نشده در فرمول");
      pos += 1;
      return v;
    }
    if (peek() === "-") {
      pos += 1;
      return -parseAtom();
    }
    if (peek() === "+") {
      pos += 1;
      return parseAtom();
    }
    if (/[a-zA-Z]/.test(peek() ?? "")) {
      const name = parseIdentifier();
      if (peek() === "(") {
        pos += 1;
        const args = parseArgs();
        if (peek() !== ")") error("پرانتز بسته‌نشده در فراخوانی تابع");
        pos += 1;
        if (!MATH_FUNCTIONS.includes(name)) error(`تابع «${name}» مجاز نیست`);
        return applyFn(name, args);
      }
      error(`شناسه‌ی ناشناخته: ${name}`);
    }
    return parseNumber();
  }

  function parsePow(): number {
    let left = parseAtom();
    if (peek() === "^") {
      pos += 1;
      const right = parsePow();
      left = Math.pow(left, right);
    }
    return left;
  }

  function parseTerm(): number {
    let value = parsePow();
    while (peek() === "*" || peek() === "/") {
      const op = peek();
      pos += 1;
      const rhs = parsePow();
      value = op === "*" ? value * rhs : value / rhs;
    }
    return value;
  }

  function parseExpr(): number {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = peek();
      pos += 1;
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  if (!src) return 0;
  const result = parseExpr();
  if (pos !== src.length) error("فرمول نامعتبر است");
  return result;
}

export function evaluateFormula(formula: FormulaValue, scope: Record<string, number>): number {
  const expression = tokensToExpression(formula.tokens, scope);
  return safeEvaluate(expression);
}

export function formulaToDisplayString(
  formula: FormulaValue,
  variableLabel: (id: string) => string,
): string {
  return formula.tokens
    .map((t) => (t.kind === "variable" ? variableLabel(t.variableId) : t.value))
    .join(" ");
}

/* ----------------------------------------------------------------------- */
/* کامپوننت                                                                */
/* ----------------------------------------------------------------------- */

export default function ConditionFormulaEditor(props: Props) {
  const { variables } = props;
  const { isDarkMode } = useTheme();

  const t = isDarkMode
    ? {
        field: "border-white/10 bg-white/[0.06] text-white placeholder:text-white/35",
        surface: "border-white/10 bg-white/[0.035]",
        muted: "text-white/55",
        chip: "border-white/10 bg-white/[0.05] text-white/80 hover:bg-[#15554f]/15 hover:border-[#15554f]/40",
        danger: "text-rose-400 hover:bg-rose-500/10",
      }
    : {
        field: "border-slate-200 bg-white text-slate-800 placeholder:text-slate-400",
        surface: "border-slate-200 bg-slate-50",
        muted: "text-slate-500",
        chip: "border-slate-200 bg-white text-slate-700 hover:bg-[#15554f]/10 hover:border-[#15554f]/40",
        danger: "text-rose-600 hover:bg-rose-50",
      };

  if (props.mode === "condition") {
    return <ConditionEditor variables={variables} value={props.value} onChange={props.onChange} t={t} />;
  }
  return <FormulaEditor variables={variables} value={props.value} onChange={props.onChange} t={t} />;
}

/* ---------------------------- حالت «شرط» -------------------------------- */

function ConditionEditor({
  variables,
  value,
  onChange,
  t,
}: {
  variables: ConditionVariable[];
  value: ConditionValue | undefined;
  onChange: (v: ConditionValue) => void;
  t: Record<string, string>;
}) {
  const condition: ConditionValue = value ?? { logic: "and", clauses: [] };

  const updateClause = (index: number, patch: Partial<ConditionClause>) => {
    const clauses = condition.clauses.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange({ ...condition, clauses });
  };
  const removeClause = (index: number) => {
    onChange({ ...condition, clauses: condition.clauses.filter((_, i) => i !== index) });
  };
  const addClause = () => {
    onChange({ ...condition, clauses: [...condition.clauses, emptyClause()] });
  };

  return (
    <div className="space-y-2.5">
      {condition.clauses.length > 1 && (
        <div className="flex items-center gap-2 text-[0.7rem]">
          <span className={t.muted}>ترکیب شروط با:</span>
          <div className={`flex items-center gap-1 rounded-full border p-0.5 ${t.surface}`}>
            {(["and", "or"] as const).map((logic) => (
              <button
                key={logic}
                type="button"
                onClick={() => onChange({ ...condition, logic })}
                className={`rounded-full px-2.5 py-1 transition-colors ${
                  condition.logic === logic ? "bg-[#15554f] text-white" : t.muted
                }`}
              >
                {logic === "and" ? "و" : "یا"}
              </button>
            ))}
          </div>
        </div>
      )}

      {condition.clauses.map((clause, index) => (
        <div key={index} className={`flex flex-wrap items-center gap-1.5 rounded-xl border p-2 ${t.surface}`}>
          <select
            value={clause.variableId}
            onChange={(e) => updateClause(index, { variableId: e.target.value })}
            className={`min-w-[8rem] flex-1 rounded-lg border px-2 py-1.5 text-xs outline-none ${t.field}`}
          >
            <option value="">انتخاب فیلد...</option>
            {variables.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>

          <select
            value={clause.operator}
            onChange={(e) => updateClause(index, { operator: e.target.value as ConditionOperator })}
            className={`rounded-lg border px-2 py-1.5 text-xs outline-none ${t.field}`}
          >
            {Object.entries(OPERATOR_LABELS).map(([op, label]) => (
              <option key={op} value={op}>
                {label}
              </option>
            ))}
          </select>

          {clause.operator !== "isEmpty" && (
            <input
              value={clause.value}
              onChange={(e) => updateClause(index, { value: e.target.value })}
              placeholder="مقدار"
              className={`min-w-[6rem] flex-1 rounded-lg border px-2 py-1.5 text-xs outline-none ${t.field}`}
            />
          )}

          <button
            type="button"
            aria-label="حذف شرط"
            onClick={() => removeClause(index)}
            className={`rounded-lg p-1.5 ${t.danger}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addClause}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.7rem] transition-colors ${t.chip}`}
      >
        <Plus className="h-3.5 w-3.5" />
        افزودن شرط
      </button>
    </div>
  );
}

/* --------------------------- حالت «فرمول» -------------------------------- */

function FormulaEditor({
  variables,
  value,
  onChange,
  t,
}: {
  variables: ConditionVariable[];
  value: FormulaValue | undefined;
  onChange: (v: FormulaValue) => void;
  t: Record<string, string>;
}) {
  const { isDarkMode } = useTheme();
  const formula: FormulaValue = value ?? { tokens: [] };
  const [testValues, setTestValues] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const numericVariables = useMemo(() => variables.filter((v) => v.type === "number"), [variables]);

  const variableLabel = (id: string) => variables.find((v) => v.id === id)?.label ?? id;

  const pushToken = (token: FormulaToken) => onChange({ tokens: [...formula.tokens, token] });
  const popToken = () => onChange({ tokens: formula.tokens.slice(0, -1) });
  const clearTokens = () => onChange({ tokens: [] });

  // هشدار همخوانی واحد وقتی دو متغیر با واحد متفاوت با + یا - ترکیب شوند
  const unitWarning = useMemo(() => {
    const toks = formula.tokens;
    for (let i = 1; i < toks.length - 1; i += 1) {
      const op = toks[i];
      if (op?.kind !== "operator" || (op.value !== "+" && op.value !== "-")) continue;
      const left = toks[i - 1];
      const right = toks[i + 1];
      if (left?.kind !== "variable" || right?.kind !== "variable") continue;
      const leftVar = variables.find((v) => v.id === left.variableId);
      const rightVar = variables.find((v) => v.id === right.variableId);
      const leftCat = leftVar?.unitCategory ?? getUnitCategoryId(leftVar?.unit);
      const rightCat = rightVar?.unitCategory ?? getUnitCategoryId(rightVar?.unit);
      if (leftCat && rightCat && leftCat !== rightCat) {
        return `واحد «${leftVar?.label}» با «${rightVar?.label}» همخوانی ندارد.`;
      }
    }
    return null;
  }, [formula.tokens, variables]);

  const runTest = () => {
    try {
      const scope: Record<string, number> = {};
      for (const v of numericVariables) {
        const raw = testValues[v.id];
        scope[v.id] = raw ? parseFloat(raw) : 0;
      }
      const result = evaluateFormula(formula, scope);
      setTestResult({ ok: true, message: `نتیجه: ${Number.isFinite(result) ? result.toLocaleString("fa-IR") : "نامعتبر"}` });
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "خطا در فرمول" });
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className={`mb-1.5 text-[0.7rem] ${t.muted}`}>متغیرهای عددی در دسترس (کلیک = افزودن به فرمول)</p>
        <div className="flex flex-wrap gap-1.5">
          {numericVariables.length === 0 && (
            <p className={`text-[0.7rem] ${t.muted}`}>فیلد عددی‌ای در دسترس نیست.</p>
          )}
          {numericVariables.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => pushToken({ kind: "variable", variableId: v.id })}
              className={`rounded-full border px-2.5 py-1 text-[0.68rem] transition-colors ${t.chip}`}
            >
              {v.label}
              {v.unit ? <span className={`mr-1 ${t.muted}`}>({v.unit})</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className={`mb-1.5 text-[0.7rem] ${t.muted}`}>عملگرها و توابع</p>
        <div className="flex flex-wrap gap-1.5" dir="ltr">
          {["+", "-", "*", "/", "(", ")"].map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => pushToken({ kind: "operator", value: op })}
              className={`min-w-8 rounded-lg border px-2 py-1 font-mono text-xs ${t.chip}`}
            >
              {op}
            </button>
          ))}
          {MATH_FUNCTIONS.map((fn) => (
            <button
              key={fn}
              type="button"
              onClick={() => pushToken({ kind: "function", value: `${fn}(` })}
              className={`rounded-lg border px-2 py-1 font-mono text-xs ${t.chip}`}
            >
              {fn}()
            </button>
          ))}
        </div>
      </div>

      <div className={`rounded-xl border p-3 ${t.surface}`}>
        <div className="mb-2 flex items-center justify-between">
          <p className={`text-[0.7rem] ${t.muted}`}>پیش‌نمایش فرمول</p>
          <div className="flex gap-1.5">
            <button type="button" onClick={popToken} disabled={!formula.tokens.length} className={`rounded-lg px-2 py-1 text-[0.65rem] disabled:opacity-30 ${t.chip}`}>
              حذف آخرین
            </button>
            <button type="button" onClick={clearTokens} disabled={!formula.tokens.length} className={`rounded-lg px-2 py-1 text-[0.65rem] disabled:opacity-30 ${t.chip}`}>
              پاک‌کردن
            </button>
          </div>
        </div>
        <div
          dir="ltr"
          className={`min-h-[2.5rem] rounded-lg border px-3 py-2 font-mono text-sm ${t.field}`}
        >
          {formula.tokens.length
            ? formula.tokens.map((tok, i) => (tok.kind === "variable" ? variableLabel(tok.variableId) : tok.value)).join(" ")
            : <span className={t.muted}>فرمولی ساخته نشده...</span>}
        </div>

        {unitWarning && (
          <p className={`mt-2 flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[0.68rem] ${isDarkMode ? "text-amber-400" : "text-amber-600"}`}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {unitWarning}
          </p>
        )}
      </div>

      <div className={`rounded-xl border p-3 ${t.surface}`}>
        <p className={`mb-2 flex items-center gap-1.5 text-[0.7rem] font-bold ${t.muted}`}>
          <FlaskConical className="h-3.5 w-3.5" />
          تست فرمول با مقادیر نمونه
        </p>
        {numericVariables.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {numericVariables.map((v) => (
              <label key={v.id} className="text-[0.65rem]">
                <span className={t.muted}>{v.label}</span>
                <input
                  value={testValues[v.id] ?? ""}
                  onChange={(e) => setTestValues((prev) => ({ ...prev, [v.id]: e.target.value }))}
                  placeholder="0"
                  dir="ltr"
                  className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-xs outline-none ${t.field}`}
                />
              </label>
            ))}
          </div>
        ) : (
          <p className={`text-[0.68rem] ${t.muted}`}>متغیر عددی برای تست وجود ندارد.</p>
        )}
        <button
          type="button"
          onClick={runTest}
          disabled={!formula.tokens.length}
          className="mt-2.5 rounded-full bg-[#15554f] px-3.5 py-1.5 text-[0.7rem] text-white transition-colors hover:bg-[#246b61] disabled:opacity-40"
        >
          اجرای تست
        </button>
        {testResult && (
          <p
            className={`mt-2 flex items-center gap-1.5 text-[0.7rem] ${
              testResult.ok ? (isDarkMode ? "text-emerald-400" : "text-emerald-600") : (isDarkMode ? "text-rose-400" : "text-rose-600")
            }`}
          >
            {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {testResult.message}
          </p>
        )}
      </div>
    </div>
  );
}