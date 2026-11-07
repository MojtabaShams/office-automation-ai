from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.base import utcnow
from app.models.payment_gateway import PaymentGateway


def list_gateways(db: Session, *, active_only: bool = False) -> list[PaymentGateway]:
    stmt = select(PaymentGateway).where(PaymentGateway.is_deleted.is_(False))
    if active_only:
        stmt = stmt.where(PaymentGateway.is_active.is_(True))
    return list(db.scalars(stmt.order_by(PaymentGateway.bank_name.asc())))


def count_gateways(db: Session) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(PaymentGateway)
            .where(PaymentGateway.is_deleted.is_(False))
        )
        or 0
    )


def get_gateway(db: Session, gateway_id: str) -> PaymentGateway | None:
    gateway = db.get(PaymentGateway, gateway_id)
    if gateway is None or gateway.is_deleted:
        return None
    return gateway


def get_gateway_by_bank(db: Session, bank_name: str) -> PaymentGateway | None:
    return db.scalar(
        select(PaymentGateway).where(
            func.lower(PaymentGateway.bank_name) == bank_name.strip().lower(),
            PaymentGateway.is_deleted.is_(False),
        )
    )


def create_gateway(
    db: Session,
    *,
    bank_name: str,
    connection_key: str,
    description: str | None,
    is_active: bool = True,
) -> PaymentGateway:
    gateway = PaymentGateway(
        bank_name=bank_name,
        connection_key=connection_key,
        description=description,
        is_active=is_active,
    )
    db.add(gateway)
    db.commit()
    db.refresh(gateway)
    return gateway


def delete_gateway(db: Session, gateway: PaymentGateway) -> None:
    """Archive a gateway; payments recorded against it keep resolving the bank."""
    gateway.is_deleted = True
    gateway.is_active = False
    gateway.deleted_at = utcnow()
    db.commit()
