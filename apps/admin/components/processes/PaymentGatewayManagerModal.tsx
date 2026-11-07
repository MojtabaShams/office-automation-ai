"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  Eye,
  EyeOff,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from "lucide-react";
import { useTheme } from "../../theme-context";
import { useAuth } from "../../app/auth-context";
import {
  createPaymentGateway,
  removePaymentGateway,
  setPaymentGatewayActive,
  updatePaymentGateway,
  type PaymentGateway,
} from "../../app/lib/payment-gateways";
import { formatJalali } from "../../app/lib/jalali";
import ConfirmModal from "../ConfirmModal";
import Modal from "../Modal";

/**
 * CRUD modal for payment gateways.
 *
 * The connection key is write-only: the API returns a masked value
 * (``••••••1234``), so the key field starts empty when editing and is only sent
 * when the operator types a new one.
 */
export default function PaymentGatewayManagerModal({
  open,
  gateways,
  loading = false,
  error = "",
  onReload,
  onClose,
}: {
  open: boolean;
  gateways: PaymentGateway[];
  loading?: boolean;
  error?: string;
  onReload: () => Promise<void>;
  onClose: () => void;
}) {
  const { isDarkMode } = useTheme();
  const { hasPermission } = useAuth();

  const canCreate = hasPermission("payment_gateways", "create");
  const canUpdate = hasPermission("payment_gateways", "update");
  const canDelete = hasPermission("payment_gateways", "delete");

  const [editing, setEditing] = useState<PaymentGateway | null>(null);
  const [bankName, setBankName] = useState("");
  const [connectionKey, setConnectionKey] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState("");
  const [operationError, setOperationError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PaymentGateway | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";
  const field = isDarkMode
    ? "border-white/10 bg-white/[0.06] text-white placeholder:text-white/35"
    : "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]";
  const card = isDarkMode ? "border-white/10 bg-white/[0.035]" : "border-[#e1e6df] bg-[#f6f7f4]";

  const resetForm = () => {
    setEditing(null);
    setBankName("");
    setConnectionKey("");
    setDescription("");
    setIsActive(true);
    setShowKey(false);
    setValidationError("");
  };

  const handleClose = () => {
    resetForm();
    setOperationError("");
    setStatusMessage("");
    onClose();
  };

  const startEditing = (gateway: PaymentGateway) => {
    setEditing(gateway);
    setBankName(gateway.bankName);
    setConnectionKey("");
    setDescription(gateway.description);
    setIsActive(gateway.isActive);
    setShowKey(false);
    setValidationError("");
    setOperationError("");
    setStatusMessage("");
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationError("");
    setOperationError("");
    if (!bankName.trim()) {
      setValidationError("نام بانک را وارد کنید.");
      return;
    }
    if (!editing && connectionKey.trim().length < 8) {
      setValidationError("کلید اتصال باید حداقل ۸ نویسه باشد.");
      return;
    }
    if (editing && connectionKey.trim() && connectionKey.trim().length < 8) {
      setValidationError("کلید اتصال جدید باید حداقل ۸ نویسه باشد.");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await updatePaymentGateway(editing.id, {
          bankName: bankName.trim(),
          connectionKey: connectionKey.trim() || undefined,
          description: description.trim(),
          isActive,
        });
        setStatusMessage(`درگاه «${bankName.trim()}» ویرایش شد.`);
      } else {
        await createPaymentGateway({
          bankName: bankName.trim(),
          connectionKey: connectionKey.trim(),
          description: description.trim(),
          isActive,
        });
        setStatusMessage(`درگاه «${bankName.trim()}» ثبت شد.`);
      }
      resetForm();
      await onReload();
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : "ذخیره درگاه پرداخت ناموفق بود.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (gateway: PaymentGateway) => {
    setPendingId(gateway.id);
    setOperationError("");
    try {
      await setPaymentGatewayActive(gateway.id, !gateway.isActive);
      setStatusMessage(
        `درگاه «${gateway.bankName}» ${gateway.isActive ? "غیرفعال" : "فعال"} شد.`,
      );
      await onReload();
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : "تغییر وضعیت درگاه ناموفق بود.");
    } finally {
      setPendingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setPendingId(deleteTarget.id);
    setOperationError("");
    try {
      await removePaymentGateway(deleteTarget.id);
      setStatusMessage(`درگاه «${deleteTarget.bankName}» حذف شد.`);
      if (editing?.id === deleteTarget.id) resetForm();
      await onReload();
    } catch (err) {
      setOperationError(err instanceof Error ? err.message : "حذف درگاه پرداخت ناموفق بود.");
    } finally {
      setPendingId(null);
      setDeleteTarget(null);
    }
  };

  const message = validationError || operationError || error;

  return (
    <>
      <Modal open={open} onClose={handleClose} title="مدیریت درگاه‌های پرداخت" maxWidthClass="max-w-3xl">
        {statusMessage && (
          <p
            role="status"
            className={`mb-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs ${
              isDarkMode ? "text-emerald-300" : "text-emerald-700"
            }`}
          >
            {statusMessage}
          </p>
        )}
        {message && (
          <p role="alert" className="mb-3 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-600">
            {message}
          </p>
        )}

        {canCreate || editing ? (
          <form onSubmit={save} className={`mb-5 rounded-2xl border p-4 ${card}`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold">
                  {editing ? "ویرایش درگاه پرداخت" : "افزودن درگاه پرداخت"}
                </h3>
                <p className={`mt-1 text-[0.65rem] ${muted}`}>
                  درگاه‌های ثبت‌شده برای انتخاب در پروسه‌ها در دسترس خواهند بود.
                </p>
              </div>
              {editing && (
                <button
                  type="button"
                  onClick={resetForm}
                  className={`rounded-lg border px-2.5 py-1.5 text-[0.68rem] ${muted} ${
                    isDarkMode ? "border-white/10" : "border-[#d5dad4]"
                  }`}
                >
                  لغو ویرایش
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`text-xs font-semibold ${muted}`}>
                نام بانک *
                <input
                  value={bankName}
                  onChange={(event) => setBankName(event.target.value)}
                  className={`mt-1.5 w-full rounded-xl border px-3 py-2.5 text-xs outline-none focus:border-[#15554f] ${field}`}
                  placeholder="مثلاً بانک ملی"
                  autoComplete="off"
                />
              </label>
              <label className={`text-xs font-semibold ${muted}`}>
                {editing ? "کلید اتصال جدید" : "کلید اتصال به درگاه پرداخت *"}
                <span className="relative mt-1.5 block">
                  <input
                    value={connectionKey}
                    onChange={(event) => setConnectionKey(event.target.value)}
                    type={showKey ? "text" : "password"}
                    className={`w-full rounded-xl border px-3 py-2.5 pl-10 text-xs outline-none focus:border-[#15554f] ${field}`}
                    placeholder={editing ? "برای حفظ کلید فعلی خالی بگذارید" : "کلید اتصال"}
                    dir="ltr"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    aria-label={showKey ? "پنهان کردن کلید" : "نمایش کلید"}
                    onClick={() => setShowKey((visible) => !visible)}
                    className={`absolute left-2 top-1/2 -translate-y-1/2 rounded-md p-1 ${muted}`}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </span>
                {editing && (
                  <span className={`mt-1 block text-[0.62rem] font-normal ${muted}`} dir="rtl">
                    کلید ذخیره‌شده هرگز بازگردانده نمی‌شود؛ مقدار فعلی:{" "}
                    <span dir="ltr">{editing.connectionKey || "ثبت نشده"}</span>
                  </span>
                )}
              </label>
              <label className={`text-xs font-semibold sm:col-span-2 ${muted}`}>
                توضیحات
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={2}
                  className={`mt-1.5 w-full resize-y rounded-xl border px-3 py-2.5 text-xs outline-none focus:border-[#15554f] ${field}`}
                  placeholder="توضیحات دلخواه درباره این درگاه"
                />
              </label>
              <label className={`inline-flex items-center gap-2 text-xs font-semibold ${muted}`}>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(event) => setIsActive(event.target.checked)}
                  className="h-3.5 w-3.5 accent-[#15554f]"
                />
                درگاه فعال باشد
              </label>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#15554f] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#246b61] disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : editing ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {saving ? "در حال ذخیره..." : editing ? "ذخیره تغییرات" : "ثبت درگاه"}
              </button>
            </div>
          </form>
        ) : (
          <p className={`mb-4 rounded-xl border border-dashed p-3 text-[0.7rem] ${muted} ${isDarkMode ? "border-white/15" : "border-[#cfd6ce]"}`}>
            دسترسی افزودن درگاه پرداخت را ندارید؛ فقط می‌توانید فهرست را ببینید.
          </p>
        )}

        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold">فهرست درگاه‌ها</h3>
          <span className={`inline-flex items-center gap-1.5 text-[0.68rem] ${muted}`}>
            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
            {gateways.length} درگاه
          </span>
        </div>
        {gateways.length ? (
          <ul className="space-y-2">
            {gateways.map((gateway) => (
              <li
                key={gateway.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${card}`}
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <span
                    className={`rounded-lg p-2 ${
                      isDarkMode ? "bg-[#15554f]/25 text-[#8bd0bf]" : "bg-[#e2eee8] text-[#15554f]"
                    }`}
                  >
                    <Landmark className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold">{gateway.bankName}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.6rem] ${
                          gateway.isActive
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-slate-500/10 text-slate-500"
                        }`}
                      >
                        {gateway.isActive ? "فعال" : "غیرفعال"}
                      </span>
                    </div>
                    <p className={`mt-1 max-w-xl truncate text-[0.65rem] ${muted}`}>
                      {gateway.description || "بدون توضیحات"}
                    </p>
                    <p className={`mt-1 font-mono text-[0.62rem] ${muted}`} dir="ltr">
                      {gateway.connectionKey || "کلیدی ثبت نشده"}
                    </p>
                    <p className={`mt-1 text-[0.62rem] ${muted}`}>
                      آخرین به‌روزرسانی:{" "}
                      {mounted && gateway.updatedAt ? formatJalali(new Date(gateway.updatedAt)) : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void toggleActive(gateway)}
                    disabled={!canUpdate || pendingId === gateway.id}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[0.68rem] disabled:cursor-not-allowed disabled:opacity-40 ${
                      isDarkMode ? "border-white/10 hover:bg-white/[0.06]" : "border-[#d5dad4] hover:bg-white"
                    }`}
                  >
                    {pendingId === gateway.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : gateway.isActive ? (
                      <ToggleRight className="h-3.5 w-3.5" />
                    ) : (
                      <ToggleLeft className="h-3.5 w-3.5" />
                    )}
                    {gateway.isActive ? "غیرفعال" : "فعال"}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditing(gateway)}
                    disabled={!canUpdate}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[0.68rem] disabled:cursor-not-allowed disabled:opacity-40 ${
                      isDarkMode ? "border-white/10 hover:bg-white/[0.06]" : "border-[#d5dad4] hover:bg-white"
                    }`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    ویرایش
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(gateway)}
                    disabled={!canDelete}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 px-2.5 py-1.5 text-[0.68rem] text-rose-600 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    حذف
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p
            className={`rounded-xl border border-dashed p-6 text-center text-xs ${muted} ${
              isDarkMode ? "border-white/15" : "border-[#cfd6ce]"
            }`}
          >
            {loading ? "در حال بارگذاری درگاه‌ها..." : "هنوز درگاهی ثبت نشده است."}
          </p>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="حذف درگاه پرداخت"
        message={
          deleteTarget
            ? `درگاه «${deleteTarget.bankName}» حذف می‌شود. پروسه‌هایی که از این درگاه استفاده می‌کنند نیز به حالت «بدون درگاه انتخاب‌شده» برمی‌گردند. ادامه می‌دهید؟`
            : ""
        }
        confirmLabel={pendingId ? "در حال حذف..." : "حذف درگاه"}
        danger
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
