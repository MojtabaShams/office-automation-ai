from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

from .base import new_id, utcnow


class PaymentGateway(Base):
    """A bank payment gateway configured from the admin panel.

    ``connection_key`` is a secret: it is accepted on create/update and never returned
    by the API (only :func:`app.services.gateway_service.mask_key` output is exposed).
    """

    __tablename__ = "payment_gateways"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("gw"))
    bank_name: Mapped[str] = mapped_column(String(120), nullable=False)
    connection_key: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    # ``is_deleted`` is the only delete path: gateways are archived, never removed,
    # so old payments keep resolving their bank.
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )
