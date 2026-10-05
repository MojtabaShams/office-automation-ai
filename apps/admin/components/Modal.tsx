"use client";

import React from "react";
import { X } from "lucide-react";
import { useTheme } from "../theme-context";

export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidthClass = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidthClass?: string;
}) {
  const { isDarkMode } = useTheme();
  const titleId = React.useId();
  if (!open) return null;

  const t = isDarkMode
    ? {
        panel: "border-white/10 bg-[#17332f] text-white",
        closeBtn: "hover:bg-white/10",
      }
    : {
        panel: "border-[#d5dad4] bg-white text-[#28443d]",
        closeBtn: "hover:bg-[#edf0eb]",
      };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 max-h-[85vh] w-full overflow-y-auto rounded-2xl border p-5 shadow-2xl ${maxWidthClass} ${t.panel}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-base font-bold">{title}</h2>
          <button
            type="button"
            aria-label="بستن"
            onClick={onClose}
            className={`rounded-lg p-1.5 ${t.closeBtn}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}