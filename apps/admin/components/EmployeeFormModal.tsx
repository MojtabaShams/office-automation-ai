"use client";

import React, { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CircleUserRound,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import Modal from "./Modal";
import JalaliDatePicker from "./JalaliDatePicker";
import ThemedSelect from "./ThemedSelect";
import { useTheme } from "../theme-context";
import { Employee, AccessLevel } from "../app/lib/mock-employees";

type FormState = {
  fullName: string;
  email: string;
  phone: string;
  role: string;
  accessLevelId: string;
  status: "active" | "inactive";
  hireDate: Date;
};

const emptyForm: FormState = {
  fullName: "",
  email: "",
  phone: "",
  role: "",
  accessLevelId: "",
  status: "active",
  hireDate: new Date(),
};

export default function EmployeeFormModal({
  open,
  onClose,
  onSubmit,
  accessLevels,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Employee, "id"> & { id?: string }) => void;
  accessLevels: AccessLevel[];
  initial?: Employee | null;
}) {
  const { isDarkMode } = useTheme();
  const [form, setForm] = useState<FormState>(emptyForm);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        fullName: initial.fullName,
        email: initial.email,
        phone: initial.phone,
        role: initial.role,
        accessLevelId: initial.accessLevelId,
        status: initial.status,
        hireDate: initial.hireDate,
      });
    } else {
      setForm(emptyForm);
    }
  }, [initial, open]);

  const t = isDarkMode
    ? {
        text: "text-white",
        sub: "text-white/50",
        surface: "border-white/[0.08] bg-white/[0.035]",
        icon: "bg-[#15554f]/20 text-[#8bd0bf]",
        input: "border-white/10 bg-white/[0.06] text-white placeholder:text-white/40",
        select: "border-white/10 bg-white/[0.06] text-white",
      }
    : {
        text: "text-[#28443d]",
        sub: "text-[#68766c]",
        surface: "border-[#d5dad4] bg-[#f6f7f4]",
        icon: "bg-[#15554f]/10 text-[#15554f]",
        input: "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]",
        select: "border-[#d5dad4] bg-white text-[#28443d]",
      };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = () => {
    if (!form.fullName.trim() || !form.email.trim()) return;
    onSubmit({ ...form, id: initial?.id });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "ویرایش کارمند" : "ثبت کارمند جدید"}
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-5">
        <div className={`flex items-start gap-3 rounded-2xl border p-4 ${t.surface}`}>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.icon}`}>
            {initial ? <CircleUserRound className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
          </span>
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>
              {initial ? "اطلاعات کارمند را ویرایش کنید" : "اطلاعات کارمند جدید را وارد کنید"}
            </h3>
            <p className={`mt-1 text-xs leading-5 ${t.sub}`}>
              مشخصات فردی، نقش سازمانی و سطح دسترسی را در این فرم تکمیل کنید.
            </p>
          </div>
        </div>

        <section className={`overflow-hidden rounded-2xl border ${t.surface}`}>
          <div className={`flex items-center gap-2 border-b px-4 py-3 ${t.sub}`}>
            <CircleUserRound className="h-4 w-4" />
            <h4 className="text-xs font-semibold">اطلاعات فردی و تماس</h4>
          </div>
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            <div>
              <label htmlFor="employee-full-name" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                نام و نام خانوادگی
              </label>
              <input
                id="employee-full-name"
                value={form.fullName}
                onChange={(e) => set("fullName", e.target.value)}
                placeholder="نام کامل کارمند"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:border-[#15554f] focus:ring-2 focus:ring-[#15554f]/15 ${t.input}`}
              />
            </div>
            <div>
              <label htmlFor="employee-email" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                ایمیل
              </label>
              <input
                id="employee-email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="name@example.com"
                dir="ltr"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:border-[#15554f] focus:ring-2 focus:ring-[#15554f]/15 ${t.input}`}
              />
            </div>
            <div>
              <label htmlFor="employee-phone" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                شماره تماس
              </label>
              <input
                id="employee-phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="0912..."
                dir="ltr"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:border-[#15554f] focus:ring-2 focus:ring-[#15554f]/15 ${t.input}`}
              />
            </div>
            <div>
              <label htmlFor="employee-role" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                نقش شغلی
              </label>
              <input
                id="employee-role"
                value={form.role}
                onChange={(e) => set("role", e.target.value)}
                placeholder="مثلاً: کارشناس اداری"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:border-[#15554f] focus:ring-2 focus:ring-[#15554f]/15 ${t.input}`}
              />
            </div>
          </div>
        </section>

        <section className={`overflow-hidden rounded-2xl border ${t.surface}`}>
          <div className={`flex items-center gap-2 border-b px-4 py-3 ${t.sub}`}>
            <BriefcaseBusiness className="h-4 w-4" />
            <h4 className="text-xs font-semibold">اطلاعات سازمانی</h4>
          </div>
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
            <div>
              <label htmlFor="employee-access-level" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                سطح دسترسی
              </label>
              <div className="relative">
                <ShieldCheck className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 ${t.sub}`} />
                <ThemedSelect
                  id="employee-access-level"
                  value={form.accessLevelId}
                  onChange={(e) => set("accessLevelId", e.target.value)}
                  className={`w-full rounded-xl border py-2.5 pl-9 pr-9 text-sm outline-none transition focus:border-[#15554f] focus:ring-2 focus:ring-[#15554f]/15 ${t.select}`}
                  arrowClassName={`left-3 ${t.sub}`}
                >
                  <option value="" style={{ backgroundColor: "#fff", color: "#111827" }}>
                    انتخاب سطح دسترسی
                  </option>
                  {accessLevels.map((level) => (
                    <option
                      key={level.id}
                      value={level.id}
                      style={{ backgroundColor: "#fff", color: "#111827" }}
                    >
                      {level.name}
                    </option>
                  ))}
                </ThemedSelect>
              </div>
            </div>
            <div>
              <label htmlFor="employee-status" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                وضعیت کارمند
              </label>
              <div className="relative">
                <span
                  className={`pointer-events-none absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${
                    form.status === "active" ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
                <ThemedSelect
                  id="employee-status"
                  value={form.status}
                  onChange={(e) => set("status", e.target.value as "active" | "inactive")}
                  className={`w-full rounded-xl border py-2.5 pl-9 pr-9 text-sm outline-none transition focus:border-[#15554f] focus:ring-2 focus:ring-[#15554f]/15 ${t.select}`}
                  arrowClassName={`left-3 ${t.sub}`}
                >
                  <option value="active" style={{ backgroundColor: "#fff", color: "#111827" }}>
                    فعال
                  </option>
                  <option value="inactive" style={{ backgroundColor: "#fff", color: "#111827" }}>
                    غیرفعال
                  </option>
                </ThemedSelect>
              </div>
            </div>
            <div>
              <label className={`mb-1.5 flex items-center gap-1.5 text-xs font-medium ${t.sub}`}>
                <CalendarDays className="h-3.5 w-3.5" />
                تاریخ استخدام
              </label>
              <JalaliDatePicker
                value={form.hireDate}
                onChange={(date) => set("hireDate", date)}
              />
            </div>
          </div>
        </section>

        <div className="flex flex-col-reverse gap-2 border-t border-current/10 pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className={`rounded-xl border px-4 py-2.5 text-xs font-medium transition-colors ${t.surface} ${t.text}`}
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-[#15554f] to-[#246b61] px-5 py-2.5 text-xs font-semibold text-white shadow-sm shadow-[#15554f]/20 transition hover:brightness-110"
          >
            <Check className="h-4 w-4" />
            {initial ? "ثبت تغییرات" : "ثبت کارمند"}
          </button>
        </div>
      </div>
    </Modal>
  );
}