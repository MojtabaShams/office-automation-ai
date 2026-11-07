"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  GitBranch,
  Plus,
  Settings2,
  ShieldAlert,
  Trash2,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useTheme } from "../../theme-context";
import {
  PROCESS_DEPARTMENTS,
  ROUTE_COMPLETE,
  ROUTE_REJECT,
  isAssigneeUnresolved,
  normalizeConsultation,
  normalizeProcess,
  type Assignee,
  type ComputedDestination,
  type ComputedProcessField,
  type FormDefinition,
  type ProcessConsultation,
  type ProcessDefinition,
  type ProcessField,
  type ProcessStage,
  type RejectPolicy,
  type StageRouteRule,
} from "../../app/lib/mock-processes";
import {
  formLeafFields,
  numericVariablesBeforeStage,
  routeTargetLabel,
  validateProcessForPublish,
  variablesAtStage,
  type ProcessIssue,
} from "../../app/lib/process-validation";
import { UNIT_CATEGORIES, type UnitCategoryId } from "../../app/lib/units";
import { listRoles, listUsers, type AdminUser, type Role } from "../../app/lib/admin-api";
import ConditionFormulaEditor, {
  type ConditionValue,
  type FormulaValue,
} from "../ConditionFormulaEditor";
import Modal from "../Modal";
import ConfirmModal from "../ConfirmModal";
import ThemedSelect from "../ThemedSelect";

const ICON_OPTIONS = [
  { value: "building", label: "ساختمان", icon: Building2 },
  { value: "file", label: "فرم", icon: FileText },
  { value: "wallet", label: "مالی", icon: Wallet },
  { value: "calendar", label: "تقویم", icon: CalendarDays },
] as const;

type PanelMode = "none" | "process" | "stage" | "logic";

type AssigneeOptions = {
  roles: Role[];
  employees: AdminUser[];
};

const EMPTY_OPTIONS: AssigneeOptions = { roles: [], employees: [] };

function createEmptyProcess(): ProcessDefinition {
  const stamp = Date.now();
  return {
    id: `proc-${stamp}`,
    code: "",
    title: "",
    department: PROCESS_DEPARTMENTS[0]!,
    description: "",
    icon: "file",
    status: "draft",
    version: "0.1",
    activeCases: 0,
    updatedAt: new Date().toISOString(),
    stages: [
      {
        id: `stage-${stamp}-1`,
        title: "ثبت درخواست",
        assignee: { kind: "applicant" },
        onReject: "reject_final",
        slaDays: 1,
        formIds: [],
        formVersions: {},
        guidance: "",
        routeRules: [],
        defaultNextStageId: "",
      },
      {
        id: `stage-${stamp}-2`,
        title: "بررسی کارشناس",
        assignee: { kind: "role", accessLevelId: "" },
        onReject: "return_to_applicant",
        slaDays: 3,
        formIds: [],
        formVersions: {},
        guidance: "",
        routeRules: [],
        defaultNextStageId: "",
      },
    ],
    fields: [],
    rules: [],
    applicantGuidance: "",
    payment: { mode: "none", provider: "", amount: 0, formula: "" },
    computedFields: [],
    publishedVersions: [],
    directiveFileNames: [],
  };
}

function emptyCondition(): ConditionValue {
  return {
    logic: "and",
    clauses: [{ variableId: "", operator: "equals", value: "" }],
  };
}

function newStage(index: number): ProcessStage {
  return {
    id: `stage-${crypto.randomUUID()}`,
    title: `مرحله ${index + 1}`,
    assignee: { kind: "role", accessLevelId: "" },
    onReject: "return_to_applicant",
    slaDays: 3,
    formIds: [],
    formVersions: {},
    guidance: "",
    routeRules: [],
    defaultNextStageId: "",
  };
}

const emptyDestination = (): ComputedDestination => ({ kind: "internal" });

export default function ProcessBuilderWizard({
  open,
  initial,
  availableForms,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: ProcessDefinition | null;
  availableForms: FormDefinition[];
  onClose: () => void;
  /** Returns ``false`` to keep the wizard open; a rejection shows its message inline. */
  onSave: (process: ProcessDefinition, publish: boolean) => boolean | Promise<boolean>;
}) {
  const { isDarkMode } = useTheme();
  const [draft, setDraft] = useState<ProcessDefinition>(() =>
    initial ? normalizeProcess(initial) : createEmptyProcess(),
  );
  const [panel, setPanel] = useState<PanelMode>("none");
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [issues, setIssues] = useState<ProcessIssue[]>([]);
  const [options, setOptions] = useState<AssigneeOptions>(EMPTY_OPTIONS);
  const [optionsError, setOptionsError] = useState("");

  // L3: خروج ایمن و حذف مرحله به‌همراه پاک‌سازی ارجاع‌ها
  const [dirty, setDirty] = useState(false);
  const [askClose, setAskClose] = useState(false);
  const [stageToDelete, setStageToDelete] = useState<ProcessStage | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) return;
    const next = initial ? normalizeProcess(initial) : createEmptyProcess();
    setDraft(next);
    setPanel("none");
    setSelectedStageId(next.stages[0]?.id ?? null);
    setIssues([]);
    setDirty(false);
    setAskClose(false);
    setStageToDelete(null);
    setNotice("");
  }, [initial, open]);

  /* H1 — گزینه‌های مسئول از داده‌های واقعی */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [rolesPayload, usersPayload] = await Promise.all([
          listRoles(),
          listUsers({ limit: 500 }),
        ]);
        if (cancelled) return;
        setOptions({ roles: rolesPayload.roles, employees: usersPayload.users });
        setOptionsError("");
      } catch (err) {
        if (cancelled) return;
        setOptionsError(
          err instanceof Error
            ? `دریافت نقش‌ها و کارمندان ناموفق بود: ${err.message}`
            : "دریافت نقش‌ها و کارمندان ناموفق بود.",
        );
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const t = isDarkMode
    ? {
        panel: "border-white/10 bg-[#122925]",
        card: "border-white/10 bg-white/[0.035]",
        field:
          "border-white/10 bg-white/[0.06] text-white placeholder:text-white/35",
        muted: "text-white/55",
        quiet:
          "border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.08]",
        divider: "border-white/10",
        canvas: "bg-[#0f1f1c]",
        stageActive: "border-[#15554f] ring-2 ring-[#15554f]/25",
        arrow: "text-white/45",
        roseBox: "bg-rose-500/10 text-rose-300",
      }
    : {
        panel: "border-[#d5dad4] bg-[#f6f7f4]",
        card: "border-[#e1e6df] bg-white",
        field:
          "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]",
        muted: "text-[#68766c]",
        quiet: "border-[#d5dad4] bg-white text-[#40584e] hover:bg-[#edf0eb]",
        divider: "border-[#e1e6df]",
        canvas: "bg-[#f3f5f1]",
        stageActive: "border-[#15554f] ring-2 ring-[#15554f]/20",
        arrow: "text-[#8c9587]",
        roseBox: "bg-rose-50 text-rose-700",
      };

  const inputClass = `w-full rounded-xl border px-3 py-2.5 text-xs outline-none transition focus:border-[#15554f] ${t.field}`;
  const selectClass = `w-full appearance-none rounded-xl border py-2.5 pl-9 pr-3 text-xs outline-none transition focus:border-[#15554f] ${t.field}`;
  const labelClass = "mb-1.5 block text-xs font-semibold";

  const update = <K extends keyof ProcessDefinition>(
    key: K,
    value: ProcessDefinition[K],
  ) => {
    setDirty(true);
    setDraft((c) => ({ ...c, [key]: value }));
  };

  const publishedForms = useMemo(
    () => availableForms.filter((form) => form.status === "active"),
    [availableForms],
  );

  const selectedStage = draft.stages.find((stage) => stage.id === selectedStageId);

  /* L4: پیش‌نمایش زنده خلاصه مشاوره؛ همان قواعد backend (سند L4). */
  const consultationPreview = useMemo(() => {
    const formsById = new Map(availableForms.map((form) => [form.id, form]));
    const documents: { label: string; required: boolean }[] = [];
    const fees: string[] = [];
    const seenDocs = new Set<string>();
    for (const stage of draft.stages) {
      for (const formId of stage.formIds ?? []) {
        const form = formsById.get(formId);
        if (!form) continue;
        for (const field of formLeafFields(form)) {
          if (field.type === "file") {
            const key = `${form.id}:${field.id}`;
            if (seenDocs.has(key)) continue;
            seenDocs.add(key);
            documents.push({ label: field.label || "بدون عنوان", required: field.required });
          }
          if (field.type === "payment") {
            const amount = field.payment?.defaultAmount;
            fees.push(
              amount
                ? `${field.label || "پرداخت"}: ${amount.toLocaleString("fa-IR")} تومان`
                : `${field.label || "پرداخت"}: محاسبه‌شده`,
            );
          }
        }
      }
    }
    for (const calc of draft.computedFields ?? []) {
      if (calc.destination.kind === "payment_amount") {
        fees.push(`${calc.name || "محاسبه"}: محاسبه‌شده`);
      }
    }
    const byId = new Map(draft.stages.map((stage) => [stage.id, stage]));
    const visited = new Set<string>();
    let cursor = draft.stages[0];
    let days = 0;
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      days += cursor.slaDays > 0 ? cursor.slaDays : 0;
      cursor = cursor.defaultNextStageId ? byId.get(cursor.defaultNextStageId) : undefined;
    }
    let basis: "default-path" | "all-stages" = "default-path";
    if (draft.stages.every((stage) => !stage.defaultNextStageId)) {
      days = draft.stages.reduce(
        (total, stage) => total + (stage.slaDays > 0 ? stage.slaDays : 0),
        0,
      );
      basis = "all-stages";
    }
    return { documents, fees, days, basis };
  }, [draft.stages, draft.computedFields, availableForms]);

  const selectStage = (id: string) => {
    setSelectedStageId(id);
    setPanel("stage");
    setIssues([]);
  };

  const updateStage = (stageId: string, patch: Partial<ProcessStage>) => {
    update(
      "stages",
      draft.stages.map((stage) => (stage.id === stageId ? { ...stage, ...patch } : stage)),
    );
  };

  const addStage = () => {
    const stage = newStage(draft.stages.length);
    update("stages", [...draft.stages, stage]);
    selectStage(stage.id);
  };

  /** ارجاع‌هایی که با حذف یک مرحله بی‌مقصد می‌شوند (برای گزارش و پاک‌سازی). */
  const stageImpact = (id: string) => {
    let routeRules = 0;
    let defaults = 0;
    for (const stage of draft.stages) {
      if (stage.id === id) continue;
      routeRules += (stage.routeRules ?? []).filter((rule) => rule.nextStageId === id).length;
      if (stage.defaultNextStageId === id) defaults += 1;
    }
    const computed = (draft.computedFields ?? []).filter(
      (field) => field.destination.kind !== "internal" && field.destination.stageId === id,
    ).length;
    return { routeRules, defaults, computed };
  };

  const deleteStage = (stage: ProcessStage, impact = stageImpact(stage.id)) => {
    const stages = draft.stages
      .filter((item) => item.id !== stage.id)
      .map((item) => ({
        ...item,
        ...(item.defaultNextStageId === stage.id ? { defaultNextStageId: "" } : {}),
        ...((item.routeRules ?? []).some((rule) => rule.nextStageId === stage.id)
          ? { routeRules: (item.routeRules ?? []).filter((rule) => rule.nextStageId !== stage.id) }
          : {}),
      }));
    const computedFields = (draft.computedFields ?? []).map((field) =>
      field.destination.kind !== "internal" && field.destination.stageId === stage.id
        ? { ...field, destination: { kind: "internal" as const } }
        : field,
    );
    update("stages", stages);
    update("computedFields", computedFields);
    if (selectedStageId === stage.id) {
      setSelectedStageId(stages[0]?.id ?? null);
      setPanel(stages[0] ? "stage" : "none");
    }
    setStageToDelete(null);
    const parts = [
      impact.routeRules ? `${impact.routeRules} قاعده مسیر` : "",
      impact.defaults ? `${impact.defaults} مسیر پیش‌فرض` : "",
      impact.computed ? `${impact.computed} محاسبه` : "",
    ].filter(Boolean);
    setNotice(
      parts.length
        ? `مرحله «${stage.title}» حذف شد و ${parts.join("، ")} که به آن اشاره می‌کردند پاک‌سازی شدند.`
        : `مرحله «${stage.title}» حذف شد.`,
    );
  };

  const requestRemoveStage = (id: string) => {
    if (draft.stages.length <= 1) return;
    const stage = draft.stages.find((item) => item.id === id);
    if (!stage) return;
    const impact = stageImpact(id);
    const hasData =
      impact.routeRules + impact.defaults + impact.computed > 0 ||
      (stage.formIds ?? []).length > 0 ||
      Boolean(stage.guidance?.trim()) ||
      (stage.routeRules ?? []).length > 0 ||
      Boolean(stage.escalation);
    if (hasData) {
      setStageToDelete(stage);
      return;
    }
    deleteStage(stage, impact);
  };

  const assigneeLabel = (assignee: Assignee): string => {
    if (assignee.kind === "applicant") return "متقاضی";
    if (assignee.kind === "role") {
      return (
        options.roles.find((role) => role.id === assignee.accessLevelId)?.name ??
        "نقش انتخاب‌نشده"
      );
    }
    return (
      options.employees.find((employee) => employee.id === assignee.employeeId)?.fullName ??
      "کارمند انتخاب‌نشده"
    );
  };

  /* ------------------------------------------------------------- اعتبارسنجی */

  const runPublishValidation = (): boolean => {
    const result = validateProcessForPublish(draft, availableForms);
    const errors = result.filter((issue) => issue.severity === "error");
    setIssues(result);
    if (errors.length) {
      const first = errors[0];
      if (first?.panel === "process") setPanel("process");
      else if (first?.panel === "logic") setPanel("logic");
      else if (first?.stageId) selectStage(first.stageId);
      return false;
    }
    return true;
  };

  const save = async (publish: boolean) => {
    if (publish && !runPublishValidation()) return;
    if (!publish) {
      const basic: ProcessIssue[] = [];
      if (!draft.title.trim()) {
        basic.push({
          id: "draft-title",
          severity: "error",
          message: "عنوان پروسه را وارد کنید.",
          panel: "process",
        });
      }
      if (!draft.stages.length) {
        basic.push({
          id: "draft-stages",
          severity: "error",
          message: "حداقل یک مرحله تعریف کنید.",
          panel: "process",
        });
      }
      if (basic.length) {
        setIssues(basic);
        setPanel("process");
        return;
      }
    }

    const lockedStages = draft.stages.map((stage) => ({
      ...stage,
      formVersions: Object.fromEntries(
        (stage.formIds ?? []).flatMap((formId) => {
          const form = publishedForms.find((item) => item.id === formId);
          if (form) return [[formId, form.version]];
          const previous = stage.formVersions?.[formId];
          return previous ? [[formId, previous]] : [];
        }),
      ),
    }));

    const lockedForms = publishedForms
      .filter((form) => lockedStages.some((stage) => (stage.formIds ?? []).includes(form.id)))
      .map((form) => ({ formId: form.id, version: form.version, title: form.title }));

    const [majorRaw, minorRaw] = (initial?.version ?? "1.0").split(".");
    const major = Number(majorRaw) || 1;
    const minor = Number(minorRaw) || 0;
    const nextVersion =
      !initial || initial.status !== "active"
        ? draft.version === "0.1"
          ? "1.0"
          : draft.version
        : `${major}.${minor + 1}`;

    const previousVersions = initial?.publishedVersions ?? [];
    const publishedVersions =
      publish && initial?.status === "active"
        ? [
            ...previousVersions.filter((version) => version.version !== initial.version),
            {
              version: initial.version,
              publishedAt: initial.updatedAt,
              stages: structuredClone(initial.stages),
              fields: structuredClone(initial.fields),
              payment: structuredClone(initial.payment),
              computedFields: structuredClone(initial.computedFields ?? []),
              formVersions: Object.fromEntries(
                initial.stages.flatMap((stage) =>
                  Object.entries(stage.formVersions ?? {}),
                ),
              ),
              ...(initial.consultation
                ? { consultation: structuredClone(initial.consultation) }
                : {}),
            },
          ]
        : previousVersions;

    let ok = false;
    try {
      ok = await onSave(
        {
          ...draft,
          stages: lockedStages,
          publishedVersions,
          status: publish ? "active" : "draft",
          version: publish ? nextVersion : draft.version,
          updatedAt: new Date().toISOString(),
        },
        publish,
      );
    } catch (error) {
      // Server-side validation stays inside the wizard instead of a hidden banner.
      setIssues([
        {
          id: "save-failed",
          severity: "error",
          message: error instanceof Error ? error.message : "ذخیره پروسه ناموفق بود.",
          panel: "process",
        },
      ]);
      setPanel("process");
      return;
    }
    if (ok) onClose();
  };

  const requestClose = () => {
    if (dirty) {
      setAskClose(true);
      return;
    }
    onClose();
  };

  /** بازنویسی دستی خلاصه مشاوره (L4)؛ خالی یعنی مقدار خودکار. */
  const patchConsultation = (patch: Partial<ProcessConsultation>) =>
    update(
      "consultation",
      normalizeConsultation({ ...(draft.consultation ?? {}), ...patch }),
    );

  const title = initial ? `ویرایش پروسه: ${initial.title}` : "ایجاد پروسه جدید";

  /* ------------------------------------------------- انتخاب مسئول (H1) */

  const renderAssignee = (
    assignee: Assignee,
    onChange: (next: Assignee) => void,
    keyPrefix: string,
  ) => (
    <div className="space-y-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        {(
          [
            { kind: "applicant", label: "متقاضی", icon: UserRound },
            { kind: "role", label: "نقش", icon: ShieldAlert },
            { kind: "employee", label: "کارمند", icon: Users },
          ] as const
        ).map(({ kind, label, icon: Icon }) => {
          const active = assignee.kind === kind;
          return (
            <button
              key={`${keyPrefix}-${kind}`}
              type="button"
              onClick={() => {
                if (kind === "applicant") onChange({ kind: "applicant" });
                else if (kind === "role") {
                  onChange({
                    kind: "role",
                    accessLevelId:
                      assignee.kind === "role" ? assignee.accessLevelId : "",
                  });
                } else {
                  onChange({
                    kind: "employee",
                    employeeId:
                      assignee.kind === "employee" ? assignee.employeeId : "",
                  });
                }
              }}
              className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[0.68rem] transition ${
                active
                  ? "border-[#15554f] bg-[#15554f]/10 text-[#15554f]"
                  : t.quiet
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {assignee.kind === "role" && (
        <ThemedSelect
          value={assignee.accessLevelId}
          onChange={(event) =>
            onChange({ kind: "role", accessLevelId: event.target.value })
          }
          className={selectClass}
          arrowClassName={`left-3 ${t.arrow}`}
          wrapperClassName="block w-full"
        >
          <option value="">انتخاب نقش…</option>
          {options.roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </ThemedSelect>
      )}

      {assignee.kind === "employee" && (
        <ThemedSelect
          value={assignee.employeeId}
          onChange={(event) =>
            onChange({ kind: "employee", employeeId: event.target.value })
          }
          className={selectClass}
          arrowClassName={`left-3 ${t.arrow}`}
          wrapperClassName="block w-full"
        >
          <option value="">انتخاب کارمند…</option>
          {options.employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.fullName}
              {employee.unit ? ` — ${employee.unit}` : ""}
            </option>
          ))}
        </ThemedSelect>
      )}
    </div>
  );

  /* ------------------------------------------- پنل تنظیمات کلی پروسه */

  const renderProcessSettings = () => (
    <div className="space-y-4">
      <h3 className="text-sm font-bold">اطلاعات کلی پروسه</h3>
      <label className={labelClass}>
        عنوان پروسه *
        <input
          value={draft.title}
          onChange={(event) => update("title", event.target.value)}
          className={`${inputClass} mt-1.5`}
          placeholder="مثلاً ثبت پروانه ساختمانی"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          کد شناسه *
          <input
            value={draft.code}
            onChange={(event) => update("code", event.target.value.toUpperCase())}
            className={`${inputClass} mt-1.5`}
            placeholder="URB-001"
            dir="ltr"
          />
        </label>
        <label className={labelClass}>
          واحد متولی
          <ThemedSelect
            value={draft.department}
            onChange={(event) => update("department", event.target.value)}
            className={selectClass}
            arrowClassName={`left-3 ${t.arrow}`}
            wrapperClassName="mt-1.5 block w-full"
          >
            {PROCESS_DEPARTMENTS.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </ThemedSelect>
        </label>
      </div>
      <div>
        <p className={`${labelClass} mb-2`}>نماد پروسه</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ICON_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => update("icon", value)}
              className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-[0.68rem] transition ${
                draft.icon === value
                  ? "border-[#15554f] bg-[#15554f]/10 text-[#15554f]"
                  : t.quiet
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </div>
      <label className={labelClass}>
        توضیحات / راهنمای کلی برای متقاضی
        <textarea
          value={draft.description}
          onChange={(event) => update("description", event.target.value)}
          rows={4}
          className={`${inputClass} mt-1.5 resize-y`}
          placeholder="هدف پروسه، مدارک لازم، شرایط کلی..."
        />
      </label>

      {/* L4: خلاصه مشاوره متقاضی — خودکار تولید می‌شود و اینجا بازنویسی می‌شود. */}
      <details className={`rounded-xl border p-3 ${t.panel}`}>
        <summary className="cursor-pointer text-xs font-bold">
          خلاصه مشاوره برای دستیار متقاضی
        </summary>
        <p className={`mt-1.5 text-[0.62rem] leading-5 ${t.muted}`}>
          مدارک، هزینه و مدت به صورت خودکار از فرم‌ها و مراحل همین پروسه ساخته
          می‌شوند. هر فیلدی را که پر کنید، جای مقدار خودکار را می‌گیرد.
        </p>
        <div
          className={`mt-2 space-y-1 rounded-lg border border-dashed p-2.5 text-[0.62rem] leading-5 ${t.muted}`}
        >
          <p className="font-semibold">پیش‌نمایش خودکار</p>
          <p>
            مدارک لازم:{" "}
            {consultationPreview.documents.length
              ? consultationPreview.documents
                  .map((item) => `${item.label}${item.required ? " (الزامی)" : ""}`)
                  .join("، ")
              : "—"}
          </p>
          <p>
            هزینه‌ها:{" "}
            {consultationPreview.fees.length ? consultationPreview.fees.join("، ") : "—"}
          </p>
          <p>
            مدت تقریبی:{" "}
            {consultationPreview.days ? `${consultationPreview.days} روز` : "—"}
            {consultationPreview.basis === "all-stages"
              ? " (جمع همه مراحل؛ مسیر پیش‌فرض تعریف نشده)"
              : ""}
          </p>
        </div>
        <div className="mt-3 space-y-3">
          <label className={labelClass}>
            مدارک لازم (بازنویسی)
            <textarea
              rows={2}
              value={draft.consultation?.requiredDocumentsText ?? ""}
              onChange={(event) =>
                patchConsultation({ requiredDocumentsText: event.target.value })
              }
              className={`${inputClass} mt-1.5 resize-y`}
              placeholder="خالی = استخراج خودکار از فیلدهای فایل"
            />
          </label>
          <label className={labelClass}>
            هزینه‌ها (بازنویسی)
            <textarea
              rows={2}
              value={draft.consultation?.feesText ?? ""}
              onChange={(event) => patchConsultation({ feesText: event.target.value })}
              className={`${inputClass} mt-1.5 resize-y`}
              placeholder="خالی = استخراج خودکار از فیلدهای پرداخت"
            />
          </label>
          <label className={labelClass}>
            مدت تقریبی (روز)
            <input
              type="number"
              min={1}
              value={draft.consultation?.estimatedDurationDays ?? ""}
              onChange={(event) =>
                patchConsultation({
                  estimatedDurationDays: event.target.value
                    ? Number(event.target.value)
                    : undefined,
                })
              }
              className={`${inputClass} mt-1.5`}
              placeholder="خالی = جمع مهلت مسیر پیش‌فرض"
            />
          </label>
          <label className={labelClass}>
            پیش‌نیازها و شرایط
            <textarea
              rows={3}
              value={draft.consultation?.prerequisites ?? ""}
              onChange={(event) =>
                patchConsultation({ prerequisites: event.target.value })
              }
              className={`${inputClass} mt-1.5 resize-y`}
              placeholder="مثلاً داشتن حداقل یک سال سابقه کار"
            />
          </label>
        </div>
      </details>
    </div>
  );

  /* ------------------------------------------------------ پنل مرحله */

  const renderStagePanel = () => {
    if (!selectedStage) {
      return <p className={`text-xs ${t.muted}`}>یک مرحله را از بوم انتخاب کنید.</p>;
    }
    const index = draft.stages.findIndex((stage) => stage.id === selectedStage.id);
    const rules = selectedStage.routeRules ?? [];
    const variables = variablesAtStage(draft, availableForms, index);
    const laterStages = draft.stages.slice(index + 1);
    const targetOptions: { value: string; label: string }[] = [
      ...laterStages.map((stage, offset) => ({
        value: stage.id,
        label: `${index + offset + 2}. ${stage.title || "بدون عنوان"}`,
      })),
      { value: ROUTE_COMPLETE, label: "پایان موفق پرونده" },
      { value: ROUTE_REJECT, label: "رد نهایی پرونده" },
    ];

    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold">تنظیمات مرحله {index + 1}</h3>
            <p className={`mt-0.5 text-[0.65rem] ${t.muted}`}>
              مسئول، مهلت، فرم، خروجی و مسیر بعدی
            </p>
          </div>
          <button
            type="button"
            disabled={draft.stages.length <= 1}
            onClick={() => requestRemoveStage(selectedStage.id)}
            className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-500/10 disabled:opacity-30"
            aria-label="حذف مرحله"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <label className={labelClass}>
          نام مرحله *
          <input
            value={selectedStage.title}
            onChange={(event) =>
              updateStage(selectedStage.id, { title: event.target.value })
            }
            className={`${inputClass} mt-1.5`}
          />
        </label>

        <div>
          <p className={`${labelClass} mb-1.5`}>مسئول انجام مرحله *</p>
          {renderAssignee(
            selectedStage.assignee,
            (assignee) => updateStage(selectedStage.id, { assignee }),
            `stage-${selectedStage.id}`,
          )}
          {selectedStage.legacyAssigneeLabel && (
            <p className={`mt-1.5 flex items-start gap-1 text-[0.65rem] ${isDarkMode ? "text-amber-400" : "text-amber-700"}`}>
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              برچسب قدیمی «{selectedStage.legacyAssigneeLabel}» قابل تبدیل خودکار نبود؛
              نقش یا کارمند درست را انتخاب کنید.
            </p>
          )}
          {optionsError && (
            <p className="mt-1.5 text-[0.65rem] text-rose-600">{optionsError}</p>
          )}
        </div>

        <label className={labelClass}>
          {selectedStage.assignee.kind === "applicant"
            ? "مهلت تکمیل توسط متقاضی (روز)"
            : "مهلت بررسی (روز)"}
          <input
            type="number"
            min={1}
            value={selectedStage.slaDays}
            onChange={(event) =>
              updateStage(selectedStage.id, {
                slaDays: Math.max(1, Number(event.target.value) || 1),
              })
            }
            className={`${inputClass} mt-1.5`}
          />
        </label>

        <div>
          <p className={`${labelClass} mb-1.5`}>فرم‌های این مرحله</p>
          <div className="space-y-1.5">
            {publishedForms.map((form) => {
              const checked = (selectedStage.formIds ?? []).includes(form.id);
              return (
                <label
                  key={form.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                    checked ? "border-[#15554f]/40 bg-[#15554f]/10" : t.quiet
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-[#15554f]"
                    checked={checked}
                    onChange={() => {
                      const ids = selectedStage.formIds ?? [];
                      updateStage(selectedStage.id, {
                        formIds: checked
                          ? ids.filter((id) => id !== form.id)
                          : [...ids, form.id],
                      });
                    }}
                  />
                  <span className="font-medium">{form.title}</span>
                  {form.formType === "payment" && (
                    <span className={`text-[0.62rem] ${t.muted}`}>(پرداخت)</span>
                  )}
                </label>
              );
            })}
            {!publishedForms.length && (
              <p className={`rounded-xl border border-dashed p-3 text-[0.68rem] ${t.muted}`}>
                فرم فعالی در کتابخانه فرم‌ها نیست. ابتدا فرم بسازید و منتشر کنید.
              </p>
            )}
          </div>
        </div>

        <label className={labelClass}>
          راهنمای این مرحله برای متقاضی
          <textarea
            value={selectedStage.guidance ?? ""}
            onChange={(event) =>
              updateStage(selectedStage.id, { guidance: event.target.value })
            }
            rows={3}
            className={`${inputClass} mt-1.5 resize-y`}
            placeholder="چه کار کند، چه مدارکی لازم است..."
          />
        </label>

        {/* ---------------- H2: خروجی‌ها و مهلت‌ها (پیش‌فرض بسته) ---------------- */}
        <details className={`rounded-xl border p-3 ${t.panel}`}>
          <summary className="cursor-pointer text-xs font-bold">
            خروجی‌ها و مهلت‌ها
          </summary>
          <div className="mt-3 space-y-3">
            {selectedStage.assignee.kind === "applicant" ? (
              <p className={`rounded-lg border border-dashed p-2.5 text-[0.68rem] leading-5 ${t.muted}`}>
                این مرحله متعلق به متقاضی است. اگر مهلت ({selectedStage.slaDays} روز) بگذرد،
                پرونده با وضعیت «بسته‌شده به‌دلیل انقضای مهلت متقاضی» بسته می‌شود و
                ارجاع کارشناسی روی آن اعمال نمی‌شود.
              </p>
            ) : (
              <>
                <label className={labelClass}>
                  رفتار در صورت رد
                  <ThemedSelect
                    value={selectedStage.onReject ?? "return_to_applicant"}
                    onChange={(event) =>
                      updateStage(selectedStage.id, {
                        onReject: event.target.value as RejectPolicy,
                      })
                    }
                    className={selectClass}
                    arrowClassName={`left-3 ${t.arrow}`}
                    wrapperClassName="mt-1.5 block w-full"
                  >
                    <option value="return_to_applicant">
                      بازگشت به آخرین مرحله متقاضی (همین نسخه)
                    </option>
                    <option value="reject_final">رد نهایی پرونده</option>
                  </ThemedSelect>
                </label>
                <p className={`text-[0.65rem] leading-5 ${t.muted}`}>
                  «بازگشت» یک مرحله متقاضی را دوباره باز می‌کند و به‌عنوان قاعده مسیر
                  معکوس ذخیره نمی‌شود؛ بنابراین مسیرهای شرطی همیشه رو به جلو و بدون چرخه
                  می‌مانند.
                </p>

                <div className={`rounded-lg border p-2.5 ${t.card}`}>
                  <label className="flex items-center gap-2 text-[0.7rem] font-semibold">
                    <input
                      type="checkbox"
                      className="accent-[#15554f]"
                      checked={Boolean(selectedStage.escalation)}
                      onChange={(event) =>
                        updateStage(selectedStage.id, {
                          escalation: event.target.checked
                            ? {
                                afterDays: selectedStage.slaDays,
                                to: { kind: "role", accessLevelId: "" },
                              }
                            : undefined,
                        })
                      }
                    />
                    ارجاع خودکار پس از تأخیر
                  </label>

                  {selectedStage.escalation && (
                    <div className="mt-2.5 space-y-2.5">
                      <label className={labelClass}>
                        پس از چند روز؟
                        <input
                          type="number"
                          min={1}
                          value={selectedStage.escalation.afterDays}
                          onChange={(event) =>
                            updateStage(selectedStage.id, {
                              escalation: {
                                afterDays: Math.max(1, Number(event.target.value) || 1),
                                to: selectedStage.escalation?.to ?? {
                                  kind: "role",
                                  accessLevelId: "",
                                },
                              },
                            })
                          }
                          className={`${inputClass} mt-1.5`}
                        />
                      </label>
                      <div>
                        <p className={`${labelClass} mb-1.5`}>ارجاع به</p>
                        {renderAssignee(
                          selectedStage.escalation.to,
                          (to) =>
                            updateStage(selectedStage.id, {
                              escalation: {
                                afterDays: selectedStage.escalation?.afterDays ?? selectedStage.slaDays,
                                to,
                              },
                            }),
                          `escalation-${selectedStage.id}`,
                        )}
                      </div>
                      <p className={`text-[0.65rem] leading-5 ${t.muted}`}>
                        تأخیر کارشناسی پرونده را نمی‌بندد؛ فقط «نیازمند ارجاع» علامت
                        می‌خورد و به مسئول بالاتر منتقل می‌شود.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </details>

        <div className={`space-y-3 rounded-xl border p-3 ${t.panel}`}>
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-bold">
              <GitBranch className="h-3.5 w-3.5 text-[#15554f]" />
              مسیر بعدی
            </h4>
            <button
              type="button"
              onClick={() =>
                updateStage(selectedStage.id, {
                  routeRules: [
                    ...rules,
                    {
                      id: `route-${crypto.randomUUID()}`,
                      condition: emptyCondition(),
                      nextStageId: ROUTE_COMPLETE,
                    },
                  ],
                })
              }
              className="text-[0.68rem] font-semibold text-[#15554f]"
            >
              + افزودن قانون شرطی
            </button>
          </div>

          {rules.map((rule: StageRouteRule) => (
            <div
              key={rule.id}
              className={`space-y-2 rounded-xl border p-2.5 ${
                isDarkMode ? "border-white/10 bg-black/20" : "border-[#e1e6df] bg-slate-50"
              }`}
            >
              {variables.length ? (
                <ConditionFormulaEditor
                  mode="condition"
                  variables={variables}
                  value={rule.condition}
                  onChange={(condition: ConditionValue) =>
                    updateStage(selectedStage.id, {
                      routeRules: rules.map((item) =>
                        item.id === rule.id ? { ...item, condition } : item,
                      ),
                    })
                  }
                />
              ) : (
                <p className={`text-[0.68rem] ${t.muted}`}>
                  برای شرط، فرم دارای فیلد به این مرحله یا مراحل قبل وصل کنید.
                </p>
              )}
              <label className={labelClass}>
                آن‌گاه برو به
                <ThemedSelect
                  value={rule.nextStageId}
                  onChange={(event) =>
                    updateStage(selectedStage.id, {
                      routeRules: rules.map((item) =>
                        item.id === rule.id
                          ? { ...item, nextStageId: event.target.value }
                          : item,
                      ),
                    })
                  }
                  className={selectClass}
                  arrowClassName={`left-3 ${t.arrow}`}
                  wrapperClassName="mt-1.5 block w-full"
                >
                  <option value="">انتخاب مقصد…</option>
                  {targetOptions.map((target) => (
                    <option key={target.value} value={target.value}>
                      {target.label}
                    </option>
                  ))}
                </ThemedSelect>
              </label>
              <p className={`text-[0.62rem] ${t.muted}`}>
                مقصد فعلی: {routeTargetLabel(draft, rule.nextStageId)}
              </p>
              <button
                type="button"
                onClick={() =>
                  updateStage(selectedStage.id, {
                    routeRules: rules.filter((item) => item.id !== rule.id),
                  })
                }
                className="text-[0.68rem] text-rose-600"
              >
                حذف این قانون
              </button>
            </div>
          ))}

          <label className={labelClass}>
            مسیر پیش‌فرض (اگر هیچ شرطی برقرار نبود)
            <ThemedSelect
              value={selectedStage.defaultNextStageId ?? ""}
              onChange={(event) =>
                updateStage(selectedStage.id, {
                  defaultNextStageId: event.target.value,
                })
              }
              className={selectClass}
              arrowClassName={`left-3 ${t.arrow}`}
              wrapperClassName="mt-1.5 block w-full"
            >
              <option value="">مرحله بعدی به‌ترتیب / پایان</option>
              {targetOptions.map((target) => (
                <option key={target.value} value={target.value}>
                  {target.label}
                </option>
              ))}
            </ThemedSelect>
          </label>
        </div>
      </div>
    );
  };

  /* -------------------------------------------------- پنل محاسبات (H3) */

  const formOptionsForStage = (stageId: string | undefined): FormDefinition[] => {
    const stage = draft.stages.find((item) => item.id === stageId);
    const ids = stage?.formIds ?? [];
    return ids
      .map((id) => availableForms.find((form) => form.id === id))
      .filter((form): form is FormDefinition => Boolean(form));
  };

  const renderComputed = (field: ComputedProcessField) => {
    const destination = field.destination;
    const destinationStageId = destination.kind === "internal" ? draft.stages[1]?.id ?? draft.stages[0]?.id ?? "" : destination.stageId;
    const stageForms = formOptionsForStage(destinationStageId);
    const activeForm = destination.kind === "internal"
      ? undefined
      : stageForms.find((form) => form.id === destination.formId) ?? stageForms[0];
    const targetFields: ProcessField[] = activeForm
      ? formLeafFields(activeForm).filter((candidate) =>
          destination.kind === "payment_amount"
            ? candidate.type === "payment"
            : candidate.type !== "payment",
        )
      : [];
    const vars = numericVariablesBeforeStage(draft, availableForms, destinationStageId);
    const category = UNIT_CATEGORIES.find((item) => item.id === field.unitCategory);
    const paymentTargets = (draft.computedFields ?? []).filter(
      (item) =>
        item.destination.kind === "payment_amount" &&
        activeForm &&
        item.destination.formId === activeForm.id,
    );

    void paymentTargets;

    const patch = (next: Partial<ComputedProcessField>) =>
      update(
        "computedFields",
        (draft.computedFields ?? []).map((item) =>
          item.id === field.id ? { ...item, ...next } : item,
        ),
      );

    const setDestination = (next: ComputedDestination) => patch({ destination: next });

    return (
      <article key={field.id} className={`space-y-2 rounded-xl border p-3 ${t.panel}`}>
        <label className={labelClass}>
          نام
          <input
            value={field.name}
            onChange={(event) => patch({ name: event.target.value })}
            className={`${inputClass} mt-1.5`}
            placeholder="مثلاً هزینه بررسی"
          />
        </label>

        <div>
          <p className={`${labelClass} mb-1.5`}>مقصد نتیجه</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { kind: "internal", label: "داخلی" },
                { kind: "form_field", label: "فیلد فرم" },
                { kind: "payment_amount", label: "مبلغ پرداخت" },
              ] as const
            ).map(({ kind, label }) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  if (kind === "internal") {
                    setDestination({ kind: "internal" });
                    return;
                  }
                  const stageId = draft.stages[1]?.id ?? draft.stages[0]?.id ?? "";
                  const form = formOptionsForStage(stageId)[0];
                  setDestination({
                    kind,
                    stageId,
                    formId: form?.id ?? "",
                    fieldId: "",
                  });
                }}
                className={`rounded-lg border px-2 py-1.5 text-[0.68rem] transition ${
                  destination.kind === kind
                    ? "border-[#15554f] bg-[#15554f]/10 text-[#15554f]"
                    : t.quiet
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {destination.kind !== "internal" && (
          <>
            <label className={labelClass}>
              مرحله مقصد
              <ThemedSelect
                value={destinationStageId}
                onChange={(event) => {
                  const stageId = event.target.value;
                  const form = formOptionsForStage(stageId)[0];
                  setDestination({
                    kind: destination.kind,
                    stageId,
                    formId: form?.id ?? "",
                    fieldId: "",
                  });
                }}
                className={selectClass}
                arrowClassName={`left-3 ${t.arrow}`}
                wrapperClassName="mt-1.5 block w-full"
              >
                {draft.stages.map((stage, position) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.title || `مرحله ${position + 1}`}
                  </option>
                ))}
              </ThemedSelect>
            </label>

            <label className={labelClass}>
              فرم مقصد
              <ThemedSelect
                value={activeForm?.id ?? ""}
                onChange={(event) =>
                  setDestination({
                    kind: destination.kind,
                    stageId: destinationStageId,
                    formId: event.target.value,
                    fieldId: "",
                  })
                }
                className={selectClass}
                arrowClassName={`left-3 ${t.arrow}`}
                wrapperClassName="mt-1.5 block w-full"
              >
                <option value="">انتخاب فرم…</option>
                {stageForms.map((form) => (
                  <option key={form.id} value={form.id}>
                    {form.title}
                  </option>
                ))}
              </ThemedSelect>
            </label>

            <label className={labelClass}>
              فیلد مقصد
              <ThemedSelect
                value={destination.fieldId}
                onChange={(event) =>
                  setDestination({
                    kind: destination.kind,
                    stageId: destinationStageId,
                    formId: activeForm?.id ?? "",
                    fieldId: event.target.value,
                  })
                }
                className={selectClass}
                arrowClassName={`left-3 ${t.arrow}`}
                wrapperClassName="mt-1.5 block w-full"
              >
                <option value="">انتخاب فیلد…</option>
                {targetFields.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label || "بدون عنوان"}
                  </option>
                ))}
              </ThemedSelect>
            </label>
          </>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className={labelClass}>
            دسته واحد
            <ThemedSelect
              value={field.unitCategory ?? ""}
              onChange={(event) => {
                const nextCategory = UNIT_CATEGORIES.find(
                  (item) => item.id === event.target.value,
                );
                patch({
                  unitCategory: nextCategory?.id as UnitCategoryId | undefined,
                  unit: nextCategory?.units[0]?.id,
                });
              }}
              className={selectClass}
              arrowClassName={`left-3 ${t.arrow}`}
              wrapperClassName="mt-1.5 block w-full"
            >
              <option value="">بدون واحد</option>
              {UNIT_CATEGORIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </ThemedSelect>
          </label>
          <label className={labelClass}>
            واحد
            <ThemedSelect
              value={field.unit ?? ""}
              onChange={(event) => patch({ unit: event.target.value })}
              className={selectClass}
              arrowClassName={`left-3 ${t.arrow}`}
              wrapperClassName="mt-1.5 block w-full"
              disabled={!category}
            >
              <option value="">—</option>
              {(category?.units ?? []).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.label}
                </option>
              ))}
            </ThemedSelect>
          </label>
        </div>

        {vars.length ? (
          <ConditionFormulaEditor
            mode="formula"
            variables={vars}
            value={field.formula}
            onChange={(formula: FormulaValue) => patch({ formula })}
          />
        ) : (
          <p className={`text-[0.68rem] ${t.muted}`}>
            متغیر عددی از مراحل قبل در دسترس نیست. فرم دارای فیلد عدد را به مرحله(های)
            قبل از مقصد وصل کنید و فرم را فعال نگه دارید.
          </p>
        )}

        <button
          type="button"
          onClick={() =>
            update(
              "computedFields",
              (draft.computedFields ?? []).filter((item) => item.id !== field.id),
            )
          }
          className="text-[0.68rem] text-rose-600"
        >
          حذف
        </button>
      </article>
    );
  };

  const renderLogicPanel = () => {
    const addComputed = () => {
      const stageId = draft.stages[1]?.id ?? draft.stages[0]?.id ?? "";
      const form = formOptionsForStage(stageId)[0];
      const field: ComputedProcessField = {
        id: `calculation-${crypto.randomUUID()}`,
        name: "",
        formula: { tokens: [] },
        destination: emptyDestination(),
        ...(form ? {} : {}),
      };
      update("computedFields", [...(draft.computedFields ?? []), field]);
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold">فیلدهای محاسباتی</h3>
            <p className={`mt-0.5 text-[0.65rem] ${t.muted}`}>
              فرمول از فیلدهای مراحل قبل؛ نتیجه هنگام ورود متقاضی به مرحله مقصد یک‌بار
              محاسبه می‌شود.
            </p>
          </div>
          <button
            type="button"
            onClick={addComputed}
            className="inline-flex items-center gap-1 rounded-xl bg-[#15554f] px-2.5 py-1.5 text-[0.68rem] font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            افزودن
          </button>
        </div>

        {(draft.computedFields ?? []).map((field) => renderComputed(field))}

        {!(draft.computedFields ?? []).length && (
          <p className={`rounded-xl border border-dashed p-4 text-center text-xs ${t.muted}`}>
            فیلد محاسباتی تعریف نشده است.
          </p>
        )}
      </div>
    );
  };

  /* -------------------------------------------------------- بوم مراحل */

  const renderCanvas = () => (
    <div
      className={`min-h-0 flex-1 overflow-y-auto rounded-2xl border p-4 ${t.canvas} ${t.divider}`}
    >
      <button
        type="button"
        onClick={() => setPanel("process")}
        className={`mb-5 flex w-full items-start justify-between gap-3 rounded-2xl border p-3.5 text-right transition hover:border-[#15554f]/40 ${t.card}`}
      >
        <div className="min-w-0">
          <p className="text-sm font-bold">
            {draft.title || "بدون عنوان"}{" "}
            <span className={`font-normal ${t.muted}`} dir="ltr">
              {draft.code || "—"}
            </span>
          </p>
          <p className={`mt-1 text-[0.68rem] ${t.muted}`}>
            {draft.department}
            {draft.description
              ? ` · ${draft.description.slice(0, 80)}${draft.description.length > 80 ? "…" : ""}`
              : " · برای ویرایش اطلاعات کلی کلیک کنید"}
          </p>
        </div>
        <Settings2 className={`h-4 w-4 shrink-0 ${t.muted}`} />
      </button>

      <div className="mx-auto flex max-w-lg flex-col items-stretch">
        {draft.stages.map((stage, index) => {
          const isSelected = stage.id === selectedStageId && panel === "stage";
          const formTitles = (stage.formIds ?? [])
            .map((id) => availableForms.find((form) => form.id === id)?.title)
            .filter((value): value is string => Boolean(value));
          const hasRules = (stage.routeRules ?? []).length > 0;
          const unresolved = stage.assignee.kind !== "applicant" && isAssigneeUnresolved(stage.assignee);

          return (
            <div key={stage.id} className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => selectStage(stage.id)}
                className={`w-full rounded-2xl border p-4 text-right transition ${t.card} ${
                  isSelected ? t.stageActive : "hover:border-[#15554f]/35"
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#15554f] text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="text-sm font-bold">
                    {stage.title || "بدون عنوان"}
                  </span>
                </div>
                <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.68rem] ${t.muted}`}>
                  <span className="inline-flex items-center gap-1">
                    {stage.assignee.kind === "applicant" ? (
                      <UserRound className="h-3 w-3" />
                    ) : (
                      <Users className="h-3 w-3" />
                    )}
                    {assigneeLabel(stage.assignee)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="h-3 w-3" />
                    {stage.slaDays} روز
                  </span>
                  {stage.assignee.kind !== "applicant" && (
                    <span className="inline-flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      {stage.onReject === "reject_final" ? "رد نهایی" : "بازگشت به متقاضی"}
                    </span>
                  )}
                </p>
                {unresolved && (
                  <p className="mt-1.5 flex items-center gap-1 text-[0.62rem] text-rose-500">
                    <AlertTriangle className="h-3 w-3" />
                    مسئول تعیین نشده
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {formTitles.length ? (
                    formTitles.map((formTitle) => (
                      <span
                        key={formTitle}
                        className="rounded-full border border-[#15554f]/25 bg-[#15554f]/10 px-2 py-0.5 text-[0.62rem] text-[#15554f]"
                      >
                        📄 {formTitle}
                      </span>
                    ))
                  ) : (
                    <span className={`rounded-full border border-dashed px-2 py-0.5 text-[0.62rem] ${t.muted}`}>
                      فرمی انتخاب نشده
                    </span>
                  )}
                  {stage.escalation && (
                    <span className={`rounded-full px-2 py-0.5 text-[0.62rem] ${t.muted}`}>
                      ⏫ ارجاع پس از {stage.escalation.afterDays} روز
                    </span>
                  )}
                </div>
              </button>

              {index < draft.stages.length - 1 && (
                <div className="flex flex-col items-center py-1">
                  <div className="h-4 w-0.5 bg-[#15554f]/35" />
                  {hasRules ? (
                    <button
                      type="button"
                      onClick={() => selectStage(stage.id)}
                      className="my-1 flex items-center gap-1 rounded-full border border-[#15554f]/30 bg-[#15554f]/10 px-2.5 py-1 text-[0.62rem] font-medium text-[#15554f]"
                    >
                      <GitBranch className="h-3 w-3" />
                      {(stage.routeRules ?? []).length} قانون مسیر
                    </button>
                  ) : (
                    <span className={`my-1 text-[0.6rem] ${t.muted}`}>↓</span>
                  )}
                  <div className="h-4 w-0.5 bg-[#15554f]/35" />
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={addStage}
          className={`mt-2 w-full rounded-2xl border border-dashed py-3 text-xs font-semibold text-[#15554f] transition hover:bg-[#15554f]/5 ${t.divider}`}
        >
          + افزودن مرحله
        </button>
      </div>
    </div>
  );

  const panelOpen = panel !== "none";
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.length - errorCount;

  const openIssue = (issue: ProcessIssue) => {
    if (issue.stageId) {
      selectStage(issue.stageId);
      return;
    }
    setPanel(issue.panel === "process" ? "process" : issue.panel === "logic" ? "logic" : "process");
  };

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title={title}
      maxWidthClass="max-w-6xl"
      fullScreen
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className={`mb-3 flex shrink-0 flex-wrap items-center gap-2 border-b pb-3 ${t.divider}`}
        >
          <button
            type="button"
            onClick={() => setPanel(panel === "process" ? "none" : "process")}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs ${
              panel === "process"
                ? "border-[#15554f] bg-[#15554f]/10 text-[#15554f]"
                : t.quiet
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            اطلاعات کلی
          </button>
          <button
            type="button"
            onClick={() => setPanel(panel === "logic" ? "none" : "logic")}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs ${
              panel === "logic"
                ? "border-[#15554f] bg-[#15554f]/10 text-[#15554f]"
                : t.quiet
            }`}
          >
            محاسبات
          </button>
        </div>

        {notice && (
          <div
            role="status"
            className={`mb-3 shrink-0 rounded-xl border p-2.5 text-[0.68rem] leading-5 ${
              isDarkMode
                ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-300"
                : "border-emerald-500/25 bg-emerald-50 text-emerald-700"
            }`}
          >
            {notice}
          </div>
        )}

        {issues.length > 0 && (
          <div
            role="alert"
            className="mb-3 max-h-40 shrink-0 overflow-y-auto rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-600"
          >
            <p className="mb-1.5 font-bold">
              اعتبارسنجی انتشار: {errorCount} خطا
              {warningCount ? ` · ${warningCount} هشدار` : ""}
            </p>
            {issues.map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => openIssue(issue)}
                className="mb-1 flex w-full items-start gap-1.5 text-right leading-5 hover:underline"
              >
                <span className="mt-0.5">
                  {issue.severity === "error" ? "•" : "◦"}
                </span>
                <span>{issue.message}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
          {renderCanvas()}

          {panelOpen && (
            <aside
              className={`flex w-full max-w-md shrink-0 flex-col overflow-hidden rounded-2xl border ${t.card}`}
            >
              <div
                className={`flex items-center justify-between border-b px-4 py-3 ${t.divider}`}
              >
                <span className="text-xs font-bold">
                  {panel === "process"
                    ? "اطلاعات کلی پروسه"
                    : panel === "logic"
                      ? "محاسبات"
                      : "تنظیمات مرحله"}
                </span>
                <button
                  type="button"
                  aria-label="بستن پنل"
                  onClick={() => setPanel("none")}
                  className={`rounded-lg p-1 ${t.quiet}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {panel === "process" && renderProcessSettings()}
                {panel === "stage" && renderStagePanel()}
                {panel === "logic" && renderLogicPanel()}
              </div>
            </aside>
          )}
        </div>

        <div
          className={`mt-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-1 pb-4 pt-3 sm:pb-5 ${t.divider} ${
            isDarkMode ? "bg-[#17332f]" : "bg-white"
          }`}
        >
          <button
            type="button"
            onClick={requestClose}
            className={`rounded-xl border px-4 py-2 text-xs ${t.quiet}`}
          >
            انصراف
          </button>

          <p
            className={`order-last w-full text-center text-[0.65rem] sm:order-none sm:w-auto ${t.muted}`}
          >
            {draft.stages.length} مرحله ·{" "}
            {draft.stages.reduce((count, stage) => count + (stage.formIds?.length ?? 0), 0)} فرم
            متصل · {(draft.computedFields ?? []).length} محاسبه
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void save(false)}
              className={`rounded-xl border px-4 py-2 text-xs font-semibold ${t.quiet}`}
            >
              ذخیره پیش‌نویس
            </button>
            <button
              type="button"
              onClick={() => void save(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <Check className="h-3.5 w-3.5" />
              انتشار
            </button>
          </div>
        </div>
      </div>

      {/* L3: تأیید حذف مرحله‌ای که هنوز ارجاع دارد. */}
      {stageToDelete &&
        (() => {
          const stage = stageToDelete;
          const impact = stageImpact(stage.id);
          const references = [
            impact.routeRules ? `${impact.routeRules} قاعده مسیر` : "",
            impact.defaults ? `${impact.defaults} مسیر پیش‌فرض` : "",
            impact.computed ? `${impact.computed} محاسبه` : "",
          ].filter(Boolean);
          const forms = (stage.formIds ?? []).length;
          const details = [
            references.length
              ? `ارجاع‌های ${references.join(" و ")} به این مرحله خودکار پاک‌سازی می‌شوند`
              : "",
            forms ? `${forms} فرم متصل نیز از این مرحله جدا می‌شود` : "",
          ].filter(Boolean);
          return (
            <ConfirmModal
              open
              danger
              title="حذف مرحله"
              message={
                details.length
                  ? `مرحله «${stage.title}» حذف شود؟ ${details.join(" و ")}.`
                  : `مرحله «${stage.title}» حذف شود؟`
              }
              confirmLabel="حذف مرحله"
              onConfirm={() => deleteStage(stage, impact)}
              onClose={() => setStageToDelete(null)}
            />
          );
        })()}

      {/* L3: خروج بدون ذخیره — ذخیره پیش‌نویس / دور ریختن / انصراف */}
      <Modal
        open={askClose}
        onClose={() => setAskClose(false)}
        title="تغییرهای ذخیره‌نشده"
        maxWidthClass="max-w-md"
      >
        <p className={`text-xs leading-6 ${t.muted}`}>
          تغییرهای این پروسه هنوز ذخیره نشده‌اند. می‌خواهید آن‌ها را به‌صورت
          پیش‌نویس ذخیره کنید؟
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setAskClose(false)}
            className={`rounded-xl border px-3.5 py-2 text-xs ${t.quiet}`}
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={() => {
              setAskClose(false);
              setDirty(false);
              onClose();
            }}
            className="rounded-xl border border-rose-500/40 px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-500/10"
          >
            دور ریختن تغییرها
          </button>
          <button
            type="button"
            onClick={() => {
              setAskClose(false);
              void save(false);
            }}
            className="rounded-xl bg-[#15554f] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#246b61]"
          >
            ذخیره پیش‌نویس
          </button>
        </div>
      </Modal>
    </Modal>
  );
}
