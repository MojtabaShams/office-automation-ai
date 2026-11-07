from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

from .base import new_id, utcnow


class ReportDefinition(Base):
    """A saved report built in the admin report builder.

    The definition is stored verbatim (camelCase, identical to the admin
    ``ReportDefinition`` type) so the builder can round-trip without a mapper.
    Deleting is a soft delete: saved reports stay for audit.
    """

    __tablename__ = "report_definitions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("rpt"))
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    category: Mapped[str] = mapped_column(String(80), nullable=False, default="عمومی")
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    definition: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )
