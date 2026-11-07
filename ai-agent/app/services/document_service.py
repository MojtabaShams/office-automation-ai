"""Reference documents (circulars/directives) for form definitions.

Two responsibilities:

* **Storage** - a validated upload is written under ``settings.UPLOADS_DIR`` and
  described by a :class:`~app.models.document.FormDocument` row;
* **Extraction** - PDF/DOCX/plain text are converted to text in the background so the
  admin can later trigger "suggest rules from this document". Extraction failures never
  lose the file: the row keeps ``extraction_status`` and ``error_message``.

The extraction helpers degrade gracefully: when ``pypdf``/``python-docx`` are not
installed the document is marked ``unsupported`` instead of crashing the request.
"""

from __future__ import annotations

import json
import logging
import re
import secrets
from pathlib import Path
from typing import Any

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import session_scope
from app.core.exceptions import NotFound, ValidationError
from app.models.document import FormDocument

logger = logging.getLogger(__name__)

#: Extension → canonical mime type for everything the builder accepts.
ALLOWED_EXTENSIONS: dict[str, str] = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
}

_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
_TEXT_EXTENSIONS = {".txt", ".md"}
_PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹"


def _safe_extension(file_name: str) -> str:
    suffix = Path(file_name or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise ValidationError("فرمت فایل پشتیبانی نمی‌شود. PDF، Word، متن یا تصویر مجاز است.")
    return suffix


def _safe_name(file_name: str) -> str:
    name = Path(file_name or "document").name.strip() or "document"
    return re.sub(r"[^\w.\-\u0600-\u06FF ]+", "_", name)[:280]


def storage_dir(form_id: str) -> Path:
    directory = settings.UPLOADS_DIR / "forms" / re.sub(r"[^\w-]+", "_", form_id)[:80]
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def create_document(
    db: Session,
    *,
    form_id: str,
    upload: UploadFile,
    actor_id: str | None,
) -> FormDocument:
    """Persist the upload and queue text extraction."""
    file_name = _safe_name(upload.filename or "document")
    extension = _safe_extension(file_name)
    mime_type = ALLOWED_EXTENSIONS.get(extension, "application/octet-stream")

    document_id = f"doc-{secrets.token_hex(8)}"
    directory = storage_dir(form_id)
    target = directory / f"{document_id}{extension}"

    size = 0
    try:
        with target.open("wb") as handle:
            while True:
                chunk = upload.file.read(1024 * 256)
                if not chunk:
                    break
                size += len(chunk)
                if size > settings.DOCUMENT_MAX_BYTES:
                    handle.close()
                    target.unlink(missing_ok=True)
                    raise ValidationError(
                        f"حجم فایل بیش از حد مجاز ({settings.DOCUMENT_MAX_BYTES // (1024 * 1024)} مگابایت) است."
                    )
                handle.write(chunk)
    except ValidationError:
        raise
    except OSError as exc:  # pragma: no cover - depends on the filesystem
        target.unlink(missing_ok=True)
        raise ValidationError("ذخیره‌سازی فایل روی سرور ناموفق بود.") from exc

    if size == 0:
        target.unlink(missing_ok=True)
        raise ValidationError("فایل انتخاب‌شده خالی است.")

    document = FormDocument(
        id=document_id,
        form_id=form_id,
        file_name=file_name,
        mime_type=mime_type,
        size=size,
        storage_key=str(target),
        uploaded_by=actor_id,
        extraction_status="pending",
    )
    db.add(document)
    db.flush()
    return document


def get_document(db: Session, form_id: str, document_id: str) -> FormDocument:
    document = db.get(FormDocument, document_id)
    if document is None or document.form_id != form_id:
        raise NotFound("سند موردنظر یافت نشد.")
    return document


def list_documents(db: Session, form_id: str) -> list[dict]:
    rows = db.scalars(
        select(FormDocument)
        .where(FormDocument.form_id == form_id)
        .order_by(FormDocument.uploaded_at.desc())
    ).all()
    return [document_to_dict(row) for row in rows]


def delete_document(db: Session, form_id: str, document_id: str) -> None:
    document = get_document(db, form_id, document_id)
    Path(document.storage_key).unlink(missing_ok=True)
    db.delete(document)
    db.flush()


def document_to_dict(document: FormDocument) -> dict:
    return {
        "id": document.id,
        "formId": document.form_id,
        "fileName": document.file_name,
        "mimeType": document.mime_type,
        "size": document.size,
        "storageKey": document.storage_key,
        "uploadedAt": document.uploaded_at.isoformat() if document.uploaded_at else None,
        "uploadedBy": document.uploaded_by,
        "extractionStatus": document.extraction_status,
        "pageCount": document.page_count,
        "errorMessage": document.error_message,
        "hasText": bool(document.extracted_text),
    }


# --------------------------------------------------------------------- extraction
def _normalise(text: str) -> str:
    for index, digit in enumerate(_PERSIAN_DIGITS):
        text = text.replace(digit, str(index))
    text = text.replace("\u200c", " ").replace("\r\n", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_text_from_file(path: Path) -> tuple[str, str | None, int | None]:
    """Return ``(status, text, page_count)``; ``status`` is done/failed/unsupported."""
    extension = path.suffix.lower()
    if extension in _IMAGE_EXTENSIONS:
        return "unsupported", None, None
    if extension in _TEXT_EXTENSIONS:
        try:
            return "done", _normalise(path.read_text(encoding="utf-8", errors="ignore")), None
        except OSError as exc:
            return "failed", None, 1 if exc else None
    if extension == ".pdf":
        try:
            from pypdf import PdfReader  # type: ignore[import-not-found]
        except ImportError:
            return "unsupported", None, None
        try:
            reader = PdfReader(str(path))
            pages = [page.extract_text() or "" for page in reader.pages]
            return "done", _normalise("\n\n".join(pages)), len(reader.pages)
        except Exception as exc:  # pragma: no cover - malformed pdf
            logger.warning("PDF extraction failed for %s: %s", path, exc)
            return "failed", None, None
    if extension == ".docx":
        try:
            import docx  # type: ignore[import-not-found]
        except ImportError:
            return "unsupported", None, None
        try:
            document = docx.Document(str(path))
            paragraphs = [paragraph.text for paragraph in document.paragraphs]
            for table in document.tables:
                for row in table.rows:
                    paragraphs.append(" | ".join(cell.text for cell in row.cells))
            return "done", _normalise("\n".join(paragraphs)), None
        except Exception as exc:  # pragma: no cover - malformed docx
            logger.warning("DOCX extraction failed for %s: %s", path, exc)
            return "failed", None, None
    return "unsupported", None, None


def process_document(document_id: str) -> None:
    """Background task: extract the text and update the row in its own session."""
    try:
        with session_scope() as db:
            document = db.get(FormDocument, document_id)
            if document is None:
                return
            document.extraction_status = "processing"
            db.flush()

            path = Path(document.storage_key)
            if not path.exists():
                document.extraction_status = "failed"
                document.error_message = "فایل روی سرور پیدا نشد."
                return

            status, text, pages = extract_text_from_file(path)
            document.extraction_status = status
            document.page_count = pages
            if text:
                document.extracted_text = text[: settings.DOCUMENT_TEXT_MAX_CHARS]
            if status == "unsupported":
                document.error_message = "استخراج متن این قالب پشتیبانی نمی‌شود."
            elif status == "failed":
                document.error_message = "خواندن فایل ناموفق بود."
    except Exception:  # pragma: no cover - never break the upload
        logger.exception("Background extraction failed for document %s", document_id)
        try:
            with session_scope() as db:
                document = db.get(FormDocument, document_id)
                if document is not None:
                    document.extraction_status = "failed"
                    document.error_message = "خطای غیرمنتظره در استخراج متن."
        except Exception:  # pragma: no cover
            logger.exception("Could not record the extraction failure for %s", document_id)


# ------------------------------------------------------------- rule suggestions
_RULE_HINT = re.compile(r"(باید|نباید|الزامی|مجاز|ممنوع|حداکثر|حداقل|تبصره|ماده|بند)")


def _heuristic_rules(text: str) -> list[dict]:
    candidates: list[dict] = []
    for raw_line in text.split("\n"):
        line = raw_line.strip(" .•-\t")
        if not 15 <= len(line) <= 320:
            continue
        if not _RULE_HINT.search(line):
            continue
        candidates.append({"text": line, "pageOrClause": ""})
        if len(candidates) >= 8:
            break
    return candidates


def _llm_rules(text: str, form_title: str) -> list[dict]:
    """Ask the configured Groq model for JSON rules; returns ``[]`` when unavailable."""
    try:
        from langchain_core.messages import HumanMessage, SystemMessage

        from app.agents.llm import get_llm
    except ImportError:  # pragma: no cover - optional dependency
        return []

    llm = get_llm()
    if llm is None:
        return []

    prompt = (
        "از متن سند رسمی زیر، قواعد قابل استناد برای فرم «"
        + form_title
        + "» را استخراج کن. فقط JSON برگردان به شکل "
        '[{"text": "...", "pageOrClause": "ماده ۳"}]. '
        "هر قاعده یک جمله کوتاه فارسی و قابل ارجاع باشد. حداکثر ۸ قاعده.\n\n"
        + text[:12000]
    )
    try:
        response = llm.invoke(
            [
                SystemMessage(content="تو یک کارشناس استخراج قواعد اداری هستی و فقط JSON معتبر برمی‌گردانی."),
                HumanMessage(content=prompt),
            ]
        )
        raw = response.content if isinstance(response.content, str) else str(response.content)
    except Exception:  # pragma: no cover - network/model failure
        logger.exception("LLM rule suggestion failed")
        return []

    match = re.search(r"\[[\s\S]*\]", raw)
    if not match:
        return []
    try:
        payload = json.loads(match.group(0))
    except json.JSONDecodeError:
        return []
    rules: list[dict] = []
    for item in payload if isinstance(payload, list) else []:
        if not isinstance(item, dict):
            continue
        rule_text = str(item.get("text") or "").strip()
        if not rule_text:
            continue
        rules.append({"text": rule_text[:400], "pageOrClause": str(item.get("pageOrClause") or "")[:120]})
        if len(rules) >= 8:
            break
    return rules


def suggest_rules(db: Session, *, form_id: str, document_id: str, form_title: str) -> list[dict]:
    """Return rule candidates ``[{text, pageOrClause}]`` for a stored document."""
    document = get_document(db, form_id, document_id)
    text = (document.extracted_text or "").strip()
    if not text:
        if document.extraction_status in {"pending", "processing"}:
            raise ValidationError("متن سند هنوز آماده نشده است؛ چند لحظه بعد دوباره تلاش کنید.")
        if document.extraction_status == "unsupported":
            raise ValidationError("استخراج متن این قالب (مثلاً تصویر) پشتیبانی نمی‌شود.")
        raise ValidationError("متنی برای این سند استخراج نشده است.")

    rules = _llm_rules(text, form_title)
    if not rules:
        rules = _heuristic_rules(text)
    return rules


def text_preview(document: FormDocument, limit: int = 4000) -> dict[str, Any]:
    return {
        "documentId": document.id,
        "status": document.extraction_status,
        "pageCount": document.page_count,
        "text": (document.extracted_text or "")[:limit],
        "truncated": bool(document.extracted_text and len(document.extracted_text) > limit),
    }
