from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

from .base import utcnow


class ProcessDefinitionRow(Base):
    """A process (workflow) definition authored in the admin panel.

    Two payloads are kept side by side:

    * ``draft_json`` - the editable definition (camelCase, identical to the admin
      ``ProcessDefinition`` type);
    * ``published_json`` - the immutable snapshot that running cases reference.

    Keeping the published snapshot on the row makes "old versions keep working" cheap:
    a case never joins back to the mutable draft.
    """

    __tablename__ = "process_definitions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    department: Mapped[str] = mapped_column(String(120), nullable=False, default="عمومی")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft", index=True)
    version_label: Mapped[str] = mapped_column(String(20), nullable=False, default="0.1")
    draft_json: Mapped[dict] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=False, default=dict)
    published_json: Mapped[dict | None] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    versions: Mapped[list["ProcessVersion"]] = relationship(
        back_populates="process",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ProcessVersion.id",
    )


class ProcessVersion(Base):
    """Immutable snapshot created on every publish."""

    __tablename__ = "process_versions"
    __table_args__ = (UniqueConstraint("process_id", "version_label", name="uq_process_versions_label"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    process_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("process_definitions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_label: Mapped[str] = mapped_column(String(20), nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=False, default=dict)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    published_by: Mapped[str | None] = mapped_column(String(64), nullable=True)

    process: Mapped["ProcessDefinitionRow"] = relationship(back_populates="versions")


class ProcessCase(Base):
    """A running instance of a published process.

    ``snapshot`` freezes the definition (stages, route rules, computed fields, reject
    policy, escalation and the locked form versions) at start time, so re-publishing a
    process never changes the meaning of an in-flight case.
    """

    __tablename__ = "process_cases"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tracking_code: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    process_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("process_definitions.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    process_version_label: Mapped[str] = mapped_column(String(20), nullable=False, default="0.1")
    snapshot: Mapped[dict] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=False, default=dict)
    applicant_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    form_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
    substatus: Mapped[str] = mapped_column(String(40), nullable=False, default="registered", index=True)
    current_stage_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    needs_escalation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    stage_states: Mapped[dict] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=False, default=dict)
    values: Mapped[dict] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=False, default=dict)
    compute_results: Mapped[dict] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=False, default=dict)
    timeline: Mapped[list] = mapped_column(JSONB().with_variant(JSON, "sqlite"), nullable=False, default=list)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )
