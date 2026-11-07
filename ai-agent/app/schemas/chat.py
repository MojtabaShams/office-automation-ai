"""Chat payloads.

The response is intentionally *not* a strict model: it mirrors the legacy
``{status, message, form, user, token}`` envelope that ``ChatPanel.tsx`` already consumes,
and optional keys are omitted when empty.
"""

from __future__ import annotations

from pydantic import AliasChoices, Field, field_validator

from .common import APIModel

CHAT_INTENTS = {"login", "register"}


class ChatRequest(APIModel):
    #: Empty is allowed when at least one attachment accompanies the turn.
    message: str = Field(default="", max_length=8000)
    intent: str | None = Field(default=None, max_length=32)
    attachment_ids: list[str] = Field(
        default_factory=list,
        max_length=3,
        validation_alias=AliasChoices("attachment_ids", "attachmentIds"),
    )
    session_id: str | None = Field(
        default=None,
        max_length=64,
        validation_alias=AliasChoices("session_id", "sessionId"),
    )
    new_session: bool = Field(
        default=False,
        validation_alias=AliasChoices("new_session", "newSession", "reset"),
    )

    @field_validator("intent")
    @classmethod
    def _normalize_intent(cls, value: str | None) -> str | None:
        if value is None:
            return None
        lowered = value.strip().lower()
        return lowered if lowered in CHAT_INTENTS else None


class RenameSessionRequest(APIModel):
    title: str = Field(min_length=1, max_length=200)
