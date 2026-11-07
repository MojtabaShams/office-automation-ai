"use client";

import { Plus, Trash2 } from "lucide-react";
import ConditionFormulaEditor, {
  type ConditionValue,
  type FormulaValue,
  type ConditionVariable,
} from "../ConditionFormulaEditor";
import type { AggregationFn, ReportMetric } from "../../app/lib/mock-reports";
import type { ReportField } from "../../app/lib/report-entities";
import { useTheme } from "../../theme-context";
import ThemedSelect from "../ThemedSelect";

const AGG_OPTIONS: { id: AggregationFn; label: string }[] = [
  { id: "count", label: "شمارش (count)" },
  { id: "sum", label: "جمع (sum)" },
  { id: "avg", label: "میانگین (avg)" },
  { id: "min", label: "کمینه (min)" },
  { id: "max", label: "بیشینه (max)" },
  { id: "countDistinct", label: "شمارش یکتا" },
];

function fieldsToVariables(fields: ReportField[]): ConditionVariable[] {
  return fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type === "number" ? "number" : f.type === "date" ? "date" : "text",
    unit: f.unit,
    unitCategory: f.unitCategory,
  }));
}

function metricsToVariables(metrics: ReportMetric[]): ConditionVariable[] {
  return metrics
    .filter((m) => m.kind === "aggregate")
    .map((m) => ({ id: m.id, label: m.label, type: "number" }));
}

export default function MetricBuilder({
  fields,
  metrics,
  onChange,
}: {
  fields: ReportField[];
  metrics: ReportMetric[];
  onChange: (next: ReportMetric[]) => void;
}) {
  const { isDarkMode } = useTheme();
  const input = isDarkMode
    ? "border-white/10 bg-white/[0.06] text-white"
    : "border-[#d5dad4] bg-white text-[#28443d]";
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";
  const surface = isDarkMode ? "border-white/10 bg-white/[0.04]" : "border-[#d5dad4] bg-[#f6f7f4]";

  const update = (index: number, patch: Partial<ReportMetric>) => {
    onChange(metrics.map((m, i) => (i === index ? ({ ...m, ...patch } as ReportMetric) : m)));
  };

  const remove = (index: number) => onChange(metrics.filter((_, i) => i !== index));

  const add = (kind: ReportMetric["kind"]) => {
    const id = `m-${Date.now()}`;
    if (kind === "raw") {
      onChange([...metrics, { id, kind: "raw", fieldId: fields[0]?.id ?? "", label: "معیار خام" }]);
    } else if (kind === "aggregate") {
      onChange([...metrics, { id, kind: "aggregate", fn: "count", label: "شمارش" }]);
    } else {
      onChange([
        ...metrics,
        { id, kind: "combined", label: "معیار ترکیبی", formula: { tokens: [] } },
      ]);
    }
  };

  return (
    <div className="space-y-3">
      {metrics.map((metric, index) => (
        <div key={metric.id} className={`rounded-xl border p-3 space-y-2 ${surface}`}>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={metric.label}
              onChange={(e) => update(index, { label: e.target.value })}
              className={`min-w-[8rem] flex-1 rounded-lg border px-2 py-1.5 text-xs outline-none ${input}`}
              placeholder="برچسب معیار"
            />
            <span className={`rounded-full px-2 py-0.5 text-[0.65rem] ${muted}`}>
              {metric.kind === "raw" ? "خام" : metric.kind === "aggregate" ? "تجمیعی" : "ترکیبی"}
            </span>
            <button type="button" onClick={() => remove(index)} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-500/10">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {metric.kind === "raw" && (
            <ThemedSelect
              value={metric.fieldId}
              onChange={(e) => update(index, { fieldId: e.target.value })}
              className={`w-full rounded-lg border px-2 py-1.5 text-xs ${input}`}
              arrowClassName="left-2"
            >
              {fields.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </ThemedSelect>
          )}

          {metric.kind === "aggregate" && (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ThemedSelect
                  value={metric.fn}
                  onChange={(e) => update(index, { fn: e.target.value as AggregationFn })}
                  className={`w-full rounded-lg border px-2 py-1.5 text-xs ${input}`}
                  arrowClassName="left-2"
                >
                  {AGG_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </ThemedSelect>
                {metric.fn !== "count" && (
                  <ThemedSelect
                    value={metric.fieldId ?? ""}
                    onChange={(e) => update(index, { fieldId: e.target.value })}
                    className={`w-full rounded-lg border px-2 py-1.5 text-xs ${input}`}
                    arrowClassName="left-2"
                  >
                    <option value="">انتخاب فیلد...</option>
                    {fields
                      .filter((f) => f.type === "number" || f.type === "text")
                      .map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                  </ThemedSelect>
                )}
              </div>
              <div>
                <p className={`mb-1 text-[0.7rem] ${muted}`}>فیلتر این معیار (اختیاری)</p>
                <ConditionFormulaEditor
                  mode="condition"
                  variables={fieldsToVariables(fields)}
                  value={metric.filter}
                  onChange={(filter) => update(index, { filter })}
                />
              </div>
            </div>
          )}

          {metric.kind === "combined" && (
            <ConditionFormulaEditor
              mode="formula"
              variables={metricsToVariables(metrics.slice(0, index))}
              value={metric.formula}
              onChange={(formula: FormulaValue) => update(index, { formula })}
            />
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => add("aggregate")} className="inline-flex items-center gap-1 rounded-full border border-[#15554f] bg-[#15554f] px-3 py-1.5 text-[0.7rem] font-semibold text-white hover:bg-[#246b61]">
          <Plus className="h-3.5 w-3.5" /> معیار تجمیعی
        </button>
        <button type="button" onClick={() => add("combined")} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold ${isDarkMode ? "border-white/15 bg-white/[0.06]" : "border-[#d5dad4] bg-white"}`}>
          <Plus className="h-3.5 w-3.5" /> معیار ترکیبی
        </button>
        <button type="button" onClick={() => add("raw")} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold ${isDarkMode ? "border-white/15 bg-white/[0.06]" : "border-[#d5dad4] bg-white"}`}>
          <Plus className="h-3.5 w-3.5" /> معیار خام
        </button>
      </div>
    </div>
  );
}