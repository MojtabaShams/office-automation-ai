"""Middleware contract of the service-desk harness.

``deepagents`` composes an ordered ``AgentMiddleware`` stack around a model loop that
``langchain.agents.create_agent`` builds. This project cannot use that runtime — it needs
the staged process dialogue and the explicit-confirmation gate to be deterministic, which
means an explicit LangGraph — but it keeps the *composition contract* identical:

* one concern per middleware, in one module;
* the stack is data, assembled by :func:`app.agents.graph.create_service_agent`;
* a middleware is addressed by ``name``, so a deployment can replace or drop it;
* cross-cutting behaviour is expressed as wrapping hooks, never by editing a neighbour.

A middleware contributes either a graph node (:meth:`AgentMiddleware.run`) or a wrapper
around the model call / tool call (:meth:`AgentMiddleware.wrap_model_call`,
:meth:`AgentMiddleware.wrap_tool_call`). Hooks return **state updates**, which is the
value type LangGraph nodes already use here; a wrapper that returns without calling
``call_next`` has short-circuited the phase.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import ClassVar

from langchain_core.runnables import RunnableConfig

StateUpdates = dict


@dataclass(slots=True)
class ToolOutcome:
    """Result of one tool invocation, keeping the failure flag explicit."""

    output: str
    failed: bool = False


class AgentMiddleware:
    """One concern in the harness.

    Subclasses set :attr:`name` (used to replace or exclude them) and override at least
    one of :meth:`run`, :meth:`wrap_model_call` or :meth:`wrap_tool_call`.
    """

    #: Stable identifier; ``create_service_agent`` replaces entries by this value.
    name: ClassVar[str] = "AgentMiddleware"

    def run(self, state: dict, config: RunnableConfig) -> StateUpdates:
        """Graph node body. The default is a pass-through."""
        return {}

    def wrap_model_call(
        self,
        state: dict,
        config: RunnableConfig,
        call_next: Callable[[], StateUpdates],
    ) -> StateUpdates:
        """Wrap the model phase; return early to skip the model entirely."""
        return call_next()

    def wrap_tool_call(
        self,
        state: dict,
        call: dict,
        config: RunnableConfig,
        call_next: Callable[[], ToolOutcome],
    ) -> ToolOutcome:
        """Wrap one tool invocation; return early to skip the tool."""
        return call_next()


def build_wrap_chain(
    middleware: list[AgentMiddleware],
    state: dict,
    config: RunnableConfig,
    innermost: Callable[[], StateUpdates],
) -> Callable[[], StateUpdates]:
    """Fold ``wrap_model_call`` middleware around ``innermost`` (first is outermost)."""
    handler = innermost
    for item in reversed(middleware):
        handler = _bind_model_wrap(item, state, config, handler)
    return handler


def _bind_model_wrap(
    middleware: AgentMiddleware,
    state: dict,
    config: RunnableConfig,
    handler: Callable[[], StateUpdates],
) -> Callable[[], StateUpdates]:
    def wrapped() -> StateUpdates:
        return middleware.wrap_model_call(state, config, handler)

    return wrapped


def build_tool_chain(
    middleware: list[AgentMiddleware],
    state: dict,
    call: dict,
    config: RunnableConfig,
    innermost: Callable[[], ToolOutcome],
) -> Callable[[], ToolOutcome]:
    """Fold ``wrap_tool_call`` middleware around one tool invocation."""
    handler = innermost
    for item in reversed(middleware):
        handler = _bind_tool_wrap(item, state, call, config, handler)
    return handler


def _bind_tool_wrap(
    middleware: AgentMiddleware,
    state: dict,
    call: dict,
    config: RunnableConfig,
    handler: Callable[[], ToolOutcome],
) -> Callable[[], ToolOutcome]:
    def wrapped() -> ToolOutcome:
        return middleware.wrap_tool_call(state, call, config, handler)

    return wrapped


__all__ = [
    "AgentMiddleware",
    "StateUpdates",
    "ToolOutcome",
    "build_tool_chain",
    "build_wrap_chain",
]
