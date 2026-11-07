"""User-facing submission endpoints: list, detail and tracking."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import db_session, require_user
from app.models.user import User
from app.repositories import submission_repo
from app.schemas.common import ok
from app.services import submission_service

router = APIRouter(prefix="/api/submissions", tags=["submissions"])


@router.get("")
def list_submissions(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_user),
    db: Session = Depends(db_session),
) -> dict:
    submissions = submission_service.list_for_user(db, user.id, limit=limit, offset=offset)
    return ok(
        "فهرست درخواست‌ها",
        submissions=submissions,
        count=len(submissions),
        total=submission_repo.count_submissions(db, user_id=user.id),
    )


@router.get("/track/{tracking_code}")
def track_submission(
    tracking_code: str,
    user: User = Depends(require_user),
    db: Session = Depends(db_session),
) -> dict:
    submission = submission_service.track(
        db,
        tracking_code,
        user_id=user.id,
        is_admin=user.has_permission("requests", "view"),
    )
    return ok("وضعیت درخواست", submission=submission)


@router.get("/{submission_id}")
def get_submission(
    submission_id: str,
    user: User = Depends(require_user),
    db: Session = Depends(db_session),
) -> dict:
    submission = submission_service.get_for_user(db, submission_id, user.id)
    return ok("جزئیات درخواست", submission=submission)
