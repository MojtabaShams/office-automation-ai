"""Form listing and submission payloads."""

from __future__ import annotations

from typing import Any

from pydantic import AliasChoices, Field, field_validator

from .common import APIModel


class FormSubmitRequest(APIModel):
    form_id: str = Field(
        min_length=3,
        max_length=64,
        validation_alias=AliasChoices("form_id", "formId", "id"),
    )
    values: dict[str, Any] = Field(default_factory=dict)
    #: When present, the presented form is removed from that conversation after submission.
    session_id: str | None = Field(
        default=None,
        max_length=64,
        validation_alias=AliasChoices("session_id", "sessionId"),
    )

    @field_validator("values")
    @classmethod
    def _limit_payload(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(value) > 100:
            raise ValueError("تعداد فیلدهای ارسالی بیش از حد مجاز است.")
        return value


class FormStatusRequest(APIModel):
    active: bool = True
    #: Builder status (``active`` / ``inactive`` / ``draft`` / ``archived``);
    #: when omitted it is derived from ``active``.
    status: str | None = Field(default=None, max_length=20)
