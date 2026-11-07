"""Domain level exceptions and their FastAPI handlers."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base class for expected, user-facing errors."""

    status_code = 400
    code = "app_error"

    def __init__(self, message: str, *, status_code: int | None = None, code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        if code is not None:
            self.code = code

    def to_payload(self) -> dict:
        # ``detail`` keeps FastAPI's convention and is what the browser client reads.
        return {"status": "error", "message": self.message, "detail": self.message, "code": self.code}


class AuthError(AppError):
    status_code = 401
    code = "auth_error"


class PermissionDenied(AppError):
    status_code = 403
    code = "permission_denied"


class NotFound(AppError):
    status_code = 404
    code = "not_found"


class ValidationError(AppError):
    status_code = 422
    code = "validation_error"


class Conflict(AppError):
    status_code = 409
    code = "conflict"


class RateLimitError(AppError):
    status_code = 429
    code = "rate_limited"

    def __init__(self, message: str, *, retry_after: int = 60) -> None:
        super().__init__(message)
        self.retry_after = max(1, retry_after)

    def to_payload(self) -> dict:
        return {**super().to_payload(), "retry_after": self.retry_after}


class AgentError(AppError):
    status_code = 503
    code = "agent_unavailable"


_FIELD_LABELS = {
    "message": "متن پیام",
    "mobile": "شماره موبایل",
    "password": "رمز عبور",
    "full_name": "نام و نام خانوادگی",
    "fullName": "نام و نام خانوادگی",
    "national_id": "کد ملی",
    "nationalId": "کد ملی",
    "form_id": "شناسه فرم",
    "values": "مقادیر فرم",
    "title": "عنوان",
    "content": "متن دانش",
    "query": "عبارت جستجو",
    "status": "وضعیت",
    "tracking_code": "کد پیگیری",
    "code": "کد نقش",
    "role_id": "نقش",
    "roleId": "نقش",
    "permissions": "دسترسی‌ها",
    "bank_name": "نام بانک",
    "bankName": "نام بانک",
    "connection_key": "کلید اتصال",
    "connectionKey": "کلید اتصال",
    "is_active": "وضعیت فعال بودن",
    "isActive": "وضعیت فعال بودن",
    "new_password_confirm": "تکرار رمز عبور جدید",
    "avatar": "تصویر پروفایل",
}


def _validation_message(exc: RequestValidationError) -> str:
    errors = exc.errors()
    if not errors:
        return "داده‌های ارسالی معتبر نیست."
    first = errors[0]
    location = [str(part) for part in first.get("loc", ()) if part not in {"body", "query", "path"}]
    field = location[-1] if location else ""
    label = _FIELD_LABELS.get(field, field)
    error_type = first.get("type", "")
    if error_type == "missing":
        return f"فیلد «{label}» الزامی است."
    if error_type in {"string_too_short", "string_too_long", "too_short", "too_long"}:
        return f"مقدار «{label}» در محدوده مجاز نیست."
    if error_type in {"int_parsing", "int_type", "float_parsing"}:
        return f"مقدار «{label}» باید عدد باشد."
    if error_type == "bool_parsing":
        return f"مقدار «{label}» معتبر نیست."
    return f"مقدار «{label}» معتبر نیست."


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error_handler(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.to_payload())

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        message = _validation_message(exc)
        return JSONResponse(
            status_code=422,
            content={
                "status": "error",
                "message": message,
                "detail": message,
                "code": "validation_error",
                "errors": [
                    {"field": "".join(str(part) for part in error.get("loc", ())), "type": error.get("type")}
                    for error in exc.errors()[:10]
                ],
            },
        )

    @app.exception_handler(Exception)
    async def _unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        message = "خطای داخلی سرور رخ داد."
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": message, "detail": message, "code": "internal_error"},
        )
