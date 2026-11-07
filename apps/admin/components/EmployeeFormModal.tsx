"use client";

import React, { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  Check,
  CircleUserRound,
  KeyRound,
  Loader2,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import Modal from "./Modal";
import ThemedSelect from "./ThemedSelect";
import { useTheme } from "../theme-context";
import type { Employee, EmployeeFormValues } from "../app/lib/employee-view";
import type { Role } from "../app/lib/admin-api";

type FormState = EmployeeFormValues;

const emptyForm: FormState = {
  fullName: "",
  email: "",
  phone: "",
  nationalId: "",
  unit: "",
  roleId: "",
  password: "",
  passwordConfirm: "",
  isActive: true,
};

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function normalizeDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
}

export default function EmployeeFormModal({
  open,
  onClose,
  onSubmit,
  roles,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: EmployeeFormValues) => Promise<void>;
  roles: Role[];
  initial?: Employee | null;
}) {
  const { isDarkMode } = useTheme();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    if (initial) {
      setForm({
        fullName: initial.fullName,
        email: initial.email,
        phone: initial.phone,
        nationalId: initial.nationalId,
        unit: initial.unit,
        roleId: initial.roleId,
        password: "",
        passwordConfirm: "",
        isActive: initial.status === "active",
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
    setForm((current) => ({ ...current, [key]: value }));

  const inputClass = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:border-[#15554f] focus:ring-2 focus:ring-[#15554f]/15 ${t.input}`;

  const handleSubmit = async () => {
    setError("");
    const fullName = form.fullName.trim();
    const mobile = normalizeDigits(form.phone.trim());
    const nationalId = normalizeDigits(form.nationalId.trim());
    const email = form.email.trim();

    if (fullName.length < 3) {
      setError("نام و نام خانوادگی را کامل وارد کنید.");
      return;
    }
    if (!/^09\d{9}$/.test(mobile)) {
      setError("شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.");
      return;
    }
    if (!/^\d{10}$/.test(nationalId)) {
      setError("کد ملی باید ۱۰ رقم باشد.");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("ایمیل وارد شده معتبر نیست.");
      return;
    }
    if (!form.roleId) {
      setError("نقش سازمانی کاربر را انتخاب کنید.");
      return;
    }
    if (!initial) {
      if (form.password.length < 8) {
        setError("رمز عبور باید حداقل ۸ نویسه باشد.");
        return;
      }
      if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
        setError("رمز عبور باید شامل حرف و رقم باشد.");
        return;
      }
      if (form.password !== form.passwordConfirm) {
        setError("رمز عبور و تکرار آن یکسان نیست.");
        return;
      }
    }

    setSaving(true);
    try {
      await onSubmit({
        fullName,
        email,
        phone: mobile,
        nationalId,
        unit: form.unit.trim(),
        roleId: form.roleId,
        password: form.password,
        passwordConfirm: form.passwordConfirm,
        isActive: form.isActive,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "ذخیره اطلاعات کارمند ناموفق بود.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "ویرایش کارمند" : "ثبت کارمند جدید"}
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-5" dir="rtl">
        <div className={`flex items-start gap-3 rounded-2xl border p-4 ${t.surface}`}>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.icon}`}>
            {initial ? <CircleUserRound className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
          </span>
          <div>
            <h3 className={`text-sm font-bold ${t.text}`}>
              {initial ? "اطلاعات کارمند را ویرایش کنید" : "اطلاعات کارمند جدید را وارد کنید"}
            </h3>
            <p className={`mt-1 text-xs leading-5 ${t.sub}`}>
              مشخصات فردی، واحد سازمانی و نقش دسترسی را در این فرم تکمیل کنید.
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
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="employee-national-id" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                کد ملی
              </label>
              <input
                id="employee-national-id"
                value={form.nationalId}
                onChange={(e) => set("nationalId", e.target.value)}
                placeholder="۱۰ رقم"
                dir="ltr"
                inputMode="numeric"
                className={inputClass}
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
                type="email"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="employee-phone" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                شماره موبایل
              </label>
              <input
                id="employee-phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="09121234567"
                dir="ltr"
                inputMode="tel"
                className={inputClass}
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
              <label htmlFor="employee-unit" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                واحد سازمانی
              </label>
              <input
                id="employee-unit"
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                placeholder="مثلاً معاونت اداری"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="employee-role" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                نقش دسترسی
              </label>
              <div className="relative">
                <ShieldCheck className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 ${t.sub}`} />
                <ThemedSelect
                  id="employee-role"
                  value={form.roleId}
                  onChange={(e) => set("roleId", e.target.value)}
                  className={`w-full rounded-xl border py-2.5 pl-9 pr-9 text-sm outline-none transition focus:border-[#15554f] focus:ring-2 focus:ring-[#15554f]/15 ${t.select}`}
                  arrowClassName={`left-3 ${t.sub}`}
                >
                  <option value="" style={{ backgroundColor: "#fff", color: "#111827" }}>
                    انتخاب نقش
                  </option>
                  {roles.map((role) => (
                    <option
                      key={role.id}
                      value={role.id}
                      style={{ backgroundColor: "#fff", color: "#111827" }}
                    >
                      {role.name}
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
                    form.isActive ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
                <ThemedSelect
                  id="employee-status"
                  value={form.isActive ? "active" : "inactive"}
                  onChange={(e) => set("isActive", e.target.value === "active")}
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
          </div>
        </section>

        {!initial && (
          <section className={`overflow-hidden rounded-2xl border ${t.surface}`}>
            <div className={`flex items-center gap-2 border-b px-4 py-3 ${t.sub}`}>
              <KeyRound className="h-4 w-4" />
              <h4 className="text-xs font-semibold">رمز عبور ورود</h4>
            </div>
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
              <div>
                <label htmlFor="employee-password" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                  رمز عبور
                </label>
                <input
                  id="employee-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  autoComplete="new-password"
                  dir="ltr"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="employee-password-confirm" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                  تکرار رمز عبور
                </label>
                <input
                  id="employee-password-confirm"
                  type="password"
                  value={form.passwordConfirm}
                  onChange={(e) => set("passwordConfirm", e.target.value)}
                  autoComplete="new-password"
                  dir="ltr"
                  className={inputClass}
                />
              </div>
              <p className={`text-[0.65rem] leading-5 sm:col-span-2 ${t.sub}`}>
                رمز عبور باید حداقل ۸ نویسه و شامل حرف و رقم باشد. رمز به‌صورت هش‌شده ذخیره
                می‌شود و در پاسخ‌های API بازگردانده نمی‌شود.
              </p>
            </div>
          </section>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-600">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-current/10 pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={`rounded-xl border px-4 py-2.5 text-xs font-medium transition-colors disabled:opacity-60 ${t.surface} ${t.text}`}
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-[#15554f] to-[#246b61] px-5 py-2.5 text-xs font-semibold text-white shadow-sm shadow-[#15554f]/20 transition hover:brightness-110 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {initial ? "ثبت تغییرات" : "ثبت کارمند"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
