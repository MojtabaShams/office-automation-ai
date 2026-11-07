"""Authentication endpoints (consumed by the login/register forms in the chat panel)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session

from app.core import rate_limit
from app.core.config import settings
from app.core.dependencies import db_session, extract_bearer_token, require_user
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    ProfileUpdateRequest,
    RegisterRequest,
)
from app.schemas.common import ok
from app.services import auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _welcome(user: User | None) -> str:
    name = (user.full_name or "").strip().split(" ")[0] if user and user.full_name else "کاربر"
    # The first turn after login greets the user and asks how to help; no rules dump.
    return f"{name} عزیز، خوش آمدید. چطور می‌تونم کمکتون کنم؟"


def _client_key(request: Request, mobile: str | None = None) -> str:
    host = request.client.host if request.client else "unknown"
    return f"{host}:{(mobile or '').strip()}"


def _auth_payload(result: auth_service.AuthResult, message: str) -> dict:
    return {
        "status": "ok",
        "message": message,
        "token": result.token,
        "user": auth_service.public_user(result.user),
        "expires_at": result.expires_at.isoformat(),
        "expires_in": settings.AUTH_TOKEN_TTL_MINUTES * 60,
    }


@router.post("/register")
def register(req: RegisterRequest, request: Request, db: Session = Depends(db_session)) -> dict:
    rate_limit.enforce(
        "auth:register",
        _client_key(request),
        limit=settings.AUTH_REGISTER_RATE_LIMIT,
        window_seconds=settings.AUTH_REGISTER_RATE_WINDOW_SECONDS,
        message="تعداد ثبت‌نام‌ها از این دستگاه بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید.",
    )
    result = auth_service.register(
        db,
        full_name=req.full_name,
        national_id=req.national_id,
        mobile=req.mobile,
        password=req.password,
        password_confirm=req.password_confirm,
        user_agent=request.headers.get("user-agent"),
    )
    return _auth_payload(result, f"ثبت‌نام با موفقیت انجام شد. {_welcome(result.user)}")


@router.post("/login")
def login(req: LoginRequest, request: Request, db: Session = Depends(db_session)) -> dict:
    rate_limit.enforce(
        "auth:login",
        _client_key(request, req.mobile),
        limit=settings.AUTH_LOGIN_RATE_LIMIT,
        window_seconds=settings.AUTH_LOGIN_RATE_WINDOW_SECONDS,
    )
    result = auth_service.login(
        db,
        mobile=req.mobile,
        password=req.password,
        user_agent=request.headers.get("user-agent"),
    )
    return _auth_payload(result, _welcome(result.user))


@router.post("/logout")
def logout(
    authorization: str | None = Header(default=None),
    db: Session = Depends(db_session),
) -> dict:
    auth_service.logout(db, extract_bearer_token(authorization))
    return ok("از حساب کاربری خارج شدید.")


@router.get("/me")
def me(user: User = Depends(require_user)) -> dict:
    return ok("پروفایل کاربر", user=auth_service.public_user(user))


@router.patch("/profile")
def update_profile(
    req: ProfileUpdateRequest,
    user: User = Depends(require_user),
    db: Session = Depends(db_session),
) -> dict:
    updated = auth_service.update_profile(
        db,
        user,
        full_name=req.full_name,
        email=req.email,
        unit=req.unit,
        avatar=req.avatar,
    )
    return ok("پروفایل به‌روزرسانی شد.", user=auth_service.public_user(updated))


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    request: Request,
    user: User = Depends(require_user),
    db: Session = Depends(db_session),
) -> dict:
    result = auth_service.change_password(
        db,
        user,
        current_password=req.current_password,
        new_password=req.new_password,
        new_password_confirm=req.new_password_confirm,
        user_agent=request.headers.get("user-agent"),
    )
    return _auth_payload(result, "رمز عبور با موفقیت تغییر کرد.")
