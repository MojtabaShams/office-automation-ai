"use client";

import React, { useState } from "react";
import { Plus, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import Modal from "./Modal";
import { useTheme } from "../theme-context";
import { AccessLevel, CONTROL_MODULES, Permission } from "../app/lib/mock-employees";

const emptyPermissions = (): Record<string, Permission> =>
  Object.fromEntries(
    CONTROL_MODULES.map((m) => [m.id, { view: false, add: false, edit: false, delete: false }])
  );

const actionLabels: { key: keyof Permission; label: string }[] = [
  { key: "view", label: "نمایش" },
  { key: "add", label: "افزودن" },
  { key: "edit", label: "ویرایش" },
  { key: "delete", label: "حذف" },
];

export default function PermissionsModal({
  open,
  onClose,
  accessLevels,
  onAdd,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  accessLevels: AccessLevel[];
  onAdd: (level: AccessLevel) => void;
  onDelete: (id: string) => void;
}) {
  const { isDarkMode } = useTheme();
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<Record<string, Permission>>(emptyPermissions());

  const t = isDarkMode
    ? {
        text: "text-white",
        sub: "text-white/50",
        input: "border-white/10 bg-white/[0.06] text-white placeholder:text-white/40",
        row: "border-white/10",
        surface: "border-white/[0.08] bg-white/[0.035]",
        tableHead: "bg-white/[0.045] text-white/60",
        tableRow: "border-white/[0.07] hover:bg-white/[0.035]",
        chip: "border-white/10 bg-white/[0.05] text-white/70 hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-300",
        icon: "bg-[#15554f]/20 text-[#8bd0bf]",
        count: "bg-white/[0.07] text-white/70",
      }
    : {
        text: "text-[#28443d]",
        sub: "text-[#68766c]",
        input: "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]",
        row: "border-[#d5dad4]",
        surface: "border-[#d5dad4] bg-[#f6f7f4]",
        tableHead: "bg-[#edf0eb] text-[#68766c]",
        tableRow: "border-[#e6e9e3] hover:bg-[#f6f7f4]",
        chip: "border-[#e3dada] bg-white text-[#8a5960] hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700",
        icon: "bg-[#15554f]/10 text-[#15554f]",
        count: "bg-[#edf0eb] text-[#40584e]",
      };

  const toggle = (moduleId: string, key: keyof Permission) => {
    setPermissions((prev) => {
      const current: Permission = prev[moduleId] ?? {
        view: false,
        add: false,
        edit: false,
        delete: false,
      };
      return {
        ...prev,
        [moduleId]: { ...current, [key]: !current[key] },
      };
    });
  };

  const permissionCount = Object.values(permissions).reduce(
    (sum, permission) => sum + Object.values(permission).filter(Boolean).length,
    0
  );

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onAdd({ id: `lvl-${Date.now()}`, name: trimmedName, permissions });
    setName("");
    setPermissions(emptyPermissions());
  };

  return (
    <Modal open={open} onClose={onClose} title="سطح‌های دسترسی" maxWidthClass="max-w-2xl">
      <div className="space-y-5">
        <section className={`overflow-hidden rounded-2xl border ${t.row}`}>
          <div className={`flex items-start gap-3 border-b p-4 ${t.row} ${t.surface}`}>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.icon}`}>
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className={`text-sm font-bold ${t.text}`}>ایجاد سطح دسترسی جدید</h3>
              <p className={`mt-1 text-xs leading-5 ${t.sub}`}>
                نام نقش را انتخاب کنید و دسترسی هر بخش را مشخص کنید.
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] ${t.count}`}>
              {permissionCount} دسترسی
            </span>
          </div>

          <div className="space-y-4 p-4">
            <div>
              <label htmlFor="access-level-name" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                نام سطح دسترسی
              </label>
              <input
                id="access-level-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثلاً: مدیر منابع انسانی"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:border-[#15554f] focus:ring-2 focus:ring-[#15554f]/15 ${t.input}`}
              />
            </div>

            <div className={`overflow-x-auto rounded-xl border ${t.row}`}>
              <table className="w-full min-w-[440px] text-xs">
                <thead>
                  <tr className={`border-b ${t.row} ${t.tableHead}`}>
                    <th className="p-3 text-right font-semibold">بخش سیستم</th>
                    {actionLabels.map((action) => (
                      <th key={action.key} className="p-3 text-center font-semibold">
                        {action.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CONTROL_MODULES.map((module) => (
                    <tr key={module.id} className={`border-b last:border-0 ${t.tableRow}`}>
                      <td className={`whitespace-nowrap p-3 text-right font-medium ${t.text}`}>
                        {module.label}
                      </td>
                      {actionLabels.map((action) => (
                        <td key={action.key} className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={permissions[module.id]?.[action.key] ?? false}
                            onChange={() => toggle(module.id, action.key)}
                            aria-label={`${module.label} - ${action.label}`}
                            className="h-4 w-4 cursor-pointer rounded accent-[#15554f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15554f]"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!name.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-[#15554f] to-[#246b61] px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-[#15554f]/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Plus className="h-4 w-4" />
                افزودن سطح دسترسی
              </button>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UsersRound className={`h-4 w-4 ${t.sub}`} />
              <h3 className={`text-sm font-bold ${t.text}`}>سطح‌های دسترسی موجود</h3>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[0.65rem] ${t.count}`}>
              {accessLevels.length} سطح
            </span>
          </div>
          <div className={`overflow-hidden rounded-2xl border ${t.row}`}>
            <table className="w-full text-xs">
              <thead>
                <tr className={`border-b ${t.row} ${t.tableHead}`}>
                  <th className="p-3 text-right font-semibold">نام سطح</th>
                  <th className="p-3 text-center font-semibold">دسترسی‌های فعال</th>
                  <th className="p-3 text-center font-semibold">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {accessLevels.map((level) => {
                  const activeCount = Object.values(level.permissions).reduce(
                    (sum, permission) => sum + Object.values(permission).filter(Boolean).length,
                    0
                  );
                  return (
                    <tr key={level.id} className={`border-b last:border-0 ${t.tableRow}`}>
                      <td className={`p-3 text-right font-medium ${t.text}`}>{level.name}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex min-w-10 justify-center rounded-full px-2.5 py-1 font-semibold ${t.count}`}>
                          {activeCount}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          aria-label={`حذف سطح دسترسی ${level.name}`}
                          onClick={() => onDelete(level.id)}
                          className={`inline-flex rounded-lg border p-2 transition-colors ${t.chip}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {accessLevels.length === 0 && (
                  <tr>
                    <td colSpan={3} className={`p-6 text-center ${t.sub}`}>
                      هنوز سطح دسترسی‌ای تعریف نشده است.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Modal>
  );
}