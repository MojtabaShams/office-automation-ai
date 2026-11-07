"""Database-backed reporting for the admin panel.

Every number here is derived from PostgreSQL: submissions and their status events,
process cases, the user directory and chat messages. No mock series or hardcoded
KPI values are returned, so the charts always mirror what staff actually see in
``Requests``, ``Processes`` and ``Employees``.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import NotFound, ValidationError
from app.models.base import new_id, utcnow
from app.models.chat import ChatMessage, ChatSession
from app.models.process import ProcessCase, ProcessDefinitionRow
from app.models.report import ReportDefinition
from app.models.submission import Submission, SubmissionEvent
from app.models.user import User

#: Iran has no DST since 2022, so a fixed offset keeps day buckets stable.
TEHRAN_TZ = timezone(timedelta(hours=3, minutes=30))

STATUS_LABELS = {
    "submitted": "ثبت شده",
    "in_review": "در حال بررسی",
    "need_info": "نیاز به اطلاعات بیشتر",
    "approved": "تأیید شده",
    "rejected": "رد شده",
    "canceled": "لغو شده",
}
OPEN_STATUSES = {"submitted", "in_review", "need_info"}
CLOSED_STATUSES = {"approved", "rejected", "canceled"}

CASE_STATUS_LABELS = {"active": "در جریان", "completed": "پایان‌یافته", "expired": "منقضی"}

WEEKDAYS = ("دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه", "یکشنبه")

PIE_COLORS = ("#15554f", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6")

QUICK_REPORT_TITLES = {
    "requests": "آمار درخواست‌ها",
    "employees": "عملکرد کارمندان",
    "processes": "وضعیت پروسه‌ها",
    "messages": "پیام‌های روزانه",
}


# ------------------------------------------------------------------ small helpers
def _tehran_day(value: datetime) -> date:
    return value.astimezone(TEHRAN_TZ).date()


def _window(days: int) -> list[date]:
    today = utcnow().astimezone(TEHRAN_TZ).date()
    return [today - timedelta(days=offset) for offset in range(days - 1, -1, -1)]


def _day_labels(days: list[date]) -> list[str]:
    return [WEEKDAYS[day.weekday()] for day in days]


def _round(value: float) -> float:
    return round(value * 10) / 10


def _percent(part: int, total: int) -> float:
    return _round(part * 100 / total) if total else 0.0


def _submissions(db: Session, *, since: datetime | None = None) -> list[Submission]:
    statement = (
        select(Submission)
        .options(selectinload(Submission.events))
        .where(Submission.is_deleted.is_(False))
        .order_by(Submission.created_at.desc())
    )
    if since is not None:
        statement = statement.where(Submission.created_at >= since)
    return list(db.scalars(statement).all())


def _cases(db: Session) -> list[ProcessCase]:
    return list(
        db.scalars(
            select(ProcessCase)
            .where(ProcessCase.is_deleted.is_(False))
            .order_by(ProcessCase.created_at.desc())
        ).all()
    )


def _series_item(key: str, label: str, color: str, values: list[int]) -> dict:
    return {"key": key, "label": label, "color": color, "values": values}


def _kpi(label: str, value: Any, *, unit: str = "", trend: str = "", up: bool = True) -> dict:
    return {"label": label, "value": value, "unit": unit, "trend": trend, "up": up}


# ------------------------------------------------------------------------ summary
def summary(db: Session) -> dict:
    """Everything the report landing page needs in one round-trip."""
    days = _window(7)
    submissions = _submissions(db)
    cases = _cases(db)
    users = list(db.scalars(select(User).where(User.is_deleted.is_(False))).all())
    processes = list(
        db.scalars(
            select(ProcessDefinitionRow).where(ProcessDefinitionRow.is_deleted.is_(False))
        ).all()
    )
    today = days[-1]
    messages_today = int(
        db.scalar(
            select(func.count())
            .select_from(ChatMessage)
            .where(ChatMessage.created_at >= datetime.combine(today, datetime.min.time(), TEHRAN_TZ))
        )
        or 0
    )

    status_counts: dict[str, int] = defaultdict(int)
    for submission in submissions:
        status_counts[submission.status] += 1
    open_count = sum(status_counts[status] for status in OPEN_STATUSES)
    closed_count = sum(status_counts[status] for status in CLOSED_STATUSES)

    active_cases = [case for case in cases if case.status == "active"]
    now = utcnow()
    overdue = [case for case in active_cases if case.due_at and case.due_at < now]

    opened = [0] * len(days)
    closed = [0] * len(days)
    waiting = [0] * len(days)
    index_of = {day: index for index, day in enumerate(days)}
    for submission in submissions:
        index = index_of.get(_tehran_day(submission.created_at))
        if index is None:
            continue
        opened[index] += 1
        if submission.status in CLOSED_STATUSES:
            closed[index] += 1
        else:
            waiting[index] += 1

    active_employees = [user for user in users if user.is_active and user.role != "applicant"]
    messages_by_role: dict[str, list[int]] = defaultdict(lambda: [0] * len(days))
    chat_rows = db.execute(
        select(ChatMessage.role, ChatMessage.created_at).where(
            ChatMessage.created_at >= datetime.combine(days[0], datetime.min.time(), TEHRAN_TZ)
        )
    ).all()
    for role, created_at in chat_rows:
        index = index_of.get(_tehran_day(created_at))
        if index is not None:
            messages_by_role[str(role)][index] += 1

    return {
        "generated_at": now.isoformat(),
        "kpis": {
            "total_requests": len(submissions),
            "open_requests": open_count,
            "closed_requests": closed_count,
            "overdue_cases": len(overdue),
            "active_cases": len(active_cases),
            "active_processes": len([row for row in processes if row.status == "active"]),
            "active_employees": len(active_employees),
            "messages_today": messages_today,
        },
        "weekly": {
            "labels": _day_labels(days),
            "series": [
                _series_item("opened", "ثبت‌شده", "#15554f", opened),
                _series_item("closed", "بسته‌شده", "#3b82f6", closed),
                _series_item("waiting", "در انتظار", "#f59e0b", waiting),
            ],
        },
        "statusPie": [
            {
                "name": "باز",
                "value": sum(status_counts[s] for s in ("submitted", "in_review")),
                "color": "#15554f",
            },
            {"name": "بسته", "value": closed_count, "color": "#3b82f6"},
            {"name": "در انتظار", "value": status_counts.get("need_info", 0), "color": "#f59e0b"},
        ],
        "messages": {
            "labels": _day_labels(days),
            "series": [
                _series_item("user", "پیام متقاضی", "#15554f", messages_by_role.get("user", [0] * len(days))),
                _series_item("assistant", "پاسخ دستیار", "#8b5cf6", messages_by_role.get("assistant", [0] * len(days))),
            ],
        },
        "quick": {
            "requests": {
                "stat": len(active_cases),
                "statLabel": "پرونده در جریان",
                "series": opened,
            },
            "employees": {
                "stat": len(active_employees),
                "statLabel": "کارمند فعال",
                "series": opened,
            },
            "processes": {
                "stat": len([row for row in processes if row.status == "active"]),
                "statLabel": "پروسه فعال",
                "series": [len([c for c in cases if _tehran_day(c.created_at) == day]) for day in days],
            },
            "messages": {
                "stat": messages_today,
                "statLabel": "پیام امروز",
                "series": [
                    a + b
                    for a, b in zip(
                        messages_by_role.get("user", [0] * len(days)),
                        messages_by_role.get("assistant", [0] * len(days)),
                    )
                ],
            },
        },
    }


# ------------------------------------------------------------------- quick reports
def _requests_report(db: Session) -> dict:
    days = _window(7)
    submissions = _submissions(db)
    cases = _cases(db)
    index_of = {day: index for index, day in enumerate(days)}

    opened = [0] * len(days)
    closed = [0] * len(days)
    waiting = [0] * len(days)
    status_counts: dict[str, int] = defaultdict(int)
    for submission in submissions:
        status_counts[submission.status] += 1
        index = index_of.get(_tehran_day(submission.created_at))
        if index is None:
            continue
        opened[index] += 1
        closed[index] += 1 if submission.status in CLOSED_STATUSES else 0
        waiting[index] += 1 if submission.status in OPEN_STATUSES else 0

    completed = [case for case in cases if case.status == "completed"]
    handling_days = [
        (case.updated_at - case.created_at).total_seconds() / 86_400 for case in completed
    ]
    avg_handling = _round(sum(handling_days) / len(handling_days)) if handling_days else 0.0
    active = [case for case in cases if case.status == "active"]
    now = utcnow()
    overdue = [case for case in active if case.due_at and case.due_at < now]
    total = len(submissions)

    rows = [
        {
            "status": STATUS_LABELS.get(status, status),
            "count": count,
            "percent": _percent(count, total),
        }
        for status, count in sorted(status_counts.items(), key=lambda item: -item[1])
    ]

    return {
        "kpis": [
            _kpi("کل درخواست‌ها", total, unit="درخواست"),
            _kpi("میانگین رسیدگی", avg_handling, unit="روز"),
            _kpi("نرخ تکمیل", _percent(len([s for s in submissions if s.status == "approved"]), total), unit="٪"),
            _kpi("تأخیر بیش از مهلت", len(overdue), unit="پرونده"),
        ],
        "series": {
            "labels": _day_labels(days),
            "series": [
                _series_item("opened", "ثبت‌شده", "#15554f", opened),
                _series_item("closed", "بسته‌شده", "#3b82f6", closed),
                _series_item("waiting", "در انتظار", "#f59e0b", waiting),
            ],
        },
        "pie": {
            "data": [
                {"name": "باز", "value": sum(status_counts[s] for s in OPEN_STATUSES), "color": "#15554f"},
                {"name": "تأییدشده", "value": status_counts.get("approved", 0), "color": "#3b82f6"},
                {"name": "ردشده", "value": status_counts.get("rejected", 0), "color": "#ef4444"},
                {"name": "لغوشده", "value": status_counts.get("canceled", 0), "color": "#8b5cf6"},
            ]
        },
        "table": {
            "columns": [
                {"key": "status", "label": "وضعیت"},
                {"key": "count", "label": "تعداد"},
                {"key": "percent", "label": "درصد"},
            ],
            "rows": rows,
        },
        "note": "همه اعداد از جدول درخواست‌ها و پرونده‌های همین پایگاه داده محاسبه شده‌اند.",
    }


def _employees_report(db: Session) -> dict:
    days = _window(7)
    users = list(db.scalars(select(User).where(User.is_deleted.is_(False))).all())
    submissions = _submissions(db)
    employees = [user for user in users if user.is_active and user.role != "applicant"]
    index_of = {day: index for index, day in enumerate(days)}

    per_day = [0] * len(days)
    for submission in submissions:
        index = index_of.get(_tehran_day(submission.created_at))
        if index is not None:
            per_day[index] += 1

    by_role: dict[str, int] = defaultdict(int)
    for user in users:
        if user.role != "applicant":
            by_role[user.role_name] += 1
    total = sum(by_role.values())

    per_employee = _round(len(submissions) / len(employees)) if employees else 0.0
    return {
        "kpis": [
            _kpi("کارمندان فعال", len(employees), unit="نفر"),
            _kpi("نقش‌های سازمانی", len(by_role), unit="نقش"),
            _kpi("میانگین درخواست هر کارمند", per_employee, unit="درخواست"),
            _kpi("درخواست‌های ثبت‌شده", len(submissions), unit="درخواست"),
        ],
        "series": {
            "labels": _day_labels(days),
            "series": [_series_item("submissions", "درخواست ثبت‌شده", "#3b82f6", per_day)],
        },
        "pie": {
            "data": [
                {"name": name, "value": count, "color": PIE_COLORS[index % len(PIE_COLORS)]}
                for index, (name, count) in enumerate(
                    sorted(by_role.items(), key=lambda item: -item[1])
                )
            ]
        },
        "table": {
            "columns": [
                {"key": "role", "label": "نقش سازمانی"},
                {"key": "users", "label": "تعداد"},
                {"key": "share", "label": "سهم (٪)"},
            ],
            "rows": [
                {"role": name, "users": count, "share": _percent(count, total)}
                for name, count in sorted(by_role.items(), key=lambda item: -item[1])
            ],
        },
        "note": "بر اساس کاربران فعال (به‌جز متقاضیان) و نقش‌های ثبت‌شده در پایگاه داده.",
    }


def _processes_report(db: Session) -> dict:
    days = _window(7)
    cases = _cases(db)
    processes = list(
        db.scalars(
            select(ProcessDefinitionRow).where(ProcessDefinitionRow.is_deleted.is_(False))
        ).all()
    )
    index_of = {day: index for index, day in enumerate(days)}
    started = [0] * len(days)
    completed = [0] * len(days)
    for case in cases:
        index = index_of.get(_tehran_day(case.created_at))
        if index is not None:
            started[index] += 1
        if case.status == "completed":
            index = index_of.get(_tehran_day(case.updated_at))
            if index is not None:
                completed[index] += 1

    case_counts: dict[str, int] = defaultdict(int)
    per_process: dict[str, dict[str, int]] = defaultdict(lambda: {"active": 0, "total": 0})
    for case in cases:
        case_counts[case.status] += 1
        per_process[case.process_id]["total"] += 1
        per_process[case.process_id]["active"] += 1 if case.status == "active" else 0

    active_cases = [case for case in cases if case.status == "active"]
    now = utcnow()
    overdue = [case for case in active_cases if case.due_at and case.due_at < now]

    return {
        "kpis": [
            _kpi("پروسه فعال", len([row for row in processes if row.status == "active"]), unit="پروسه"),
            _kpi("پرونده در جریان", len(active_cases), unit="پرونده"),
            _kpi("پرونده پایان‌یافته", case_counts.get("completed", 0), unit="پرونده"),
            _kpi("تأخیر بیش از مهلت", len(overdue), unit="پرونده"),
        ],
        "series": {
            "labels": _day_labels(days),
            "series": [
                _series_item("started", "پرونده جدید", "#15554f", started),
                _series_item("completed", "پایان‌یافته", "#3b82f6", completed),
            ],
        },
        "pie": {
            "data": [
                {"name": label, "value": case_counts.get(key, 0), "color": PIE_COLORS[index % len(PIE_COLORS)]}
                for index, (key, label) in enumerate(CASE_STATUS_LABELS.items())
            ]
        },
        "table": {
            "columns": [
                {"key": "title", "label": "پروسه"},
                {"key": "department", "label": "واحد"},
                {"key": "status", "label": "وضعیت"},
                {"key": "active", "label": "پرونده در جریان"},
                {"key": "total", "label": "کل پرونده‌ها"},
            ],
            "rows": [
                {
                    "title": row.title,
                    "department": row.department,
                    "status": "فعال" if row.status == "active" else row.status,
                    "active": per_process[row.id]["active"],
                    "total": per_process[row.id]["total"],
                }
                for row in processes
            ],
        },
        "note": "پرونده‌ها از جدول process_cases و تعریف‌ها از process_definitions خوانده می‌شوند.",
    }


def _messages_report(db: Session) -> dict:
    days = _window(7)
    index_of = {day: index for index, day in enumerate(days)}
    rows = db.execute(
        select(ChatMessage.role, ChatMessage.created_at).where(
            ChatMessage.created_at >= datetime.combine(days[0], datetime.min.time(), TEHRAN_TZ)
        )
    ).all()
    user_daily = [0] * len(days)
    assistant_daily = [0] * len(days)
    totals: dict[str, int] = defaultdict(int)
    for role, created_at in rows:
        totals[str(role)] += 1
        index = index_of.get(_tehran_day(created_at))
        if index is None:
            continue
        if str(role) == "user":
            user_daily[index] += 1
        else:
            assistant_daily[index] += 1

    sessions = int(
        db.scalar(
            select(func.count())
            .select_from(ChatSession)
            .where(ChatSession.is_deleted.is_(False))
        )
        or 0
    )
    total_messages = sum(totals.values())
    today_total = user_daily[-1] + assistant_daily[-1]
    avg_per_session = _round(total_messages / sessions) if sessions else 0.0

    return {
        "kpis": [
            _kpi("پیام‌های امروز", today_total, unit="پیام"),
            _kpi("کل پیام‌ها (۷ روز)", total_messages, unit="پیام"),
            _kpi("گفتگوهای فعال", sessions, unit="گفتگو"),
            _kpi("میانگین پیام هر گفتگو", avg_per_session, unit="پیام"),
        ],
        "series": {
            "labels": _day_labels(days),
            "series": [
                _series_item("user", "پیام متقاضی", "#15554f", user_daily),
                _series_item("assistant", "پاسخ دستیار", "#8b5cf6", assistant_daily),
            ],
        },
        "pie": {
            "data": [
                {"name": "متقاضی", "value": totals.get("user", 0), "color": "#15554f"},
                {"name": "دستیار", "value": totals.get("assistant", 0), "color": "#8b5cf6"},
            ]
        },
        "table": {
            "columns": [
                {"key": "date", "label": "روز"},
                {"key": "user", "label": "پیام متقاضی"},
                {"key": "assistant", "label": "پاسخ دستیار"},
            ],
            "rows": [
                {"date": label, "user": user_count, "assistant": assistant_count}
                for label, user_count, assistant_count in zip(
                    _day_labels(days), user_daily, assistant_daily
                )
            ],
        },
        "note": "حجم پیام‌ها از جدول chat_messages در هفت روز گذشته.",
    }


_REPORTS = {
    "requests": _requests_report,
    "employees": _employees_report,
    "processes": _processes_report,
    "messages": _messages_report,
}


def quick_report(db: Session, report_id: str) -> dict:
    builder = _REPORTS.get(report_id)
    if builder is None:
        raise NotFound("گزارش موردنظر یافت نشد.")
    payload = builder(db)
    return {
        "id": report_id,
        "title": QUICK_REPORT_TITLES.get(report_id, report_id),
        "generated_at": utcnow().isoformat(),
        **payload,
    }


# ------------------------------------------------------------------------ entities
_EMPLOYEE_FIELDS = [
    {"id": "fullName", "label": "نام و نام خانوادگی", "type": "text"},
    {"id": "role", "label": "نقش شغلی", "type": "text"},
    {"id": "status", "label": "وضعیت", "type": "select", "options": ["active", "inactive"]},
    {"id": "hireDate", "label": "تاریخ استخدام", "type": "date"},
    {"id": "unit", "label": "واحد سازمانی", "type": "text"},
    {"id": "email", "label": "ایمیل", "type": "text"},
    {"id": "phone", "label": "شماره تماس", "type": "text"},
]

_REQUEST_FIELDS = [
    {"id": "processName", "label": "نوع پروسه", "type": "text"},
    {"id": "group", "label": "وضعیت کلی", "type": "select", "options": ["active", "completed", "expired"]},
    {"id": "statusLabel", "label": "وضعیت", "type": "select"},
    {"id": "subStatus", "label": "زیروضعیت", "type": "text"},
    {"id": "createdAt", "label": "تاریخ ثبت", "type": "date"},
    {"id": "updatedAt", "label": "آخرین تغییر", "type": "date"},
    {"id": "assigneeName", "label": "مسئول فعلی", "type": "text"},
    {"id": "escalated", "label": "اسکالیشن", "type": "boolean"},
    {"id": "title", "label": "عنوان", "type": "text"},
    {"id": "applicantName", "label": "متقاضی", "type": "text"},
]


def _group_of(status: str) -> str:
    if status == "canceled":
        return "expired"
    if status in CLOSED_STATUSES:
        return "completed"
    return "active"


def entities(db: Session) -> dict:
    """Rows and field metadata the report builder can group/aggregate on."""
    users = list(db.scalars(select(User).where(User.is_deleted.is_(False))).all())
    submissions = _submissions(db, since=utcnow() - timedelta(days=180))
    processes = {
        row.id: row.title
        for row in db.scalars(
            select(ProcessDefinitionRow).where(ProcessDefinitionRow.is_deleted.is_(False))
        ).all()
    }

    employee_rows = [
        {
            "id": user.id,
            "fullName": user.full_name,
            "role": user.role_name,
            "status": "active" if user.is_active else "inactive",
            "hireDate": user.created_at.isoformat(),
            "unit": user.unit or "—",
            "email": user.email or "—",
            "phone": user.mobile,
        }
        for user in users
        if user.role != "applicant"
    ]

    request_rows = [
        {
            "id": submission.id,
            "processName": processes.get(submission.process_id or "", "—"),
            "group": _group_of(submission.status),
            "groupLabel": {"active": "در حال رسیدگی", "completed": "تکمیل‌شده", "expired": "بسته‌شده"}[
                _group_of(submission.status)
            ],
            "statusLabel": STATUS_LABELS.get(submission.status, submission.status),
            "subStatus": submission.current_stage_title or "—",
            "createdAt": submission.created_at.isoformat(),
            "updatedAt": submission.updated_at.isoformat(),
            "assigneeName": submission.current_stage_title or "—",
            "escalated": False,
            "title": (submission.form_snapshot or {}).get("title") or "—",
            "applicantName": submission.user_name or "—",
        }
        for submission in submissions
    ]

    return {
        "entities": [
            {"id": "employees", "label": "کارمندان", "fields": _EMPLOYEE_FIELDS, "rows": employee_rows},
            {"id": "requests", "label": "درخواست‌ها / پرونده‌ها", "fields": _REQUEST_FIELDS, "rows": request_rows},
        ]
    }


# -------------------------------------------------------------------------- events
def events(db: Session, *, limit: int = 200) -> list[dict]:
    """A unified audit feed built from the append-only tables that already exist."""
    entries: list[dict] = []

    submission_rows = db.execute(
        select(
            SubmissionEvent.id,
            SubmissionEvent.status,
            SubmissionEvent.note,
            SubmissionEvent.actor_id,
            SubmissionEvent.created_at,
            Submission.tracking_code,
            Submission.user_name,
        )
        .join(Submission, Submission.id == SubmissionEvent.submission_id)
        .where(Submission.is_deleted.is_(False))
        .order_by(SubmissionEvent.created_at.desc())
        .limit(limit)
    ).all()
    for row in submission_rows:
        entries.append(
            {
                "userId": row.actor_id or "system",
                "userName": row.user_name or "متقاضی",
                "action": "CREATE" if row.status == "submitted" else "UPDATE",
                "module": "درخواست‌ها",
                "recordId": row.tracking_code,
                "oldValues": None,
                "newValues": f'{{"status":"{STATUS_LABELS.get(row.status, row.status)}"}}',
                "ipAddress": "—",
                "userAgent": "—",
                "createdAt": row.created_at,
            }
        )

    for case in _cases(db)[:limit]:
        for entry in (case.timeline or [])[-5:]:
            if not isinstance(entry, dict):
                continue
            raw_at = entry.get("at")
            try:
                created_at = datetime.fromisoformat(str(raw_at))
            except (TypeError, ValueError):
                continue
            entries.append(
                {
                    "userId": entry.get("actorId") or "system",
                    "userName": entry.get("actorId") or "سیستم",
                    "action": "UPDATE",
                    "module": "پروسه‌ها",
                    "recordId": case.tracking_code,
                    "oldValues": None,
                    "newValues": str(entry.get("description") or entry.get("action") or ""),
                    "ipAddress": "—",
                    "userAgent": "—",
                    "createdAt": created_at,
                }
            )

    login_rows = db.execute(
        select(User.id, User.full_name, User.last_login_at)
        .where(User.last_login_at.is_not(None), User.is_deleted.is_(False))
        .order_by(User.last_login_at.desc())
        .limit(50)
    ).all()
    for row in login_rows:
        entries.append(
            {
                "userId": row.id,
                "userName": row.full_name,
                "action": "LOGIN",
                "module": "AUTH",
                "recordId": row.id,
                "oldValues": None,
                "newValues": "ورود موفق",
                "ipAddress": "—",
                "userAgent": "—",
                "createdAt": row.last_login_at,
            }
        )

    entries.sort(key=lambda item: item["createdAt"], reverse=True)
    return [
        {
            **entry,
            "id": index + 1,
            "createdAt": entry["createdAt"].isoformat() if entry["createdAt"] else None,
        }
        for index, entry in enumerate(entries[:limit])
    ]


# ------------------------------------------------------------------- saved reports
def definition_to_dict(row: ReportDefinition) -> dict:
    payload = dict(row.definition or {})
    payload.update(
        {
            "id": row.id,
            "title": row.title,
            "description": row.description or "",
            "category": row.category,
            "entityId": row.entity_id,
            "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
        }
    )
    return payload


def list_saved(db: Session) -> list[dict]:
    rows = db.scalars(
        select(ReportDefinition)
        .where(ReportDefinition.is_deleted.is_(False))
        .order_by(ReportDefinition.updated_at.desc())
    ).all()
    return [definition_to_dict(row) for row in rows]


def save_saved(db: Session, payload: dict, actor_id: str | None) -> dict:
    title = str(payload.get("title") or "").strip()
    entity_id = str(payload.get("entityId") or "").strip()
    if not title:
        raise ValidationError("عنوان گزارش الزامی است.")
    if not entity_id:
        raise ValidationError("منبع داده گزارش را انتخاب کنید.")

    report_id = str(payload.get("id") or "").strip() or new_id("rpt")
    row = db.get(ReportDefinition, report_id)
    if row is None:
        row = ReportDefinition(id=report_id, created_by=actor_id)
        db.add(row)
    row.title = title
    row.description = str(payload.get("description") or "")
    row.category = str(payload.get("category") or "عمومی")
    row.entity_id = entity_id
    row.definition = {**payload, "id": report_id}
    # Saving a previously archived report (same id) restores it.
    row.is_deleted = False
    row.deleted_at = None
    db.flush()
    return definition_to_dict(row)


def delete_saved(db: Session, report_id: str) -> None:
    row = db.get(ReportDefinition, report_id)
    if row is None or row.is_deleted:
        raise NotFound("گزارش موردنظر یافت نشد.")
    row.is_deleted = True
    row.deleted_at = utcnow()
    db.flush()
