/**
 * Client for the form reference-document endpoints (H5).
 *
 * Documents are stored server-side (``form_documents``) because text extraction needs a
 * real PDF/DOCX parser. The admin session token is attached exactly like
 * ``adminRequest`` does, with two differences:
 *
 * * uploads must **not** send ``Content-Type: application/json`` (the browser has to add
 *   the multipart boundary itself);
 * * downloads return a Blob so a Persian file name survives and the bearer token is not
 *   leaked into a URL.
 */

import {
  ApiError,
  SESSION_EXPIRED_EVENT,
  clearStoredSession,
  readStoredSession,
} from "./admin-api";
import type { DocumentExtractionStatus, ReferenceDocument } from "./mock-forms";

const API_BASE =
  process.env.NEXT_PUBLIC_ADMIN_API_URL ??
  process.env.NEXT_PUBLIC_AGENT_API_URL ??
  "http://127.0.0.1:8000";

const EXTRACTION_STATUSES: DocumentExtractionStatus[] = [
  "pending",
  "processing",
  "done",
  "failed",
  "unsupported",
];

function normaliseStatus(value: unknown): DocumentExtractionStatus {
  return EXTRACTION_STATUSES.find((status) => status === value) ?? "pending";
}

type ServerDocument = {
  id?: string;
  formId?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  storageKey?: string;
  uploadedAt?: string;
  uploadedBy?: string | null;
  extractionStatus?: string;
  pageCount?: number | null;
  errorMessage?: string | null;
  hasText?: boolean;
};

function toReferenceDocument(raw: ServerDocument, formId: string): ReferenceDocument {
  return {
    id: raw.id ?? `doc-${Math.random().toString(36).slice(2)}`,
    formId: raw.formId ?? formId,
    fileName: raw.fileName ?? "سند",
    mimeType: raw.mimeType ?? "application/octet-stream",
    size: typeof raw.size === "number" ? raw.size : 0,
    storageKey: raw.storageKey ?? "",
    uploadedAt: raw.uploadedAt ?? new Date().toISOString(),
    ...(raw.uploadedBy ? { uploadedBy: raw.uploadedBy } : {}),
    extractionStatus: normaliseStatus(raw.extractionStatus),
    ...(typeof raw.pageCount === "number" ? { pageCount: raw.pageCount } : {}),
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = readStoredSession()?.token ?? null;
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  if (!(init.body instanceof FormData) && init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    if (response.status === 401 && token) {
      clearStoredSession();
      if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    const payload = (await response.json().catch(() => ({}))) as {
      detail?: string;
      message?: string;
      code?: string;
    };
    throw new ApiError(
      payload.detail || payload.message || `خطای سرور (${response.status})`,
      response.status,
      payload.code,
    );
  }
  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
}

function documentsPath(formId: string): string {
  return `/api/forms/${encodeURIComponent(formId)}/documents`;
}

export async function listFormDocuments(formId: string): Promise<ReferenceDocument[]> {
  const data = await request<{ documents?: ServerDocument[] }>(documentsPath(formId));
  return (data.documents ?? []).map((item) => toReferenceDocument(item, formId));
}

export async function uploadFormDocument(
  formId: string,
  file: File,
): Promise<ReferenceDocument> {
  const body = new FormData();
  body.append("file", file, file.name);
  const data = await request<{ document?: ServerDocument }>(documentsPath(formId), {
    method: "POST",
    body,
  });
  if (!data.document) throw new ApiError("پاسخ سرور برای بارگذاری سند معتبر نیست.", 502);
  return toReferenceDocument(data.document, formId);
}

export async function deleteFormDocument(formId: string, documentId: string): Promise<void> {
  await request(`${documentsPath(formId)}/${encodeURIComponent(documentId)}`, {
    method: "DELETE",
  });
}

export async function downloadFormDocument(
  formId: string,
  documentId: string,
): Promise<Blob> {
  const token = readStoredSession()?.token ?? null;
  const response = await fetch(
    `${API_BASE}${documentsPath(formId)}/${encodeURIComponent(documentId)}/download`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!response.ok) {
    throw new ApiError("دریافت فایل سند ناموفق بود.", response.status);
  }
  return response.blob();
}

export type SuggestedRule = { text: string; pageOrClause: string };

export async function suggestRulesFromDocument(
  formId: string,
  documentId: string,
): Promise<SuggestedRule[]> {
  const data = await request<{ rules?: { text?: string; pageOrClause?: string }[] }>(
    `${documentsPath(formId)}/${encodeURIComponent(documentId)}/suggest-rules`,
    { method: "POST" },
  );
  return (data.rules ?? [])
    .map((item) => ({
      text: (item.text ?? "").trim(),
      pageOrClause: (item.pageOrClause ?? "").trim(),
    }))
    .filter((item) => item.text.length > 0);
}
