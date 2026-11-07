"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  LogIn,
  Moon,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
} from "lucide-react";
import { useTheme } from "../../theme-context";
import { useAuth } from "../auth-context";

export default function AdminLoginPage() {
  const { isDarkMode, changeTheme } = useTheme();
  const { login, user, loading } = useAuth();
  const router = useRouter();

  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const normalizedMobile = mobile.replace(/[۰-۹]/g, (digit) =>
      String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)),
    );
    if (!/^09\d{9}$/.test(normalizedMobile)) {
      setError("شماره موبایل باید با ۰۹ شروع شده و ۱۱ رقم باشد.");
      return;
    }
    if (password.length < 8) {
      setError("رمز عبور باید حداقل ۸ نویسه باشد.");
      return;
    }

    setSubmitting(true);
    try {
      await login(normalizedMobile, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ورود ناموفق بود.");
    } finally {
      setSubmitting(false);
    }
  };

  const card = isDarkMode
    ? "border-white/10 bg-[#17332f]/95 text-white shadow-black/40"
    : "border-[#d5dad4] bg-white/95 text-[#28443d] shadow-[#28443d]/10";
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";
  const field = isDarkMode
    ? "border-white/10 bg-white/[0.06] text-white placeholder:text-white/35 focus:border-[#4c9a8b]"
    : "border-[#d5dad4] bg-[#fafbf9] text-[#28443d] placeholder:text-[#8c9587] focus:border-[#15554f]";

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <button
        type="button"
        onClick={() => changeTheme(isDarkMode ? "light" : "dark")}
        aria-label={isDarkMode ? "تم روشن" : "تم تاریک"}
        className={`fixed left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur ${
          isDarkMode
            ? "border-white/15 bg-white/10 text-white hover:bg-white/20"
            : "border-[#d5dad4] bg-white/80 text-[#28443d] hover:bg-white"
        }`}
      >
        {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl backdrop-blur-md sm:p-8 ${card}`}>
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#32796d] to-[#174f49] shadow-lg shadow-black/25 ring-1 ring-white/20">
            <Sparkles className="h-7 w-7 text-white" />
          </span>
          <h1 className="mt-4 text-lg font-black">ورود به پنل مدیریت</h1>
          <p className={`mt-1 text-xs leading-6 ${muted}`}>
            میز خدمت هوشمند - دسترسی ویژه کارکنان و مدیران سامانه
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-xs leading-5 text-rose-600"
          >
            {error}
          </p>
        )}

        <form onSubmit={submit} className="space-y-4" dir="rtl">
          <div>
            <label htmlFor="login-mobile" className={`mb-1.5 flex items-center gap-1.5 text-xs font-medium ${muted}`}>
              <Smartphone className="h-3.5 w-3.5" />
              شماره موبایل
            </label>
            <input
              id="login-mobile"
              value={mobile}
              onChange={(event) => setMobile(event.target.value)}
              inputMode="numeric"
              autoComplete="username"
              dir="ltr"
              placeholder="09123456789"
              className={`w-full rounded-xl border px-3 py-3 text-sm outline-none transition focus:ring-2 focus:ring-[#15554f]/15 ${field}`}
            />
          </div>

          <div>
            <label htmlFor="login-password" className={`mb-1.5 flex items-center gap-1.5 text-xs font-medium ${muted}`}>
              <LockKeyhole className="h-3.5 w-3.5" />
              رمز عبور
            </label>
            <span className="relative block">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                dir="ltr"
                placeholder="••••••••"
                className={`w-full rounded-xl border px-3 py-3 pl-11 text-sm outline-none transition focus:ring-2 focus:ring-[#15554f]/15 ${field}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "پنهان کردن رمز عبور" : "نمایش رمز عبور"}
                className={`absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-2 ${muted} hover:bg-black/5`}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-[#15554f] to-[#246b61] px-4 py-3 text-sm font-semibold text-white shadow-md shadow-[#15554f]/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {submitting ? "در حال ورود..." : "ورود به پنل"}
          </button>
        </form>

        <div className={`mt-6 flex items-start gap-2 rounded-xl border p-3 text-[0.68rem] leading-5 ${
          isDarkMode ? "border-white/10 bg-white/[0.04] text-white/60" : "border-[#e1e6df] bg-[#f6f7f4] text-[#68766c]"
        }`}>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#15554f]" />
          <p>
            پس از ۳۰ دقیقه بی‌فعالیتی، نشست شما به‌صورت خودکار بسته می‌شود و برای ادامه باید
            دوباره وارد شوید. مراجعان امکان ورود به این پنل را ندارند.
          </p>
        </div>
      </div>
    </div>
  );
}
