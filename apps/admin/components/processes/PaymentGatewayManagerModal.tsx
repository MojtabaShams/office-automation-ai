"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Landmark, Pencil, Plus, Trash2 } from "lucide-react";
import { useTheme } from "../../theme-context";
import type { PaymentGateway } from "../../app/lib/payment-gateways";
import ConfirmModal from "../ConfirmModal";
import Modal from "../Modal";

export default function PaymentGatewayManagerModal({
  open,
  gateways,
  operationError,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  gateways: PaymentGateway[];
  operationError: string;
  onClose: () => void;
  onSave: (gateway: PaymentGateway) => boolean;
  onDelete: (gatewayId: string) => boolean;
}) {
  const { isDarkMode } = useTheme();
  const [editing, setEditing] = useState<PaymentGateway | null>(null);
  const [bankName, setBankName] = useState("");
  const [connectionKey, setConnectionKey] = useState("");
  const [description, setDescription] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PaymentGateway | null>(null);

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
    setShowKey(false);
    setValidationError("");
  };

  const startEditing = (gateway: PaymentGateway) => {
    setEditing(gateway);
    setBankName(gateway.bankName);
    setConnectionKey(gateway.connectionKey);
    setDescription(gateway.description);
    setShowKey(false);
    setValidationError("");
    setStatusMessage("");
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bankName.trim()) {
      setValidationError("نام بانک را وارد کنید.");
      return;
    }
    if (!connectionKey.trim()) {
      setValidationError("کلید اتصال به درگاه را وارد کنید.");
      return;
    }
    const wasEditing = Boolean(editing);
    const saved = onSave({
      id: editing?.id ?? `gateway-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      bankName: bankName.trim(),
      connectionKey: connectionKey.trim(),
      description: description.trim(),
      updatedAt: new Date().toISOString(),
    });
    if (saved) {
      setStatusMessage(wasEditing ? `درگاه «${bankName.trim()}» ویرایش شد.` : `درگاه «${bankName.trim()}» ثبت شد.`);
      resetForm();
    }
  };

  return (
    <>
      <Modal open={open} onClose={() => { resetForm(); setStatusMessage(""); onClose(); }} title="مدیریت درگاه‌های پرداخت" maxWidthClass="max-w-3xl">
        {statusMessage && <p role="status" className="mb-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">{statusMessage}</p>}
        {(operationError || validationError) && <p role="alert" className="mb-3 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-600">{validationError || operationError}</p>}

        <form onSubmit={save} className={`mb-5 rounded-2xl border p-4 ${card}`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold">{editing ? "ویرایش درگاه پرداخت" : "افزودن درگاه پرداخت"}</h3>
              <p className={`mt-1 text-[0.65rem] ${muted}`}>درگاه‌های ثبت‌شده برای انتخاب در پروسه‌ها در دسترس خواهند بود.</p>
            </div>
            {editing && <button type="button" onClick={resetForm} className={`rounded-lg border px-2.5 py-1.5 text-[0.68rem] ${muted} ${isDarkMode ? "border-white/10" : "border-[#d5dad4]"}`}>لغو ویرایش</button>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={`text-xs font-semibold ${muted}`}>نام بانک *
              <input value={bankName} onChange={(event) => setBankName(event.target.value)} className={`mt-1.5 w-full rounded-xl border px-3 py-2.5 text-xs outline-none focus:border-[#15554f] ${field}`} placeholder="مثلاً بانک ملی" autoComplete="off" />
            </label>
            <label className={`text-xs font-semibold ${muted}`}>کلید اتصال به درگاه پرداخت *
              <span className="relative mt-1.5 block">
                <input value={connectionKey} onChange={(event) => setConnectionKey(event.target.value)} type={showKey ? "text" : "password"} className={`w-full rounded-xl border px-3 py-2.5 pl-10 text-xs outline-none focus:border-[#15554f] ${field}`} placeholder="کلید اتصال" dir="ltr" autoComplete="new-password" />
                <button type="button" aria-label={showKey ? "پنهان کردن کلید" : "نمایش کلید"} onClick={() => setShowKey((visible) => !visible)} className={`absolute left-2 top-1/2 -translate-y-1/2 rounded-md p-1 ${muted}`}>
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>
            <label className={`text-xs font-semibold sm:col-span-2 ${muted}`}>توضیحات
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className={`mt-1.5 w-full resize-y rounded-xl border px-3 py-2.5 text-xs outline-none focus:border-[#15554f] ${field}`} placeholder="توضیحات دلخواه درباره این درگاه" />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-[#15554f] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#246b61]">
              {editing ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {editing ? "ذخیره تغییرات" : "ثبت درگاه"}
            </button>
          </div>
        </form>

        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold">فهرست درگاه‌ها</h3>
          <span className={`text-[0.68rem] ${muted}`}>{gateways.length} درگاه</span>
        </div>
        {gateways.length ? (
          <ul className="space-y-2">
            {gateways.map((gateway) => (
              <li key={gateway.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${card}`}>
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className={`rounded-lg p-2 ${isDarkMode ? "bg-[#15554f]/25 text-[#8bd0bf]" : "bg-[#e2eee8] text-[#15554f]"}`}><Landmark className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold">{gateway.bankName}</p>
                    <p className={`mt-1 max-w-xl truncate text-[0.65rem] ${muted}`}>{gateway.description || "بدون توضیحات"}</p>
                    <p className={`mt-1 font-mono text-[0.62rem] ${muted}`} dir="ltr">کلید: {"•".repeat(Math.min(gateway.connectionKey.length, 12))}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => startEditing(gateway)} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[0.68rem] ${isDarkMode ? "border-white/10 hover:bg-white/[0.06]" : "border-[#d5dad4] hover:bg-white"}`}><Pencil className="h-3.5 w-3.5" />ویرایش</button>
                  <button type="button" onClick={() => setDeleteTarget(gateway)} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 px-2.5 py-1.5 text-[0.68rem] text-rose-600 hover:bg-rose-500/10"><Trash2 className="h-3.5 w-3.5" />حذف</button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`rounded-xl border border-dashed p-6 text-center text-xs ${muted} ${isDarkMode ? "border-white/15" : "border-[#cfd6ce]"}`}>هنوز درگاهی ثبت نشده است.</p>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="حذف درگاه پرداخت"
        message={deleteTarget ? `درگاه «${deleteTarget.bankName}» حذف می‌شود. پروسه‌هایی که از این درگاه استفاده می‌کنند نیز به حالت «بدون درگاه انتخاب‌شده» برمی‌گردند. ادامه می‌دهید؟` : ""}
        confirmLabel="حذف درگاه"
        danger
        onConfirm={() => {
          if (deleteTarget && onDelete(deleteTarget.id)) {
            setStatusMessage(`درگاه «${deleteTarget.bankName}» حذف شد.`);
            if (editing?.id === deleteTarget.id) resetForm();
            setDeleteTarget(null);
          }
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
