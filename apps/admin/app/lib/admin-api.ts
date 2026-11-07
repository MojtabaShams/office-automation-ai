/**
 * Typed client for the FastAPI backend used by the admin panel.
 *
 * The access token lives for 30 minutes (``AUTH_TOKEN_TTL_MINUTES`` on the server).
 * The session (token + expiry + user snapshot) is stored under a clearly named
 * localStorage key and is discarded on logout, expiry, or any ``401`` response.
 */

import type { FormDefinition } from "./mock-forms";
import { normalizeProcess, type ProcessDefinition, type ProcessStatus } from "./mock-processes";
import type { ReportDefinition } from "./report-types";

const API_BASE =
  process.env.NEXT_PUBLIC_ADMIN_API_URL ??
  process.env.NEXT_PUBLIC_AGENT_API_URL ??
  "http://127.0.0.1:8000";

export const ADMIN_SESSION_KEY = "office-admin-session-v1";
export const SESSION_EXPIRED_EVENT = "office-admin-session-expired";

export type PermissionMatrix = Record<string, Record<string, boolean>>;

export type AuthUser = {
  id: string;
  full_name: string;
  national_id: string;
  mobile: string;
  email: string;
  unit: string;
  avatar: string;
  role: string;
  role_name: string;
  is_active: boolean;
  permissions: PermissionMatrix;
  last_login_at: string | null;
  created_at: string | null;
};

export type StoredSession = {
  token: string;
  /** Epoch milliseconds after which the token is rejected by the server. */
  expiresAt: number;
  user: AuthUser;
};

export type AuthResponse = {
  status: string;
  message: string;
  token: string;
  user: AuthUser;
  expires_at: string;
  expires_in: number;
};

export type AdminUser = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  nationalId: string;
  unit: string;
  role: string;
  roleCode: string;
  accessLevelId: string;
  status: "active" | "inactive";
  isActive: boolean;
  hireDate: string;
  lastLoginAt: string | null;
  createdAt: string;
};

export type EmployeeInput = {
  fullName: string;
  mobile: string;
  nationalId: string;
  password: string;
  roleId: string;
  email?: string;
  unit?: string;
  isActive?: boolean;
};

export type Role = {
  id: string;
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: PermissionMatrix;
  userCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CatalogAction = { action: string; label: string };
export type CatalogResource = { resource: string; label: string; actions: CatalogAction[] };
export type PermissionCatalog = { resources: CatalogResource[]; actions: CatalogAction[] };

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function isBrowser() {
  return typeof window !== "undefined";
}

export function readStoredSession(): StoredSession | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.token || !parsed?.user || !parsed?.expiresAt) {
      clearStoredSession();
      return null;
    }
    if (Date.now() >= parsed.expiresAt) {
      clearStoredSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: StoredSession) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
  } catch {
    /* private mode: the in-memory session still works for this tab */
  }
}

export function clearStoredSession() {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Fetch wrapper: injects the bearer token and enforces the 401 contract. */
export async function adminRequest<T>(
  path: string,
  init: RequestInit = {},
  token: string | null | undefined = readStoredSession()?.token,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as {
    detail?: string;
    message?: string;
    code?: string;
  };
  if (!res.ok) {
    if (res.status === 401 && token) {
      clearStoredSession();
      if (isBrowser()) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(
      data.detail || data.message || `خطای سرور (${res.status})`,
      res.status,
      data.code,
    );
  }
  return data as T;
}

// ---------------------------------------------------------------------- auth
export async function login(mobile: string, password: string): Promise<AuthResponse> {
  return adminRequest<AuthResponse>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ mobile, password }) },
    null,
  );
}

export async function logout(token?: string | null): Promise<void> {
  try {
    await adminRequest("/api/auth/logout", { method: "POST" }, token ?? null);
  } catch {
    /* the local session is dropped even when the server call fails */
  }
}

export async function getMe(): Promise<AuthUser> {
  const data = await adminRequest<{ user: AuthUser }>("/api/auth/me");
  return data.user;
}

export async function updateProfile(input: {
  fullName?: string;
  email?: string;
  unit?: string;
  avatar?: string;
}): Promise<AuthUser> {
  const data = await adminRequest<{ user: AuthUser }>("/api/auth/profile", {
    method: "PATCH",
    body: JSON.stringify({
      ...(input.fullName !== undefined ? { full_name: input.fullName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
    }),
  });
  return data.user;
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirm: string;
}): Promise<AuthResponse> {
  return adminRequest<AuthResponse>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({
      current_password: input.currentPassword,
      new_password: input.newPassword,
      new_password_confirm: input.newPasswordConfirm,
    }),
  });
}

// --------------------------------------------------------------------- users
export async function listUsers(params: {
  query?: string;
  roleId?: string;
  status?: "active" | "inactive";
  limit?: number;
  offset?: number;
} = {}): Promise<{ users: AdminUser[]; count: number; total: number }> {
  const search = new URLSearchParams();
  if (params.query) search.set("q", params.query);
  if (params.roleId) search.set("role_id", params.roleId);
  if (params.status) search.set("status", params.status);
  search.set("limit", String(params.limit ?? 200));
  if (params.offset) search.set("offset", String(params.offset));
  return adminRequest(`/api/users?${search.toString()}`);
}

export async function createUser(input: EmployeeInput): Promise<AdminUser> {
  const data = await adminRequest<{ user: AdminUser }>("/api/users", {
    method: "POST",
    body: JSON.stringify({
      full_name: input.fullName,
      mobile: input.mobile,
      national_id: input.nationalId,
      password: input.password,
      role_id: input.roleId,
      email: input.email || null,
      unit: input.unit || null,
      is_active: input.isActive ?? true,
    }),
  });
  return data.user;
}

export async function updateUser(
  id: string,
  input: {
    fullName?: string;
    mobile?: string;
    nationalId?: string;
    roleId?: string;
    email?: string;
    unit?: string;
    isActive?: boolean;
  },
): Promise<AdminUser> {
  const data = await adminRequest<{ user: AdminUser }>(`/api/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(input.fullName !== undefined ? { full_name: input.fullName } : {}),
      ...(input.mobile !== undefined ? { mobile: input.mobile } : {}),
      ...(input.nationalId !== undefined ? { national_id: input.nationalId } : {}),
      ...(input.roleId !== undefined ? { role_id: input.roleId } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
    }),
  });
  return data.user;
}

export async function setUserActive(id: string, isActive: boolean): Promise<AdminUser> {
  const data = await adminRequest<{ user: AdminUser }>(
    `/api/users/${encodeURIComponent(id)}/status`,
    { method: "PATCH", body: JSON.stringify({ is_active: isActive }) },
  );
  return data.user;
}

export async function deleteUser(id: string): Promise<void> {
  await adminRequest(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// --------------------------------------------------------------------- roles
export async function listRoles(): Promise<{ roles: Role[]; count: number }> {
  return adminRequest("/api/roles");
}

export async function getRoleCatalog(): Promise<PermissionCatalog> {
  return adminRequest("/api/roles/catalog");
}

export async function createRole(input: {
  name: string;
  code: string;
  description?: string;
  permissions: PermissionMatrix;
}): Promise<Role> {
  const data = await adminRequest<{ role: Role }>("/api/roles", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.role;
}

export async function updateRole(
  id: string,
  input: { name?: string; description?: string },
): Promise<Role> {
  const data = await adminRequest<{ role: Role }>(`/api/roles/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return data.role;
}

export async function setRolePermissions(
  id: string,
  permissions: PermissionMatrix,
): Promise<Role> {
  const data = await adminRequest<{ role: Role }>(
    `/api/roles/${encodeURIComponent(id)}/permissions`,
    { method: "PUT", body: JSON.stringify({ permissions }) },
  );
  return data.role;
}

export async function deleteRole(id: string): Promise<void> {
  await adminRequest(`/api/roles/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// --------------------------------------------------------------- submissions
export type SubmissionStatus =
  | "submitted"
  | "in_review"
  | "need_info"
  | "approved"
  | "rejected"
  | "canceled";

export type SubmissionEvent = {
  status: string;
  status_label: string;
  note?: string | null;
  created_at?: string | null;
};

/** A field definition frozen in the submission snapshot (used to label answers). */
export type SubmissionFormField = {
  id?: string;
  slug?: string;
  label?: string;
  type?: string;
  required?: boolean;
  options?: unknown[];
  subFields?: SubmissionFormField[];
};

/** A user submission as returned by ``GET /api/admin/submissions``. */
export type AdminSubmission = {
  id: string;
  submission_id: string;
  tracking_code: string;
  trackingCode?: string;
  form_id: string;
  formId?: string;
  form_title?: string | null;
  form_guidance?: string | null;
  form_fields?: SubmissionFormField[];
  user_name?: string | null;
  user_id?: string | null;
  process_id?: string | null;
  process_title?: string | null;
  process_case_id?: string | null;
  current_stage_id?: string | null;
  current_stage_title?: string | null;
  step_index?: number | null;
  step_count?: number | null;
  status: SubmissionStatus | string;
  status_label: string;
  values?: Record<string, unknown>;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  events?: SubmissionEvent[];
};

export async function listAdminSubmissions(
  params: {
    status?: SubmissionStatus;
    formId?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ submissions: AdminSubmission[]; total: number }> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.formId) search.set("form_id", params.formId);
  search.set("limit", String(params.limit ?? 100));
  if (params.offset) search.set("offset", String(params.offset));
  return adminRequest(`/api/admin/submissions?${search.toString()}`);
}

export async function updateSubmissionStatus(
  id: string,
  status: SubmissionStatus,
  note?: string,
): Promise<AdminSubmission> {
  const data = await adminRequest<{ submission: AdminSubmission }>(
    `/api/admin/submissions/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status, ...(note ? { note } : {}) }),
    },
  );
  return data.submission;
}

export async function getAdminSubmission(id: string): Promise<AdminSubmission> {
  const data = await adminRequest<{ submission: AdminSubmission }>(
    `/api/admin/submissions/${encodeURIComponent(id)}`,
  );
  return data.submission;
}

/** Soft delete: the row, its values and its events stay for audit. */
export async function archiveAdminSubmission(id: string): Promise<void> {
  await adminRequest(`/api/admin/submissions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ------------------------------------------------------------- process cases
/** One stage of the published snapshot a case runs on. */
export type ProcessCaseStage = {
  id: string;
  index: number;
  title: string;
  guidance: string;
  responsibleUnit: string;
  slaDays: number;
  isApplicantStage: boolean;
  formIds: string[];
};

export type ProcessCaseStageState = {
  state?: "current" | "approved" | "rejected" | "returned" | string;
  enteredAt?: string | null;
  actedAt?: string | null;
  decision?: string | null;
  note?: string | null;
  assigneeId?: string | null;
};

export type ProcessCaseTimelineEntry = {
  id?: string;
  action?: string;
  actorId?: string | null;
  at?: string | null;
  description?: string;
};

/** ``GET /api/processes/cases/{id}`` — the running case behind a request. */
export type ProcessCase = {
  id: string;
  trackingCode: string;
  processId: string;
  processTitle: string;
  processVersion?: string;
  applicantId?: string | null;
  formId?: string | null;
  title?: string;
  status: "active" | "completed" | "expired" | string;
  substatus?: string;
  needsEscalation?: boolean;
  currentStageId?: string | null;
  currentStageTitle?: string;
  currentAssignee?: { kind?: string; employeeId?: string; accessLevelId?: string };
  stages?: ProcessCaseStage[];
  stageStates?: Record<string, ProcessCaseStageState>;
  values?: Record<string, unknown>;
  computed?: Record<string, unknown>;
  timeline?: ProcessCaseTimelineEntry[];
  dueAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export async function getProcessCase(caseId: string): Promise<ProcessCase> {
  const data = await adminRequest<{ case: ProcessCase }>(
    `/api/processes/cases/${encodeURIComponent(caseId)}`,
  );
  return data.case;
}

type CaseActionInput = { note?: string; values?: Record<string, unknown> };

export async function advanceProcessCase(
  caseId: string,
  input: CaseActionInput = {},
): Promise<ProcessCase> {
  const data = await adminRequest<{ case: ProcessCase }>(
    `/api/processes/cases/${encodeURIComponent(caseId)}/advance`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return data.case;
}

export async function rejectProcessCase(
  caseId: string,
  input: CaseActionInput & { final?: boolean } = {},
): Promise<ProcessCase> {
  const data = await adminRequest<{ case: ProcessCase }>(
    `/api/processes/cases/${encodeURIComponent(caseId)}/reject`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return data.case;
}

export async function escalateProcessCase(
  caseId: string,
  input: CaseActionInput = {},
): Promise<ProcessCase> {
  const data = await adminRequest<{ case: ProcessCase }>(
    `/api/processes/cases/${encodeURIComponent(caseId)}/escalate`,
    { method: "POST", body: JSON.stringify(input) },
  );
  return data.case;
}

// --------------------------------------------------------------- forms (builder)
export async function listAdminForms(query?: string): Promise<FormDefinition[]> {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  const data = await adminRequest<{ forms: FormDefinition[]; count: number }>(
    `/api/admin/forms${suffix}`,
  );
  return data.forms;
}

/** Create or update a builder form; the raw camelCase schema is stored as-is. */
export async function saveAdminForm(form: FormDefinition): Promise<FormDefinition> {
  const data = await adminRequest<{ form: FormDefinition }>("/api/admin/forms", {
    method: "POST",
    body: JSON.stringify(form),
  });
  return data.form;
}

export async function setAdminFormStatus(
  formId: string,
  status: ProcessStatus,
): Promise<FormDefinition> {
  const data = await adminRequest<{ form: FormDefinition }>(
    `/api/admin/forms/${encodeURIComponent(formId)}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
  return data.form;
}

/** Soft delete: the backend keeps the row and hides it from every list. */
export async function archiveAdminForm(formId: string): Promise<void> {
  await adminRequest(`/api/admin/forms/${encodeURIComponent(formId)}`, {
    method: "DELETE",
  });
}

// ----------------------------------------------------------- processes (builder)
export async function listProcessDefinitions(
  status?: ProcessStatus,
): Promise<ProcessDefinition[]> {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : "";
  const data = await adminRequest<{ processes: Partial<ProcessDefinition>[]; count: number }>(
    `/api/processes${suffix}`,
  );
  // Rows edited outside the builder (seed scripts, older snapshots) may miss
  // optional arrays; normalizing here keeps every screen crash-free.
  return data.processes.map((process) => normalizeProcess(process));
}

/** Upsert the draft definition (a new ``id`` creates the process). */
export async function saveProcessDefinition(
  process: ProcessDefinition,
): Promise<ProcessDefinition> {
  const data = await adminRequest<{ process: Partial<ProcessDefinition> }>(
    `/api/processes/${encodeURIComponent(process.id)}`,
    { method: "PUT", body: JSON.stringify(process) },
  );
  return normalizeProcess(data.process);
}

/** Validate + publish: the server bumps the version and snapshots the stages. */
export async function publishProcessDefinition(
  process: ProcessDefinition,
): Promise<{ process: ProcessDefinition; version: string }> {
  const data = await adminRequest<{ process: Partial<ProcessDefinition>; version: string }>(
    `/api/processes/${encodeURIComponent(process.id)}/publish`,
    { method: "POST", body: JSON.stringify(process) },
  );
  return { process: normalizeProcess(data.process), version: data.version };
}

/** Soft delete: the definition is archived and hidden, running cases keep working. */
export async function archiveProcessDefinition(processId: string): Promise<void> {
  await adminRequest(`/api/processes/${encodeURIComponent(processId)}`, {
    method: "DELETE",
  });
}

// ------------------------------------------------------------------- reports
/** One KPI card of a quick report (all values are computed by the backend). */
export type ReportKpi = {
  label: string;
  value: number | string;
  unit?: string;
  trend?: string;
  up?: boolean;
};

export type ReportSeriesItem = {
  key: string;
  label: string;
  color: string;
  values: number[];
};

export type ReportSeries = { labels: string[]; series: ReportSeriesItem[] };

export type ReportPieSlice = { name: string; value: number; color: string };

export type ReportTable = {
  columns: { key: string; label: string }[];
  rows: Record<string, string | number>[];
};

/** Compact tile shown on the reports landing page. */
export type ReportQuickTile = {
  stat: number;
  statLabel: string;
  series: number[];
};

export type ReportQuickTileId = "requests" | "employees" | "processes" | "messages";

/** ``GET /api/admin/reports/summary`` — everything the landing page needs. */
export type ReportSummary = {
  generated_at: string;
  kpis: {
    total_requests: number;
    open_requests: number;
    closed_requests: number;
    overdue_cases: number;
    active_cases: number;
    active_processes: number;
    active_employees: number;
    messages_today: number;
  };
  weekly: ReportSeries;
  /** Pie slices (named ``statusPie`` so they never shadow the ``status: ok`` envelope). */
  statusPie: ReportPieSlice[];
  messages: ReportSeries;
  quick: Record<ReportQuickTileId, ReportQuickTile>;
};

/** ``GET /api/admin/reports/quick/{id}`` — a ready-made report. */
export type ReportQuickReport = {
  id: string;
  title: string;
  generated_at: string;
  kpis: ReportKpi[];
  series: ReportSeries;
  pie: { data: ReportPieSlice[] };
  table: ReportTable;
  note?: string;
};

/** A groupable/aggregatable field exposed to the report builder. */
export type ReportEntityField = {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "boolean";
  unit?: string;
  unitCategory?: string;
  options?: string[];
};

export type ReportEntityData = {
  id: string;
  label: string;
  fields: ReportEntityField[];
  rows: Record<string, string | number | boolean | null>[];
};

/** One row of the unified audit feed. */
export type ReportEvent = {
  id: number;
  userId: string;
  userName: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "VIEW" | "LOGIN" | "RESTORE" | string;
  module: string;
  recordId: string;
  oldValues: string | null;
  newValues: string | null;
  ipAddress: string;
  userAgent: string;
  createdAt: string | null;
};

export async function getReportSummary(): Promise<ReportSummary> {
  return adminRequest<ReportSummary>("/api/admin/reports/summary");
}

export async function getQuickReport(reportId: string): Promise<ReportQuickReport> {
  const data = await adminRequest<{ report: ReportQuickReport }>(
    `/api/admin/reports/quick/${encodeURIComponent(reportId)}`,
  );
  return data.report;
}

export async function getReportEntities(): Promise<ReportEntityData[]> {
  const data = await adminRequest<{ entities: ReportEntityData[] }>("/api/admin/reports/entities");
  return data.entities;
}

export async function getReportEvents(limit = 200): Promise<ReportEvent[]> {
  const data = await adminRequest<{ events: ReportEvent[] }>(
    `/api/admin/reports/events?limit=${limit}`,
  );
  return data.events;
}

export async function listSavedReports(): Promise<ReportDefinition[]> {
  const data = await adminRequest<{ reports: ReportDefinition[] }>("/api/admin/reports");
  return data.reports;
}

export async function saveReportDefinition(
  report: ReportDefinition,
): Promise<ReportDefinition> {
  const data = await adminRequest<{ report: ReportDefinition }>("/api/admin/reports", {
    method: "POST",
    body: JSON.stringify(report),
  });
  return data.report;
}

/** Soft delete: the definition stays in the database for audit. */
export async function deleteReportDefinition(reportId: string): Promise<void> {
  await adminRequest(`/api/admin/reports/${encodeURIComponent(reportId)}`, {
    method: "DELETE",
  });
}
