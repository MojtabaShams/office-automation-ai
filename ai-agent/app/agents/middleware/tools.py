"""Tool execution: run the calls a model asked for and turn them into UI payloads.

The graph node is a ``wrap_tool_call`` chain so a deployment can intercept a single call
(log it, veto it, rewrite its arguments) without editing this loop. Three things happen
per call and nothing more:

1. the tool runs, and any failure becomes a tool message rather than an exception;
2. sentinel outputs (``FORM_READY:``, ``PROCESS_READY:``, ``PROCESS_STARTED:``) are
   resolved into the structured payloads the chat panel renders;
3. the pending form/process bookkeeping is updated so the *next* turn knows what the
   applicant is being asked about.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable, Sequence

from langchain_core.messages import ToolMessage
from langchain_core.runnables import RunnableConfig

from app.services import consultation_service, form_service

from ..backends import session_for
from .base import AgentMiddleware, StateUpdates, ToolOutcome, build_tool_chain

logger = logging.getLogger(__name__)

#: Tools whose name alone is enough to know what the applicant is being asked about.
FORM_REQUIREMENTS_TOOL = "get_form_requirements"
PROCESS_SUMMARY_TOOL = "get_process_consultation_summary"


class ToolMiddleware(AgentMiddleware):
    """Executes the pending tool calls of the newest assistant message."""

    name = "ToolMiddleware"

    def __init__(
        self,
        tool_map: dict[str, object] | None = None,
        *,
        interceptors: Sequence[AgentMiddleware] = (),
    ) -> None:
        self._tool_map = tool_map or {}
        self._interceptors = list(interceptors)

    def run(self, state: dict, config: RunnableConfig) -> StateUpdates:
        db = session_for(config)
        messages = state.get("messages") or []
        last = messages[-1] if messages else None
        tool_calls = list(getattr(last, "tool_calls", None) or [])
        iterations = state.get("tool_iterations", 0) + 1
        if db is None:
            return {"tool_iterations": iterations}

        tool_messages: list[ToolMessage] = []
        form_payload = state.get("form_payload")
        process_payload = state.get("process_payload")
        stepper_process_id = state.get("stepper_process_id")
        pending = state.get("pending_form_id")

        for call in tool_calls:
            name = call.get("name")
            args = call.get("args") or {}
            outcome = self._execute(state, call, config)
            output = outcome.output

            if name == FORM_REQUIREMENTS_TOOL and args.get("form_id"):
                pending = str(args["form_id"])
            if name == PROCESS_SUMMARY_TOOL and args.get("process_id") and not outcome.failed:
                # The consultant summary prepares the confirmation; the applicant stage
                # form is what the panel renders after the user explicitly confirms.
                resolved = consultation_service.process_payload(db, str(args["process_id"]))
                if resolved is not None:
                    process_payload = resolved
                    pending = (resolved.get("form") or {}).get("form_id") or pending
            if output.startswith("FORM_READY:"):
                parts = output.split(":", 2)  # FORM_READY, form_id, optional PREFILL:...
                fid = parts[1]
                form = form_service.get_form(db, fid)
                if form:
                    if len(parts) > 2 and parts[2].startswith("PREFILL:"):
                        try:
                            prefill = json.loads(parts[2][len("PREFILL:"):])
                        except Exception:
                            prefill = None
                        if isinstance(prefill, dict):
                            form = dict(form)
                            form["prefill"] = prefill
                    form_payload = form
                    pending = None
            if output.startswith("PROCESS_READY:"):
                resolved = consultation_service.process_payload(db, output.split(":", 1)[1])
                if resolved and resolved.get("form"):
                    process_payload = resolved
                    form_payload = resolved["form"]
                    pending = None
            if output.startswith("PROCESS_STARTED:"):
                # Structured action: the client opens the multi-step wizard for this process.
                stepper_process_id = output.split(":", 1)[1]
                pending = None

            tool_messages.append(ToolMessage(content=output, tool_call_id=call.get("id")))

        return {
            "messages": tool_messages,
            "form_payload": form_payload,
            "process_payload": process_payload,
            "stepper_process_id": stepper_process_id,
            "pending_form_id": pending,
            "tool_iterations": iterations,
        }

    def _execute(self, state: dict, call: dict, config: RunnableConfig) -> ToolOutcome:
        """Run one call through the interceptor chain, then through the tool itself."""
        chain = build_tool_chain(
            self._interceptors,
            state,
            call,
            config,
            lambda: self._invoke(call),
        )
        return chain()

    def _invoke(self, call: dict) -> ToolOutcome:
        name = call.get("name")
        args = call.get("args") or {}
        tool = self._tool_map.get(name)
        if tool is None:
            return ToolOutcome(f"ابزار ناشناخته: {name}", failed=True)
        try:
            return ToolOutcome(str(tool.invoke(args)))
        except Exception as exc:
            logger.warning("Tool %s failed: %s", name, exc)
            return ToolOutcome(f"خطا در اجرای ابزار: {exc}", failed=True)


def route_after_model(state: dict, *, tool_limit: int) -> str:
    """Continue into the tools while the model keeps calling them; otherwise gate."""
    messages = state.get("messages", [])
    if not messages:
        return "confirmation_gate"
    last = messages[-1]
    tool_calls = getattr(last, "tool_calls", None) or []
    if tool_calls and state.get("tool_iterations", 0) < tool_limit:
        return "tools"
    return "confirmation_gate"


__all__ = ["ToolMiddleware", "route_after_model"]
