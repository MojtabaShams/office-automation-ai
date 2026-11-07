"""Reference documents attached to a form definition (H5).

Endpoints live next to the public forms router but require an admin session. Upload
accepts PDF / DOCX / plain text / images; extraction runs in the background and the
admin can poll ``/text`` or trigger ``/suggest-rules`` once text is available.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.dependencies import db_session, require_permission
from app.core.exceptions import NotFound
from app.models.user import User
from app.schemas.common import ok
from app.services import document_service

router = APIRouter(prefix="/api/forms", tags=["form-documents"])


@router.post("/{form_id}/documents")
def upload_document(
    form_id: str,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    user: User = Depends(require_permission("forms", "update")),
    db: Session = Depends(db_session),
) -> dict:
    document = document_service.create_document(db, form_id=form_id, upload=file, actor_id=user.id)
    db.commit()
    background.add_task(document_service.process_document, document.id)
    return ok(
        "سند بارگذاری شد؛ استخراج متن در پس‌زمینه انجام می‌شود.",
        document=document_service.document_to_dict(document),
    )


@router.get("/{form_id}/documents")
def list_documents(
    form_id: str,
    _: User = Depends(require_permission("forms", "view")),
    db: Session = Depends(db_session),
) -> dict:
    documents = document_service.list_documents(db, form_id)
    return ok("فهرست اسناد مرجع", documents=documents, count=len(documents))


@router.get("/{form_id}/documents/{document_id}/download")
def download_document(
    form_id: str,
    document_id: str,
    _: User = Depends(require_permission("forms", "view")),
    db: Session = Depends(db_session),
) -> FileResponse:
    document = document_service.get_document(db, form_id, document_id)
    path = Path(document.storage_key)
    if not path.exists():
        raise NotFound("فایل سند روی سرور پیدا نشد.")
    return FileResponse(
        path,
        media_type=document.mime_type,
        filename=document.file_name,
    )


@router.get("/{form_id}/documents/{document_id}/text")
def document_text(
    form_id: str,
    document_id: str,
    _: User = Depends(require_permission("forms", "view")),
    db: Session = Depends(db_session),
) -> dict:
    document = document_service.get_document(db, form_id, document_id)
    return ok("متن استخراج‌شده", **document_service.text_preview(document))


@router.post("/{form_id}/documents/{document_id}/extract")
def reextract_document(
    form_id: str,
    document_id: str,
    background: BackgroundTasks,
    _: User = Depends(require_permission("forms", "update")),
    db: Session = Depends(db_session),
) -> dict:
    document = document_service.get_document(db, form_id, document_id)
    document.extraction_status = "pending"
    document.error_message = None
    db.commit()
    background.add_task(document_service.process_document, document.id)
    return ok("استخراج متن دوباره در صف قرار گرفت.", document=document_service.document_to_dict(document))


@router.delete("/{form_id}/documents/{document_id}")
def delete_document(
    form_id: str,
    document_id: str,
    _: User = Depends(require_permission("forms", "update")),
    db: Session = Depends(db_session),
) -> dict:
    document_service.delete_document(db, form_id, document_id)
    db.commit()
    return ok("سند مرجع حذف شد.")


@router.post("/{form_id}/documents/{document_id}/suggest-rules")
def suggest_rules(
    form_id: str,
    document_id: str,
    _: User = Depends(require_permission("forms", "update")),
    db: Session = Depends(db_session),
) -> dict:
    """Return ``[{text, pageOrClause}]`` candidates for the assistant review UI."""
    from app.services import form_service

    form = form_service.get_form(db, form_id, active_only=False) or {}
    rules = document_service.suggest_rules(
        db,
        form_id=form_id,
        document_id=document_id,
        form_title=str(form.get("title") or "بدون عنوان"),
    )
    if not rules:
        return ok("قاعده‌ای از این سند استخراج نشد.", rules=[], count=0)
    return ok(f"{len(rules)} قاعده پیشنهادی استخراج شد.", rules=rules, count=len(rules))
