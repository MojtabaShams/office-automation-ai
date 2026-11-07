"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Check,
  CircleUserRound,
  Clock3,
  Fingerprint,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MessageSquareText,
  Phone,
  Save,
  ShieldCheck,
  ShieldX,
  Camera,
  Trash2,
} from "lucide-react";
import { useTheme } from "../theme-context";
import {
  ADMIN_APP_URL,
  type AgentUser,
  getMe,
  getToken,
  isAdminRole,
  patchProfile,
  postChangePassword,
  postLogout,
  saveSession,
  updateStoredUser,
} from "../lib/agent-api";
import { formatJalali } from "../lib/jalali";

function formatDateTime(value: string | null, mounted: boolean) {
  if (!value || !mounted) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const time = date.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
  return `${formatJalali(date)} - ${time}`;
}

/**
 * Crops the picked picture to a centered square and downscales it to 256px so the
 * ``data:image/jpeg`` payload stays far below the API limit.
 */
function toAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("خواندن تصویر ناموفق بود."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () =>
        reject(new Error("فایل انتخاب‌شده تصویر معتبری نیست."));
      image.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("پردازش تصویر در این مرورگر ممکن نیست."));
          return;
        }
        const side = Math.min(image.width, image.height);
        const sx = (image.width - side) / 2;
        const sy = (image.height - side) / 2;
        context.drawImage(image, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function ClientProfilePage() {
  const { isDarkMode } = useTheme();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<AgentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  const [avatar, setAvatar] = useState("");
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    setMounted(true);
    let cancelled = false;

    const load = async () => {
      if (!getToken()) {
        setNeedsAuth(true);
        setLoading(false);
        return;
      }
      try {
        const data = await getMe();
        if (cancelled) return;
        setUser(data.user);
        updateStoredUser(data.user);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "بارگذاری پروفایل ناموفق بود.");
        if (!getToken()) setNeedsAuth(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    setFullName(user.full_name);
    setEmail(user.email);
    setAvatar(user.avatar ?? "");
  }, [user]);

  const t = isDarkMode
    ? {
        text: "text-white",
        sub: "text-white/55",
        card: "border-white/10 bg-[#152e2b]/85",
        inner: "border-white/10 bg-white/[0.04]",
        input: "border-white/10 bg-white/[0.06] text-white placeholder:text-white/35",
        secondary: "border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]",
      }
    : {
        text: "text-[#28443d]",
        sub: "text-[#68766c]",
        card: "border-[#d5dad4] bg-white/80",
        inner: "border-[#e1e6df] bg-[#f6f7f4]",
        input: "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]",
        secondary: "border-[#d5dad4] bg-[#f6f7f4] text-[#28443d] hover:bg-[#edf0eb]",
      };

  const inputClass = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:border-[#15554f] focus:ring-2 focus:ring-[#15554f]/15 ${t.input}`;

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError("");
    setProfileMessage("");
    if (fullName.trim().length < 3) {
      setProfileError("نام و نام خانوادگی را کامل وارد کنید.");
      return;
    }
    setSavingProfile(true);
    try {
      const data = await patchProfile({
        full_name: fullName.trim(),
        email: email.trim(),
      });
      setUser(data.user);
      updateStoredUser(data.user);
      setProfileMessage("اطلاعات پروفایل ذخیره شد.");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "ذخیره پروفایل ناموفق بود.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarPick = async (file: File | null | undefined) => {
    if (!file) return;
    setAvatarError("");
    setAvatarMessage("");
    if (file.size > 8 * 1024 * 1024) {
      setAvatarError("حجم تصویر نباید بیش از ۸ مگابایت باشد.");
      return;
    }
    setSavingAvatar(true);
    try {
      const dataUrl = await toAvatarDataUrl(file);
      const data = await patchProfile({ avatar: dataUrl });
      setUser(data.user);
      setAvatar(data.user.avatar ?? "");
      updateStoredUser(data.user);
      setAvatarMessage("تصویر پروفایل به‌روزرسانی شد.");
    } catch (err) {
      setAvatarError(
        err instanceof Error ? err.message : "ذخیره تصویر پروفایل ناموفق بود.",
      );
    } finally {
      setSavingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const removeAvatar = async () => {
    setAvatarError("");
    setAvatarMessage("");
    setSavingAvatar(true);
    try {
      const data = await patchProfile({ avatar: "" });
      setUser(data.user);
      setAvatar(data.user.avatar ?? "");
      updateStoredUser(data.user);
      setAvatarMessage("تصویر پروفایل حذف شد.");
    } catch (err) {
      setAvatarError(
        err instanceof Error ? err.message : "حذف تصویر پروفایل ناموفق بود.",
      );
    } finally {
      setSavingAvatar(false);
    }
  };

  const savePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    if (newPassword.length < 8) {
      setPasswordError("رمز عبور جدید باید حداقل ۸ نویسه باشد.");
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setPasswordError("رمز عبور جدید باید شامل حرف و رقم باشد.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordError("رمز عبور جدید و تکرار آن یکسان نیست.");
      return;
    }
    setSavingPassword(true);
    try {
      const data = await postChangePassword({
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm,
      });
      saveSession(data.token, data.user, data.expires_at);
      setUser(data.user);
      setPasswordMessage("رمز عبور تغییر کرد و نشست شما تمدید شد.");
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "تغییر رمز عبور ناموفق بود.");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogout = async () => {
    await postLogout();
    router.replace("/");
  };

  if (loading) {
    return (
      <div className={`flex h-[60vh] items-center justify-center gap-2 text-sm ${t.sub}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        در حال بارگذاری پروفایل...
      </div>
    );
  }

  if (needsAuth || !user) {
    return (
      <div className="mx-auto flex h-[70vh] max-w-md flex-col items-center justify-center text-center">
        <span className={`mb-4 grid h-16 w-16 place-items-center rounded-2xl border ${t.inner}`}>
          <ShieldX className="h-7 w-7 text-[#15554f]" />
        </span>
        <h1 className={`text-lg font-black ${t.text}`}>پروفایل در دسترس نیست</h1>
        <p className={`mt-2 text-xs leading-6 ${t.sub}`}>
          {loadError || "برای مشاهده پروفایل و تاریخچه، ابتدا از میز خدمت وارد حساب کاربری شوید."}
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-[#15554f] to-[#246b61] px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-[#15554f]/20"
        >
          <MessageSquareText className="h-4 w-4" />
          بازگشت به میز خدمت
        </Link>
      </div>
    );
  }

  const admin = isAdminRole(user);

  return (
    <div className={`mx-auto w-full max-w-4xl px-1 py-6 ${t.text}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-black">
            <CircleUserRound className="h-7 w-7 text-[#15554f]" />
            پروفایل کاربری
          </h1>
          <p className={`mt-1 text-xs ${t.sub}`}>
            اطلاعات حساب کاربری
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {admin && (
            <a
              href={ADMIN_APP_URL}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#15554f] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#246b61]"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              ورود به پنل مدیریت
            </a>
          )}
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/25 px-3.5 py-2 text-xs text-rose-600 transition-colors hover:bg-rose-500/10"
          >
            <LogOut className="h-3.5 w-3.5" />
            خروج از حساب
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className={`rounded-2xl border p-4 ${t.card}`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <ShieldCheck className="h-4 w-4 text-[#15554f]" />
              مشخصات حساب
            </h2>
            <span
              className={`rounded-full px-2.5 py-1 text-[0.65rem] ${
                user.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
              }`}
            >
              {user.is_active ? "فعال" : "غیرفعال"}
            </span>
          </div>

          <div className={`mb-3 flex items-center gap-3 rounded-xl border p-3 ${t.inner}`}>
            <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#32796d] to-[#174f49] text-xl font-black text-white ring-2 ring-[#15554f]/15">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt="تصویر پروفایل"
                  className="h-full w-full object-cover"
                />
              ) : (
                (user.full_name || "؟").trim().charAt(0)
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">تصویر پروفایل</p>
              <p className={`mt-0.5 text-[0.65rem] leading-5 ${t.sub}`}>
                یک تصویر مربعی انتخاب کنید؛ در منو و صفحه حساب کاربری نمایش داده می‌شود.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) =>
                    void handleAvatarPick(event.target.files?.[0])
                  }
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={savingAvatar}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#15554f] px-3 py-1.5 text-[0.7rem] font-semibold text-white transition-colors hover:bg-[#246b61] disabled:opacity-60"
                >
                  {savingAvatar ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
                  )}
                  {avatar ? "تغییر تصویر" : "انتخاب تصویر"}
                </button>
                {avatar && (
                  <button
                    type="button"
                    onClick={() => void removeAvatar()}
                    disabled={savingAvatar}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[0.7rem] transition-colors disabled:opacity-60 ${t.secondary}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    حذف تصویر
                  </button>
                )}
              </div>
              {avatarError && (
                <p role="alert" className="mt-2 text-[0.65rem] text-rose-500">
                  {avatarError}
                </p>
              )}
              {avatarMessage && !avatarError && (
                <p role="status" className="mt-2 text-[0.65rem] text-emerald-600">
                  {avatarMessage}
                </p>
              )}
            </div>
          </div>

          <dl className="grid gap-2.5 sm:grid-cols-2">
            {[
              { icon: CircleUserRound, label: "نام و نام خانوادگی", value: user.full_name },
              { icon: Phone, label: "شماره موبایل", value: user.mobile },
              { icon: Mail, label: "ایمیل", value: user.email },
              { icon: Fingerprint, label: "کد ملی", value: user.national_id },
              { icon: Clock3, label: "آخرین ورود", value: formatDateTime(user.last_login_at, mounted) },
              { icon: CalendarClock, label: "تاریخ عضویت", value: formatDateTime(user.created_at, mounted) },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className={`flex items-start gap-2.5 rounded-xl border p-3 ${t.inner}`}>
                <span className="mt-0.5 text-[#15554f]">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <dt className={`text-[0.65rem] ${t.sub}`}>{label}</dt>
                  <dd className="mt-1 break-words text-xs font-semibold">{value || "—"}</dd>
                </div>
              </div>
            ))}
          </dl>
        </section>

        <div className="space-y-4">
          <section className={`rounded-2xl border p-4 ${t.card}`}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <Save className="h-4 w-4 text-[#15554f]" />
              ویرایش اطلاعات
            </h2>
            <form onSubmit={saveProfile} className="space-y-3" dir="rtl">
              <div>
                <label htmlFor="client-profile-name" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                  نام و نام خانوادگی
                </label>
                <input
                  id="client-profile-name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="client-profile-email" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                  ایمیل
                </label>
                <input
                  id="client-profile-email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  dir="ltr"
                  placeholder="name@example.com"
                  className={inputClass}
                />
              </div>

              {profileError && (
                <p role="alert" className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-600">
                  {profileError}
                </p>
              )}
              {profileMessage && (
                <p role="status" className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                  {profileMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-l from-[#15554f] to-[#246b61] px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-[#15554f]/20 transition hover:brightness-110 disabled:opacity-60"
              >
                {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {savingProfile ? "در حال ذخیره..." : "ذخیره تغییرات"}
              </button>
            </form>
          </section>

          <section className={`rounded-2xl border p-4 ${t.card}`}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <KeyRound className="h-4 w-4 text-[#15554f]" />
              تغییر رمز عبور
            </h2>
            <form onSubmit={savePassword} className="space-y-3" dir="rtl">
              <div>
                <label htmlFor="client-current-password" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                  رمز عبور فعلی
                </label>
                <input
                  id="client-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  dir="ltr"
                  className={inputClass}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="client-new-password" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                    رمز عبور جدید
                  </label>
                  <input
                    id="client-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    dir="ltr"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="client-confirm-password" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                    تکرار رمز عبور جدید
                  </label>
                  <input
                    id="client-confirm-password"
                    type="password"
                    value={newPasswordConfirm}
                    onChange={(event) => setNewPasswordConfirm(event.target.value)}
                    autoComplete="new-password"
                    dir="ltr"
                    className={inputClass}
                  />
                </div>
              </div>
              <p className={`text-[0.65rem] leading-5 ${t.sub}`}>
                رمز عبور باید حداقل ۸ نویسه و شامل حرف و رقم باشد. پس از تغییر، همه نشست‌های قبلی بسته می‌شوند.
              </p>

              {passwordError && (
                <p role="alert" className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-600">
                  {passwordError}
                </p>
              )}
              {passwordMessage && (
                <p role="status" className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
                  {passwordMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={savingPassword}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-colors disabled:opacity-60 ${t.secondary}`}
              >
                {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {savingPassword ? "در حال تغییر..." : "تغییر رمز عبور"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
