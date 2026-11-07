"""Payment gateway endpoints (the connection key is never returned)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import db_session, require_permission
from app.models.user import User
from app.schemas.common import ok
from app.schemas.gateways import (
    GatewayStatusRequest,
    PaymentGatewayCreateRequest,
    PaymentGatewayUpdateRequest,
)
from app.services import gateway_service

router = APIRouter(prefix="/api/payment-gateways", tags=["payment-gateways"])


@router.get("")
def list_gateways(
    active_only: bool = Query(default=False),
    _: User = Depends(require_permission("payment_gateways", "view")),
    db: Session = Depends(db_session),
) -> dict:
    gateways = gateway_service.list_gateways(db, active_only=active_only)
    return ok("فهرست درگاه‌های پرداخت", gateways=gateways, count=len(gateways))


@router.post("")
def create_gateway(
    req: PaymentGatewayCreateRequest,
    _: User = Depends(require_permission("payment_gateways", "create")),
    db: Session = Depends(db_session),
) -> dict:
    gateway = gateway_service.create_gateway(
        db,
        bank_name=req.bank_name,
        connection_key=req.connection_key,
        description=req.description,
        is_active=req.is_active,
    )
    return ok("درگاه پرداخت ثبت شد.", gateway=gateway)


@router.patch("/{gateway_id}")
def update_gateway(
    gateway_id: str,
    req: PaymentGatewayUpdateRequest,
    _: User = Depends(require_permission("payment_gateways", "update")),
    db: Session = Depends(db_session),
) -> dict:
    gateway = gateway_service.get_gateway_or_404(db, gateway_id)
    updated = gateway_service.update_gateway(
        db,
        gateway,
        bank_name=req.bank_name,
        connection_key=req.connection_key,
        description=req.description,
        is_active=req.is_active,
    )
    return ok("درگاه پرداخت به‌روزرسانی شد.", gateway=updated)


@router.patch("/{gateway_id}/status")
def set_gateway_status(
    gateway_id: str,
    req: GatewayStatusRequest,
    _: User = Depends(require_permission("payment_gateways", "update")),
    db: Session = Depends(db_session),
) -> dict:
    gateway = gateway_service.get_gateway_or_404(db, gateway_id)
    updated = gateway_service.set_active(db, gateway, req.is_active)
    return ok("وضعیت درگاه پرداخت تغییر کرد.", gateway=updated)


@router.delete("/{gateway_id}")
def delete_gateway(
    gateway_id: str,
    _: User = Depends(require_permission("payment_gateways", "delete")),
    db: Session = Depends(db_session),
) -> dict:
    gateway = gateway_service.get_gateway_or_404(db, gateway_id)
    deleted = gateway_service.delete_gateway(db, gateway)
    return ok("درگاه پرداخت حذف شد.", **deleted)
