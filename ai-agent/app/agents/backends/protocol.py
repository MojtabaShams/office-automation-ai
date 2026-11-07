"""Runtime backend contract.

``deepagents`` hides *where* the agent's files live behind a ``BackendProtocol`` so the
middleware never touches a concrete store. This harness needs the same seam for a
different resource: the organisation's data. A middleware asks the backend for the
current session or for a human readable title and never reaches into
``RunnableConfig``, ``Session`` objects or the graph state on its own.

Kept deliberately tiny: a backend is only worth existing if a middleware can be written
against it without knowing whether the data came from PostgreSQL or from the graph.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from sqlalchemy.orm import Session


@runtime_checkable
class RuntimeBackend(Protocol):
    """Read-only view of the resources one agent turn may touch."""

    def session(self) -> Session | None:
        """SQLAlchemy session for the current turn, or ``None`` when unavailable."""

    def form_title(self, form_id: str | None) -> str:
        """Display title of a form; ``—`` when it is unknown or no session exists."""

    def process_title(self, process_id: str | None) -> str:
        """Human readable label of a published process, or the raw id."""
