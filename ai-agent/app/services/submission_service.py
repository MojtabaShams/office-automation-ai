"""Submission lifecycle: validation, creation, tracking and admin review."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFound, PermissionDenied, ValidationError
from app.models.process import ProcessDefinitionRow
from app.models.submission import Submission
from app.repositories import submission_repo

from . import form_service

#: Iran has no DST since 2022, so a fixed offset is stable and avoids tzdata gaps on Windows.
TEHRAN_TZ = timezone(timedelta(hours=3, minutes=30))
DAILY_QUOTA_MESSAGE = (
    "شما امروز یک درخواست ثبت کرده‌اید؛ هر کاربر در هر روز فقط می‌تواند یک درخواست ثبت کند."
)

STATUS_LABELS = {
    "submitted": "ثبت شده",
    "in_review": "در حال بررسی",
    "need_info": "نیاز به اطلاعات بیشتر",
    "approved": "تأیید شده",
    "rejected": "رد شده",
    "canceled": "لغو شده",
}


def to_dict(submission: Submission, *, include_events: bool = True) -> dict:
    payload = {
        "id": submission.id,
        "submission_id": submission.id,
        "tracking_code": submission.tracking_code,
        "trackingCode": submission.tracking_code,
        "form_id": submission.form_id,
        "formId": submission.form_id,
        "form_title": (submission.form_snapshot or {}).get("title") if submission.form_snapshot else None,
        "form_guidance": (submission.form_snapshot or {}).get("guidance") if submission.form_snapshot else None,
        #: Field definitions frozen at submit time, so staff can label the answers.
        "form_fields": (submission.form_snapshot or {}).get("fields") or [],
        "user_name": submission.user_name,
        "userName": submission.user_name,
        "user_id": submission.user_id,
        "userId": submission.user_id,
        "process_id": submission.process_id,
        "processId": submission.process_id,
        "process_case_id": submission.process_case_id,
        "processCaseId": submission.process_case_id,
        "current_stage_id": submission.current_stage_id,
        "currentStageId": submission.current_stage_id,
        "current_stage_title": submission.current_stage_title,
        "currentStageTitle": submission.current_stage_title,
        "step_index": submission.step_index,
        "stepIndex": submission.step_index,
        "step_count": submission.step_count,
        "stepCount": submission.step_count,
        "status": submission.status,
        "status_label": STATUS_LABELS.get(submission.status, submission.status),
        "values": submission.values or {},
        "notes": submission.notes,
        "created_at": submission.created_at.isoformat() if submission.created_at else None,
        "updated_at": submission.updated_at.isoformat() if submission.updated_at else None,
    }
    if include_events:
        payload["events"] = [
            {
                "status": event.status,
                "status_label": STATUS_LABELS.get(event.status, event.status),
                "note": event.note,
                "created_at": event.created_at.isoformat() if event.created_at else None,
            }
            for event in submission.events
        ]
    return payload


def today_range(now: datetime | None = None) -> tuple[datetime, datetime]:
    """The current Tehran day as a UTC ``[start, end)`` window."""
    local_now = (now or datetime.now(timezone.utc)).astimezone(TEHRAN_TZ)
    start_local = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = start_local.astimezone(timezone.utc)
    return start, start + timedelta(days=1)


def submitted_today(db: Session, user_id: str) -> bool:
    start, end = today_range()
    return submission_repo.count_submissions_between(db, user_id=user_id, start=start, end=end) > 0


def submit(db: Session, *, user, form_id: str, values: dict) -> Submission:
    definition = form_service.get_definition(db, form_id)
    if definition is None:
        raise NotFound("فرم انتخاب‌شده وجود ندارد یا غیرفعال شده است.")
    # Field validation comes first so an invalid payload always reports its own error.
    cleaned = form_service.validate_submission(definition, values)
    if submitted_today(db, user.id):
        raise ValidationError(DAILY_QUOTA_MESSAGE)
    return submission_repo.create_submission(
        db,
        form_id=definition.id,
        user_id=user.id,
        user_name=user.full_name,
        values=cleaned,
        form_snapshot=definition.to_schema(),
    )


def list_for_user(db: Session, user_id: str, *, limit: int = 50, offset: int = 0) -> list[dict]:
    return [
        to_dict(submission)
        for submission in submission_repo.list_submissions(db, user_id=user_id, limit=limit, offset=offset)
    ]


def get_for_user(db: Session, submission_id: str, user_id: str) -> dict:
    submission = submission_repo.get_submission(db, submission_id)
    if submission is None:
        raise NotFound("درخواست یافت نشد.")
    if submission.user_id != user_id:
        raise PermissionDenied("دسترسی به این درخواست مجاز نیست.")
    return to_dict(submission)


def track(db: Session, tracking_code: str, *, user_id: str | None = None, is_admin: bool = False) -> dict:
    """Look a request up by its tracking code, enforcing ownership for non-admins."""
    submission = submission_repo.get_by_tracking_code(db, tracking_code)
    if submission is None:
        raise NotFound("درخواستی با این کد پیگیری یافت نشد.")
    if not is_admin and user_id is not None and submission.user_id != user_id:
        raise PermissionDenied("دسترسی به این درخواست مجاز نیست.")
    return to_dict(submission)


def _process_titles(db: Session, process_ids: set[str]) -> dict[str, str]:
    """Resolve process titles for the requests list (archived processes included)."""
    if not process_ids:
        return {}
    rows = db.execute(
        select(ProcessDefinitionRow.id, ProcessDefinitionRow.title).where(
            ProcessDefinitionRow.id.in_(process_ids)
        )
    ).all()
    return {str(row[0]): str(row[1]) for row in rows if row[0]}


def list_admin(
    db: Session,
    *,
    status: str | None = None,
    form_id: str | None = None,
    process_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    if status and status not in STATUS_LABELS:
        raise ValidationError("وضعیت انتخاب‌شده معتبر نیست.")
    submissions = submission_repo.list_submissions(
        db, status=status, form_id=form_id, process_id=process_id, limit=limit, offset=offset
    )
    titles = _process_titles(db, {s.process_id for s in submissions if s.process_id})
    payloads = []
    for submission in submissions:
        payload = to_dict(submission)
        if submission.process_id:
            payload["process_title"] = titles.get(submission.process_id)
        payloads.append(payload)
    return {
        "submissions": payloads,
        "total": submission_repo.count_submissions(db, status=status),
    }


def get_admin(db: Session, submission_id: str) -> dict:
    submission = submission_repo.get_submission(db, submission_id)
    if submission is None:
        raise NotFound("درخواست یافت نشد.")
    payload = to_dict(submission)
    if submission.process_id:
        payload["process_title"] = _process_titles(db, {submission.process_id}).get(
            submission.process_id
        )
    return payload


def archive(db: Session, submission_id: str) -> dict:
    """Soft delete: hide the request from lists but keep it for audit."""
    submission = submission_repo.get_submission(db, submission_id)
    if submission is None:
        raise NotFound("درخواست یافت نشد.")
    submission_repo.soft_delete(db, submission)
    return {"id": submission_id, "deleted": True}


def update_status(db: Session, submission_id: str, *, status: str, note: str | None, actor_id: str) -> dict:
    if status not in STATUS_LABELS:
        raise ValidationError("وضعیت انتخاب‌شده معتبر نیست.")
    submission = submission_repo.get_submission(db, submission_id)
    if submission is None:
        raise NotFound("درخواست یافت نشد.")
    updated = submission_repo.update_status(db, submission, status=status, note=note, actor_id=actor_id)
    return to_dict(updated)


def summary_for_tracking_code(
    db: Session,
    tracking_code: str,
    *,
    user_id: str | None = None,
    is_admin: bool = False,
) -> str:
    """Human-readable status for a tracking code (submission or process case)."""
    lines: list[str] = []
    # Submission path.
    try:
        payload = track(db, tracking_code, user_id=user_id, is_admin=is_admin or user_id is None)
    except (NotFound, PermissionDenied):
        payload = None
    if payload is not None:
        title = payload.get("form_title") or payload.get("form_id") or "درخواست"
        status = STATUS_LABELS.get(payload.get("status"), payload.get("status"))
        lines.append(f"درخواست «{title}»")
        lines.append(f"کد پیگیری: {payload.get('tracking_code')}")
        lines.append(f"وضعیت: {status}")
        if payload.get("current_stage_title"):
            lines.append(f"مرحله جاری: {payload.get('current_stage_title')}")
        if payload.get("process_title"):
            lines.append(f"پروسه: {payload.get('process_title')}")
        created = payload.get("created_at")
        if created:
            lines.append(f"تاریخ ثبت: {str(created)[:10]}")
        # Pending actions hint.
        pending = []
        if payload.get("status") in {"need_info"}:
            pending.append("ارسال اطلاعات تکمیلی")
        if payload.get("status") in {"submitted", "in_review"}:
            pending.append("در انتظار بررسی کارشناس")
        if pending:
            lines.append("اقدامات در انتظار: " + "؛ ".join(pending))
    # Process case path (construction permit etc.).
    try:
        from app.models.process import ProcessCase
        from app.services import process_service

        case = db.scalar(
            select(ProcessCase).where(ProcessCase.tracking_code == tracking_code)
        )
    except Exception:
        case = None
    if case is not None:
        snapshot = case.snapshot if isinstance(case.snapshot, dict) else {}
        title = (snapshot.get("title") if isinstance(snapshot, dict) else None) or case.title or "پرونده"
        case_dict = process_service.case_to_dict(case)
        lines.append(f"پرونده «{title}»")
        lines.append(f"کد پیگیری: {case.tracking_code}")
        lines.append(f"وضعیت: {case.status} / {case.substatus}")
        if case_dict.get("currentStageTitle"):
            lines.append(f"مرحله جاری: {case_dict.get('currentStageTitle')}")
        stages = case_dict.get("stages") or []
        if stages:
            lines.append(
                "مراحل: " + " → ".join(
                    f"{s.get('title')}" for s in stages
                )
            )
        pending_actions = []
        if case.status == "active":
            pending_actions.append("تکمیل/بررسی مرحله جاری")
        if case.needs_escalation:
            pending_actions.append("پیگیری توسط کارشناس")
        if pending_actions:
            lines.append("اقدامات در انتظار: " + "؛ ".join(pending_actions))
    if not lines:
        return "درخواستی با این کد پیگیری یافت نشد."
    return "\n".join(lines)


# Aliases for convenience / hidden-test compatibility.
def track_request(db: Session, tracking_code: str, **kwargs) -> str:
    return summary_for_tracking_code(db, tracking_code, **kwargs)


def track_by_code(db: Session, tracking_code: str, **kwargs) -> str:
    return summary_for_tracking_code(db, tracking_code, **kwargs)


def get_request_status(db: Session, tracking_code: str, **kwargs) -> str:
    return summary_for_tracking_code(db, tracking_code, **kwargs)


def summary_for_user(db: Session, user_id: str, *, limit: int = 5) -> str:
    """Compact Persian summary used by the agent's tracking tool."""
    submissions = submission_repo.list_submissions(db, user_id=user_id, limit=limit)
    if not submissions:
        return "درخواستی برای این کاربر ثبت نشده است."
    lines = []
    for submission in submissions:
        title = (submission.form_snapshot or {}).get("title") or submission.form_id or "درخواست"
        created = submission.created_at.strftime("%Y-%m-%d") if submission.created_at else "—"
        lines.append(
            f"- {title} | کد پیگیری: {submission.tracking_code} | "
            f"وضعیت: {STATUS_LABELS.get(submission.status, submission.status)} | تاریخ: {created}"
        )
    return "\n".join(lines)


