from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

from .base import new_id, utcnow


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("cs"))
    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    pending_form_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("forms.id", ondelete="SET NULL"), nullable=True
    )
    #: Process the applicant is currently being guided through (drives progressive dialogue).
    pending_process_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("process_definitions.id", ondelete="SET NULL"), nullable=True
    )
    #: Progressive guidance stage: overview_sent | steps_offered | steps_sent | forms_offered |
    #: forms_sent | stepper_ready.
    guidance_stage: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    # ``is_deleted`` is the only delete path for conversations (audit keeps messages).
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary_upto_message_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )

    user: Mapped["User"] = relationship(back_populates="chat_sessions")  # noqa: F821
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ChatMessage.id",
    )

    __table_args__ = (Index("ix_chat_sessions_user_activity", "user_id", "last_activity_at"),)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    intent: Mapped[str | None] = mapped_column(String(40), nullable=True)
    form_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    process_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    citations: Mapped[list | None] = mapped_column(JSON, nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    session: Mapped["ChatSession"] = relationship(back_populates="messages")
