from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

from .base import utcnow


class FieldGuideline(Base):
    __tablename__ = "field_guidelines"
    __table_args__ = (
        UniqueConstraint("form_id", "field_name", name="uq_field_guidelines_form_field"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    form_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("forms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    filling_rules: Mapped[str | None] = mapped_column(Text, nullable=True)
    examples: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )
