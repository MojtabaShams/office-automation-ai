"""Form registry endpoints.

``GET /api/forms`` powers form discovery in the client; ``POST /api/forms/submit`` is the
endpoint ``postFormSubmit()`` already calls and keeps its ``{form_id, values}`` body.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import db_session, require_user
from app.core.exceptions import NotFound
from app.models.user import User
from app.repositories import session_repo
from app.schemas.common import ok
from app.schemas.forms import FormSubmitRequest
from app.services import form_service, submission_service

router = APIRouter(prefix="/api/forms", tags=["forms"])


@router.get("")
def list_forms(
    q: str | None = Query(default=None, max_length=100),
    db: Session = Depends(db_session),
) -> dict:
    forms = form_service.list_forms(db, query=q)
    return ok("فهرست فرم‌های فعال", forms=forms, count=len(forms))


@router.get("/{form_id}")
def get_form(form_id: str, db: Session = Depends(db_session)) -> dict:
    form = form_service.get_form(db, form_id)
    if form is None:
        raise NotFound("فرم موردنظر یافت نشد.")
    return ok("تعریف فرم", form=form)


@router.post("/submit")
def submit_form(
    req: FormSubmitRequest,
    user: User = Depends(require_user),
    db: Session = Depends(db_session),
) -> dict:
    """Validate the submitted values and register a new request."""
    submission = submission_service.submit(db, user=user, form_id=req.form_id, values=req.values)
    if req.session_id:
        # The form was submitted: drop it from the conversation so a restored chat cannot
        # offer the same table again (the daily quota is the second line of defence).
        session_repo.clear_form_references(db, user.id, req.session_id, req.form_id)
    detail = submission_service.to_dict(submission)
    return ok(
        f"درخواست شما با کد پیگیری {submission.tracking_code} ثبت شد.",
        submission_id=submission.id,
        tracking_code=submission.tracking_code,
        submission=detail,
        user_name=user.full_name,
        form_id=submission.form_id,
    )
