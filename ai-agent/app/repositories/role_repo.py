from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.permissions import DEFAULT_ROLES
from app.models.role import Role, RolePermission
from app.models.user import User


def get_role(db: Session, role_id: str) -> Role | None:
    return db.get(Role, role_id)


def get_role_by_code(db: Session, code: str) -> Role | None:
    return db.scalar(select(Role).where(func.lower(Role.code) == code.strip().lower()))


def list_roles(db: Session) -> list[Role]:
    return list(db.scalars(select(Role).order_by(Role.is_system.desc(), Role.name.asc())))


def create_role(
    db: Session,
    *,
    code: str,
    name: str,
    description: str | None = None,
    is_system: bool = False,
    pairs: Iterable[tuple[str, str]] = (),
) -> Role:
    role = Role(code=code, name=name, description=description, is_system=is_system)
    role.permissions = [RolePermission(resource=resource, action=action) for resource, action in pairs]
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


def update_role(db: Session, role: Role, *, name: str | None = None, description: str | None = None) -> Role:
    if name is not None:
        role.name = name
    if description is not None:
        role.description = description
    db.commit()
    db.refresh(role)
    return role


def delete_role(db: Session, role: Role) -> None:
    db.delete(role)
    db.commit()


def set_permissions(db: Session, role: Role, pairs: Iterable[tuple[str, str]]) -> Role:
    """Replace the role's permission rows in one transaction.

    The old rows are deleted and flushed first: the ``(role_id, resource, action)``
    unique constraint would otherwise reject the re-inserted pairs.
    """
    db.execute(RolePermission.__table__.delete().where(RolePermission.role_id == role.id))
    db.flush()
    db.expire(role, ["permissions"])
    role.permissions = [RolePermission(resource=resource, action=action) for resource, action in pairs]
    db.commit()
    db.refresh(role)
    return role


def count_users(db: Session, role_id: str) -> int:
    return int(db.scalar(select(func.count()).select_from(User).where(User.role_id == role_id)) or 0)


def ensure_default_roles(db: Session) -> list[Role]:
    """Create the system roles that are missing (idempotent, never overwrites edits)."""
    created: list[Role] = []
    for definition in DEFAULT_ROLES:
        existing = get_role_by_code(db, definition["code"])
        if existing is not None:
            created.append(existing)
            continue
        created.append(
            create_role(
                db,
                code=definition["code"],
                name=definition["name"],
                description=definition["description"],
                is_system=definition["is_system"],
                pairs=definition["grants"],
            )
        )
    return created
