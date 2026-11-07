from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.permissions import APPLICANT_ROLE, is_admin_role

from .base import new_id, utcnow

if TYPE_CHECKING:  # pragma: no cover - typing only
    from .role import Role


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("u"))
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    national_id: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    mobile: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True, unique=True)
    unit: Mapped[str | None] = mapped_column(String(120), nullable=True)
    #: Resized avatar as a ``data:image/...;base64,`` URL (see migration 0004).
    avatar: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    role_id: Mapped[str | None] = mapped_column(
        String(64), ForeignKey("roles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # ``is_deleted`` is the only delete path: accounts are deactivated, never removed,
    # so requests and audit history keep their applicant.
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    role_record: Mapped["Role | None"] = relationship(
        back_populates="users",
        lazy="joined",
        foreign_keys=[role_id],
    )
    sessions: Mapped[list["AuthSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    chat_sessions: Mapped[list["ChatSession"]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    submissions: Mapped[list["Submission"]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )

    # ------------------------------------------------------------------ helpers
    @property
    def role(self) -> str:
        """The role code (``super_admin`` / ``employee`` / ``applicant``)."""
        return self.role_record.code if self.role_record is not None else APPLICANT_ROLE

    @property
    def role_name(self) -> str:
        return self.role_record.name if self.role_record is not None else "مراجع"

    @property
    def permission_matrix(self) -> dict[str, dict[str, bool]]:
        return self.role_record.permission_matrix if self.role_record is not None else {}

    def has_permission(self, resource: str, action: str) -> bool:
        return self.role_record is not None and self.role_record.has_permission(resource, action)

    @property
    def is_admin(self) -> bool:
        return is_admin_role(self.role) and self.has_permission("admin_panel", "view")


class AuthSession(Base):
    """Opaque bearer session. Only the SHA-256 digest of the token is stored."""

    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_agent: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="sessions")
