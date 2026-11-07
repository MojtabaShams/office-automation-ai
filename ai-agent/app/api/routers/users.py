"""Employee management endpoints backing the ``/employees`` page."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import db_session, require_permission
from app.models.user import User
from app.schemas.common import ok
from app.schemas.users import EmployeeCreateRequest, EmployeeUpdateRequest, UserStatusRequest
from app.services import user_service

router = APIRouter(prefix="/api/users", tags=["users"])


def _status_filter(status: str | None) -> bool | None:
    if status in {"active", "فعال", "true", "1"}:
        return True
    if status in {"inactive", "غیرفعال", "false", "0"}:
        return False
    return None


@router.get("")
def list_users(
    q: str | None = Query(default=None, max_length=100),
    role_id: str | None = Query(default=None, max_length=64),
    status: str | None = Query(default=None, max_length=20),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(require_permission("employees", "view")),
    db: Session = Depends(db_session),
) -> dict:
    payload = user_service.list_users(
        db,
        query=q,
        role_id=role_id,
        is_active=_status_filter(status),
        limit=limit,
        offset=offset,
    )
    return ok("فهرست کاربران", **payload)


@router.get("/{user_id}")
def get_user(
    user_id: str,
    _: User = Depends(require_permission("employees", "view")),
    db: Session = Depends(db_session),
) -> dict:
    user = user_service.get_user_or_404(db, user_id)
    return ok("اطلاعات کاربر", user=user_service.admin_user_payload(user))


@router.post("")
def create_employee(
    req: EmployeeCreateRequest,
    _: User = Depends(require_permission("employees", "create")),
    db: Session = Depends(db_session),
) -> dict:
    user = user_service.create_employee(
        db,
        full_name=req.full_name,
        mobile=req.mobile,
        national_id=req.national_id,
        password=req.password,
        role_id=req.role_id,
        email=req.email,
        unit=req.unit,
        is_active=req.is_active,
    )
    return ok("کارمند جدید ثبت شد.", user=user)


@router.patch("/{user_id}")
def update_employee(
    user_id: str,
    req: EmployeeUpdateRequest,
    _: User = Depends(require_permission("employees", "update")),
    db: Session = Depends(db_session),
) -> dict:
    user = user_service.get_user_or_404(db, user_id)
    updated = user_service.update_employee(
        db,
        user,
        full_name=req.full_name,
        mobile=req.mobile,
        national_id=req.national_id,
        email=req.email,
        unit=req.unit,
        role_id=req.role_id,
        is_active=req.is_active,
    )
    return ok("اطلاعات کاربر به‌روزرسانی شد.", user=updated)


@router.patch("/{user_id}/status")
def set_user_status(
    user_id: str,
    req: UserStatusRequest,
    actor: User = Depends(require_permission("employees", "update")),
    db: Session = Depends(db_session),
) -> dict:
    user = user_service.get_user_or_404(db, user_id)
    updated = user_service.set_active(db, actor, user, req.is_active)
    return ok("وضعیت کاربر تغییر کرد.", user=updated)


@router.delete("/{user_id}")
def delete_employee(
    user_id: str,
    actor: User = Depends(require_permission("employees", "delete")),
    db: Session = Depends(db_session),
) -> dict:
    user = user_service.get_user_or_404(db, user_id)
    deleted = user_service.delete_employee(db, actor, user)
    return ok("کاربر حذف شد.", **deleted)
