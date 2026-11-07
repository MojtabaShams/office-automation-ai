"""The model phase of the harness.

``deepagents`` wraps the model call of ``create_agent`` with middleware, so a deployment
can replace the model, add a committee, or short-circuit the call without touching the
loop. This module is that phase for the service desk: one graph node whose body is a
``wrap_model_call`` chain.

Order matters and mirrors the old advisor node exactly:

1. :class:`~app.agents.middleware.guidance.GuidanceMiddleware` may answer on its own
   (staged process dialogue) — the model is then never called;
2. :class:`~app.agents.middleware.ensemble.EnsembleMiddleware` may replace the call with
   the three-model committee;
3. this module's own single-model call is the innermost handler, and it degrades to the
   deterministic replies in :mod:`app.agents.middleware.finalize` when no client exists.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence

from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from .._models import get_llm
from ..backends import session_for
from .base import AgentMiddleware, StateUpdates, build_wrap_chain
from .finalize import fallback_reply, finalize_advisor
from .prompting import PROMPT_TEMPLATE_KEY, system_prompt_for

logger = logging.getLogger(__name__)

_ERROR_REPLY = "ارتباط با سرویس هوش مصنوعی برقرار نشد. لطفاً چند لحظه بعد دوباره تلاش کنید."

#: State keys this middleware owns for the duration of one turn.
TURN_TOOL_BINDINGS = "_tool_bindings"


class ModelCallMiddleware(AgentMiddleware):
    """Prompt assembly, the ``wrap_model_call`` chain, and the single-model fallback."""

    name = "ModelCallMiddleware"

    def __init__(
        self,
        wrappers: Sequence[AgentMiddleware] = (),
        *,
        tools: Sequence[object] = (),
        system_prompt: str | None = None,
    ) -> None:
        self._wrappers = list(wrappers)
        self._tools = list(tools)
        self._system_prompt = system_prompt

    def run(self, state: dict, config: RunnableConfig) -> StateUpdates:
        db = session_for(config)
        # The turn dictionary is a local copy: prompt caching and tool bindings must not
        # leak into the graph state.
        working = dict(state)
        working[TURN_TOOL_BINDINGS] = list(self._tools)
        if self._system_prompt is not None:
            working[PROMPT_TEMPLATE_KEY] = self._system_prompt

        chain = build_wrap_chain(
            self._wrappers,
            working,
            config,
            lambda: self._call_model(working, db),
        )
        return chain()

    def _call_model(self, state: dict, db) -> StateUpdates:
        """Innermost handler: one model, or the deterministic reply when unavailable."""
        pending = state.get("pending_form_id")
        prompt = system_prompt_for(state, db)
        llm = get_llm()
        if llm is None:
            return {"messages": [AIMessage(content=fallback_reply(state, db))], "pending_form_id": pending}

        try:
            response = llm.bind_tools(list(self._tools)).invoke(
                [SystemMessage(content=prompt), *list(state.get("messages", []))]
            )
        except Exception as exc:
            logger.exception("Advisor LLM call failed: %s", exc)
            return {"messages": [AIMessage(content=_ERROR_REPLY)], "pending_form_id": pending}

        return finalize_advisor(
            response,
            state,
            db,
            pending,
            list(state.get("messages", [])),
        )


def advisor(state: dict, config: RunnableConfig) -> StateUpdates:
    """Single-model advisor node (no ensemble, no staged guidance)."""
    return ModelCallMiddleware().run(state, config)


__all__ = ["ModelCallMiddleware", "advisor"]
