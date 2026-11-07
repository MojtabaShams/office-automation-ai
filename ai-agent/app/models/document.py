from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

from .base import utcnow


class FormDocument(Base):
    """A reference document (circular/directive) stored with a form definition.

    ``form_id`` intentionally has **no** foreign key: the admin panel authors forms
    locally and syncs them later, so a document must survive while its form is still a
    draft (or was created on another workstation).  The column is indexed and behaves
    like a bucket key.
    """

    __tablename__ = "form_documents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    form_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    file_name: Mapped[str] = mapped_column(String(300), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(150), nullable=False, default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    uploaded_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # pending | processing | done | failed | unsupported
    extraction_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
