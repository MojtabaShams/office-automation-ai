"""Applicant attachments sent from the client chat composer.

Files are written under ``settings.UPLOADS_DIR/chat/<user>/`` with a small JSON sidecar
holding the display metadata and the extracted text. No database table is needed: the
attachment ids are referenced from the chat message ``meta`` column, and every read goes
through the owning user's directory, so one user can never resolve another user's file.

The text extraction reuses :mod:`app.services.document_service` (PDF/DOCX/plain text);
images are accepted but have no extractable text, so the agent only receives their name.
"""

from __future__ import annotations

import json
import logging
import re
import secrets
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings
from app.core.exceptions import NotFound, PermissionDenied, ValidationError

from . import document_service

logger = logging.getLogger(__name__)

#: Upper bound of one message; keeps the agent prompt and the UI chips readable.
MAX_ATTACHMENTS = 3
#: Characters of extracted text forwarded to the agent (the sidecar keeps more).
PROMPT_TEXT_MAX_CHARS = 6000
#: Characters kept in the sidecar so a later turn can still read the document.
STORED_TEXT_MAX_CHARS = 20_000

ATTACHMENT_ID_RE = re.compile(r"^att-[0-9a-f]{16}$")

_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
_TEXT_EXTENSIONS = {".txt", ".md"}


def _user_dir(user_id: str) -> Path:
    safe = re.sub(r"[^\w-]+", "_", user_id or "anonymous")[:80] or "anonymous"
    directory = settings.UPLOADS_DIR / "chat" / safe
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _meta_path(user_id: str, attachment_id: str) -> Path:
    return _user_dir(user_id) / f"{attachment_id}.json"


def _looks_like(path: Path, extension: str) -> bool:
    """Cheap magic-byte check so a renamed executable cannot pass as a document."""
    try:
        head = path.read_bytes()[:16]
    except OSError:
        return False
    if extension == ".pdf":
        return head.startswith(b"%PDF")
    if extension == ".png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if extension in {".jpg", ".jpeg"}:
        return head.startswith(b"\xff\xd8\xff")
    if extension == ".webp":
        return len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    if extension == ".bmp":
        return head.startswith(b"BM")
    if extension in {".tif", ".tiff"}:
        return head.startswith(b"II*\x00") or head.startswith(b"MM\x00*")
    if extension == ".docx":
        return head.startswith(b"PK\x03\x04")
    if extension == ".doc":
        return head.startswith(b"\xd0\xcf\x11\xe0")
    if extension in _TEXT_EXTENSIONS:
        return b"\x00" not in head
    return True


def _public(meta: dict) -> dict:
    return {
        "id": meta["id"],
        "name": meta["name"],
        "mime": meta["mime"],
        "size": meta["size"],
    }


def save_upload(user_id: str, upload: UploadFile) -> dict:
    """Validate and store one upload, returning its public metadata."""
    file_name = document_service._safe_name(upload.filename or "file")
    extension = document_service._safe_extension(file_name)
    mime_type = document_service.ALLOWED_EXTENSIONS.get(extension, "application/octet-stream")

    attachment_id = f"att-{secrets.token_hex(8)}"
    target = _user_dir(user_id) / f"{attachment_id}{extension}"

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
                    limit = settings.DOCUMENT_MAX_BYTES // (1024 * 1024)
                    raise ValidationError(f"حجم فایل بیش از حد مجاز ({limit} مگابایت) است.")
                handle.write(chunk)
    except ValidationError:
        raise
    except OSError as exc:  # pragma: no cover - depends on the filesystem
        target.unlink(missing_ok=True)
        raise ValidationError("ذخیره‌سازی فایل روی سرور ناموفق بود.") from exc

    if size == 0:
        target.unlink(missing_ok=True)
        raise ValidationError("فایل انتخاب‌شده خالی است.")

    if not _looks_like(target, extension):
        target.unlink(missing_ok=True)
        raise ValidationError("محتوای فایل با پسوند آن هم‌خوانی ندارد.")

    text = ""
    try:
        status, extracted, _ = document_service.extract_text_from_file(target)
        if status == "done" and extracted:
            text = extracted[:STORED_TEXT_MAX_CHARS]
    except Exception:  # pragma: no cover - extraction must never block the upload
        logger.warning("Text extraction failed for chat attachment %s", attachment_id)

    meta = {
        "id": attachment_id,
        "name": file_name,
        "mime": mime_type,
        "size": size,
        "extension": extension,
        "text": text,
    }
    try:
        _meta_path(user_id, attachment_id).write_text(
            json.dumps(meta, ensure_ascii=False), encoding="utf-8"
        )
    except OSError as exc:  # pragma: no cover - depends on the filesystem
        target.unlink(missing_ok=True)
        raise ValidationError("ذخیره‌سازی اطلاعات فایل ناموفق بود.") from exc

    return _public(meta)


def _read_from_disk(user_id: str, attachment_id: str) -> tuple[Path, dict]:
    if not ATTACHMENT_ID_RE.match(attachment_id or ""):
        raise NotFound("فایل پیوست یافت نشد.")
    sidecar = _meta_path(user_id, attachment_id)
    if not sidecar.exists():
        raise NotFound("فایل پیوست یافت نشد.")
    try:
        meta = json.loads(sidecar.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise NotFound("اطلاعات فایل پیوست خوانده نشد.") from exc
    extension = str(meta.get("extension") or "")
    file_path = sidecar.with_name(f"{attachment_id}{extension}")
    if not file_path.exists():
        raise NotFound("فایل پیوست روی سرور پیدا نشد.")
    return file_path, meta


def get_for_user(user_id: str, attachment_id: str) -> tuple[Path, dict]:
    """Return the file plus its public metadata for a download."""
    file_path, meta = _read_from_disk(user_id, attachment_id)
    return file_path, _public(meta)


def resolve(user_id: str, attachment_ids: list[str] | None) -> list[dict]:
    """Resolve the ids sent with a chat turn (ownership is enforced per id)."""
    unique: list[str] = []
    for raw in attachment_ids or []:
        value = (raw or "").strip()
        if value and value not in unique:
            unique.append(value)
    if len(unique) > MAX_ATTACHMENTS:
        raise ValidationError(f"حداکثر {MAX_ATTACHMENTS} فایل را می‌توانید در یک پیام بفرستید.")
    attachments: list[dict] = []
    for attachment_id in unique:
        try:
            _, meta = _read_from_disk(user_id, attachment_id)
        except NotFound as exc:
            raise PermissionDenied("فایل پیوست در دسترس نیست؛ دوباره بارگذاری کنید.") from exc
        attachments.append(meta)
    return attachments


def public_meta(attachments: list[dict]) -> list[dict]:
    return [_public(meta) for meta in attachments]


def prompt_block(attachments: list[dict]) -> str:
    """Persian description of the attachments handed to the LLM."""
    lines: list[str] = []
    for meta in attachments:
        lines.append(f"- {meta['name']} ({meta['mime']})")
        text = str(meta.get("text") or "").strip()
        if text:
            lines.append(f"  متن استخراج‌شده: {text[:PROMPT_TEXT_MAX_CHARS]}")
        elif meta.get("extension") in _IMAGE_EXTENSIONS:
            lines.append(
                "  محتوای بصری این تصویر برای Agent قابل‌دسترسی نیست و OCR فعال نیست؛ "
                "نباید ادعا شود که تصویر بررسی شده است."
            )
        else:
            lines.append("  متنی از این فایل استخراج نشد؛ محتوای آن برای Agent قابل‌دسترسی نیست.")
    return "\n".join(lines)
