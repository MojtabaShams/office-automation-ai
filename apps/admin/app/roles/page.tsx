"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  Loader2,
  Lock,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { useTheme } from "../../theme-context";
import ConfirmModal from "../../components/ConfirmModal";
import Modal from "../../components/Modal";
import {
  createRole,
  deleteRole,
  getRoleCatalog,
  listRoles,
  setRolePermissions,
  updateRole,
  type PermissionCatalog,
  type PermissionMatrix,
  type Role,
} from "../lib/admin-api";

type FormState = {
  name: string;
  code: string;
  description: string;
  permissions: PermissionMatrix;
};

function buildEmptyMatrix(catalog: PermissionCatalog | null): PermissionMatrix {
  const matrix: PermissionMatrix = {};
  catalog?.resources.forEach((resource) => {
    matrix[resource.resource] = Object.fromEntries(
      resource.actions.map((action) => [action.action, false]),
    );
  });
  return matrix;
}

function mergeMatrix(catalog: PermissionCatalog | null, source: PermissionMatrix): PermissionMatrix {
  const matrix = buildEmptyMatrix(catalog);
  Object.entries(source ?? {}).forEach(([resource, actions]) => {
    const target = matrix[resource];
    if (!target) return;
    Object.entries(actions ?? {}).forEach(([action, enabled]) => {
      if (action in target) target[action] = enabled === true;
    });
  });
  return matrix;
}

function countPermissions(matrix: PermissionMatrix): number {
  return Object.values(matrix).reduce(
    (total, actions) => total + Object.values(actions).filter(Boolean).length,
    0,
  );
}

export default function RolesPage() {
  const { isDarkMode } = useTheme();

  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState<FormState>({
    name: "",
    code: "",
    description: "",
    permissions: {},
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState(false);

  const t = isDarkMode
    ? {
        text: "text-white",
        sub: "text-white/55",
        card: "border-white/10 bg-[#193632]/80",
        input: "border-white/10 bg-white/[0.06] text-white placeholder:text-white/35",
        chip: "border-white/15 bg-white/[0.06] text-white/85 hover:bg-white/[0.12]",
        primary: "bg-[#15554f] text-white hover:bg-[#246b61]",
      }
    : {
        text: "text-[#28443d]",
        sub: "text-[#68766c]",
        card: "border-[#d5dad4] bg-[#fafbf9]/90",
        input: "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]",
        chip: "border-[#d5dad4] bg-[#f6f7f4] text-[#40584e] hover:bg-[#edf0eb]",
        primary: "bg-[#15554f] text-white hover:bg-[#246b61]",
      };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [rolePayload, catalogPayload] = await Promise.all([listRoles(), getRoleCatalog()]);
      setRoles(rolePayload.roles);
      setCatalog(catalogPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "بارگذاری نقش‌ها ناموفق بود.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const isSuperAdmin = editing?.code === "super_admin";
  const lockedMatrix = useMemo(() => isSuperAdmin, [isSuperAdmin]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      code: "",
      description: "",
      permissions: buildEmptyMatrix(catalog),
    });
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (role: Role) => {
    setEditing(role);
    setForm({
      name: role.name,
      code: role.code,
      description: role.description,
      permissions: mergeMatrix(catalog, role.permissions),
    });
    setFormError("");
    setModalOpen(true);
  };

  const togglePermission = (resource: string, action: string) => {
    if (lockedMatrix) return;
    setForm((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [resource]: {
          ...(current.permissions[resource] ?? {}),
          [action]: !current.permissions[resource]?.[action],
        },
      },
    }));
  };

  const save = async () => {
    setFormError("");
    if (form.name.trim().length < 2) {
      setFormError("نام نقش باید حداقل ۲ نویسه باشد.");
      return;
    }
    if (!editing && !/^[a-z][a-z0-9_]{2,49}$/.test(form.code.trim())) {
      setFormError("کد نقش باید با حرف شروع شود و فقط شامل حروف کوچک، رقم و زیرخط باشد.");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await updateRole(editing.id, {
          name: form.name.trim(),
          description: form.description.trim(),
        });
        if (!lockedMatrix) {
          await setRolePermissions(editing.id, form.permissions);
        }
        setNotice(`نقش «${form.name.trim()}» به‌روزرسانی شد.`);
      } else {
        await createRole({
          name: form.name.trim(),
          code: form.code.trim().toLowerCase(),
          description: form.description.trim(),
          permissions: form.permissions,
        });
        setNotice(`نقش «${form.name.trim()}» ایجاد شد.`);
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "ذخیره نقش ناموفق بود.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRole(deleteTarget.id);
      setNotice(`نقش «${deleteTarget.name}» حذف شد.`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "حذف نقش ناموفق بود.");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={`w-full ${t.text}`}>
      <h1 className="mb-1 flex items-center gap-2.5 text-xl font-black">
        <ShieldCheck aria-hidden="true" className="h-7 w-7 text-[#15554f]" />
        نقش‌ها و سطوح دسترسی
      </h1>
      <p className={`mb-4 text-xs ${t.sub}`}>
        هر نقش مجموعه‌ای از دسترسی‌های «بخش + عملیات» است و به کارمندان اختصاص داده می‌شود.
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-600">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
          {notice}
        </p>
      )}

      <div className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3 ${t.card}`}>
        <button
          type="button"
          onClick={openCreate}
          disabled={!catalog}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${t.primary}`}
        >
          <Plus className="h-3.5 w-3.5" />
          نقش جدید
        </button>
        <span className={`text-[0.7rem] ${t.sub}`}>{roles.length} نقش ثبت شده است</span>
      </div>

      {loading ? (
        <div className={`flex h-48 items-center justify-center gap-2 rounded-2xl border text-sm ${t.card} ${t.sub}`}>
          <Loader2 className="h-4 w-4 animate-spin" />
          در حال بارگذاری نقش‌ها...
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {roles.map((role) => (
            <article key={role.id} className={`rounded-2xl border p-4 ${t.card}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-bold">{role.name}</h2>
                    <span className="rounded-full bg-[#15554f]/10 px-2 py-0.5 font-mono text-[0.62rem] text-[#15554f]" dir="ltr">
                      {role.code}
                    </span>
                    {role.isSystem && (
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.62rem] ${t.chip}`}>
                        <Lock className="h-3 w-3" />
                        سیستمی
                      </span>
                    )}
                  </div>
                  <p className={`mt-1.5 text-[0.7rem] leading-5 ${t.sub}`}>
                    {role.description || "توضیحی ثبت نشده است."}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(role)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[0.68rem] transition-colors ${t.chip}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    ویرایش
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(role)}
                    disabled={role.isSystem}
                    title={role.isSystem ? "نقش‌های سیستمی قابل حذف نیستند" : "حذف نقش"}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 px-2.5 py-1.5 text-[0.68rem] text-rose-600 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    حذف
                  </button>
                </div>
              </div>

              <div className={`mt-3 flex flex-wrap items-center gap-3 border-t pt-3 text-[0.68rem] ${t.sub} ${isDarkMode ? "border-white/10" : "border-[#e6e9e3]"}`}>
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {countPermissions(role.permissions)} دسترسی
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {role.userCount} کاربر
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `ویرایش نقش «${editing.name}»` : "ایجاد نقش جدید"}
        maxWidthClass="max-w-3xl"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className={`rounded-xl border px-4 py-2.5 text-xs font-medium ${t.chip}`}
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-[#15554f] to-[#246b61] px-5 py-2.5 text-xs font-semibold text-white shadow-sm shadow-[#15554f]/20 transition hover:brightness-110 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {editing ? "ذخیره تغییرات" : "ایجاد نقش"}
            </button>
          </div>
        }
      >
        <div className="space-y-4" dir="rtl">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="role-name" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                نام نقش
              </label>
              <input
                id="role-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="مثلاً کارشناس منابع انسانی"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:border-[#15554f] focus:ring-2 focus:ring-[#15554f]/15 ${t.input}`}
              />
            </div>
            <div>
              <label htmlFor="role-code" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                کد نقش {editing ? "(غیرقابل تغییر)" : ""}
              </label>
              <input
                id="role-code"
                value={form.code}
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                disabled={Boolean(editing)}
                dir="ltr"
                placeholder="hr_expert"
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:border-[#15554f] focus:ring-2 focus:ring-[#15554f]/15 disabled:opacity-60 ${t.input}`}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="role-description" className={`mb-1.5 block text-xs font-medium ${t.sub}`}>
                توضیحات
              </label>
              <textarea
                id="role-description"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                rows={2}
                className={`w-full resize-y rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:border-[#15554f] focus:ring-2 focus:ring-[#15554f]/15 ${t.input}`}
              />
            </div>
          </div>

          {lockedMatrix ? (
            <p className={`rounded-xl border px-3 py-2.5 text-xs leading-5 ${t.chip}`}>
              دسترسی‌های نقش «مدیر کل سامانه» قابل تغییر نیست تا هیچ‌گاه دسترسی کامل از دست نرود.
            </p>
          ) : (
            <section className={`overflow-hidden rounded-2xl border ${isDarkMode ? "border-white/10" : "border-[#e1e6df]"}`}>
              <div className={`border-b px-3 py-2 text-xs font-semibold ${t.sub} ${isDarkMode ? "border-white/10" : "border-[#e1e6df]"}`}>
                دسترسی‌ها {editing?.code === "employee" ? "(دسترسی «ورود به پنل مدیریت» باید فعال بماند)" : ""}
              </div>
              <div className="max-h-[46vh] overflow-y-auto">
                {catalog?.resources.map((resource) => (
                  <div
                    key={resource.resource}
                    className={`flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5 last:border-b-0 ${
                      isDarkMode ? "border-white/[0.06]" : "border-[#eef0ec]"
                    }`}
                  >
                    <span className="text-xs font-medium">{resource.label}</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {resource.actions.map((action) => {
                        const enabled = form.permissions[resource.resource]?.[action.action] === true;
                        return (
                          <button
                            key={action.action}
                            type="button"
                            aria-pressed={enabled}
                            onClick={() => togglePermission(resource.resource, action.action)}
                            className={`rounded-full border px-2.5 py-1 text-[0.65rem] transition-colors ${
                              enabled
                                ? "border-[#15554f] bg-[#15554f] text-white"
                                : isDarkMode
                                  ? "border-white/15 bg-white/[0.04] text-white/60 hover:bg-white/[0.1]"
                                  : "border-[#d5dad4] bg-white text-[#68766c] hover:bg-[#edf0eb]"
                            }`}
                          >
                            {action.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {formError && (
            <p role="alert" className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-600">
              {formError}
            </p>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="حذف نقش"
        message={
          deleteTarget
            ? `نقش «${deleteTarget.name}» حذف می‌شود. این عمل فقط برای نقش‌های بدون کاربر امکان‌پذیر است. ادامه می‌دهید؟`
            : ""
        }
        confirmLabel={deleting ? "در حال حذف..." : "حذف نقش"}
        danger
      />
    </div>
  );
}
