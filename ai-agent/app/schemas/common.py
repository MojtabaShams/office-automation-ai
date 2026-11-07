"""Shared Pydantic primitives for the public API.

The browser client (``apps/client/app/lib/agent-api.ts``) speaks snake_case, while older
callers of the service desk used camelCase. Both spellings are accepted so that the
contract stays backwards compatible without duplicating request models.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class APIModel(BaseModel):
    """Base model that tolerates unknown keys and both naming styles."""

    model_config = ConfigDict(
        extra="ignore",
        populate_by_name=True,
        str_strip_whitespace=True,
    )


def ok(message: str = "عملیات با موفقیت انجام شد.", **extra: Any) -> dict:
    """Uniform success envelope used by every non-chat endpoint."""
    return {"status": "ok", "message": message, **extra}
