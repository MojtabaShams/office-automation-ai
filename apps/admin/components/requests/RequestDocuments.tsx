"use client";

import { useState } from "react";
import { Download, FileImage, Image as ImageIcon, Printer } from "lucide-react";
import { useTheme } from "../../theme-context";
import type { RequestDocument } from "../../app/lib/mock-requests";
import { formatRequestDate } from "../../app/lib/mock-requests";

function printableName(value: string) {
  return value.replace(/[\u0000-\u001f<>]/g, "").slice(0, 180) || "مدرک پرونده";
}

export default function RequestDocuments({ documents }: { documents: RequestDocument[] }) {
  const { isDarkMode } = useTheme();
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printError, setPrintError] = useState("");
  const [imageErrors, setImageErrors] = useState<string[]>([]);

  const printImage = (document: RequestDocument) => {
    if (!document.mimeType.startsWith("image/")) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setPrintError("پنجره چاپ باز نشد؛ اجازه بازشدن پنجره‌های جدید را در مرورگر فعال کنید.");
      return;
    }

    setPrintingId(document.id);
    setPrintError("");
    printWindow.opener = null;

    const style = printWindow.document.createElement("style");
    style.textContent = `
      @page { margin: 12mm; }
      html, body { margin: 0; padding: 0; background: #fff; color: #111; font: 14px sans-serif; }
      main { min-height: 95vh; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 12px; }
      h1 { font-size: 16px; text-align: center; }
      img { max-width: 100%; max-height: 88vh; object-fit: contain; }
      @media print { img { max-height: 260mm; } }
    `;
    const main = printWindow.document.createElement("main");
    const title = printWindow.document.createElement("h1");
    title.textContent = printableName(document.name);
    const image = printWindow.document.createElement("img");
    image.alt = printableName(document.name);
    image.onload = () => {
      printWindow.focus();
      printWindow.print();
      setPrintingId(null);
    };
    image.onerror = () => {
      setPrintingId(null);
      setPrintError(`پیش‌نمایش چاپ «${printableName(document.name)}» بارگذاری نشد.`);
      printWindow.close();
    };
    image.src = document.url;
    main.append(title, image);
    printWindow.document.head.append(style);
    printWindow.document.body.append(main);
  };

  const surface = isDarkMode
    ? "border-white/10 bg-[#193632]"
    : "border-[#d5dad4] bg-white";
  const tile = isDarkMode
    ? "border-white/10 bg-[#122925]/50"
    : "border-[#e6e9e3] bg-[#f6f7f4]";
  const muted = isDarkMode ? "text-white/55" : "text-[#68766c]";

  return (
    <section className={`rounded-2xl border p-4 ${surface}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <FileImage className="h-4 w-4 text-[#15554f]" />
            مدارک بارگذاری‌شده
          </h2>
          <p className={`mt-1 text-[0.68rem] ${muted}`}>تصاویر در قالب‌های پشتیبانی‌شده‌ی مرورگر پیش‌نمایش و چاپ می‌شوند.</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[0.68rem] ${isDarkMode ? "bg-white/[0.06] text-white/65" : "bg-[#edf0eb] text-[#68766c]"}`}>
          {documents.length} فایل
        </span>
      </div>

      {printError && <p role="alert" className="mb-3 text-xs text-rose-600">{printError}</p>}

      {documents.length === 0 ? (
        <div className={`rounded-xl border border-dashed p-5 text-center text-xs ${muted} ${isDarkMode ? "border-white/10" : "border-[#d5dad4]"}`}>
          مدرکی برای این پرونده بارگذاری نشده است.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {documents.map((document) => {
            const isImage = document.mimeType.startsWith("image/");
            const hasPreviewError = imageErrors.includes(document.id);
            return (
              <article key={document.id} className={`min-w-0 overflow-hidden rounded-xl border ${tile}`}>
                {isImage && !hasPreviewError ? (
                  <a
                    href={document.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`باز کردن ${document.name} در پنجره جدید`}
                    className="flex h-40 items-center justify-center overflow-hidden bg-black/[0.03] p-2"
                  >
                    <img
                      src={document.url}
                      alt={`پیش‌نمایش ${document.name}`}
                      className="h-full w-full object-contain"
                      onError={() => setImageErrors((current) => [...current, document.id])}
                    />
                  </a>
                ) : (
                  <div className={`flex h-40 flex-col items-center justify-center gap-2 ${muted}`}>
                    <ImageIcon className="h-9 w-9 opacity-50" />
                    <span className="px-3 text-center text-[0.68rem]">
                      {isImage ? "این قالب تصویر در مرورگر پیش‌نمایش داده نمی‌شود." : "پیش‌نمایش این نوع فایل در این صفحه پشتیبانی نمی‌شود."}
                    </span>
                  </div>
                )}
                <div className="p-3">
                  <p className="truncate text-xs font-semibold" title={document.name}>{document.name}</p>
                  <p className={`mt-1 text-[0.62rem] ${muted}`}>
                    {document.mimeType} · بارگذاری: {formatRequestDate(document.uploadedAt, true)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {isImage && (
                      <button
                        type="button"
                        disabled={printingId === document.id}
                        onClick={() => printImage(document)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#15554f] px-3 py-1.5 text-[0.68rem] font-semibold text-white transition hover:bg-[#246b61] disabled:cursor-wait disabled:opacity-60"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        {printingId === document.id ? "آماده‌سازی چاپ..." : "چاپ"}
                      </button>
                    )}
                    <a
                      href={document.url}
                      download={printableName(document.name)}
                      target="_blank"
                      rel="noreferrer"
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[0.68rem] font-semibold ${isDarkMode ? "border-white/10 text-white/75 hover:bg-white/[0.06]" : "border-[#d5dad4] text-[#40584e] hover:bg-white"}`}
                    >
                      <Download className="h-3.5 w-3.5" />
                      دریافت فایل
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
