const API_BASE =
  process.env.NEXT_PUBLIC_AGENT_API_URL ??
  process.env.NEXT_PUBLIC_AI_API_URL ??
  "http://127.0.0.1:8000";

const TOKEN_KEY = "mez-khedmat-token";
const USER_KEY = "mez-khedmat-user";
const EXPIRY_KEY = "mez-khedmat-token-expiry";

/** Fired whenever the stored session is written or cleared (same tab). */
export const SESSION_CHANGED_EVENT = "mez-khedmat-session-changed";

/** Admin panel origin: applicants never get this link. */
export const ADMIN_APP_URL =
  process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? "http://localhost:3000";

export type PermissionMatrix = Record<string, Record<string, boolean>>;

export type FormField = {
  name: string;
  label: string;
  type: string;
  placeholder?: string;
  required?: boolean;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  options?: string[];
  helpText?: string;
};

export type FormRequirement = { title: string; items: string[] };

export type AgentForm = {
  form_id: string;
  title: string;
  submit_label: string;
  description?: string;
  category?: string;
  fields: FormField[];
  footer_links?: { action: string; label: string }[];
  requirements?: FormRequirement[];
  prefill?: Record<string, string>;
};

export type AgentUser = {
  id: string;
  full_name: string;
  national_id: string;
  mobile: string;
  email: string;
  unit: string;
  /** Resized ``data:image/...;base64,`` picture; empty when the user has none. */
  avatar?: string;
  role: string;
  role_name: string;
  is_active: boolean;
  permissions: PermissionMatrix;
  last_login_at: string | null;
  created_at: string | null;
};

/** Roles allowed into the admin panel (mirrors ``ADMIN_ROLE_CODES`` on the server). */
export function isAdminRole(user: AgentUser | null): boolean {
  if (!user) return false;
  return (
    user.permissions?.admin_panel?.view === true ||
    user.role === "super_admin" ||
    user.role === "admin" ||
    user.role === "employee"
  );
}

export type Citation = {
  title: string;
  source: string;
  score?: number;
  snippet?: string;
};

/** One behind-the-scenes status chip returned with an assistant turn. */
export type AgentActivity = {
  key: string;
  label: string;
};

/** A leaf/grouping field exactly as the admin builder stored it. */
export type ProcessField = {
  id?: string;
  slug?: string;
  label?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  subFields?: ProcessField[];
  minRows?: number;
  maxRows?: number;
  allowedFileTypes?: string[];
  maxFileSizeMb?: number;
  minFiles?: number;
  maxFiles?: number;
  validation?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    preset?: string;
  };
  payment?: { gatewayId?: string; amountSource?: string; defaultAmount?: number };
};

export type ProcessForm = {
  form_id: string;
  code?: string | null;
  title: string;
  description?: string;
  guidance?: string;
  formType?: string;
  version?: string | number | null;
  fields: ProcessField[];
  rules?: string[];
  payment?: { gatewayId?: string; defaultAmount?: number } | null;
  prefill?: Record<string, unknown>;
  missing?: boolean;
};

export type ProcessStep = {
  id: string;
  index: number;
  title: string;
  guidance: string;
  responsibleUnit: string;
  slaDays: number;
  isApplicantStage: boolean;
  /** True when the wizard collects this step; later staff/reopened steps are read-only. */
  collectsInput: boolean;
  forms: ProcessForm[];
};

/** The structured payload the agent returns to open the client stepper. */
export type ProcessStepperPayload = {
  process_id: string;
  process_version_id?: string | null;
  version?: string;
  title: string;
  department?: string;
  description?: string;
  guidance?: string;
  steps: ProcessStep[];
  submittedToday?: boolean;
};

export type SubmitApplicationResult = {
  status: string;
  message: string;
  trackingCode?: string;
  process?: { id: string; title: string; version: string };
  case?: {
    id: string;
    trackingCode?: string;
    currentStageTitle?: string;
    status?: string;
    [key: string]: unknown;
  };
  submissions?: SubmissionSummary[];
};

export type ChatResponse = {
  status: "ok" | "auth_required" | "error";
  message: string;
  form?: AgentForm;
  /** Legacy consultation payload (stages + first form). */
  process?: { process_id: string; title: string; stages: unknown[] };
  /** Structured action: open the multi-step wizard for this process. */
  stepper?: ProcessStepperPayload;
  activity?: AgentActivity[];
  user?: AgentUser;
  token?: string;
  expires_at?: string;
  expires_in?: number;
  session_id?: string;
  citations?: Citation[];
  intent?: string;
  action?: {
    action: "OPEN_AND_FILL_FORM";
    form_id: string;
    fields: Record<string, string | number>;
  };
};

export type AgentAttachment = {
  id: string;
  name: string;
  mime: string;
  size: number;
};

export type ChatSessionSummary = {
  id: string;
  title: string;
  message_count: number;
  pending_form_id?: string | null;
  pending_process_id?: string | null;
  guidance_stage?: string | null;
  snippet?: string | null;
  updated_at?: string | null;
};

export type ChatHistoryMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  form_id?: string | null;
  process_id?: string | null;
  attachments?: AgentAttachment[] | null;
  activity?: AgentActivity[] | null;
  citations?: Citation[] | null;
  created_at?: string | null;
};

export type ChatSessionDetail = {
  session_id: string;
  title?: string | null;
  messages: ChatHistoryMessage[];
};

export type SubmissionStatusEvent = {
  status: string;
  status_label: string;
  note?: string | null;
  created_at?: string | null;
};

export type SubmissionSummary = {
  id: string;
  submission_id: string;
  tracking_code: string;
  form_id: string;
  form_title?: string | null;
  status: string;
  status_label: string;
  notes?: string | null;
  created_at?: string | null;
  values?: Record<string, unknown>;
  events?: SubmissionStatusEvent[];
};

function readExpiry(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(EXPIRY_KEY);
    if (!raw) return null;
    const value = new Date(raw).getTime();
    return Number.isNaN(value) ? null : value;
  } catch {
    return null;
  }
}

function notifySessionChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const expiry = readExpiry();
    if (expiry !== null && Date.now() >= expiry) {
      clearSession();
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function getStoredUser(): AgentUser | null {
  if (typeof window === "undefined") return null;
  if (!getToken()) return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AgentUser) : null;
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: AgentUser, expiresAt?: string | null) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    if (expiresAt) localStorage.setItem(EXPIRY_KEY, expiresAt);
    else localStorage.removeItem(EXPIRY_KEY);
  } catch {
    /* private mode: the in-memory state still works for this tab */
  }
  notifySessionChanged();
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(EXPIRY_KEY);
  } catch {
    /* ignore */
  }
  notifySessionChanged();
}

/** Refreshes the cached profile without touching the token or its expiry. */
export function updateStoredUser(user: AgentUser) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
  notifySessionChanged();
}

/** Shared fetch wrapper: injects the bearer token and surfaces the Persian error. */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A 401 means the 15-minute token is gone (or revoked): drop the session.
    if (res.status === 401 && token) clearSession();
    const error = data as { detail?: string; message?: string };
    throw new Error(error.detail || error.message || `خطای سرور (${res.status})`);
  }
  return data as T;
}

export async function postChat(
  message: string,
  intent?: "login" | "register",
  sessionId?: string,
  attachmentIds: string[] = [],
): Promise<ChatResponse> {
  return request<ChatResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      intent: intent ?? null,
      ...(sessionId ? { session_id: sessionId } : {}),
      ...(attachmentIds.length ? { attachment_ids: attachmentIds } : {}),
    }),
  });
}

export async function streamChat(
  message: string,
  intent: "login" | "register" | undefined,
  sessionId: string | undefined,
  onActivity: (activity: AgentActivity) => void,
  attachmentIds: string[] = [],
): Promise<ChatResponse> {
  const token = getToken();
  const response = await fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      message,
      intent: intent ?? null,
      ...(sessionId ? { session_id: sessionId } : {}),
      ...(attachmentIds.length ? { attachment_ids: attachmentIds } : {}),
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { detail?: string; message?: string };
    throw new Error(data.detail || data.message || `خطای سرور (${response.status})`);
  }
  if (!response.body) throw new Error("سرور جریان پاسخ را پشتیبانی نمی‌کند.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload: ChatResponse | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((item) => item.startsWith("data: "));
      if (!line) continue;
      const event = JSON.parse(line.slice(6)) as
        | { type: "activity"; key: string; label: string }
        | { type: "error"; message: string }
        | { type: "done"; payload: ChatResponse };
      if (event.type === "activity") onActivity({ key: event.key, label: event.label });
      if (event.type === "error") throw new Error(event.message);
      if (event.type === "done") finalPayload = event.payload;
    }
  }
  if (!finalPayload) throw new Error("پاسخ کامل ایجنت دریافت نشد.");
  return finalPayload;
}

/** Uploads one composer attachment; the returned id travels with the next chat turn. */
export async function postChatAttachment(file: File): Promise<AgentAttachment> {
  const token = getToken();
  if (!token) throw new Error("برای پیوست فایل ابتدا وارد حساب کاربری شوید.");

  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${API_BASE}/api/chat/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) clearSession();
    const error = data as { detail?: string; message?: string };
    throw new Error(error.detail || error.message || `خطای سرور (${res.status})`);
  }
  return (data as { attachment: AgentAttachment }).attachment;
}

export async function postLogin(mobile: string, password: string) {
  return request<ChatResponse & { token: string; user: AgentUser }>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ mobile, password }) },
  );
}

export async function postRegister(body: {
  full_name: string;
  national_id: string;
  mobile: string;
  password: string;
  password_confirm: string;
}) {
  return request<ChatResponse & { token: string; user: AgentUser }>(
    "/api/auth/register",
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function postLogout() {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } catch {
    /* the local session is dropped even if the server call fails */
  } finally {
    clearSession();
  }
}

export async function getMe() {
  return request<{ user: AgentUser }>("/api/auth/me");
}

export async function patchProfile(input: {
  full_name?: string;
  email?: string;
  unit?: string;
  avatar?: string;
}) {
  return request<{ status: string; message: string; user: AgentUser }>("/api/auth/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function postChangePassword(input: {
  current_password: string;
  new_password: string;
  new_password_confirm: string;
}) {
  return request<ChatResponse & { token: string; user: AgentUser }>(
    "/api/auth/change-password",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function postFormSubmit(
  formId: string,
  values: Record<string, string | boolean>,
  sessionId?: string | null,
) {
  return request<{ status: string; message: string; submission_id?: string }>(
    "/api/forms/submit",
    {
      method: "POST",
      body: JSON.stringify({
        form_id: formId,
        values,
        ...(sessionId ? { session_id: sessionId } : {}),
      }),
    },
  );
}

export async function getForms(query?: string) {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  return request<{ forms: AgentForm[]; count: number }>(`/api/forms${suffix}`);
}

export async function getForm(formId: string) {
  return request<{ form: AgentForm }>(`/api/forms/${encodeURIComponent(formId)}`);
}

export async function getChatSessions(limit = 50) {
  return request<{ sessions: ChatSessionSummary[]; total: number }>(
    `/api/chat/sessions?limit=${limit}`,
  );
}

export async function getChatSession(sessionId: string) {
  return request<ChatSessionDetail>(
    `/api/chat/sessions/${encodeURIComponent(sessionId)}`,
  );
}

export async function renameChatSession(sessionId: string, title: string) {
  return request<{ id: string; title: string }>(
    `/api/chat/sessions/${encodeURIComponent(sessionId)}`,
    { method: "PATCH", body: JSON.stringify({ title }) },
  );
}

export async function deleteChatSession(sessionId: string) {
  return request(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
}

export async function getSubmissions(limit = 50) {
  return request<{ submissions: SubmissionSummary[]; count: number; total: number }>(
    `/api/submissions?limit=${limit}`,
  );
}

export async function trackSubmission(trackingCode: string) {
  return request<{ submission: SubmissionSummary }>(
    `/api/submissions/track/${encodeURIComponent(trackingCode)}`,
  );
}

// ------------------------------------------------------- process execution (stepper)
export async function getApplicantProcesses() {
  return request<{ processes: Record<string, unknown>[]; count: number }>(
    "/api/processes/applicant/processes",
  );
}

/** Full stepper payload (steps, guidance and the forms of every step). */
export async function getApplicantProcess(processId: string) {
  return request<{ process: ProcessStepperPayload }>(
    `/api/processes/applicant/processes/${encodeURIComponent(processId)}`,
  );
}

/** Submit every applicant-stage form of a process at once. */
export async function postApplicantSubmit(
  processId: string,
  values: Record<string, Record<string, unknown>>,
  sessionId?: string | null,
) {
  return request<SubmitApplicationResult>("/api/processes/applicant/submit", {
    method: "POST",
    body: JSON.stringify({
      processId,
      values,
      ...(sessionId ? { sessionId } : {}),
    }),
  });
}
