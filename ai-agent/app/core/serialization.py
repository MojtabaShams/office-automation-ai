"""Small serialisation helpers shared by the services."""

from __future__ import annotations

from datetime import datetime


def iso(value: datetime | None) -> str | None:
    """Return an ISO-8601 string (the browser parses it with ``new Date()``)."""
    return value.isoformat() if value is not None else None
