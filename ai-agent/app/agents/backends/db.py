"""PostgreSQL-backed runtime backend.

The database session is injected by the runner through ``RunnableConfig`` so the LLM
never sees or controls it; this module is the single place that unwraps it.
"""

from __future__ import annotations

from dataclasses import dataclass

from langchain_core.runnables import RunnableConfig
from sqlalchemy.orm import Session

from app.services import consultation_service, form_service


def session_for(config: RunnableConfig | None) -> Session | None:
    """Read the injected session out of ``config["configurable"]["db"]``."""
    configurable = (config or {}).get("configurable") or {}
    return configurable.get("db")


@dataclass(slots=True)
class DbBackend:
    """Backend over the PostgreSQL session of one turn."""

    db: Session | None

    @classmethod
    def from_config(cls, config: RunnableConfig | None) -> "DbBackend":
        return cls(session_for(config))

    def session(self) -> Session | None:
        return self.db

    def form_title(self, form_id: str | None) -> str:
        if not form_id or self.db is None:
            return "—"
        form = form_service.get_form(self.db, form_id)
        return form["title"] if form else form_id

    def process_title(self, process_id: str | None) -> str:
        if not process_id or self.db is None:
            return "—"
        for row in consultation_service.list_published(self.db):
            if row["id"] == process_id:
                return f"{row['title']} ({process_id})"
        return process_id


__all__ = ["DbBackend", "session_for"]
