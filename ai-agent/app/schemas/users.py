"""Employee (admin user) payloads."""

from __future__ import annotations

from pydantic import AliasChoices, Field

from .common import APIModel


class EmployeeCreateRequest(APIModel):
    full_name: str = Field(
        min_length=3,
        max_length=120,
        validation_alias=AliasChoices("full_name", "fullName"),
    )
    mobile: str = Field(min_length=10, max_length=15)
    national_id: str = Field(
        min_length=10,
        max_length=12,
        validation_alias=AliasChoices("national_id", "nationalId"),
    )
    password: str = Field(min_length=8, max_length=128)
    role_id: str = Field(
        min_length=1,
        max_length=64,
        validation_alias=AliasChoices("role_id", "roleId", "accessLevelId"),
    )
    email: str | None = Field(default=None, max_length=200)
    unit: str | None = Field(default=None, max_length=120)
    is_active: bool = Field(
        default=True,
        validation_alias=AliasChoices("is_active", "isActive"),
    )


class EmployeeUpdateRequest(APIModel):
    full_name: str | None = Field(
        default=None,
        min_length=3,
        max_length=120,
        validation_alias=AliasChoices("full_name", "fullName"),
    )
    mobile: str | None = Field(default=None, min_length=10, max_length=15)
    national_id: str | None = Field(
        default=None,
        min_length=10,
        max_length=12,
        validation_alias=AliasChoices("national_id", "nationalId"),
    )
    role_id: str | None = Field(
        default=None,
        min_length=1,
        max_length=64,
        validation_alias=AliasChoices("role_id", "roleId", "accessLevelId"),
    )
    email: str | None = Field(default=None, max_length=200)
    unit: str | None = Field(default=None, max_length=120)
    is_active: bool | None = Field(
        default=None,
        validation_alias=AliasChoices("is_active", "isActive"),
    )


class UserStatusRequest(APIModel):
    is_active: bool = Field(validation_alias=AliasChoices("is_active", "isActive", "active"))
