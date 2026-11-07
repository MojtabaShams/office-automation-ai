from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.permissions import empty_matrix

from .base import new_id, utcnow

if TYPE_CHECKING:  # pragma: no cover - typing only
    from .user import User


class Role(Base):
    """A named set of ``(resource, action)`` permissions."""

    __tablename__ = "roles"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("role"))
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    permissions: Mapped[list["RolePermission"]] = relationship(
        back_populates="role",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )
    users: Mapped[list["User"]] = relationship(  # noqa: F821
        back_populates="role_record",
        passive_deletes=True,
    )

    # ------------------------------------------------------------------ helpers
    @property
    def permission_pairs(self) -> set[tuple[str, str]]:
        return {(permission.resource, permission.action) for permission in self.permissions}

    @property
    def permission_matrix(self) -> dict[str, dict[str, bool]]:
        """Full matrix (every known resource/action) so the UI can render checkboxes."""
        matrix = empty_matrix()
        for resource, action in self.permission_pairs:
            if resource in matrix and action in matrix[resource]:
                matrix[resource][action] = True
        return matrix

    def has_permission(self, resource: str, action: str) -> bool:
        return (resource, action) in self.permission_pairs


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (
        UniqueConstraint("role_id", "resource", "action", name="uq_role_permissions_role_id_resource_action"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    role_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    resource: Mapped[str] = mapped_column(String(50), nullable=False)
    action: Mapped[str] = mapped_column(String(30), nullable=False)

    role: Mapped["Role"] = relationship(back_populates="permissions")
