from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

from .base import utcnow


class Form(Base):
    """A dynamic form definition.

    ``schema_json`` is the canonical admin-authored definition (camelCase, matching the
    admin UI). ``form_fields`` is a normalised projection used for search/validation.
    """

    __tablename__ = "forms"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False, default="general", index=True)
    submit_label: Mapped[str] = mapped_column(String(100), nullable=False, default="ارسال")
    schema_json: Mapped[dict] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=False, default=dict)
    footer_links: Mapped[list | None] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=True)
    requirements: Mapped[list | None] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="dynamic", index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    checksum: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # ``is_deleted`` is the only delete path: rows are never removed from the table, so
    # submissions and process snapshots that point at a form keep their meaning.
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    fields: Mapped[list["FormField"]] = relationship(
        back_populates="form",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="FormField.order_index",
    )
    submissions: Mapped[list["Submission"]] = relationship(back_populates="form")  # noqa: F821


class FormField(Base):
    __tablename__ = "form_fields"
    __table_args__ = (UniqueConstraint("form_id", "name", name="uq_form_fields_form_id_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    form_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("forms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False, default="text")
    required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    placeholder: Mapped[str | None] = mapped_column(String(300), nullable=True)
    help_text: Mapped[str | None] = mapped_column(String(500), nullable=True)
    pattern: Mapped[str | None] = mapped_column(String(500), nullable=True)
    min_length: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_length: Mapped[int | None] = mapped_column(Integer, nullable=True)
    default_value: Mapped[str | None] = mapped_column(String(500), nullable=True)
    options: Mapped[list | None] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    form: Mapped["Form"] = relationship(back_populates="fields")
