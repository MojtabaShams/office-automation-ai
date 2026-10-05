"use client";

import React from "react";
import Modal from "./Modal";
import { useTheme } from "../theme-context";

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "تأیید",
  cancelLabel = "انصراف",
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { isDarkMode } = useTheme();
  const t = isDarkMode
    ? { sub: "text-white/60", cancel: "border-white/15 text-white/70 hover:bg-white/10" }
    : { sub: "text-[#68766c]", cancel: "border-[#d5dad4] text-[#40584e] hover:bg-[#edf0eb]" };

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidthClass="max-w-sm">
      <p className={`mb-5 text-sm leading-6 ${t.sub}`}>{message}</p>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className={`rounded-full border px-4 py-1.5 text-xs ${t.cancel}`}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={`rounded-full px-4 py-1.5 text-xs text-white ${
            danger ? "bg-[#cb5967] hover:bg-[#b94957]" : "bg-[#15554f] hover:bg-[#246b61]"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}