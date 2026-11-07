"""Administrative endpoints: form authoring, indexing and request review.

Every route requires a specific ``resource:action`` permission (see
``app.core.permissions``) so a custom role can be granted exactly what it needs. Form
definitions are plain JSON objects so non-developers can add a form without touching
Python code.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import db_session, require_admin, require_permission
from app.core.exceptions import NotFound
from app.models.user import User
from app.repositories import form_repo, user_repo
from app.schemas.common import ok
from app.schemas.forms import FormStatusRequest
from app.schemas.submissions import SubmissionStatusRequest
from app.services import form_service, knowledge_service, submission_service

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ------------------------------------------------------------------------- forms
@router.get("/forms")
def list_forms(
    query: str | None = Query(default=None, max_length=200),
    _: User = Depends(require_permission("forms", "view")),
    db: Session = Depends(db_session),
) -> dict:
    """Builder-shaped forms stored in PostgreSQL (drafts and archived excluded)."""
    forms = form_service.list_admin_forms(db, query=query)
    return ok("فهرست فرم‌ها", forms=forms, count=len(forms))


@router.get("/forms/{form_id}")
def get_form(
    form_id: str,
    _: User = Depends(require_permission("forms", "view")),
    db: Session = Depends(db_session),
) -> dict:
    form = form_service.get_admin_form(db, form_id)
    if form is None:
        raise NotFound("فرم یافت نشد.")
    return ok("فرم", form=form)


@router.post("/forms")
def save_form(
    payload: dict[str, Any] = Body(...),
    user: User = Depends(require_permission("forms", "create")),
    db: Session = Depends(db_session),
) -> dict:
    """Create or update a builder form; the raw camelCase schema is stored as-is."""
    form = form_service.save_admin_form(db, payload, actor_id=user.id)
    return ok("فرم ذخیره شد.", form=form)


@router.patch("/forms/{form_id}/status")
def set_form_status(
    form_id: str,
    req: FormStatusRequest,
    _: User = Depends(require_permission("forms", "update")),
    db: Session = Depends(db_session),
) -> dict:
    status = req.status or ("active" if req.active else "inactive")
    form = form_service.set_admin_form_status(db, form_id, status)
    return ok("وضعیت فرم به‌روزرسانی شد.", form=form)


@router.delete("/forms/{form_id}")
def delete_form(
    form_id: str,
    _: User = Depends(require_permission("forms", "delete")),
    db: Session = Depends(db_session),
) -> dict:
    result = form_service.delete_form(db, form_id)
    return ok(result.pop("message", "فرم آرشیو شد."), **result)


# ----------------------------------------------------------------------- syncing
@router.post("/sync/forms")
def sync_forms(
    _: User = Depends(require_permission("forms", "update")),
    db: Session = Depends(db_session),
) -> dict:
    summary = form_service.sync_forms_from_disk(db)
    return ok("فرم‌ها از پوشه forms بازخوانی شدند.", **summary)


@router.post("/sync/knowledge")
def sync_knowledge(
    force: bool = Query(default=False),
    _: User = Depends(require_permission("settings", "update")),
    db: Session = Depends(db_session),
) -> dict:
    summary = knowledge_service.sync_knowledge(db, force=force)
    return ok("پایگاه دانش بازسازی شد.", **summary)


# ------------------------------------------------------------------- submissions
@router.get("/submissions")
def list_submissions(
    status: str | None = Query(default=None, max_length=32),
    form_id: str | None = Query(default=None, max_length=64),
    process_id: str | None = Query(default=None, alias="processId", max_length=64),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(require_permission("requests", "view")),
    db: Session = Depends(db_session),
) -> dict:
    payload = submission_service.list_admin(
        db, status=status, form_id=form_id, process_id=process_id, limit=limit, offset=offset
    )
    return ok("فهرست درخواست‌ها", **payload)


@router.get("/submissions/{submission_id}")
def get_submission(
    submission_id: str,
    _: User = Depends(require_permission("requests", "view")),
    db: Session = Depends(db_session),
) -> dict:
    submission = submission_service.get_admin(db, submission_id)
    return ok("جزئیات درخواست", submission=submission)


@router.delete("/submissions/{submission_id}")
def archive_submission(
    submission_id: str,
    _: User = Depends(require_permission("requests", "delete")),
    db: Session = Depends(db_session),
) -> dict:
    """Archive a request (soft delete): the row and its events stay in the database."""
    submission_service.archive(db, submission_id)
    return ok("درخواست آرشیو شد.", submission_id=submission_id, deleted=True)


@router.patch("/submissions/{submission_id}")
def update_submission(
    submission_id: str,
    req: SubmissionStatusRequest,
    admin: User = Depends(require_permission("requests", "update")),
    db: Session = Depends(db_session),
) -> dict:
    note = req.note or req.notes
    submission = submission_service.update_status(
        db,
        submission_id,
        status=req.status,
        note=note,
        actor_id=admin.id,
    )
    return ok("وضعیت درخواست به‌روزرسانی شد.", submission=submission)


# --------------------------------------------------------------------- overview
@router.get("/overview")
def overview(
    _: User = Depends(require_admin),
    db: Session = Depends(db_session),
) -> dict:
    return ok(
        "نمای کلی سامانه",
        users=user_repo.count_users(db),
        forms=form_repo.count_forms(db),
        submissions=submission_service.list_admin(db, limit=1)["total"],
        knowledge=knowledge_service.stats(db),
    )
