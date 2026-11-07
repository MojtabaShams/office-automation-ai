"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Table2,
  BarChart3,
  LineChart as LineIcon,
  PieChart as PieIcon,
  LayoutDashboard,
} from "lucide-react";
import ConditionFormulaEditor, { type ConditionValue } from "../ConditionFormulaEditor";
import MetricBuilder from "./MetricBuilder";
import { reportEntities, getReportEntity, type ReportField } from "../../app/lib/report-entities";
import {
  type ReportDefinition,
  type ReportDisplayType,
  type ReportMetric,
  loadReports,
  saveReports,
} from "../../app/lib/mock-reports";
import { runReport } from "./report-engine";
import { useTheme } from "../../theme-context";

/** ۶ مرحله — منبع داده و نوع نمایش داخل «اطلاعات پایه» */
const STEPS = [
  "اطلاعات پایه",
  "فیلترها",
  "گروه‌بندی",
  "معیارها",
  "پیش‌نمایش",
  "ذخیره",
];

const CATEGORIES = ["منابع انسانی", "درخواست‌ها", "عمومی", "مالی"];

const DISPLAY_OPTIONS: {
  id: ReportDisplayType;
  label: string;
  icon: React.ElementType;
}[] = [
  { id: "table", label: "جدول", icon: Table2 },
  { id: "bar", label: "میله‌ای", icon: BarChart3 },
  { id: "line", label: "خطی", icon: LineIcon },
  { id: "pie", label: "دایره‌ای", icon: PieIcon },
  { id: "kpi", label: "کارت KPI", icon: LayoutDashboard },
];

const CHART_COLORS = ["#15554f", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444"];

function ThemedFieldSelect({
  value,
  onChange,
  children,
  className = "",
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const { isDarkMode } = useTheme();
  const field = isDarkMode
    ? "border-white/10 bg-white/[0.06] text-white"
    : "border-[#d5dad4] bg-white text-[#28443d]";
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";

  return (
    <span className={`relative block ${className}`}>
      <select
        value={value}
        onChange={onChange}
        className={`w-full appearance-none rounded-xl border py-2.5 pl-9 pr-3 text-xs outline-none transition focus:border-[#15554f] ${field}`}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className={`pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${muted}`}
      />
    </span>
  );
}

export default function ReportBuilderWizard({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { isDarkMode } = useTheme();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]!);
  const [entityId, setEntityId] = useState(reportEntities[0]?.id ?? "employees");
  const [filters, setFilters] = useState<ConditionValue | undefined>();
  const [groupBy, setGroupBy] = useState<
    { fieldId: string; dateBucket?: "day" | "week" | "month" | "year" }[]
  >([]);
  const [metrics, setMetrics] = useState<ReportMetric[]>([
    { id: "m-count", kind: "aggregate", fn: "count", label: "تعداد" },
  ]);
  const [displayType, setDisplayType] = useState<ReportDisplayType>("table");
  const [xFieldId, setXFieldId] = useState("");
  const [yMetricIds] = useState<string[]>(["m-count"]);

  const entity = getReportEntity(entityId);
  const fields: ReportField[] = entity?.fields ?? [];

  const variables = useMemo(
    () =>
      fields.map((f) => ({
        id: f.id,
        label: f.label,
        type: (f.type === "number" ? "number" : f.type === "date" ? "date" : "text") as string,
        unit: f.unit,
        unitCategory: f.unitCategory,
      })),
    [fields]
  );

  const t = isDarkMode
    ? {
        panel: "border-white/10 bg-[#122925]",
        card: "border-white/10 bg-white/[0.035]",
        field: "border-white/10 bg-white/[0.06] text-white placeholder:text-white/35",
        muted: "text-white/55",
        quiet: "border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.08]",
        divider: "border-white/10",
      }
    : {
        panel: "border-[#d5dad4] bg-[#f6f7f4]",
        card: "border-[#e1e6df] bg-white",
        field: "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]",
        muted: "text-[#68766c]",
        quiet: "border-[#d5dad4] bg-white text-[#40584e] hover:bg-[#edf0eb]",
        divider: "border-[#e1e6df]",
      };

  const inputClass = `w-full rounded-xl border px-3 py-2.5 text-xs outline-none transition focus:border-[#15554f] ${t.field}`;
  const labelClass = "mb-1.5 block text-xs font-semibold";
  const sectionClass = `rounded-2xl border p-4 sm:p-5 ${t.card}`;

  const draft: ReportDefinition = {
    id: `rpt-${Date.now()}`,
    title: title || "گزارش بدون عنوان",
    description,
    category,
    entityId,
    filters,
    groupBy,
    metrics,
    display: {
      type: displayType,
      xFieldId: xFieldId || groupBy[0]?.fieldId,
      yMetricIds,
    },
    updatedAt: new Date().toISOString(),
  };

  const preview = useMemo(
    () => runReport(draft),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [title, description, category, entityId, filters, groupBy, metrics, displayType, xFieldId, yMetricIds]
  );

  const validateStep = () => {
    const issues: string[] = [];
    if (step === 0) {
      if (!title.trim()) issues.push("عنوان گزارش را وارد کنید.");
      if (!entityId) issues.push("منبع داده را انتخاب کنید.");
    }
    if (step === 3 && metrics.length === 0) issues.push("حداقل یک معیار تعریف کنید.");
    setErrors(issues);
    return issues.length === 0;
  };

  const next = () => {
    if (validateStep()) setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const save = () => {
    if (!title.trim()) {
      setErrors(["عنوان گزارش را وارد کنید."]);
      setStep(0);
      return;
    }
    if (!metrics.length) {
      setErrors(["حداقل یک معیار لازم است."]);
      setStep(3);
      return;
    }
    const list = loadReports();
    saveReports([draft, ...list]);
    onSaved();
    onClose();
  };

  const stepStatus = useMemo(
    () => STEPS.map((label, index) => ({ label, index, done: index < step, current: index === step })),
    [step]
  );

  return (
    /* ستون انعطاف‌پذیر: محتوا اسکرول می‌شود، فوتر ثابت می‌ماند */
    <div className="flex max-h-[min(70vh,560px)] flex-col text-sm">
      {/* استپر — ثابت بالا */}
      <div className={`shrink-0 overflow-x-auto border-b pb-3 ${t.divider}`}>
        <ol className="flex min-w-max items-center gap-1">
          {stepStatus.map(({ label, index, done, current }) => (
            <li key={label} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  if (index <= step) {
                    setStep(index);
                    setErrors([]);
                  }
                }}
                className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-[0.68rem] transition ${
                  current ? "bg-[#15554f] text-white" : done ? "text-[#15554f]" : t.muted
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[0.65rem] ${
                    current
                      ? "bg-white/20"
                      : done
                        ? "bg-emerald-500/10"
                        : isDarkMode
                          ? "bg-white/10"
                          : "bg-[#e7eae5]"
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                {label}
              </button>
              {index < STEPS.length - 1 && (
                <ChevronLeft className={`h-3.5 w-3.5 shrink-0 ${t.muted}`} />
              )}
            </li>
          ))}
        </ol>
      </div>

      {errors.length > 0 && (
        <div
          role="alert"
          className="mt-3 shrink-0 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-600"
        >
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}

      {/* بدنه اسکرول‌شونده */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-0.5 py-4">
        {/* ——— مرحله ۰: اطلاعات پایه + منبع + نوع نمایش ——— */}
        {step === 0 && (
          <div className="space-y-4">
            <section className={sectionClass}>
              <h3 className="mb-4 text-sm font-bold">مشخصات گزارش</h3>
              <label className={labelClass}>
                عنوان گزارش *
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={`${inputClass} mt-1.5`}
                  placeholder="مثلاً تعداد کارمندان به‌تفکیک نقش"
                />
              </label>
              <label className={`${labelClass} mt-3`}>
                توضیح
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className={`${inputClass} mt-1.5 resize-y`}
                  placeholder="توضیح کوتاه درباره هدف گزارش..."
                />
              </label>
              <label className={`${labelClass} mt-3`}>
                دسته‌بندی
                <ThemedFieldSelect
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1.5"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c} style={{ background: "#fff", color: "#111827" }}>
                      {c}
                    </option>
                  ))}
                </ThemedFieldSelect>
              </label>
            </section>

            <section className={sectionClass}>
              <h3 className="mb-3 text-sm font-bold">منبع داده *</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {reportEntities.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEntityId(e.id)}
                    className={`rounded-xl border p-3 text-right transition ${
                      entityId === e.id
                        ? "border-[#15554f] bg-[#15554f] text-white"
                        : `${t.panel} hover:border-[#15554f]/40`
                    }`}
                  >
                    <div className="text-xs font-bold">{e.label}</div>
                    <div
                      className={`mt-1 text-[0.65rem] ${
                        entityId === e.id ? "text-white/80" : t.muted
                      }`}
                    >
                      {e.fields.length} فیلد قابل گزارش‌گیری
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className={sectionClass}>
              <h3 className="mb-3 text-sm font-bold">نوع نمایش</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {DISPLAY_OPTIONS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDisplayType(id)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-semibold transition ${
                      displayType === id
                        ? "border-[#15554f] bg-[#15554f] text-white"
                        : t.quiet
                    }`}
                  >
                    <Icon className="h-4.5 w-4.5" />
                    {label}
                  </button>
                ))}
              </div>
              {displayType !== "kpi" && groupBy.length > 0 && (
                <label className={`${labelClass} mt-4`}>
                  محور افقی (X)
                  <ThemedFieldSelect
                    value={xFieldId || groupBy[0]?.fieldId || ""}
                    onChange={(e) => setXFieldId(e.target.value)}
                    className="mt-1.5"
                  >
                    {groupBy.map((g) => {
                      const f = fields.find((x) => x.id === g.fieldId);
                      return (
                        <option
                          key={g.fieldId}
                          value={g.fieldId}
                          style={{ background: "#fff", color: "#111827" }}
                        >
                          {f?.label ?? g.fieldId}
                        </option>
                      );
                    })}
                  </ThemedFieldSelect>
                </label>
              )}
            </section>
          </div>
        )}

        {/* ——— مرحله ۱: فیلترها ——— */}
        {step === 1 && (
          <section className={sectionClass}>
            <h3 className="mb-2 text-sm font-bold">فیلترهای سراسری</h3>
            <p className={`mb-3 text-[0.68rem] ${t.muted}`}>
              فقط ردیف‌هایی که این شروط را دارند در گزارش لحاظ می‌شوند.
            </p>
            <ConditionFormulaEditor
              mode="condition"
              variables={variables}
              value={filters}
              onChange={setFilters}
            />
          </section>
        )}

        {/* ——— مرحله ۲: گروه‌بندی ——— */}
        {step === 2 && (
          <section className={sectionClass}>
            <h3 className="mb-2 text-sm font-bold">ابعاد گروه‌بندی</h3>
            <p className={`mb-3 text-[0.68rem] ${t.muted}`}>
              اختیاری — برای تفکیک نتایج بر اساس فیلدهای متنی، انتخابی یا تاریخی.
            </p>
            <div className="space-y-2">
              {fields
                .filter(
                  (f) =>
                    f.type === "text" ||
                    f.type === "select" ||
                    f.type === "boolean" ||
                    f.type === "date"
                )
                .map((f) => {
                  const active = groupBy.some((g) => g.fieldId === f.id);
                  return (
                    <div
                      key={f.id}
                      className={`flex flex-wrap items-center gap-2 rounded-xl border p-2.5 ${t.panel}`}
                    >
                      <label className="flex flex-1 items-center gap-2 text-xs font-semibold">
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setGroupBy([
                                ...groupBy,
                                {
                                  fieldId: f.id,
                                  dateBucket: f.type === "date" ? "month" : undefined,
                                },
                              ]);
                            } else {
                              setGroupBy(groupBy.filter((g) => g.fieldId !== f.id));
                            }
                          }}
                          className="h-3.5 w-3.5 accent-[#15554f]"
                        />
                        {f.label}
                      </label>
                      {active && f.type === "date" && (
                        <ThemedFieldSelect
                          value={
                            groupBy.find((g) => g.fieldId === f.id)?.dateBucket ?? "month"
                          }
                          onChange={(e) =>
                            setGroupBy(
                              groupBy.map((g) =>
                                g.fieldId === f.id
                                  ? {
                                      ...g,
                                      dateBucket: e.target.value as
                                        | "day"
                                        | "week"
                                        | "month"
                                        | "year",
                                    }
                                  : g
                              )
                            )
                          }
                          className="w-32"
                        >
                          <option value="day" style={{ background: "#fff", color: "#111827" }}>
                            روز
                          </option>
                          <option value="week" style={{ background: "#fff", color: "#111827" }}>
                            هفته
                          </option>
                          <option value="month" style={{ background: "#fff", color: "#111827" }}>
                            ماه
                          </option>
                          <option value="year" style={{ background: "#fff", color: "#111827" }}>
                            سال
                          </option>
                        </ThemedFieldSelect>
                      )}
                    </div>
                  );
                })}
            </div>
          </section>
        )}

        {/* ——— مرحله ۳: معیارها ——— */}
        {step === 3 && (
          <section className={sectionClass}>
            <h3 className="mb-3 text-sm font-bold">معیارها</h3>
            <MetricBuilder fields={fields} metrics={metrics} onChange={setMetrics} />
          </section>
        )}

        {/* ——— مرحله ۴: پیش‌نمایش ——— */}
        {step === 4 && (
          <section className={sectionClass}>
            <h3 className="mb-3 text-sm font-bold">پیش‌نمایش زنده</h3>
            {displayType === "table" || displayType === "kpi" ? (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className={`border-b ${t.divider}`}>
                      {Object.keys(preview.rows[0] ?? preview.metricLabels).map((k) => (
                        <th key={k} className={`px-2 py-2 font-semibold ${t.muted}`}>
                          {preview.metricLabels[k] ?? k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr key={i} className={`border-b last:border-0 ${t.divider}`}>
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="px-2 py-2">
                            {String(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {!preview.rows.length && (
                      <tr>
                        <td className={`p-6 text-center ${t.muted}`}>داده‌ای نیست</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  {displayType === "pie" ? (
                    <PieChart>
                      <Pie
                        data={preview.rows}
                        dataKey={yMetricIds[0] ?? "m-count"}
                        nameKey={xFieldId || groupBy[0]?.fieldId || "role"}
                        outerRadius={80}
                      >
                        {preview.rows.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  ) : displayType === "line" ? (
                    <LineChart data={preview.rows}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}
                      />
                      <XAxis dataKey={xFieldId || groupBy[0]?.fieldId} tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      {(yMetricIds.length ? yMetricIds : metrics.map((m) => m.id)).map(
                        (id, i) => (
                          <Line
                            key={id}
                            type="monotone"
                            dataKey={id}
                            stroke={CHART_COLORS[i % CHART_COLORS.length]}
                            strokeWidth={2}
                          />
                        )
                      )}
                    </LineChart>
                  ) : (
                    <BarChart data={preview.rows}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}
                      />
                      <XAxis dataKey={xFieldId || groupBy[0]?.fieldId} tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      {(yMetricIds.length ? yMetricIds : metrics.map((m) => m.id)).map(
                        (id, i) => (
                          <Bar
                            key={id}
                            dataKey={id}
                            fill={CHART_COLORS[i % CHART_COLORS.length]}
                            radius={[4, 4, 0, 0]}
                          />
                        )
                      )}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </section>
        )}

        {/* ——— مرحله ۵: ذخیره ——— */}
        {step === 5 && (
          <section className={sectionClass}>
            <h3 className="mb-3 text-sm font-bold">خلاصه و ذخیره</h3>
            <dl className={`space-y-3 text-xs ${t.muted}`}>
              <div>
                <dt className="font-semibold">عنوان</dt>
                <dd className="mt-1">{draft.title}</dd>
              </div>
              <div>
                <dt className="font-semibold">منبع</dt>
                <dd className="mt-1">{entity?.label}</dd>
              </div>
              <div>
                <dt className="font-semibold">دسته</dt>
                <dd className="mt-1">{category}</dd>
              </div>
              <div>
                <dt className="font-semibold">نوع نمایش</dt>
                <dd className="mt-1">
                  {DISPLAY_OPTIONS.find((o) => o.id === displayType)?.label ?? displayType}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">معیارها</dt>
                <dd className="mt-1">{metrics.length} مورد</dd>
              </div>
            </dl>
          </section>
        )}
      </div>

      {/* فوتر ثابت پایین — با اسکرول جابه‌جا نمی‌شود */}
      <div
        className={`shrink-0 border-t pt-3 ${t.divider} ${
          isDarkMode ? "bg-[#17332f]" : "bg-white"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`rounded-xl border px-4 py-2 text-xs ${t.quiet}`}
          >
            انصراف
          </button>
          <div className="flex flex-wrap justify-end gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => {
                  setStep((s) => Math.max(0, s - 1));
                  setErrors([]);
                }}
                className={`inline-flex items-center gap-1 rounded-xl border px-4 py-2 text-xs ${t.quiet}`}
              >
                <ChevronRight className="h-4 w-4" />
                قبلی
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-1 rounded-xl bg-[#15554f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#246b61]"
              >
                بعدی
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={save}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Check className="h-4 w-4" />
                ذخیره گزارش
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}