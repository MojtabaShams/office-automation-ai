"""Payment gateway payloads (the connection key is write-only)."""

from __future__ import annotations

from pydantic import AliasChoices, Field

from .common import APIModel


class PaymentGatewayCreateRequest(APIModel):
    bank_name: str = Field(
        min_length=2,
        max_length=120,
        validation_alias=AliasChoices("bank_name", "bankName"),
    )
    connection_key: str = Field(
        min_length=4,
        max_length=500,
        validation_alias=AliasChoices("connection_key", "connectionKey"),
    )
    description: str | None = Field(default=None, max_length=1000)
    is_active: bool = Field(
        default=True,
        validation_alias=AliasChoices("is_active", "isActive"),
    )


class PaymentGatewayUpdateRequest(APIModel):
    bank_name: str | None = Field(
        default=None,
        min_length=2,
        max_length=120,
        validation_alias=AliasChoices("bank_name", "bankName"),
    )
    connection_key: str | None = Field(
        default=None,
        max_length=500,
        validation_alias=AliasChoices("connection_key", "connectionKey"),
    )
    description: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = Field(
        default=None,
        validation_alias=AliasChoices("is_active", "isActive"),
    )


class GatewayStatusRequest(APIModel):
    is_active: bool = Field(validation_alias=AliasChoices("is_active", "isActive", "active"))
