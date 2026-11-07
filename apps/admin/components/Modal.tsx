"use client";

import React from "react";
import { X } from "lucide-react";
import { useTheme } from "../theme-context";

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidthClass = "max-w-lg",
  fullScreen = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Fixed action bar at the bottom; only used when ``fullScreen`` is false. */
  footer?: React.ReactNode;
  maxWidthClass?: string;
  fullScreen?: boolean;
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-3">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-10 flex w-full flex-col overflow-hidden rounded-none border shadow-2xl sm:rounded-2xl ${
          fullScreen
            ? "h-[100dvh] max-h-[100dvh] max-w-none sm:h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-1.5rem)]"
            : `max-h-[85vh] ${maxWidthClass}`
        } ${t.panel}`}
        dir="rtl"
      >
        <div
          className={`flex shrink-0 items-center justify-between border-b ${
            fullScreen ? "px-4 py-3 sm:px-5" : "px-5 py-3.5"
          } ${isDarkMode ? "border-white/10" : "border-[#e1e6df]"}`}
        >
          <h2 id={titleId} className="text-base font-bold">
            {title}
          </h2>
          <button
            type="button"
            aria-label="بستن"
            onClick={onClose}
            className={`rounded-lg p-1.5 ${t.closeBtn}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {fullScreen ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-0 pt-3 sm:px-5">
            {children}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        )}
        {footer && !fullScreen && (
          <div
            className={`shrink-0 border-t px-5 py-3.5 ${isDarkMode ? "border-white/10" : "border-[#e1e6df]"}`}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}