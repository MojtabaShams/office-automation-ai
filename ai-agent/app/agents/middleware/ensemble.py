"""Multi-model ensemble: Gemini, ChatGPT and Claude answer in parallel via GapGPT.

The committee pattern implemented here is deliberately conservative:

1. Every member receives the *same* system prompt, the *same* history and the *same*
   tool schemas, so the three answers are comparable.
2. Calls run in a :class:`~concurrent.futures.ThreadPoolExecutor` — the SDK calls are
   pure network I/O, so a small thread pool per turn keeps the sync LangGraph node simple
   and avoids rewriting the whole graph as ``async``.
3. A failed member never breaks the turn: one retry is attempted, then it is dropped.
4. **Structured actions are decided by majority vote**, not by the judge. Opening a form or
   a process is a safety-critical decision (the golden rule: only after explicit
   confirmation), and voting is deterministic and auditable.
5. The prose is synthesised by a separate judge call over the surviving answers. When only
   one member answered, or when the committee already agrees, the judge call is skipped.

The module is framework-agnostic: LangChain's ``BaseChatModel`` is duck-typed through
``invoke`` / ``bind_tools``, so tests can pass lightweight fakes instead of HTTP clients.
:class:`EnsembleMiddleware` is the seam that replaces a plain model call with the
committee; it returns early when every member failed so the single-model path runs.
"""

from __future__ import annotations

import logging
import re
import time
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from app.core.config import settings

from .._models import get_chat_model
from ..backends import session_for
from ..prompts import ENSEMBLE_JUDGE_PROMPT
from . import activity
from .base import AgentMiddleware, StateUpdates
from .finalize import finalize_advisor
from .prompting import system_prompt_for

logger = logging.getLogger(__name__)

#: Display names used by the activity chips and the stored trace.
_GEMINI = "Gemini"
_CHATGPT = "ChatGPT"
_CLAUDE = "Claude"

#: Upper bound of one candidate answer injected into the judge prompt.
_CANDIDATE_CHAR_LIMIT = 2000
#: Upper bound of the system prompt injected into the judge prompt.
_PROMPT_CHAR_LIMIT = 4000
_JUDGE_PREFIX_RE = re.compile(r"^\s*(پاسخ\s*نهایی|پاسخ)\s*[:\-–]\s*", re.IGNORECASE)


# ------------------------------------------------------------------------- contracts
@dataclass(slots=True)
class Candidate:
    """One committee member's answer (or its failure)."""

    model: str
    response: AIMessage | None = None
    error: str | None = None
    latency_ms: int = 0

    @property
    def label(self) -> str:
        return model_label(self.model)

    @property
    def text(self) -> str:
        if self.response is None:
            return ""
        content = self.response.content
        return content if isinstance(content, str) else str(content)

    @property
    def actions(self) -> list[dict]:
        return normalize_actions(getattr(self.response, "tool_calls", None) if self.response else None)

    @property
    def usable(self) -> bool:
        return self.response is not None


@dataclass(slots=True)
class EnsembleTurn:
    """The selected answer plus everything the caller needs to explain it."""

    message: AIMessage | None
    candidates: list[Candidate] = field(default_factory=list)
    answer_model: str | None = None
    judged: bool = False
    unanimous: bool = False

    @property
    def models_used(self) -> list[str]:
        return [candidate.model for candidate in self.candidates if candidate.usable]

    @property
    def models_failed(self) -> list[str]:
        return [candidate.model for candidate in self.candidates if not candidate.usable]

    @property
    def reply(self) -> str:
        if self.message is None:
            return ""
        content = self.message.content
        return content if isinstance(content, str) else str(content)


# --------------------------------------------------------------------------- helpers
def model_label(model: str) -> str:
    """Map any GapGPT model id to the human label shown in the UI."""
    lowered = (model or "").lower()
    if "gemini" in lowered:
        return _GEMINI
    if "claude" in lowered:
        return _CLAUDE
    # GapGPT/flagship ids usually say only "gpt-…".
    if "chatgpt" in lowered or lowered.startswith("gpt"):
        return _CHATGPT
    return model or "—"


def normalize_actions(raw_calls: Sequence[Any] | None) -> list[dict]:
    """Convert provider-specific tool calls into stable ``{"name", "args"}`` dicts."""
    normalized: list[dict] = []
    for call in raw_calls or []:
        if not isinstance(call, dict):
            continue
        name = str(call.get("name") or "").strip()
        if not name:
            continue
        args = call.get("args")
        normalized.append({"name": name, "args": dict(args) if isinstance(args, dict) else {}})
    return normalized


def _action_signature(actions: Sequence[dict]) -> tuple[tuple[str, tuple[tuple[str, str], ...]], ...]:
    """Order-independent, hashable identity of a candidate's structured actions."""
    return tuple(
        sorted(
            (str(action.get("name")), tuple(sorted((str(k), str(v)) for k, v in (action.get("args") or {}).items())))
            for action in actions
        )
    )


def _bind_tools(client: Any, tools: Sequence[Any] | None) -> Any:
    if not tools:
        return client
    try:
        return client.bind_tools(list(tools))
    except Exception as exc:  # a model that rejects the schema still answers without tools
        logger.warning("bind_tools failed; calling without tools: %s", exc)
        return client


def _invoke_one(model: str, prompt: list[BaseMessage], tools: Sequence[Any] | None) -> Candidate:
    """Ask one member; never raises."""
    client = get_chat_model(model)
    if client is None:
        return Candidate(model=model, error="client unavailable")

    started = time.perf_counter()
    try:
        response = _bind_tools(client, tools).invoke(prompt)
    except Exception as exc:
        logger.warning("Ensemble member %s failed: %s", model, exc)
        return Candidate(model=model, error=str(exc)[:300])
    latency = int((time.perf_counter() - started) * 1000)

    if not isinstance(response, AIMessage):
        response = AIMessage(content=str(getattr(response, "content", response)))
    return Candidate(model=model, response=response, latency_ms=latency)


def _collect(models: Sequence[str], prompt: list[BaseMessage], tools: Sequence[Any] | None) -> list[Candidate]:
    """Run every member in parallel, then retry the ones that failed once."""
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=max(1, len(models)), thread_name_prefix="ensemble") as pool:
        candidates = list(pool.map(lambda model: _invoke_one(model, prompt, tools), models))

    failed = [candidate.model for candidate in candidates if not candidate.usable]
    if failed and len(failed) < len(candidates):
        # A single retry only when the committee is partially available: three calls per
        # model would triple latency for a permanently wrong model id.
        with ThreadPoolExecutor(max_workers=len(failed), thread_name_prefix="ensemble-retry") as pool:
            retried = list(pool.map(lambda model: _invoke_one(model, prompt, tools), failed))
        by_model = {candidate.model: candidate for candidate in retried}
        candidates = [by_model.get(candidate.model, candidate) for candidate in candidates]

    logger.info(
        "Ensemble answered in %d ms: %s",
        int((time.perf_counter() - started) * 1000),
        ", ".join(f"{model_label(c.model)}={'ok' if c.usable else 'fail'}" for c in candidates),
    )
    return candidates


def tally_actions(candidates: Sequence[Candidate]) -> tuple[tuple | None, int, int]:
    """Majority vote with abstention.

    A member that returns no tool call counts as a vote for "do nothing", which is the
    safe default of this product, so 2 of 3 members agreeing on an action is a majority.
    The returned signature is ``None`` when no option holds a strict majority, and the
    caller then executes no action at all.
    """
    votes: dict[tuple, int] = {}
    for candidate in candidates:
        signature = _action_signature(candidate.actions)
        votes[signature] = votes.get(signature, 0) + 1

    signature, count = max(votes.items(), key=lambda item: item[1])
    total = len(candidates)
    return (signature if count * 2 > total else None), count, total


def pick_winner(candidates: Sequence[Candidate], *, intent: str = "") -> Candidate | None:
    """Deterministic fallback when the judge is unavailable or skipped.

    The final action is decided by the vote, never by the answer length; the victor here
    only supplies the prose (and, when the vote has a majority, its tool calls).
    """
    usable = [candidate for candidate in candidates if candidate.usable]
    if not usable:
        return None

    # When a majority action exists, only candidates that agreed on it are eligible to
    # supply the prose. This keeps a dissenting (often longer) reply from being reported
    # as the answer model for an action the majority took.
    signature, votes, total = tally_actions(usable)
    if signature is not None and votes > total / 2:
        agreeing = [
            candidate for candidate in usable
            if _action_signature(candidate.actions) == signature
        ]
        if agreeing:
            usable = agreeing

    def score(candidate: Candidate) -> tuple[int, int]:
        prefers_excerpt = 0
        if intent == "knowledge" and re.search(r"\[\d+\]|پایگاه دانش", candidate.text):
            prefers_excerpt = 1
        return (prefers_excerpt, len(candidate.text.strip()))

    return max(usable, key=score)


def _judge_prompt(system_prompt: str, messages: Sequence[BaseMessage], candidates: Sequence[Candidate]) -> str:
    user_message = ""
    for message in reversed(messages):
        if isinstance(message, HumanMessage):
            content = message.content
            user_message = content if isinstance(content, str) else str(content)
            break

    blocks = []
    for index, candidate in enumerate(candidates, start=1):
        text = candidate.text.strip() or "(این مدل فقط یک عملیات ساختاریافته درخواست کرده و متنی ندارد)"
        blocks.append(f"### پاسخ {index} — {candidate.label}\n{text[:_CANDIDATE_CHAR_LIMIT]}")

    return ENSEMBLE_JUDGE_PROMPT.format(
        system_prompt=system_prompt[:_PROMPT_CHAR_LIMIT],
        user_message=user_message or "—",
        candidates="\n\n".join(blocks),
    )


def _judge(system_prompt: str, messages: Sequence[BaseMessage], candidates: Sequence[Candidate]) -> str | None:
    """Ask the judge model to pick/merge the best answer; ``None`` when it cannot."""
    if not settings.AGENT_ENSEMBLE_JUDGE_ENABLED:
        return None
    client = get_chat_model(settings.ensemble_judge_model, 0.1)
    if client is None:
        return None
    try:
        response = client.invoke(
            [HumanMessage(content=_judge_prompt(system_prompt, messages, candidates))]
        )
    except Exception as exc:
        logger.warning("Ensemble judge failed: %s", exc)
        return None

    content = response.content if isinstance(response.content, str) else str(response.content)
    content = _JUDGE_PREFIX_RE.sub("", content).strip()
    return content or None


def _record_activity(candidates: Sequence[Candidate], *, judged: bool) -> None:
    labels = [candidate.label for candidate in candidates if candidate.usable]
    if not labels:
        return
    if len(labels) == 1:
        activity.record("models", f"دریافت پاسخ از مدل هوش مصنوعی ({labels[0]})…")
    else:
        activity.record("models", f"مقایسه پاسخ {len(labels)} مدل هوش مصنوعی ({'، '.join(labels)})…")
    if judged:
        activity.record("judge", "انتخاب و ترکیب بهترین پاسخ…")


# ------------------------------------------------------------------------ public API
def run_ensemble(
    *,
    system_prompt: str,
    messages: Sequence[BaseMessage],
    tools: Sequence[Any] | None = None,
    intent: str = "",
    models: Sequence[str] | None = None,
) -> EnsembleTurn:
    """Ask the committee, then return the best answer with its structured actions.

    ``EnsembleTurn.message`` is ``None`` only when every member failed; callers then fall
    back to the single-model path or to the deterministic reply.
    """
    members = [model for model in (models or settings.ensemble_models) if model]
    if not members:
        return EnsembleTurn(message=None)

    prompt: list[BaseMessage] = [SystemMessage(content=system_prompt), *messages]
    candidates = _collect(members, prompt, tools)
    usable = [candidate for candidate in candidates if candidate.usable]
    if not usable:
        _record_activity(candidates, judged=False)
        return EnsembleTurn(message=None, candidates=candidates)

    winner = pick_winner(usable, intent=intent)
    signature, votes, total = tally_actions(usable)
    unanimous = len(usable) > 1 and signature is not None and votes == total

    # The judge only rewrites prose; the action always comes from the vote.
    judged = False
    final_text: str | None = None
    if len(usable) > 1 and not (settings.AGENT_ENSEMBLE_EARLY_STOP and unanimous):
        final_text = _judge(system_prompt, messages, usable)
        judged = final_text is not None

    _record_activity(candidates, judged=judged)

    if winner is None:
        return EnsembleTurn(message=None, candidates=candidates)
    text = final_text if final_text is not None else winner.text
    # The action is executed exactly as the majority voted it; the prose may come from a
    # different member, so the tool calls are taken from a voter, not from the winner.
    tool_calls: list = []
    if signature is not None:
        voter = next(
            (candidate for candidate in usable if _action_signature(candidate.actions) == signature),
            None,
        )
        if voter is not None and voter.response is not None:
            tool_calls = list(voter.response.tool_calls)
    message = AIMessage(content=text, tool_calls=tool_calls)
    return EnsembleTurn(
        message=message,
        candidates=candidates,
        answer_model=winner.model,
        judged=judged,
        unanimous=unanimous,
    )


def describe(turn: EnsembleTurn) -> str:
    """Compact Persian trace stored with the assistant message (debugging/audit)."""
    if not turn.candidates:
        return "کمیته مدل‌ها در دسترس نبود."
    parts = []
    for candidate in turn.candidates:
        status = f"{candidate.latency_ms}ms" if candidate.usable else "خطا"
        parts.append(f"{candidate.label}: {status}")
    trace = "، ".join(parts)
    if turn.answer_model:
        trace += f" — پاسخ نهایی: {model_label(turn.answer_model)}"
    if turn.judged:
        trace += " (ترکیب با داور)"
    return trace


class EnsembleMiddleware(AgentMiddleware):
    """Replaces one model call with the three-model committee.

    Returns ``call_next()`` — the single-model path — when the ensemble is disabled or
    when every member failed, so the harness degrades exactly as before. The selected
    answer is finalised by the caller's ``after_model`` step (see
    :mod:`app.agents.middleware.model`), which keeps action extraction in one place.
    """

    name = "EnsembleMiddleware"

    def __init__(self, runner: Callable[..., EnsembleTurn] | None = None) -> None:
        self._runner = runner or run_ensemble

    def wrap_model_call(
        self,
        state: dict,
        config: RunnableConfig,
        call_next: Callable[[], StateUpdates],
    ) -> StateUpdates:
        if not settings.ensemble_enabled:
            return call_next()

        db = session_for(config)
        turn = self._runner(
            system_prompt=system_prompt_for(state, db),
            messages=list(state.get("messages", [])),
            tools=state.get("_tool_bindings"),
            intent=state.get("intent") or "",
        )
        trace = describe(turn)
        if turn.message is None:
            logger.warning("Every ensemble member failed; falling back. %s", trace)
            return call_next()

        logger.info("Advisor ensemble: %s", trace)
        return finalize_advisor(
            turn.message,
            state,
            db,
            state.get("pending_form_id"),
            list(state.get("messages", [])),
            extra={
                "answer_model": turn.answer_model,
                "ensemble_trace": trace,
                "used_judge": turn.judged,
            },
        )


__all__ = [
    "Candidate",
    "EnsembleMiddleware",
    "EnsembleTurn",
    "describe",
    "model_label",
    "normalize_actions",
    "pick_winner",
    "run_ensemble",
    "tally_actions",
]
