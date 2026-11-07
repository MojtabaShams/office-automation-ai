"""Upload endpoint for extracting structured administrative forms."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile

from app.core.config import settings
from app.core.dependencies import require_user
from app.core.exceptions import ValidationError
from app.models.user import User
from app.services.form_extraction_service import extract_form

router = APIRouter(tags=["form extraction"])


@router.post("/api/extract-form")
def extract_form_from_upload(
    file: UploadFile = File(...),
    _: User = Depends(require_user),
) -> dict:
    """Read an uploaded PDF, DOCX, text file or image and return a form extraction result."""
    content = bytearray()
    while True:
        chunk = file.file.read(1024 * 256)
        if not chunk:
            break
        content.extend(chunk)
        if len(content) > settings.DOCUMENT_MAX_BYTES:
            limit_mb = settings.DOCUMENT_MAX_BYTES // (1024 * 1024)
            raise ValidationError(f"حجم فایل بیش از حد مجاز ({limit_mb} مگابایت) است.")
    return extract_form(file.filename or "document", bytes(content))
