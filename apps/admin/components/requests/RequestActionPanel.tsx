"use client";

import { useState } from "react";
import { AlertTriangle, Check, FilePlus2, MessageSquareText, RotateCw, X } from "lucide-react";
import { useTheme } from "../../theme-context";
import JalaliDatePicker from "../JalaliDatePicker";
import Modal from "../Modal";
import ConfirmModal from "../ConfirmModal";
import type { AdminRequest } from "../../app/lib/mock-requests";

export type RequestActionHandlers = {
  approve: (note: string) => void;
  reject: (kind: "return" | "final", note: string, dueDate?: Date) => void;
  requestDocuments: (note: string, dueDate: Date) => void;
  receiveDocuments: () => void;
  addNote: (note: string) => void;
};

export default function RequestActionPanel({
  request,
  onAction,
}: {
  request: AdminRequest;
  onAction: RequestActionHandlers;
}) {
  const { isDarkMode } = useTheme();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [finalConfirmOpen, setFinalConfirmOpen] = useState(false);
  const [rejectKind, setRejectKind] = useState<"return" | "final">("return");
  const [rejectNote, setRejectNote] = useState("");
  const [rejectDueDate, setRejectDueDate] = useState<Date>(() => {
    const date = new Date();
    date.setDate(date.getDate() + 5);
    return date;
  });
  const [documentNote, setDocumentNote] = useState("");
  const [documentDueDate, setDocumentDueDate] = useState<Date>(() => {
    const date = new Date();
    date.setDate(date.getDate() + 5);
    return date;
  });
  const [internalNote, setInternalNote] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [notice, setNotice] = useState("");
  const awaitingUser = request.subStatus === "awaiting-user-documents";
  const surface = isDarkMode ? "border-white/10 bg-[#193632]" : "border-[#d5dad4] bg-white";
  const input = isDarkMode
    ? "border-white/10 bg-white/[0.06] text-white placeholder:text-white/40"
    : "border-[#d5dad4] bg-white text-[#28443d] placeholder:text-[#8c9587]";

  const addNote = () => {
    if (!internalNote.trim()) return;
    onAction.addNote(internalNote.trim());
    setInternalNote("");
    setNotice("یادداشت در تاریخچه پرونده ثبت شد.");
  };

  return (
    <>
      <section className={`rounded-2xl border p-4 shadow-sm ${surface}`}>
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
          <Check className="h-4 w-4 text-[#15554f]" />
          اقدام روی پرونده
        </h2>
        <p className={`mb-4 text-[0.68rem] leading-5 ${isDarkMode ? "text-white/55" : "text-[#68766c]"}`}>
          {awaitingUser ? "پرونده برای تکمیل مدرک نزد کاربر است؛ پس از دریافت مدرک دوباره بررسی کنید." : "شما مسئول مرحله جاری هستید و می‌توانید درباره پرونده تصمیم بگیرید."}
        </p>
        {notice && <p role="status" className="mb-3 text-[0.68rem] text-emerald-600">{notice}</p>}

        {awaitingUser && (
          <button
            type="button"
            onClick={() => {
              onAction.receiveDocuments();
              setNotice("دریافت مدرک ثبت شد و پرونده برای بررسی دوباره آماده است.");
            }}
            className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/15"
          >
            <FilePlus2 className="h-4 w-4" />
            ثبت دریافت مدرک و ادامه رسیدگی
          </button>
        )}

        <label className="mb-3 block text-xs font-semibold">
          یادداشت تأیید (اختیاری)
          <textarea value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} rows={2} className={`mt-1.5 w-full resize-y rounded-xl border px-3 py-2 text-xs outline-none focus:border-[#15554f] ${input}`} placeholder="توضیح تصمیم یا ارجاع..." />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={awaitingUser}
            onClick={() => {
              onAction.approve(approvalNote.trim());
              setApprovalNote("");
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="h-4 w-4" />
            تأیید و ارجاع به مرحله بعد
          </button>
          <button type="button" disabled={awaitingUser} onClick={() => setRejectOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40">
            <X className="h-4 w-4" />
            رد درخواست
          </button>
        </div>

        <div className={`my-4 border-t ${isDarkMode ? "border-white/10" : "border-[#e6e9e3]"}`} />
        <h3 className="mb-2 flex items-center gap-2 text-xs font-bold"><FilePlus2 className="h-4 w-4 text-[#15554f]" />درخواست مدرک تکمیلی از کاربر</h3>
        <label className="mb-2 block text-[0.68rem]">
          مدرک یا توضیح موردنیاز
          <textarea value={documentNote} onChange={(event) => setDocumentNote(event.target.value)} rows={2} className={`mt-1.5 w-full resize-y rounded-xl border px-3 py-2 text-xs outline-none focus:border-[#15554f] ${input}`} placeholder="مثلاً تصویر خوانای کارت ملی را ارسال کنید" />
        </label>
        <label className="mb-2 block text-[0.68rem]">
          مهلت تکمیل مدرک
          <span className="mt-1.5 block"><JalaliDatePicker value={documentDueDate} onChange={setDocumentDueDate} /></span>
        </label>
        <button
          type="button"
          disabled={!documentNote.trim()}
          onClick={() => {
            onAction.requestDocuments(documentNote.trim(), documentDueDate);
            setDocumentNote("");
            setNotice("درخواست مدرک و مهلت آن ثبت شد.");
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-[#15554f]/25 px-3 py-2 text-xs font-semibold text-[#15554f] transition hover:bg-[#15554f]/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FilePlus2 className="h-3.5 w-3.5" />
          ثبت درخواست مدرک
        </button>

        <div className={`my-4 border-t ${isDarkMode ? "border-white/10" : "border-[#e6e9e3]"}`} />
        <label className="mb-2 flex items-center gap-2 text-xs font-bold"><MessageSquareText className="h-4 w-4 text-[#15554f]" />یادداشت داخلی</label>
        <textarea value={internalNote} onChange={(event) => setInternalNote(event.target.value)} rows={2} className={`w-full resize-y rounded-xl border px-3 py-2 text-xs outline-none focus:border-[#15554f] ${input}`} placeholder="یادداشتی که فقط در تاریخچه داخلی پرونده ثبت می‌شود..." />
        <button type="button" onClick={addNote} disabled={!internalNote.trim()} className="mt-2 rounded-xl bg-[#15554f] px-3 py-2 text-xs font-semibold text-white hover:bg-[#246b61] disabled:cursor-not-allowed disabled:opacity-40">
          ثبت یادداشت
        </button>
      </section>

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="رد درخواست" maxWidthClass="max-w-xl">
        <p className={`mb-4 text-xs leading-6 ${isDarkMode ? "text-white/60" : "text-[#68766c]"}`}>
          این پرونده برای اصلاح به کاربر برگردد، یا به‌طور کامل رد شود؟
        </p>
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => setRejectKind("return")} className={`rounded-xl border p-3 text-right text-xs ${rejectKind === "return" ? "border-[#15554f] bg-[#15554f]/10" : isDarkMode ? "border-white/10" : "border-[#d5dad4]"}`}>
            <span className="mb-1 flex items-center gap-2 font-bold"><RotateCw className="h-4 w-4 text-[#15554f]" />بازگشت برای اصلاح</span>
            <span className="opacity-70">پرونده باز می‌ماند و پس از تکمیل دوباره وارد گردش کار می‌شود.</span>
          </button>
          <button type="button" onClick={() => setRejectKind("final")} className={`rounded-xl border p-3 text-right text-xs ${rejectKind === "final" ? "border-rose-500 bg-rose-500/10" : isDarkMode ? "border-white/10" : "border-[#d5dad4]"}`}>
            <span className="mb-1 flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4 text-rose-500" />رد نهایی</span>
            <span className="opacity-70">پرونده بسته و درخواست ردشده ثبت می‌شود.</span>
          </button>
        </div>
        <label className="mb-3 block text-xs font-semibold">
          توضیح تصمیم
          <textarea value={rejectNote} onChange={(event) => setRejectNote(event.target.value)} rows={3} className={`mt-1.5 w-full rounded-xl border px-3 py-2 text-xs outline-none focus:border-[#15554f] ${input}`} placeholder="دلیل رد یا موارد موردنیاز برای اصلاح..." />
        </label>
        {rejectKind === "return" && (
          <label className="mb-4 block text-xs font-semibold">
            مهلت اصلاح توسط کاربر
            <span className="mt-1.5 block"><JalaliDatePicker value={rejectDueDate} onChange={setRejectDueDate} /></span>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setRejectOpen(false)} className={`rounded-xl border px-4 py-2 text-xs ${isDarkMode ? "border-white/10" : "border-[#d5dad4]"}`}>انصراف</button>
          <button
            type="button"
            disabled={!rejectNote.trim()}
            onClick={() => {
                if (rejectKind === "final") {
                  setFinalConfirmOpen(true);
                } else {
                  onAction.reject("return", rejectNote.trim(), rejectDueDate);
                  setRejectNote("");
                }
                setRejectOpen(false);
              }}
            className={`rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 ${rejectKind === "final" ? "bg-rose-600 hover:bg-rose-700" : "bg-[#15554f] hover:bg-[#246b61]"}`}
          >
            {rejectKind === "return" ? "بازگرداندن برای اصلاح" : "رد نهایی درخواست"}
          </button>
        </div>
      </Modal>
      <ConfirmModal
        open={finalConfirmOpen}
        title="رد نهایی پرونده"
        message="این تصمیم پرونده را می‌بندد و درخواست را به‌طور کامل رد می‌کند. ادامه می‌دهید؟"
        confirmLabel="رد نهایی"
        danger
        onConfirm={() => {
          onAction.reject("final", rejectNote.trim());
          setFinalConfirmOpen(false);
          setRejectNote("");
        }}
        onClose={() => setFinalConfirmOpen(false)}
      />
    </>
  );
}
