"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ADMIN_SESSION_KEY,
  SESSION_EXPIRED_EVENT,
  clearStoredSession,
  changePassword as apiChangePassword,
  getMe,
  login as apiLogin,
  logout as apiLogout,
  readStoredSession,
  updateProfile as apiUpdateProfile,
  writeStoredSession,
  type AuthResponse,
  type AuthUser,
  type StoredSession,
} from "./lib/admin-api";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  /** Epoch milliseconds at which the current token expires. */
  expiresAt: number | null;
  isAuthenticated: boolean;
  login: (mobile: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser>;
  updateProfile: (input: {
    fullName?: string;
    email?: string;
    unit?: string;
    avatar?: string;
  }) => Promise<AuthUser>;
  changePassword: (input: {
    currentPassword: string;
    newPassword: string;
    newPasswordConfirm: string;
  }) => Promise<AuthUser>;
  hasPermission: (resource: string, action: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [loading, setLoading] = useState(true);

  // Hydrate from localStorage after mount (the server render has no window).
  useEffect(() => {
    setSession(readStoredSession());
    setLoading(false);
  }, []);

  // Hard expiry: the token is dead after 30 minutes, so is the UI session.
  useEffect(() => {
    if (!session) return;
    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) {
      clearStoredSession();
      setSession(null);
      return;
    }
    const timer = window.setTimeout(() => {
      clearStoredSession();
      setSession(null);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [session]);

  // A 401 anywhere in the app closes the session; other tabs stay in sync.
  useEffect(() => {
    const onExpired = () => setSession(null);
    const onStorage = (event: StorageEvent) => {
      if (event.key === ADMIN_SESSION_KEY || event.key === null) {
        setSession(readStoredSession());
      }
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const applyAuthResponse = useCallback((payload: AuthResponse) => {
    const next: StoredSession = {
      token: payload.token,
      expiresAt: new Date(payload.expires_at).getTime(),
      user: payload.user,
    };
    writeStoredSession(next);
    setSession(next);
    return payload.user;
  }, []);

  const login = useCallback(
    async (mobile: string, password: string) => {
      const payload = await apiLogin(mobile, password);
      const canEnterAdmin = payload.user.permissions?.admin_panel?.view === true;
      if (!canEnterAdmin) {
        // Do not leave a live token for an applicant on the admin origin.
        await apiLogout(payload.token);
        throw new Error("این حساب کاربری به پنل مدیریت دسترسی ندارد.");
      }
      return applyAuthResponse(payload);
    },
    [applyAuthResponse],
  );

  const logout = useCallback(async () => {
    const token = session?.token ?? null;
    clearStoredSession();
    setSession(null);
    await apiLogout(token);
  }, [session]);

  const refreshUser = useCallback(async () => {
    const user = await getMe();
    const stored = readStoredSession();
    if (stored) {
      const next = { ...stored, user };
      writeStoredSession(next);
      setSession(next);
    }
    return user;
  }, []);

  const updateProfile = useCallback(
    async (input: { fullName?: string; email?: string; unit?: string; avatar?: string }) => {
      const user = await apiUpdateProfile(input);
      const stored = readStoredSession();
      if (stored) {
        const next = { ...stored, user };
        writeStoredSession(next);
        setSession(next);
      }
      return user;
    },
    [],
  );

  const changePassword = useCallback(
    async (input: {
      currentPassword: string;
      newPassword: string;
      newPasswordConfirm: string;
    }) => {
      const payload = await apiChangePassword(input);
      return applyAuthResponse(payload);
    },
    [applyAuthResponse],
  );

  const hasPermission = useCallback(
    (resource: string, action: string) => session?.user.permissions?.[resource]?.[action] === true,
    [session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      loading,
      expiresAt: session?.expiresAt ?? null,
      isAuthenticated: Boolean(session),
      login,
      logout,
      refreshUser,
      updateProfile,
      changePassword,
      hasPermission,
    }),
    [session, loading, login, logout, refreshUser, updateProfile, changePassword, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth باید داخل AuthProvider استفاده شود");
  return ctx;
}
