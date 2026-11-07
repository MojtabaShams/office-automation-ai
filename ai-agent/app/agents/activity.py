"""Behind-the-scenes activity indicators for one chat turn.

The applicant should see that the assistant is actually working (reading the process
tables, searching the knowledge base, querying the web) instead of staring at a silent
composer. Every agent step records a short Persian label here and the chat envelope
returns the collected list next to the reply, so the client can render status chips.

The buffer is a :mod:`contextvars` list: the tools are invoked by LangChain on the same
context, so they can record without receiving any extra parameters.
"""

from __future__ import annotations

import contextvars
from collections.abc import Callable

#: Stable keys the client may map to icons; the label is what is shown to the user.
LABELS: dict[str, str] = {
    "history": "مرور سابقه گفتگو…",
    "db_processes": "جستجوی خدمات در پایگاه داده…",
    "db_process": "بارگذاری اطلاعات خدمت از پایگاه داده…",
    "db_steps": "بارگذاری مراحل خدمت از پایگاه داده…",
    "db_forms": "آماده‌سازی فرم‌های مرحله…",
    "db_submissions": "بررسی درخواست‌های قبلی…",
    "knowledge": "جستجو در پایگاه دانش…",
    "web": "جستجوی اطلاعات عمومی در وب…",
    "models": "مشورت با مدل‌های هوش مصنوعی…",
    "judge": "انتخاب بهترین پاسخ…",
    "prepare": "آماده‌سازی پاسخ…",
    "stepper": "آماده‌سازی فرایند برای تکمیل فرم‌ها…",
    "field_guidelines": "دریافت راهنمای فیلد از پایگاه داده…",
    "slot_filling": "بررسی اطلاعات لازم برای مرخصی…",
    "duration": "محاسبه تعداد روزهای مرخصی…",
    "populate_form": "تکمیل خودکار اطلاعات فرم…",
}

_activities: contextvars.ContextVar[list[dict] | None] = contextvars.ContextVar(
    "agent_activities", default=None
)
_listener: contextvars.ContextVar[Callable[[dict[str, str]], None] | None] = contextvars.ContextVar(
    "agent_activity_listener", default=None
)


def reset() -> None:
    """Start a fresh buffer for the current turn."""
    _activities.set([])


def set_listener(
    listener: Callable[[dict[str, str]], None] | None,
) -> contextvars.Token[Callable[[dict[str, str]], None] | None]:
    """Stream each activity to the current request without changing tool signatures."""
    return _listener.set(listener)


def record(key: str, label: str | None = None) -> None:
    """Append one indicator; repeated keys are ignored so chips never duplicate."""
    buffer = _activities.get()
    if buffer is None:
        buffer = []
        _activities.set(buffer)
    if any(item.get("key") == key for item in buffer):
        return
    text = (label or LABELS.get(key) or "").strip()
    if not text:
        return
    item = {"key": key, "label": text}
    buffer.append(item)
    listener = _listener.get()
    if listener is not None:
        listener(item)


def collected() -> list[dict]:
    """Snapshot of the indicators recorded during this turn."""
    return [dict(item) for item in (_activities.get() or [])]
