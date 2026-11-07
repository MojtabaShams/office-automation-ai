import { evaluateFormula, type ConditionValue } from "../ConditionFormulaEditor";
import type { ReportMetric, ReportDefinition } from "../../app/lib/mock-reports";
import { getReportEntity } from "../../app/lib/report-entities";
import { gregorianToJalali } from "../../app/lib/jalali";

function matchClause(row: Record<string, unknown>, clause: { variableId: string; operator: string; value: string }) {
  const raw = row[clause.variableId];
  const str = raw == null ? "" : String(raw);
  const num = typeof raw === "number" ? raw : parseFloat(str);
  switch (clause.operator) {
    case "equals":
      return str === clause.value || String(raw) === clause.value;
    case "notEquals":
      return str !== clause.value;
    case "contains":
      return str.includes(clause.value);
    case "isEmpty":
      return str === "" || raw == null;
    case "greaterThan":
      return !Number.isNaN(num) && num > parseFloat(clause.value);
    case "lessThan":
      return !Number.isNaN(num) && num < parseFloat(clause.value);
    default:
      return true;
  }
}

export function applyCondition(rows: Record<string, unknown>[], condition?: ConditionValue) {
  if (!condition?.clauses?.length) return rows;
  return rows.filter((row) => {
    const results = condition.clauses.map((c) => matchClause(row, c));
    return condition.logic === "or" ? results.some(Boolean) : results.every(Boolean);
  });
}

function bucketKey(value: unknown, bucket?: "day" | "week" | "month" | "year") {
  if (!(value instanceof Date) && typeof value !== "string") return String(value ?? "—");
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const j = gregorianToJalali(d);
  if (bucket === "year") return String(j.year);
  if (bucket === "month") return `${j.year}/${String(j.month).padStart(2, "0")}`;
  if (bucket === "day") return `${j.year}/${String(j.month).padStart(2, "0")}/${String(j.day).padStart(2, "0")}`;
  return `${j.year}/${String(j.month).padStart(2, "0")}/${String(j.day).padStart(2, "0")}`;
}

function aggregate(rows: Record<string, unknown>[], fn: string, fieldId?: string): number {
  if (fn === "count") return rows.length;
  if (fn === "countDistinct") {
    const set = new Set(rows.map((r) => String(r[fieldId ?? ""])));
    return set.size;
  }
  const nums = rows
    .map((r) => Number(r[fieldId ?? ""]))
    .filter((n) => !Number.isNaN(n));
  if (!nums.length) return 0;
  if (fn === "sum") return nums.reduce((a, b) => a + b, 0);
  if (fn === "avg") return nums.reduce((a, b) => a + b, 0) / nums.length;
  if (fn === "min") return Math.min(...nums);
  if (fn === "max") return Math.max(...nums);
  return 0;
}

export type ReportResultRow = Record<string, string | number>;

export function runReport(def: ReportDefinition): { rows: ReportResultRow[]; metricLabels: Record<string, string> } {
  const entity = getReportEntity(def.entityId);
  if (!entity) return { rows: [], metricLabels: {} };

  let rows = applyCondition(entity.getRows(), def.filters);

  const groups = new Map<string, Record<string, unknown>[]>();
  if (!def.groupBy.length) {
    groups.set("__all__", rows);
  } else {
    for (const row of rows) {
      const key = def.groupBy
        .map((g) => bucketKey(row[g.fieldId], g.dateBucket))
        .join(" | ");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
  }

  const metricLabels: Record<string, string> = {};
  const result: ReportResultRow[] = [];

  for (const [groupKey, groupRows] of groups) {
    const scope: Record<string, number> = {};
    const out: ReportResultRow = {};

    if (def.groupBy.length) {
      def.groupBy.forEach((g, i) => {
        out[g.fieldId] = groupKey.split(" | ")[i] ?? groupKey;
      });
    }

    for (const m of def.metrics) {
      metricLabels[m.id] = m.label;
      if (m.kind === "raw") {
        out[m.id] = String(groupRows[0]?.[m.fieldId] ?? "");
      } else if (m.kind === "aggregate") {
        const filtered = applyCondition(groupRows, m.filter);
        const val = aggregate(filtered, m.fn, m.fieldId);
        scope[m.id] = val;
        out[m.id] = val;
      } else if (m.kind === "combined") {
        try {
          const val = evaluateFormula(m.formula, scope);
          scope[m.id] = val;
          out[m.id] = Number.isFinite(val) ? Math.round(val * 100) / 100 : 0;
        } catch {
          out[m.id] = 0;
        }
      }
    }
    result.push(out);
  }

  return { rows: result, metricLabels };
}