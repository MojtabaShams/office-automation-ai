from __future__ import annotations

import secrets
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.base import utcnow
from app.models.submission import Submission, SubmissionEvent


def generate_tracking_code() -> str:
    """Human-friendly tracking code, e.g. ``R9F2C4A1``."""
    return "R" + secrets.token_hex(4).upper()


def create_submission(
    db: Session,
    *,
    form_id: str | None,
    user_id: str,
    user_name: str | None,
    values: dict,
    form_snapshot: dict | None,
    status: str = "submitted",
    process_id: str | None = None,
    process_case_id: str | None = None,
    current_stage_id: str | None = None,
    current_stage_title: str | None = None,
    step_index: int | None = None,
    step_count: int | None = None,
    note: str = "ثبت اولیه درخواست",
) -> Submission:
    # Retry a couple of times in the unlikely event of a tracking-code collision.
    for _ in range(5):
        submission = Submission(
            tracking_code=generate_tracking_code(),
            form_id=form_id,
            user_id=user_id,
            user_name=user_name,
            values=values,
            form_snapshot=form_snapshot,
            status=status,
            process_id=process_id,
            process_case_id=process_case_id,
            current_stage_id=current_stage_id,
            current_stage_title=current_stage_title,
            step_index=step_index,
            step_count=step_count,
        )
        db.add(submission)
        try:
            db.flush()
            db.add(SubmissionEvent(submission_id=submission.id, status=status, note=note))
            db.commit()
            db.refresh(submission)
            return submission
        except Exception:
            db.rollback()
    raise RuntimeError("ایجاد کد پیگیری ممکن نشد؛ دوباره تلاش کنید.")


def get_submission(db: Session, submission_id: str) -> Submission | None:
    return db.scalar(
        select(Submission)
        .options(selectinload(Submission.events))
        .where(Submission.id == submission_id, Submission.is_deleted.is_(False))
    )


def get_by_tracking_code(db: Session, tracking_code: str) -> Submission | None:
    return db.scalar(
        select(Submission)
        .options(selectinload(Submission.events))
        .where(
            Submission.tracking_code == tracking_code.strip().upper(),
            Submission.is_deleted.is_(False),
        )
    )


def list_submissions(
    db: Session,
    *,
    user_id: str | None = None,
    status: str | None = None,
    form_id: str | None = None,
    process_id: str | None = None,
    process_case_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> Sequence[Submission]:
    stmt = (
        select(Submission)
        .options(selectinload(Submission.events))
        .where(Submission.is_deleted.is_(False))
    )
    if user_id:
        stmt = stmt.where(Submission.user_id == user_id)
    if status:
        stmt = stmt.where(Submission.status == status)
    if form_id:
        stmt = stmt.where(Submission.form_id == form_id)
    if process_id:
        stmt = stmt.where(Submission.process_id == process_id)
    if process_case_id:
        stmt = stmt.where(Submission.process_case_id == process_case_id)
    return list(db.scalars(stmt.order_by(Submission.created_at.desc()).limit(limit).offset(offset)))


def count_submissions(
    db: Session, *, user_id: str | None = None, status: str | None = None
) -> int:
    stmt = select(func.count()).select_from(Submission).where(Submission.is_deleted.is_(False))
    if user_id:
        stmt = stmt.where(Submission.user_id == user_id)
    if status:
        stmt = stmt.where(Submission.status == status)
    return int(db.scalar(stmt) or 0)


def count_submissions_between(
    db: Session, *, user_id: str, start: datetime, end: datetime
) -> int:
    """Requests created in the ``[start, end)`` window (used for the daily quota)."""
    stmt = (
        select(func.count())
        .select_from(Submission)
        .where(
            Submission.user_id == user_id,
            Submission.is_deleted.is_(False),
            Submission.created_at >= start,
            Submission.created_at < end,
        )
    )
    return int(db.scalar(stmt) or 0)


def update_status(
    db: Session, submission: Submission, *, status: str, note: str | None, actor_id: str | None
) -> Submission:
    submission.status = status
    if note:
        submission.notes = note
    db.add(SubmissionEvent(submission_id=submission.id, status=status, note=note, actor_id=actor_id))
    db.commit()
    db.refresh(submission)
    return submission


def soft_delete(db: Session, submission: Submission) -> Submission:
    """Hide a request without losing its audit trail (the only delete path)."""
    submission.is_deleted = True
    submission.deleted_at = utcnow()
    db.add(
        SubmissionEvent(
            submission_id=submission.id, status=submission.status, note="آرشیو درخواست"
        )
    )
    db.commit()
    db.refresh(submission)
    return submission
