"""Role and permission payloads."""

from __future__ import annotations

from pydantic import AliasChoices, Field

from .common import APIModel


class RoleCreateRequest(APIModel):
    name: str = Field(min_length=2, max_length=120)
    code: str = Field(min_length=3, max_length=50, pattern=r"^[a-z][a-z0-9_]{2,49}$")
    description: str | None = Field(default=None, max_length=500)
    permissions: dict[str, dict[str, bool]] = Field(default_factory=dict)


class RoleUpdateRequest(APIModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=500)


class RolePermissionsRequest(APIModel):
    permissions: dict[str, dict[str, bool]] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("permissions", "matrix"),
    )
