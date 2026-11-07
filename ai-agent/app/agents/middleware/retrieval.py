"""Retrieval: put the knowledge base in front of the model before it answers.

Retrieval runs as its own step rather than as a tool the model may or may not call,
because the service desk must never answer a rules question from the model's own memory.
Intents that cannot benefit (greetings, tracking, guidance confirmations) skip the
round-trip, and a retrieval failure degrades to an empty context instead of failing the
turn.
"""

from __future__ import annotations

import logging

from langchain_core.runnables import RunnableConfig

from app.services import knowledge_service

from ..backends import DbBackend, session_for
from . import activity
from ._utils import last_human_content
from .base import AgentMiddleware, StateUpdates

logger = logging.getLogger(__name__)

#: Intents that never benefit from a knowledge round-trip.
_SKIP_INTENTS = frozenset({"greeting", "track", "process_continue", "process_stop"})


def retrieve(state: dict, config: RunnableConfig) -> StateUpdates:
    """Search the knowledge base for the current message; never raises."""
    db = session_for(config)
    if db is None:
        return {"context": "", "citations": []}

    message = last_human_content(state.get("messages", []))
    if state.get("intent") in _SKIP_INTENTS:
        return {"context": "", "citations": []}
    if len(message.strip()) < 3:
        return {"context": "", "citations": []}

    backend = DbBackend(db)
    pending_title = backend.form_title(state.get("pending_form_id"))
    query = message if pending_title == "—" else f"{message} {pending_title}"

    try:
        activity.record("knowledge")
        context, citations, _ = knowledge_service.search_context(db, query)
    except Exception as exc:  # retrieval failure should degrade, not crash the turn
        logger.warning("Knowledge retrieval failed: %s", exc)
        return {"context": "", "citations": [], "query": query}

    return {"context": context, "citations": citations, "query": query}


class RetrievalMiddleware(AgentMiddleware):
    """Graph step between routing and the model phase."""

    name = "RetrievalMiddleware"

    def run(self, state: dict, config: RunnableConfig) -> StateUpdates:
        return retrieve(state, config)


__all__ = ["RetrievalMiddleware", "retrieve"]
