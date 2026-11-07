"""Employee (admin-side user) management.

Applicants register themselves through the chat; employees are created here so they can
sign in to the admin panel. The same ``users`` table backs both, the difference is the
assigned role.
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy.orm import Session

from app.core.exceptions import Conflict, NotFound, ValidationError
from app.core.permissions import SUPER_ADMIN_ROLE
from app.core.security import hash_password, validate_password_strength
from app.core.serialization import iso
from app.core.text_utils import (
    is_valid_mobile,
    is_valid_national_id,
    normalize_mobile,
    normalize_national_id,
    normalize_person_name,
)
from app.models.role import Role
from app.models.user import User
from app.repositories import role_repo, user_repo

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


def admin_user_payload(user: User) -> dict[str, Any]:
    """Shape consumed by the employees table / form (camelCase, like the UI mocks)."""
    return {
        "id": user.id,
        "fullName": user.full_name,
        "email": user.email or "",
        "phone": user.mobile,
        "nationalId": user.national_id,
        "unit": user.unit or "",
        "role": user.role_name,
        "roleCode": user.role,
        "accessLevelId": user.role_id or "",
        "status": "active" if user.is_active else "inactive",
        "isActive": user.is_active,
        "hireDate": iso(user.created_at),
        "lastLoginAt": iso(user.last_login_at),
        "createdAt": iso(user.created_at),
    }


def list_users(
    db: Session,
    *,
    query: str | None = None,
    role_id: str | None = None,
    is_active: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    users = user_repo.list_users(
        db, query=query, role_id=role_id, is_active=is_active, limit=limit, offset=offset
    )
    total = user_repo.count_users(db, role_id=role_id, is_active=is_active)
    return {"users": [admin_user_payload(user) for user in users], "count": len(users), "total": total}


def get_user_or_404(db: Session, user_id: str) -> User:
    user = user_repo.get_user_by_id(db, user_id)
    if user is None:
        raise NotFound("کاربر موردنظر یافت نشد.")
    return user


def clean_email(email: str | None) -> str | None:
    value = (email or "").strip().lower()
    if not value:
        return None
    if not _EMAIL_RE.match(value):
        raise ValidationError("قالب ایمیل معتبر نیست.")
    if len(value) > 200:
        raise ValidationError("ایمیل بیش از حد طولانی است.")
    return value


def _resolve_role(db: Session, role_id: str | None) -> Role:
    if not role_id:
        raise ValidationError("نقش کاربر را انتخاب کنید.")
    role = role_repo.get_role(db, role_id)
    if role is None:
        raise NotFound("نقش انتخاب‌شده یافت نشد.")
    return role


def _active_super_admins(db: Session) -> int:
    return user_repo.count_users(db, role_code=SUPER_ADMIN_ROLE, is_active=True)


def _guard_last_super_admin(db: Session, user: User) -> None:
    if user.role == SUPER_ADMIN_ROLE and user.is_active and _active_super_admins(db) <= 1:
        raise ValidationError("حداقل یک مدیر کل فعال باید در سامانه باقی بماند.")


def create_employee(
    db: Session,
    *,
    full_name: str,
    mobile: str,
    national_id: str,
    password: str,
    role_id: str,
    email: str | None = None,
    unit: str | None = None,
    is_active: bool = True,
) -> dict[str, Any]:
    full_name = normalize_person_name(full_name)
    mobile = normalize_mobile(mobile)
    national_id = normalize_national_id(national_id)
    email = clean_email(email)

    if len(full_name) < 3:
        raise ValidationError("نام و نام خانوادگی را کامل وارد کنید.")
    if not is_valid_mobile(mobile):
        raise ValidationError("شماره موبایل باید با ۰۹ شروع شده و ۱۱ رقم باشد.")
    if not is_valid_national_id(national_id):
        raise ValidationError("کد ملی وارد شده معتبر نیست.")
    strength_error = validate_password_strength(password)
    if strength_error:
        raise ValidationError(strength_error)

    role = _resolve_role(db, role_id)
    if user_repo.get_user_by_mobile(db, mobile):
        raise Conflict("کاربری با این شماره موبایل قبلاً ثبت شده است.")
    if user_repo.get_user_by_national_id(db, national_id):
        raise Conflict("کاربری با این کد ملی قبلاً ثبت شده است.")
    if email and user_repo.get_user_by_email(db, email):
        raise Conflict("این ایمیل قبلاً برای کاربر دیگری ثبت شده است.")

    user = user_repo.create_user(
        db,
        full_name=full_name,
        national_id=national_id,
        mobile=mobile,
        password_hash=hash_password(password),
        role_id=role.id,
        email=email,
        unit=(unit or "").strip()[:120] or None,
    )
    if not is_active:
        user.is_active = False
        db.commit()
        db.refresh(user)
    return admin_user_payload(user)


def update_employee(
    db: Session,
    user: User,
    *,
    full_name: str | None = None,
    mobile: str | None = None,
    national_id: str | None = None,
    email: str | None = None,
    unit: str | None = None,
    role_id: str | None = None,
    is_active: bool | None = None,
) -> dict[str, Any]:
    if full_name is not None:
        cleaned = normalize_person_name(full_name)
        if len(cleaned) < 3:
            raise ValidationError("نام و نام خانوادگی را کامل وارد کنید.")
        user.full_name = cleaned
    if mobile is not None:
        cleaned_mobile = normalize_mobile(mobile)
        if not is_valid_mobile(cleaned_mobile):
            raise ValidationError("شماره موبایل باید با ۰۹ شروع شده و ۱۱ رقم باشد.")
        duplicate = user_repo.get_user_by_mobile(db, cleaned_mobile)
        if duplicate is not None and duplicate.id != user.id:
            raise Conflict("کاربری با این شماره موبایل قبلاً ثبت شده است.")
        user.mobile = cleaned_mobile
    if national_id is not None:
        cleaned_national = normalize_national_id(national_id)
        if not is_valid_national_id(cleaned_national):
            raise ValidationError("کد ملی وارد شده معتبر نیست.")
        duplicate = user_repo.get_user_by_national_id(db, cleaned_national)
        if duplicate is not None and duplicate.id != user.id:
            raise Conflict("کاربری با این کد ملی قبلاً ثبت شده است.")
        user.national_id = cleaned_national
    if email is not None:
        cleaned_email = clean_email(email)
        if cleaned_email:
            duplicate = user_repo.get_user_by_email(db, cleaned_email)
            if duplicate is not None and duplicate.id != user.id:
                raise Conflict("این ایمیل قبلاً برای کاربر دیگری ثبت شده است.")
        user.email = cleaned_email
    if unit is not None:
        user.unit = unit.strip()[:120] or None
    if role_id is not None:
        role = _resolve_role(db, role_id)
        if role.code != SUPER_ADMIN_ROLE and user.role == SUPER_ADMIN_ROLE:
            _guard_last_super_admin(db, user)
        user.role_id = role.id
    if is_active is not None and is_active != user.is_active:
        if not is_active:
            _guard_last_super_admin(db, user)
        user.is_active = is_active
        if not is_active:
            user_repo.revoke_all_sessions(db, user.id)

    db.commit()
    db.refresh(user)
    return admin_user_payload(user)


def set_active(db: Session, actor: User, user: User, is_active: bool) -> dict[str, Any]:
    if user.id == actor.id and not is_active:
        raise ValidationError("نمی‌توانید حساب کاربری خودتان را غیرفعال کنید.")
    if not is_active:
        _guard_last_super_admin(db, user)
        user.is_active = False
        user_repo.revoke_all_sessions(db, user.id)
    else:
        user.is_active = True
    db.commit()
    db.refresh(user)
    return admin_user_payload(user)


def delete_employee(db: Session, actor: User, user: User) -> dict[str, Any]:
    if user.id == actor.id:
        raise ValidationError("نمی‌توانید حساب کاربری خودتان را حذف کنید.")
    _guard_last_super_admin(db, user)
    payload = {"id": user.id, "fullName": user.full_name}
    user_repo.delete_user(db, user)
    return payload
