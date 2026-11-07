/**
 * View model for the API-backed employees table.
 *
 * The backend returns camelCase payloads (``AdminUser``); the table and the
 * form work with real ``Date`` objects so sorting/filtering keep working.
 */

import type { AdminUser } from "./admin-api";

export type Employee = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  nationalId: string;
  unit: string;
  role: string;
  roleCode: string;
  roleId: string;
  status: "active" | "inactive";
  /** Registration date on the server (``created_at``). */
  hireDate: Date;
  lastLoginAt: Date | null;
};

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toEmployee(user: AdminUser): Employee {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    nationalId: user.nationalId,
    unit: user.unit,
    role: user.role,
    roleCode: user.roleCode,
    roleId: user.accessLevelId,
    status: user.status,
    hireDate: toDate(user.hireDate) ?? new Date(0),
    lastLoginAt: toDate(user.lastLoginAt),
  };
}

export type EmployeeFormValues = {
  fullName: string;
  email: string;
  phone: string;
  nationalId: string;
  unit: string;
  roleId: string;
  password: string;
  passwordConfirm: string;
  isActive: boolean;
};
