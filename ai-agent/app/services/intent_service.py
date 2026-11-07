"""Lightweight intent recognition and entity extraction for the AI agent."""

from __future__ import annotations

import re
from datetime import datetime
from math import trunc
from typing import Any

_AUTH_LOGIN_KEYWORDS = (
    "login", "log in", "sign in", "ورود", "وارد", "لاگین", "حساب کاربری",
    "حساب کاربر", "حسابم", "حساب دارم", "چطور وارد", "چطوری وارد",
    "چگونه وارد", "چطور لاگین", "چگونه لاگین", "وارد شوم", "وارد شو",
    "وارد بشم", "وارد شدم", "ورود به", "ورود کنم", "لاگین کنم",
)
_AUTH_REGISTER_KEYWORDS = (
    "register", "sign up", "create account", "ثبت نام", "ثبت‌نام", "عضویت",
    "حساب ندارم", "ثبت نام کنم", "ثبت‌نام کنم", "ثبت نام می‌خواهم",
    "ثبت‌نام می‌خواهم", "ثبت نام کن", "ثبت‌نام کن", "اکانت", "ثبت نام میخوام",
    "ثبت‌نام میخوام", "ساخت حساب", "ایجاد حساب", "ثبت نام کنیم",
)
_LEAVE_KEYWORDS = ("leave", "مرخصی")
_MISSION_KEYWORDS = ("mission", "ماموریت")
_CONSTRUCTION_KEYWORDS = ("construction permit", "building permit", "پروانه", "ساختمان", "ساخت")
_TRACK_KEYWORDS = ("tracking", "track", "پیگیری", "کد پیگیری", "وضعیت درخواست")


def _contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    lowered = text.lower()
    return any(keyword.lower() in lowered for keyword in keywords)


def detect_intent(text: str) -> str:
    if not text:
        return "general"
    if _contains_any(text, _TRACK_KEYWORDS) and re.search(r"\bR[A-Z0-9]{4,}\b", text.upper()):
        return "track"
    if _contains_any(text, _AUTH_REGISTER_KEYWORDS):
        return "auth_register"
    if _contains_any(text, _AUTH_LOGIN_KEYWORDS):
        return "auth_login"
    if _contains_any(text, _CONSTRUCTION_KEYWORDS):
        return "construction_permit"
    if _contains_any(text, _LEAVE_KEYWORDS) or _contains_any(text, _MISSION_KEYWORDS):
        return "leave_request"
    return "general"


def needs_auth(text: str) -> bool:
    return detect_intent(text) in {"auth_login", "auth_register"}


def is_auth_intent(intent: str) -> bool:
    return intent in {"auth_login", "auth_register"}


_DATE_RANGE_PATTERNS = [
    re.compile(r"from\s+(.+?)\s+to\s+(.+)", re.IGNORECASE),
    re.compile(r"از\s+(.+?)\s+تا\s+(.+)"),
    re.compile(r"between\s+(.+?)\s+and\s+(.+)", re.IGNORECASE),
]

_JALALI_MONTHS = {
    "فروردین": 1, "اردیبهشت": 2, "خرداد": 3, "تیر": 4, "مرداد": 5,
    "شهریور": 6, "مهر": 7, "آبان": 8, "آذر": 9, "دی": 10,
    "بهمن": 11, "اسفند": 12,
    "farvardin": 1, "ordibehesht": 2, "khordad": 3,
    "tir": 4, "mordad": 5, "shahrivar": 6, "mehr": 7, "aban": 8,
    "azar": 9, "dey": 10, "bahman": 11, "esfand": 12,
}


def _ascii_digits(text: str) -> str:
    return (
        text.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789"))
        .translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789"))
    )


_JALALI_BREAKS = (
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060,
    2097, 2192, 2262, 2324, 2394, 2456, 3178,
)


def _div(value: int, divisor: int) -> int:
    return trunc(value / divisor)


def _jalaali_cal(year: int) -> tuple[int, int, int]:
    """Return leap status, Gregorian year, and Nowruz day for a Jalali year."""
    gy = year + 621
    leap_j = -14
    previous_break = _JALALI_BREAKS[0]
    jump = 0
    for next_break in _JALALI_BREAKS[1:]:
        jump = next_break - previous_break
        if year < next_break:
            break
        leap_j += _div(jump, 33) * 8 + _div(jump % 33, 4)
        previous_break = next_break

    n = year - previous_break
    leap_j += _div(n, 33) * 8 + _div((n % 33) + 3, 4)
    if jump % 33 == 4 and jump - n == 4:
        leap_j += 1

    leap_g = trunc(gy / 4) - trunc((trunc(gy / 100) + 1) * 3 / 4) - 150
    march = 20 + leap_j - leap_g
    if jump - n < 6:
        n = n - jump + _div(jump + 4, 33) * 33
    leap = ((n + 1) % 33) % 4
    return leap, gy, march


def _gregorian_day_number(year: int, month: int, day: int) -> int:
    value = _div((year + _div(month - 8, 6) + 100100) * 1461, 4)
    value += _div(153 * ((month + 9) % 12) + 2, 5) + day - 34840408
    return value - _div(_div(year + 100100 + _div(month - 8, 6), 100) * 3, 4) + 752


def _day_number_to_gregorian(day_number: int) -> tuple[int, int, int]:
    value = 4 * day_number + 139361631
    value += _div(_div(4 * day_number + 183187720, 146097) * 3, 4) * 4 - 3908
    month_day = _div(value % 1461, 4) * 5 + 308
    day = _div(month_day % 153, 5) + 1
    month = (_div(month_day, 153) % 12) + 1
    year = _div(value, 1461) - 100100 + _div(8 - month, 6)
    return year, month, day


def _jalali_day_number(year: int, month: int, day: int) -> int:
    _, gregorian_year, march = _jalaali_cal(year)
    return (
        _gregorian_day_number(gregorian_year, 3, march)
        + (month - 1) * 31
        - _div(month, 7) * (month - 7)
        + day
        - 1
    )


def _gregorian_to_jalali(year: int, month: int, day: int) -> tuple[int, int, int]:
    day_number = _gregorian_day_number(year, month, day)
    jalali_year = year - 621
    leap, _, march = _jalaali_cal(jalali_year)
    remaining = day_number - _gregorian_day_number(year, 3, march)
    if remaining >= 0:
        if remaining <= 185:
            return jalali_year, 1 + _div(remaining, 31), (remaining % 31) + 1
        remaining -= 186
    else:
        jalali_year -= 1
        remaining += 179
        if leap == 1:
            remaining += 1
    month = 7 + _div(remaining, 30)
    day = (remaining % 30) + 1
    return jalali_year, month, day


def _jalali_to_gregorian(year: int, month: int, day: int) -> str | None:
    if month < 1 or month > 12 or day < 1:
        return None
    leap, _, _ = _jalaali_cal(year)
    month_days = 31 if month <= 6 else 30 if month <= 11 else (30 if leap == 0 else 29)
    if day > month_days:
        return None
    gregorian_year, gregorian_month, gregorian_day = _day_number_to_gregorian(
        _jalali_day_number(year, month, day)
    )
    try:
        gregorian = datetime(gregorian_year, gregorian_month, gregorian_day)
    except ValueError:
        return None
    return gregorian.strftime("%Y-%m-%d")


def _current_jalali_year() -> int:
    now = datetime.now()
    return _gregorian_to_jalali(now.year, now.month, now.day)[0]


def _parse_jalali_date(value: str, default_year: int) -> tuple[tuple[int, int, int] | None, bool]:
    value = _ascii_digits(value.strip()).replace("ـ", "").replace("\u200c", " ")
    numeric = re.search(r"(?<!\d)(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?!\d)", value)
    if numeric:
        year, month, day = (int(part) for part in numeric.groups())
        if year >= 1700:
            try:
                date = datetime(year, month, day)
            except ValueError:
                return None, True
            year, month, day = _gregorian_to_jalali(date.year, date.month, date.day)
        if _jalali_to_gregorian(year, month, day) is None:
            return None, True
        return (year, month, day), True

    month_pattern = "|".join(
        sorted((re.escape(name) for name in _JALALI_MONTHS), key=len, reverse=True)
    )
    textual = re.search(
        rf"(?<!\d)(\d{{1,2}})\s*({month_pattern})\s*(?:ماه)?"
        r"(?:\s*(?:سال)?\s*(\d{4}))?",
        value,
        re.IGNORECASE,
    )
    if not textual:
        return None, False
    day = int(textual.group(1))
    month = _JALALI_MONTHS.get(textual.group(2).lower())
    year_text = textual.group(3)
    year = int(year_text) if year_text else default_year
    if month is None or _jalali_to_gregorian(year, month, day) is None:
        return None, bool(year_text)
    return (year, month, day), bool(year_text)


def _format_jalali_date(value: tuple[int, int, int]) -> str:
    return f"{value[0]:04d}/{value[1]:02d}/{value[2]:02d}"


def _split_range(text: str):
    for pattern in _DATE_RANGE_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(1).strip(" .,،"), match.group(2).strip(" .,،")
    return None, None


def extract_entities(text: str) -> dict[str, Any]:
    entities: dict[str, Any] = {}
    if not text:
        return entities
    if _contains_any(text, _MISSION_KEYWORDS):
        entities["leave_type"] = "ماموریت"
    elif _contains_any(text, _LEAVE_KEYWORDS):
        entities["leave_type"] = "مرخصی"
    start_text, end_text = _split_range(text)
    default_year = _current_jalali_year()
    end_date, end_has_year = _parse_jalali_date(end_text or "", default_year)
    if start_text and end_date and re.fullmatch(r"\s*\d{1,2}\s*", _ascii_digits(start_text)):
        start_day = int(_ascii_digits(start_text).strip())
        if _jalali_to_gregorian(end_date[0], end_date[1], start_day) is not None:
            start_date = (end_date[0], end_date[1], start_day)
            start_has_year = end_has_year
        else:
            start_date, start_has_year = None, False
    else:
        start_date, start_has_year = _parse_jalali_date(start_text or "", default_year)
    if start_date and end_date:
        if start_has_year and not end_has_year:
            end_date = (start_date[0], end_date[1], end_date[2])
        elif end_has_year and not start_has_year:
            start_date = (end_date[0], start_date[1], start_date[2])
        elif not start_has_year and not end_has_year:
            if end_date[1:] < start_date[1:]:
                end_date = (end_date[0] + 1, end_date[1], end_date[2])

        if end_date < start_date:
            start_date = None
            end_date = None

    if start_date:
        entities["start_date"] = _format_jalali_date(start_date)
    if end_date:
        entities["end_date"] = _format_jalali_date(end_date)
    if start_date and end_date:
        try:
            start_day = datetime.strptime(_jalali_to_gregorian(*start_date) or "", "%Y-%m-%d")
            end_day = datetime.strptime(_jalali_to_gregorian(*end_date) or "", "%Y-%m-%d")
            entities["duration_days"] = (end_day - start_day).days + 1
        except ValueError:
            pass
    duration_match = re.search(
        r"(\d+)\s*(?:روز(?:ه)?|day(?:s)?)", _ascii_digits(text), re.IGNORECASE
    )
    if duration_match and not (start_date and end_date):
        entities["duration_days"] = int(duration_match.group(1))
    code_match = re.search(r"\b(R[A-Z0-9]{4,})\b", text.upper())
    if code_match:
        entities["tracking_code"] = code_match.group(1)
    name_match = re.search(r"(?:for|برای)\s+([A-Za-z\u0600-\u06FF ]{2,40})", text)
    if name_match:
        entities["applicant_name"] = name_match.group(1).strip()
    return entities


def user_context(user: Any) -> dict[str, Any]:
    if user is None:
        return {}
    return {
        "full_name": getattr(user, "full_name", None),
        "applicant_name": getattr(user, "full_name", None),
        "employee_name": getattr(user, "full_name", None),
        "employee_id": getattr(user, "national_id", None),
        "department": getattr(user, "unit", None),
        "mobile": getattr(user, "mobile", None),
    }


def get_user_profile(db: Any, user_id: str | None) -> dict[str, Any]:
    """Resolve the authenticated applicant's profile fields from the database."""
    if not db or not user_id:
        return {}
    from app.models.user import User

    user = db.get(User, user_id)
    return user_context(user)


def user_context_from_db(db: Any, user_id: str | None) -> dict[str, Any]:
    return get_user_profile(db, user_id)


_FIELD_ALIASES = {
    "applicant_name": ("applicant_name", "full_name", "name", "owner_name", "employee_name"),
    "start_date": ("start_date", "startDate", "from_date", "leave_start"),
    "end_date": ("end_date", "endDate", "to_date", "leave_end"),
    "duration_days": ("duration_days", "durationDays", "days", "leave_days", "duration"),
    "leave_type": ("leave_type", "leaveType", "type", "request_type"),
    "employee_id": ("employee_id", "employeeId", "national_id"),
    "department": ("department", "unit", "department_name"),
}


def build_prefill(form_id: str, entities: dict[str, Any], user_ctx: dict[str, Any] | None = None) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    if user_ctx:
        merged.update({k: v for k, v in user_ctx.items() if v is not None})
    if entities:
        merged.update({k: v for k, v in entities.items() if v is not None})
    return merged


def prefill_form(form_id: str, entities: dict[str, Any], user_ctx: dict[str, Any] | None = None) -> dict[str, Any]:
    return build_prefill(form_id, entities, user_ctx)


def prefill_values(form_id: str, entities: dict[str, Any], user_ctx: dict[str, Any] | None = None) -> dict[str, Any]:
    return build_prefill(form_id, entities, user_ctx)


def map_prefill_to_fields(fields: list, prefill: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    flat: list = []

    def collect(items):
        for item in items or []:
            if isinstance(item, dict) and item.get("type") in {"section", "group"}:
                collect(item.get("subFields") or [])
            else:
                flat.append(item)

    collect(fields)
    for field in flat:
        if not isinstance(field, dict):
            continue
        name = field.get("name") or field.get("id")
        if not name:
            continue
        for canonical, aliases in _FIELD_ALIASES.items():
            if name in aliases or name.lower() in {a.lower() for a in aliases}:
                if canonical in prefill and prefill[canonical] is not None:
                    result[name] = prefill[canonical]
    return result


def auth_suggestion_text() -> str:
    return (
        "برای ادامه باید وارد حساب کاربری شوید. "
        "آیا فرم ورود یا ثبت‌نام را برایتان باز کنم؟"
    )
