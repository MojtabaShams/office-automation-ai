"""Role and permission management.

Roles are editable from the admin panel. System roles (``super_admin``, ``employee``,
``applicant``) cannot be deleted and the super-admin matrix is locked so an accidental
edit cannot lock everybody out of the panel.
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy.orm import Session

from app.core.exceptions import Conflict, NotFound, ValidationError
from app.core.permissions import (
    SUPER_ADMIN_ROLE,
    action_labels,
    catalog,
    pairs_from_matrix,
)
from app.core.serialization import iso
from app.models.role import Role
from app.repositories import role_repo

_CODE_RE = re.compile(r"^[a-z][a-z0-9_]{2,49}$")


def role_payload(role: Role, *, user_count: int | None = None) -> dict[str, Any]:
    return {
        "id": role.id,
        "code": role.code,
        "name": role.name,
        "description": role.description or "",
        "isSystem": role.is_system,
        "permissions": role.permission_matrix,
        "userCount": user_count if user_count is not None else 0,
        "createdAt": iso(role.created_at),
        "updatedAt": iso(role.updated_at),
    }


def catalog_payload() -> dict[str, Any]:
    return {"resources": catalog(), "actions": action_labels()}


def list_roles(db: Session) -> list[dict[str, Any]]:
    roles = role_repo.list_roles(db)
    return [role_payload(role, user_count=role_repo.count_users(db, role.id)) for role in roles]


def get_role_or_404(db: Session, role_id: str) -> Role:
    role = role_repo.get_role(db, role_id)
    if role is None:
        raise NotFound("نقش موردنظر یافت نشد.")
    return role


def create_role(
    db: Session,
    *,
    name: str,
    code: str,
    description: str | None,
    permissions: dict[str, dict[str, Any]] | None,
) -> dict[str, Any]:
    name = (name or "").strip()
    code = (code or "").strip().lower()
    if len(name) < 2:
        raise ValidationError("نام نقش باید حداقل ۲ نویسه باشد.")
    if not _CODE_RE.match(code):
        raise ValidationError("کد نقش باید با حرف شروع شود و فقط شامل حروف کوچک، رقم و زیرخط باشد.")
    if role_repo.get_role_by_code(db, code) is not None:
        raise Conflict("نقشی با این کد قبلاً ثبت شده است.")

    role = role_repo.create_role(
        db,
        code=code,
        name=name,
        description=(description or "").strip() or None,
        pairs=pairs_from_matrix(permissions or {}),
    )
    return role_payload(role)


def update_role(
    db: Session, role: Role, *, name: str | None = None, description: str | None = None
) -> dict[str, Any]:
    if name is not None and len(name.strip()) < 2:
        raise ValidationError("نام نقش باید حداقل ۲ نویسه باشد.")
    role = role_repo.update_role(
        db,
        role,
        name=name.strip() if name is not None else None,
        description=(description or "").strip() if description is not None else None,
    )
    return role_payload(role, user_count=role_repo.count_users(db, role.id))


def set_permissions(db: Session, role: Role, matrix: dict[str, dict[str, Any]]) -> dict[str, Any]:
    if role.code == SUPER_ADMIN_ROLE:
        raise ValidationError("دسترسی‌های نقش مدیر کل قابل تغییر نیست.")
    pairs = pairs_from_matrix(matrix or {})
    if role.code == "employee" and not any(pair == ("admin_panel", "view") for pair in pairs):
        raise ValidationError("نقش کارشناس باید دسترسی ورود به پنل مدیریت را داشته باشد.")
    role = role_repo.set_permissions(db, role, pairs)
    return role_payload(role, user_count=role_repo.count_users(db, role.id))


def delete_role(db: Session, role: Role) -> dict[str, Any]:
    if role.is_system:
        raise ValidationError("نقش‌های سیستمی قابل حذف نیستند.")
    user_count = role_repo.count_users(db, role.id)
    if user_count:
        raise Conflict(f"این نقش به {user_count} کاربر اختصاص داده شده است؛ ابتدا نقش آن‌ها را تغییر دهید.")
    role_repo.delete_role(db, role)
    return {"id": role.id, "name": role.name}


def ensure_default_roles(db: Session) -> list[Role]:
    """Seed the system roles on startup (idempotent)."""
    return role_repo.ensure_default_roles(db)
