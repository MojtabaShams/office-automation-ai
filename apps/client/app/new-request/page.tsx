"use client";

import ChatPanel from "../components/ChatPanel";

export default function NewRequestPage() {
  // این صفحه هر بار که باز شود، یک نمونه‌ی تازه از ChatPanel می‌سازد؛
  // یعنی گفتگوی قبلی (در صورت وجود) قطع می‌شود و کاربر می‌تواند
  // گفتگوی جدیدی شروع کند.
  return <ChatPanel />;
}