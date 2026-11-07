"""Per-deployment tuning knobs of the harness.

``deepagents`` resolves a ``HarnessProfile`` per model and applies it while assembling
the middleware stack (base prompt, excluded tools, extra middleware). This project has a
single deployment but several knobs that belong to the harness rather than to a
middleware: how many tool round-trips are allowed, whether sub-agents are exposed, and
which middleware the deployment wants switched off.

A profile is data, not behaviour: :func:`app.agents.graph.create_service_agent` reads it
once while assembling the stack.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.core.config import settings

DEFAULT_NAME = "service-desk"


def _default_models() -> tuple[str, ...]:
    """Ensemble members as configured; evaluated lazily so tests can patch settings."""
    return tuple(settings.ensemble_models)


@dataclass(frozen=True, slots=True)
class HarnessProfile:
    """Ordering and feature switches for one harness assembly."""

    name: str = DEFAULT_NAME
    #: ``None`` means "read ``AGENT_MAX_TOOL_ITERATIONS`` at call time".
    max_tool_iterations: int | None = None
    #: Sub-agents stay off unless a deployment opts in; see :mod:`app.agents.subagents`.
    subagents_enabled: bool = False
    #: Middleware ``name`` values to drop from the assembled stack.
    excluded_middleware: tuple[str, ...] = ()
    #: Advisory only: which model a single-model deployment would use.
    ensemble_members: tuple[str, ...] = field(default_factory=_default_models)

    def tool_iteration_limit(self) -> int:
        if self.max_tool_iterations is None:
            return settings.AGENT_MAX_TOOL_ITERATIONS
        return self.max_tool_iterations


DEFAULT_PROFILE = HarnessProfile()

__all__ = ["DEFAULT_NAME", "DEFAULT_PROFILE", "HarnessProfile"]
