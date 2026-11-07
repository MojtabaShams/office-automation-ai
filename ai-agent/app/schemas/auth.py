"""Authentication payloads (register / login / logout / profile / password change)."""

from __future__ import annotations

from pydantic import AliasChoices, Field

from .common import APIModel


class RegisterRequest(APIModel):
    full_name: str = Field(
        min_length=3,
        max_length=120,
        validation_alias=AliasChoices("full_name", "fullName", "name"),
    )
    national_id: str = Field(
        min_length=10,
        max_length=12,
        validation_alias=AliasChoices("national_id", "nationalId"),
    )
    mobile: str = Field(min_length=10, max_length=15)
    password: str = Field(min_length=8, max_length=128)
    # Required: the service refuses a registration without a matching confirmation.
    password_confirm: str = Field(
        min_length=1,
        max_length=128,
        validation_alias=AliasChoices("password_confirm", "passwordConfirm", "confirm_password"),
    )


class LoginRequest(APIModel):
    mobile: str = Field(min_length=10, max_length=15)
    password: str = Field(min_length=1, max_length=128)


class ChangePasswordRequest(APIModel):
    current_password: str = Field(
        min_length=1,
        max_length=128,
        validation_alias=AliasChoices("current_password", "currentPassword", "old_password"),
    )
    new_password: str = Field(
        min_length=8,
        max_length=128,
        validation_alias=AliasChoices("new_password", "newPassword"),
    )
    new_password_confirm: str = Field(
        min_length=1,
        max_length=128,
        validation_alias=AliasChoices(
            "new_password_confirm", "newPasswordConfirm", "confirm_password"
        ),
    )


class ProfileUpdateRequest(APIModel):
    full_name: str | None = Field(
        default=None,
        min_length=3,
        max_length=120,
        validation_alias=AliasChoices("full_name", "fullName"),
    )
    email: str | None = Field(default=None, max_length=200)
    unit: str | None = Field(default=None, max_length=120)
    #: Empty string clears the picture; otherwise a resized data URL from the profile page.
    avatar: str | None = Field(default=None, max_length=400_000)
