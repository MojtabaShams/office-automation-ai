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

export const REPORT_STORAGE_KEY = "office-admin-report-definitions-v1";

export const initialReports: ReportDefinition[] = [
  {
    id: "rpt-emp-by-role",
    title: "تعداد کارمندان به‌تفکیک نقش",
    description: "شمارش کارمندان فعال و غیرفعال بر اساس نقش شغلی",
    category: "منابع انسانی",
    entityId: "employees",
    groupBy: [{ fieldId: "role" }],
    metrics: [
      { id: "m-count", kind: "aggregate", fn: "count", label: "تعداد" },
    ],
    display: { type: "table", xFieldId: "role", yMetricIds: ["m-count"] },
    updatedAt: "2026-10-12T10:00:00",
  },
  {
    id: "rpt-req-escalation-rate",
    title: "نرخ اسکالیشن درخواست‌ها",
    description: "نسبت پرونده‌های اسکاله‌شده به کل پرونده‌ها",
    category: "درخواست‌ها",
    entityId: "requests",
    groupBy: [],
    metrics: [
      {
        id: "m-total",
        kind: "aggregate",
        fn: "count",
        label: "کل پرونده‌ها",
      },
      {
        id: "m-escalated",
        kind: "aggregate",
        fn: "count",
        filter: {
          logic: "and",
          clauses: [{ variableId: "escalated", operator: "equals", value: "true" }],
        },
        label: "اسکاله‌شده",
      },
      {
        id: "m-rate",
        kind: "combined",
        label: "نرخ اسکالیشن",
        unit: "percent",
        formula: {
          tokens: [
            { kind: "variable", variableId: "m-escalated" },
            { kind: "operator", value: "/" },
            { kind: "variable", variableId: "m-total" },
            { kind: "operator", value: "*" },
            { kind: "number", value: "100" },
          ],
        },
      },
    ],
    display: { type: "kpi", yMetricIds: ["m-rate"] },
    updatedAt: "2026-10-11T14:30:00",
  },
];

export function loadReports(): ReportDefinition[] {
  if (typeof window === "undefined") return initialReports;
  try {
    const raw = window.localStorage.getItem(REPORT_STORAGE_KEY);
    if (!raw) return initialReports;
    return JSON.parse(raw) as ReportDefinition[];
  } catch {
    return initialReports;
  }
}

export function saveReports(reports: ReportDefinition[]) {
  window.localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(reports));
}