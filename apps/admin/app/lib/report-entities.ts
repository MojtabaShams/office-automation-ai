import { initialEmployees } from "./mock-employees";
import {
  initialRequests,
  type AdminRequest,
  REQUEST_STORAGE_KEY,
} from "./mock-requests";

export type ReportField = {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "boolean";
  unit?: string;
  unitCategory?: string;
  options?: string[];
};

export type ReportEntity = {
  id: string;
  label: string;
  getRows: () => Record<string, unknown>[];
  fields: ReportField[];
};

function loadRequests(): AdminRequest[] {
  if (typeof window === "undefined") return initialRequests;
  try {
    const raw = window.localStorage.getItem(REQUEST_STORAGE_KEY);
    if (!raw) return initialRequests;
    return JSON.parse(raw) as AdminRequest[];
  } catch {
    return initialRequests;
  }
}

const groupLabel: Record<string, string> = {
  active: "در حال رسیدگی",
  completed: "تکمیل‌شده",
  expired: "بسته‌شده",
};

export const reportEntities: ReportEntity[] = [
  {
    id: "employees",
    label: "کارمندان",
    fields: [
      { id: "fullName", label: "نام و نام خانوادگی", type: "text" },
      { id: "role", label: "نقش شغلی", type: "text" },
      { id: "status", label: "وضعیت", type: "select", options: ["active", "inactive"] },
      { id: "hireDate", label: "تاریخ استخدام", type: "date" },
      { id: "accessLevelId", label: "سطح دسترسی", type: "text" },
      { id: "email", label: "ایمیل", type: "text" },
      { id: "phone", label: "شماره تماس", type: "text" },
    ],
    getRows: () =>
      initialEmployees.map((e) => ({
        id: e.id,
        fullName: e.fullName,
        role: e.role,
        status: e.status,
        hireDate: e.hireDate,
        accessLevelId: e.accessLevelId,
        email: e.email,
        phone: e.phone,
      })),
  },
  {
    id: "requests",
    label: "درخواست‌ها / پرونده‌ها",
    fields: [
      { id: "processName", label: "نوع پروسه", type: "text" },
      {
        id: "group",
        label: "وضعیت کلی",
        type: "select",
        options: ["active", "completed", "expired"],
      },
      { id: "subStatus", label: "زیروضعیت", type: "text" },
      { id: "createdAt", label: "تاریخ ثبت", type: "date" },
      { id: "updatedAt", label: "آخرین تغییر", type: "date" },
      { id: "assigneeName", label: "مسئول فعلی", type: "text" },
      { id: "escalated", label: "اسکالیشن", type: "boolean" },
      { id: "title", label: "عنوان", type: "text" },
      { id: "applicantName", label: "متقاضی", type: "text" },
    ],
    getRows: () => {
      const list = loadRequests();
      return list.map((r) => {
        const current = r.stages?.[r.currentStageIndex];
        return {
          id: r.id,
          processName: r.processName,
          group: r.group,
          groupLabel: groupLabel[r.group] ?? r.group,
          subStatus: r.subStatus,
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
          assigneeName: current?.assigneeId ?? "—",
          escalated: r.subStatus === "escalation",
          title: r.title,
          applicantName: r.applicantName,
        };
      });
    },
  },
];

export function getReportEntity(id: string): ReportEntity | undefined {
  return reportEntities.find((e) => e.id === id);
}