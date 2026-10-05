"use client";

import { useState } from "react";
import { MessageCircle, UserRoundCog } from "lucide-react";
import { useTheme } from "../../theme-context";
import { initialEmployees } from "../../app/lib/mock-employees";
import type { AdminRequest } from "../../app/lib/mock-requests";
import { formatRequestDate, formatRequestId } from "../../app/lib/mock-requests";
import Modal from "../Modal";
import ThemedSelect from "../ThemedSelect";

export function RequestConversationModal({
  request,
  onClose,
}: {
  request: AdminRequest;
  onClose: () => void;
}) {
  const { isDarkMode } = useTheme();
  return (
    <Modal open onClose={onClose} title="گفتگوی اصلی با دستیار هوشمند" maxWidthClass="max-w-2xl">
      <div className={`mb-3 flex items-center gap-2 rounded-xl border p-3 text-xs ${isDarkMode ? "border-white/10 bg-white/[0.04] text-white/65" : "border-[#d5dad4] bg-[#f6f7f4] text-[#68766c]"}`}>
        <MessageCircle className="h-4 w-4 shrink-0 text-[#15554f]" />
        <span>{request.applicantName} · {formatRequestId(request.id)}</span>
      </div>
      <div className={`max-h-[55vh] space-y-3 overflow-y-auto rounded-2xl p-3 ${isDarkMode ? "bg-[#122925]" : "bg-[#f1f2ee]"}`}>
        {request.chat.map((message, index) => {
          const fromUser = message.sender === "user";
          return (
            <div key={`${message.at}-${index}`} className={`flex ${fromUser ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${fromUser ? isDarkMode ? "bg-[#15554f] text-white" : "bg-[#dcece3] text-[#28443d]" : isDarkMode ? "bg-[#203b39] text-white" : "bg-white text-[#28443d]"}`}>
                <p className="text-[0.7rem] font-bold">{fromUser ? request.applicantName : "دستیار هوشمند"}</p>
                <p className="mt-1 text-xs leading-6">{message.text}</p>
                <p className={`mt-1 text-left text-[0.62rem] ${isDarkMode ? "text-white/50" : "text-[#718074]"}`}>
                  {formatRequestDate(message.at, true)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export function ReassignRequestModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (employeeId: string, reason: string) => void;
}) {
  const { isDarkMode } = useTheme();
  const [employeeId, setEmployeeId] = useState("");
  const [reason, setReason] = useState("");
  const input = isDarkMode
    ? "border-white/10 bg-white/[0.06] text-white"
    : "border-[#d5dad4] bg-white text-[#28443d]";

  return (
    <Modal open={open} onClose={onClose} title="ارجاع مجدد پرونده" maxWidthClass="max-w-lg">
      <p className={`mb-4 text-xs leading-5 ${isDarkMode ? "text-white/55" : "text-[#68766c]"}`}>
        پرونده به کارمند دیگری ارجاع می‌شود و مهلت مرحله از زمان ارجاع دوباره محاسبه خواهد شد.
      </p>
      <label className="mb-3 block text-xs font-semibold">
        کارمند جدید
        <ThemedSelect value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className={`mt-1.5 w-full rounded-xl border py-2.5 pl-8 pr-3 text-xs outline-none ${input}`} arrowClassName={`left-3 ${isDarkMode ? "text-white/55" : "text-[#68766c]"}`}>
          <option value="" style={{ background: "#fff", color: "#111827" }}>انتخاب کارمند</option>
          {initialEmployees.filter((employee) => employee.status === "active").map((employee) => (
            <option key={employee.id} value={employee.id} style={{ background: "#fff", color: "#111827" }}>
              {employee.fullName} — {employee.role}
            </option>
          ))}
        </ThemedSelect>
      </label>
      <label className="mb-4 block text-xs font-semibold">
        دلیل ارجاع
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className={`mt-1.5 w-full rounded-xl border px-3 py-2.5 text-xs outline-none focus:border-[#15554f] ${input}`} placeholder="علت ارجاع مجدد را بنویسید..." />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={`rounded-xl border px-4 py-2 text-xs ${isDarkMode ? "border-white/10" : "border-[#d5dad4]"}`}>انصراف</button>
        <button
          type="button"
          disabled={!employeeId || !reason.trim()}
          onClick={() => {
            onConfirm(employeeId, reason.trim());
            setEmployeeId("");
            setReason("");
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-[#15554f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#246b61] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <UserRoundCog className="h-4 w-4" />
          ارجاع پرونده
        </button>
      </div>
    </Modal>
  );
}

export function RequestSatisfaction({ request }: { request: AdminRequest }) {
  const { isDarkMode } = useTheme();
  const text = isDarkMode ? "text-white/60" : "text-[#68766c]";
  if (request.group !== "completed" && request.group !== "expired") return null;
  return (
    <section className={`rounded-2xl border p-4 ${isDarkMode ? "border-white/10 bg-[#193632]" : "border-[#d5dad4] bg-white"}`}>
      <h2 className="mb-2 text-sm font-bold">رضایت‌سنجی کاربر</h2>
      {request.satisfaction ? (
        <>
          <p className="text-amber-500" aria-label={`${request.satisfaction.score} از ۵ ستاره`}>
            {"★".repeat(request.satisfaction.score)}{"☆".repeat(5 - request.satisfaction.score)}
            <span className={`mr-2 text-xs ${text}`}>{request.satisfaction.score} از ۵</span>
          </p>
          <p className={`mt-2 text-xs leading-5 ${text}`}>{request.satisfaction.comment}</p>
        </>
      ) : (
        <p className={`text-xs ${text}`}>هنوز ثبت نشده</p>
      )}
    </section>
  );
}
