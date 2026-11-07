/**
 * Shared shape of a saved report definition.
 *
 * The definition itself is stored in PostgreSQL (``report_definitions``) by the
 * FastAPI backend; this module only holds the TypeScript contract shared by the
 * builder, the report engine and the reports pages.
 */

import type { ConditionValue, FormulaValue } from "../../components/ConditionFormulaEditor";

export type AggregationFn = "count" | "sum" | "avg" | "min" | "max" | "countDistinct";

export type ReportMetric =
  | { id: string; kind: "raw"; fieldId: string; label: string }
  | {
      id: string;
      kind: "aggregate";
      fn: AggregationFn;
      fieldId?: string;
      filter?: ConditionValue;
      label: string;
    }
  | {
      id: string;
      kind: "combined";
      formula: FormulaValue;
      label: string;
      unit?: string;
    };

export type ReportDisplayType = "table" | "bar" | "line" | "pie" | "kpi";

export type ReportDefinition = {
  id: string;
  title: string;
  description: string;
  category: string;
  entityId: string;
  filters?: ConditionValue;
  groupBy: { fieldId: string; dateBucket?: "day" | "week" | "month" | "year" }[];
  metrics: ReportMetric[];
  display: {
    type: ReportDisplayType;
    xFieldId?: string;
    yMetricIds?: string[];
  };
  updatedAt: string;
};
