"""Shared column helpers for the ORM models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"
