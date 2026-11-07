"""Shared FastAPI dependencies (database session, authentication, authorization)."""

from __future__ import annotations

from collections.abc import Callable, Generator

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.core.permissions import RESOURCE_LABELS
from app.models.user import User
from app.repositories import user_repo

from .database import get_db
from .exceptions import AuthError, PermissionDenied


def db_session() -> Generator[Session, None, None]:
    yield from get_db()


def extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return None
    token = value.strip()
    return token or None


def get_optional_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(db_session),
) -> User | None:
    """Return the authenticated user, or ``None`` for anonymous callers.

    An expired or revoked token resolves to ``None``; ``require_user`` then raises the
    Persian 401 that makes the admin panel drop its session and show the login page.
    """
    token = extract_bearer_token(authorization)
    if not token:
        return None
    return user_repo.get_user_by_token(db, token)


def get_current_user(user: User | None = Depends(get_optional_user)) -> User:
    if user is None:
        raise AuthError("نشست شما منقضی شده است؛ دوباره وارد شوید.")
    return user


def require_user(user: User = Depends(get_current_user)) -> User:
    if not user.is_active:
        raise AuthError("حساب کاربری شما غیرفعال شده است.")
    return user


def require_admin(user: User = Depends(require_user)) -> User:
    """Entry gate for the admin panel (``admin_panel:view``)."""
    if not user.is_admin:
        raise PermissionDenied("این بخش فقط برای کارمندان و مدیران سامانه در دسترس است.")
    return user


def require_permission(resource: str, action: str) -> Callable[..., User]:
    """Build a dependency that enforces ``resource:action`` for the current user."""
    label = RESOURCE_LABELS.get(resource, resource)

    def dependency(user: User = Depends(require_user)) -> User:
        if not user.has_permission(resource, action):
            raise PermissionDenied(f"برای انجام این عملیات به دسترسی «{label}» نیاز دارید.")
        return user

    dependency.__name__ = f"require_{resource}_{action}"
    return dependency
