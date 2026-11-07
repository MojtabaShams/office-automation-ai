"""Payment gateway management.

The connection key is a write-only secret: it is stored on the row and only a masked
form (``••••••1234``) is ever returned by the API.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import Conflict, NotFound, ValidationError
from app.core.serialization import iso
from app.models.payment_gateway import PaymentGateway
from app.repositories import gateway_repo


def mask_key(key: str | None) -> str:
    key = key or ""
    if len(key) < 8:
        return "•" * 8
    return f"{'•' * 8}{key[-4:]}"


def gateway_payload(gateway: PaymentGateway) -> dict[str, Any]:
    """Never serialise ``connection_key`` itself."""
    return {
        "id": gateway.id,
        "bankName": gateway.bank_name,
        "connectionKey": mask_key(gateway.connection_key),
        "hasKey": bool(gateway.connection_key),
        "description": gateway.description or "",
        "isActive": gateway.is_active,
        "updatedAt": iso(gateway.updated_at),
    }


def _clean_bank_name(value: str) -> str:
    bank_name = (value or "").strip()
    if len(bank_name) < 2:
        raise ValidationError("نام بانک را وارد کنید.")
    if len(bank_name) > 120:
        raise ValidationError("نام بانک بیش از حد طولانی است.")
    return bank_name


def _clean_key(value: str) -> str:
    key = (value or "").strip()
    if len(key) < settings.PAYMENT_GATEWAY_KEY_MIN_LENGTH:
        raise ValidationError(
            f"کلید اتصال باید حداقل {settings.PAYMENT_GATEWAY_KEY_MIN_LENGTH} نویسه باشد."
        )
    if len(key) > 500:
        raise ValidationError("کلید اتصال بیش از حد طولانی است.")
    return key


def list_gateways(db: Session, *, active_only: bool = False) -> list[dict[str, Any]]:
    return [gateway_payload(gateway) for gateway in gateway_repo.list_gateways(db, active_only=active_only)]


def get_gateway_or_404(db: Session, gateway_id: str) -> PaymentGateway:
    gateway = gateway_repo.get_gateway(db, gateway_id)
    if gateway is None:
        raise NotFound("درگاه پرداخت یافت نشد.")
    return gateway


def create_gateway(
    db: Session,
    *,
    bank_name: str,
    connection_key: str,
    description: str | None = None,
    is_active: bool = True,
) -> dict[str, Any]:
    bank_name = _clean_bank_name(bank_name)
    connection_key = _clean_key(connection_key)
    if gateway_repo.get_gateway_by_bank(db, bank_name) is not None:
        raise Conflict("درگاهی با این نام بانک قبلاً ثبت شده است.")
    gateway = gateway_repo.create_gateway(
        db,
        bank_name=bank_name,
        connection_key=connection_key,
        description=(description or "").strip() or None,
        is_active=is_active,
    )
    return gateway_payload(gateway)


def update_gateway(
    db: Session,
    gateway: PaymentGateway,
    *,
    bank_name: str | None = None,
    connection_key: str | None = None,
    description: str | None = None,
    is_active: bool | None = None,
) -> dict[str, Any]:
    if bank_name is not None:
        cleaned = _clean_bank_name(bank_name)
        duplicate = gateway_repo.get_gateway_by_bank(db, cleaned)
        if duplicate is not None and duplicate.id != gateway.id:
            raise Conflict("درگاهی با این نام بانک قبلاً ثبت شده است.")
        gateway.bank_name = cleaned
    if connection_key is not None and connection_key.strip():
        gateway.connection_key = _clean_key(connection_key)
    if description is not None:
        gateway.description = description.strip() or None
    if is_active is not None:
        gateway.is_active = is_active
    db.commit()
    db.refresh(gateway)
    return gateway_payload(gateway)


def set_active(db: Session, gateway: PaymentGateway, is_active: bool) -> dict[str, Any]:
    gateway.is_active = is_active
    db.commit()
    db.refresh(gateway)
    return gateway_payload(gateway)


def delete_gateway(db: Session, gateway: PaymentGateway) -> dict[str, Any]:
    payload = {"id": gateway.id, "bankName": gateway.bank_name}
    gateway_repo.delete_gateway(db, gateway)
    return payload
