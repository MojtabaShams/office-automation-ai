from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

from .base import new_id, utcnow

SUBMISSION_STATUSES = ("submitted", "in_review", "need_info", "approved", "rejected", "canceled")


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("sub"))
    tracking_code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    form_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("forms.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    values: Mapped[dict] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=False, default=dict)
    form_snapshot: Mapped[dict | None] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="submitted", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: Process a submission belongs to (set when submitted through the applicant stepper).
    process_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("process_definitions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    process_case_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("process_cases.id", ondelete="SET NULL"), nullable=True, index=True
    )
    current_stage_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    current_stage_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    step_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    step_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # ``is_deleted`` is the only delete path; rows stay for audit and tracking.
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    form: Mapped["Form | None"] = relationship(back_populates="submissions")  # noqa: F821
    user: Mapped["User"] = relationship(back_populates="submissions")  # noqa: F821
    events: Mapped[list["SubmissionEvent"]] = relationship(
        back_populates="submission",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="SubmissionEvent.id",
    )

    __table_args__ = (
        Index("ix_submissions_user_created", "user_id", "created_at"),
        Index("ix_submissions_process_created", "process_id", "created_at"),
    )


class SubmissionEvent(Base):
    """Append-only status history powering request tracking."""

    __tablename__ = "submission_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    submission_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    submission: Mapped["Submission"] = relationship(back_populates="events")
