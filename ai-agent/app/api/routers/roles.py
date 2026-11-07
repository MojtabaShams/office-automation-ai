"""Role and permission management endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import db_session, require_permission
from app.models.user import User
from app.schemas.common import ok
from app.schemas.roles import RoleCreateRequest, RolePermissionsRequest, RoleUpdateRequest
from app.services import role_service

router = APIRouter(prefix="/api/roles", tags=["roles"])


@router.get("/catalog")
def permission_catalog(_: User = Depends(require_permission("roles", "view"))) -> dict:
    """The module/action catalog the matrix editor renders."""
    return ok("کاتالوگ دسترسی‌ها", **role_service.catalog_payload())


@router.get("")
def list_roles(
    _: User = Depends(require_permission("roles", "view")),
    db: Session = Depends(db_session),
) -> dict:
    roles = role_service.list_roles(db)
    return ok("فهرست نقش‌ها", roles=roles, count=len(roles))


@router.post("")
def create_role(
    req: RoleCreateRequest,
    _: User = Depends(require_permission("roles", "create")),
    db: Session = Depends(db_session),
) -> dict:
    role = role_service.create_role(
        db,
        name=req.name,
        code=req.code,
        description=req.description,
        permissions=req.permissions,
    )
    return ok("نقش ایجاد شد.", role=role)


@router.patch("/{role_id}")
def update_role(
    role_id: str,
    req: RoleUpdateRequest,
    _: User = Depends(require_permission("roles", "update")),
    db: Session = Depends(db_session),
) -> dict:
    role = role_service.get_role_or_404(db, role_id)
    updated = role_service.update_role(db, role, name=req.name, description=req.description)
    return ok("نقش به‌روزرسانی شد.", role=updated)


@router.put("/{role_id}/permissions")
def set_permissions(
    role_id: str,
    req: RolePermissionsRequest,
    _: User = Depends(require_permission("roles", "update")),
    db: Session = Depends(db_session),
) -> dict:
    role = role_service.get_role_or_404(db, role_id)
    updated = role_service.set_permissions(db, role, req.permissions)
    return ok("دسترسی‌های نقش ذخیره شد.", role=updated)


@router.delete("/{role_id}")
def delete_role(
    role_id: str,
    _: User = Depends(require_permission("roles", "delete")),
    db: Session = Depends(db_session),
) -> dict:
    role = role_service.get_role_or_404(db, role_id)
    deleted = role_service.delete_role(db, role)
    return ok("نقش حذف شد.", **deleted)
