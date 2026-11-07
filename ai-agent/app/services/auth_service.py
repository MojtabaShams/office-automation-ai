"""Authentication: registration, login, logout, profile and admin bootstrap."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AuthError, Conflict, ValidationError
from app.core.permissions import APPLICANT_ROLE, SUPER_ADMIN_ROLE
from app.core.security import (
    generate_token,
    hash_password,
    needs_rehash,
    validate_password_strength,
    verify_password,
)
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

logger = logging.getLogger(__name__)

#: Only the resized JPEG/PNG/WebP produced by the profile page is accepted.
_AVATAR_DATA_URL = re.compile(r"^data:image/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$")
_AVATAR_MAX_CHARS = 380_000


@dataclass(slots=True)
class AuthResult:
    user: User
    token: str
    expires_at: datetime


def public_user(user: User) -> dict:
    """The profile shape shared by ``/api/auth/*`` and the chat endpoint."""
    return {
        "id": user.id,
        "full_name": user.full_name,
        "national_id": user.national_id,
        "mobile": user.mobile,
        "email": user.email or "",
        "unit": user.unit or "",
        "avatar": user.avatar or "",
        "role": user.role,
        "role_name": user.role_name,
        "is_active": user.is_active,
        "permissions": user.permission_matrix,
        "last_login_at": iso(user.last_login_at),
        "created_at": iso(user.created_at),
    }


def _role_for(db: Session, code: str) -> Role:
    role = role_repo.get_role_by_code(db, code)
    if role is None:
        # A fresh database may not have been seeded yet (e.g. first registration).
        role_repo.ensure_default_roles(db)
        role = role_repo.get_role_by_code(db, code)
    if role is None:
        raise ValidationError("نقش پیش‌فرض سامانه یافت نشد؛ با مدیر سامانه تماس بگیرید.")
    return role


def validate_registration(
    *, full_name: str, national_id: str, mobile: str, password: str, password_confirm: str | None
) -> tuple[str, str, str]:
    full_name = normalize_person_name(full_name)
    national_id = normalize_national_id(national_id)
    mobile = normalize_mobile(mobile)

    if len(full_name) < 3:
        raise ValidationError("نام و نام خانوادگی را کامل وارد کنید.")
    if not is_valid_national_id(national_id):
        raise ValidationError("کد ملی وارد شده معتبر نیست.")
    if not is_valid_mobile(mobile):
        raise ValidationError("شماره موبایل باید با ۰۹ شروع شده و ۱۱ رقم باشد.")
    if not password_confirm or password != password_confirm:
        raise ValidationError("رمز عبور و تکرار آن یکسان نیست.")
    strength_error = validate_password_strength(password)
    if strength_error:
        raise ValidationError(strength_error)

    return full_name, national_id, mobile


def register(
    db: Session,
    *,
    full_name: str,
    national_id: str,
    mobile: str,
    password: str,
    password_confirm: str | None = None,
    user_agent: str | None = None,
) -> AuthResult:
    full_name, national_id, mobile = validate_registration(
        full_name=full_name,
        national_id=national_id,
        mobile=mobile,
        password=password,
        password_confirm=password_confirm,
    )

    if user_repo.get_user_by_mobile(db, mobile):
        raise Conflict("این شماره موبایل قبلاً ثبت شده است. وارد شوید یا رمز خود را بازیابی کنید.")
    if user_repo.get_user_by_national_id(db, national_id):
        raise Conflict("با این کد ملی قبلاً حساب کاربری ساخته شده است. وارد شوید.")

    role = _role_for(db, APPLICANT_ROLE)
    user = user_repo.create_user(
        db,
        full_name=full_name,
        national_id=national_id,
        mobile=mobile,
        password_hash=hash_password(password),
        role_id=role.id,
    )
    token = generate_token()
    session = user_repo.create_session(db, token=token, user_id=user.id, user_agent=user_agent)
    user_repo.prune_sessions(db, user.id)
    logger.info("New user registered: %s", user.id)
    return AuthResult(user=user, token=token, expires_at=session.expires_at)


def login(
    db: Session, *, mobile: str, password: str, user_agent: str | None = None
) -> AuthResult:
    normalized_mobile = normalize_mobile(mobile)
    user = user_repo.get_user_by_mobile(db, normalized_mobile)
    # A constant-ish response prevents trivial account enumeration.
    if user is None or not verify_password(password, user.password_hash):
        raise AuthError("شماره موبایل یا رمز عبور اشتباه است.")
    if not user.is_active or user.is_deleted:
        raise AuthError("شماره موبایل یا رمز عبور اشتباه است.")

    if needs_rehash(user.password_hash):
        user_repo.update_password_hash(db, user, hash_password(password))

    token = generate_token()
    session = user_repo.create_session(db, token=token, user_id=user.id, user_agent=user_agent)
    user_repo.prune_sessions(db, user.id)
    user_repo.touch_last_login(db, user)
    return AuthResult(user=user, token=token, expires_at=session.expires_at)


def logout(db: Session, token: str | None) -> None:
    if token:
        user_repo.revoke_session(db, token)


def update_profile(
    db: Session,
    user: User,
    *,
    full_name: str | None = None,
    email: str | None = None,
    unit: str | None = None,
    avatar: str | None = None,
) -> User:
    from .user_service import clean_email

    if full_name is not None:
        cleaned_name = normalize_person_name(full_name)
        if len(cleaned_name) < 3:
            raise ValidationError("نام و نام خانوادگی را کامل وارد کنید.")
        user.full_name = cleaned_name
    if email is not None:
        cleaned_email = clean_email(email)
        if cleaned_email:
            duplicate = user_repo.get_user_by_email(db, cleaned_email)
            if duplicate is not None and duplicate.id != user.id:
                raise Conflict("این ایمیل قبلاً برای کاربر دیگری ثبت شده است.")
        user.email = cleaned_email
    if unit is not None:
        user.unit = unit.strip()[:120] or None
    if avatar is not None:
        if not avatar:
            user.avatar = None
        else:
            if len(avatar) > _AVATAR_MAX_CHARS or not _AVATAR_DATA_URL.match(avatar):
                raise ValidationError("تصویر پروفایل معتبر نیست؛ یک تصویر JPG یا PNG انتخاب کنید.")
            user.avatar = avatar
    db.commit()
    db.refresh(user)
    return user


def change_password(
    db: Session,
    user: User,
    *,
    current_password: str,
    new_password: str,
    new_password_confirm: str | None,
    user_agent: str | None = None,
) -> AuthResult:
    """Change the password, revoke every session and return a fresh token.

    Revoking all sessions is the safe default after a credential change; the caller's
    device gets a new token so it does not have to log in again.
    """
    if not verify_password(current_password, user.password_hash):
        raise AuthError("رمز عبور فعلی درست نیست.")
    if not new_password_confirm or new_password != new_password_confirm:
        raise ValidationError("رمز عبور جدید و تکرار آن یکسان نیست.")
    strength_error = validate_password_strength(new_password)
    if strength_error:
        raise ValidationError(strength_error)
    user_repo.update_password_hash(db, user, hash_password(new_password))
    user_repo.revoke_all_sessions(db, user.id)
    token = generate_token()
    session = user_repo.create_session(db, token=token, user_id=user.id, user_agent=user_agent)
    return AuthResult(user=user, token=token, expires_at=session.expires_at)


def create_admin(
    db: Session,
    *,
    mobile: str,
    password: str,
    full_name: str | None = None,
    national_id: str | None = None,
) -> User:
    """Create (or promote) an administrator account. Used by the CLI and the seeder."""
    mobile = normalize_mobile(mobile)
    if not is_valid_mobile(mobile):
        raise ValidationError("شماره موبایل مدیر معتبر نیست.")
    strength_error = validate_password_strength(password)
    if strength_error:
        raise ValidationError(strength_error)

    role = _role_for(db, SUPER_ADMIN_ROLE)
    user = user_repo.get_user_by_mobile(db, mobile)
    if user is not None:
        user.role_id = role.id
        user.is_active = True
        db.commit()
        db.refresh(user)
        return user

    if national_id:
        national_id = normalize_national_id(national_id)
        if not is_valid_national_id(national_id):
            raise ValidationError("کد ملی مدیر معتبر نیست.")
    else:
        # Administrators are identified by mobile number; keep a stable placeholder.
        national_id = mobile[-9:].rjust(10, "0")

    return user_repo.create_user(
        db,
        full_name=(full_name or settings.ADMIN_FULL_NAME).strip(),
        national_id=national_id,
        mobile=mobile,
        password_hash=hash_password(password),
        role_id=role.id,
    )


def ensure_admin(db: Session) -> User | None:
    """Create the bootstrap admin account from environment variables (idempotent)."""
    if not settings.ADMIN_MOBILE or not settings.ADMIN_PASSWORD:
        return None
    mobile = normalize_mobile(settings.ADMIN_MOBILE)
    if not is_valid_mobile(mobile):
        logger.warning("ADMIN_MOBILE is not a valid Iranian mobile number; skipping admin seed.")
        return None

    strength_error = validate_password_strength(settings.ADMIN_PASSWORD)
    if strength_error:
        logger.warning("ADMIN_PASSWORD is too weak (%s); skipping admin seed.", strength_error)
        return None

    user = create_admin(
        db,
        mobile=mobile,
        password=settings.ADMIN_PASSWORD,
        full_name=settings.ADMIN_FULL_NAME,
    )
    logger.info("Bootstrap admin ensured: %s", user.mobile)
    return user
