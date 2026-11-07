"""Explicit-confirmation detection and the gate that enforces the golden rule.

The golden rule of this assistant is that a form is never rendered without an explicit
user confirmation. Relying on the LLM alone for that decision is fragile, so the first
gate is this deterministic classifier; the LLM is only consulted for ambiguous replies.

Nothing else in the harness may set ``confirmed``: tools read it, the presenter acts on
it, and only this module writes it.
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata

from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig

from .._models import get_llm
from ..backends import DbBackend, session_for
from ..prompts import CONFIRMATION_CLASSIFIER_PROMPT
from ._utils import last_ai_content, last_human_content
from .base import AgentMiddleware, StateUpdates

logger = logging.getLogger(__name__)

CONFIRM = "confirm"
DECLINE = "decline"
UNCLEAR = "unclear"

_DECLINE_PATTERNS = (
    r"\bنه\b",
    r"\bخیر\b",
    r"\bنمی\s?خوام\b",
    r"\bنمی\s?خواهم\b",
    r"\bانصراف\b",
    r"\bلغو\b",
    r"\bبی\s?خیال\b",
    r"\bبعدا\b",
    r"\bبعداً\b",
    r"\bفعلا نه\b",
    r"\bفعلاً نه\b",
    r"\bno\b",
    r"\bnope\b",
)

_CONFIRM_PATTERNS = (
    r"\bبله\b",
    r"\bبلی\b",
    r"\bآره\b",
    r"\bاره\b",
    r"\bباشه\b",
    r"\bباشک?\b",
    r"\bحتما\b",
    r"\bحتماً\b",
    r"\bتایید\b",
    r"\bتأیید\b",
    r"\bتأیید می\s?کنم\b",
    r"\bموافقم\b",
    r"\bدرسته\b",
    r"\bصحیح\b",
    r"\bاوکی\b",
    r"\bok(ay)?\b",
    r"\byes\b",
    r"\bsure\b",
    r"باز\s?کن",
    r"بازش\s?کن",
    r"نمایش\s?بده",
    r"نشون\s?بده",
    r"ثبت\s?کن",
    r"پر\s?کن",
    r"ادامه\s?بده",
    r"می\s?خوام\s?(ثبت|ببینم|پر)",
)

_QUESTION_MARKERS = ("?", "؟", "چرا", "چطور", "چگونه", "یعنی", "فرق")

# Imperatives that unambiguously ask for the form, even when mixed with a question.
_STRONG_INTENT = re.compile(
    r"(باز|بازش|نمایش|نشون)\s?((می\s?)?کن|بده)|ثبت\s?کن|پر\s?کن|ادامه\s?بده"
)


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    text = text.replace("\u200c", " ").replace("ي", "ی").replace("ك", "ک")
    text = re.sub(r"[.,!؛;:\"'«»()\[\]]", " ", text)
    return re.sub(r"\s+", " ", text).strip().lower()


def detect_confirmation(text: str) -> str:
    """Classify a user reply as ``confirm``, ``decline`` or ``unclear``."""
    normalized = normalize(text)
    if not normalized or len(normalized) > 160:
        return UNCLEAR

    if any(re.search(pattern, normalized) for pattern in _DECLINE_PATTERNS):
        return DECLINE

    has_confirmation = any(re.search(pattern, normalized) for pattern in _CONFIRM_PATTERNS)
    if not has_confirmation:
        return UNCLEAR

    # A question mixed with a confirmation (e.g. «باشه ولی چرا؟») shows hesitation, so it
    # only counts when the user also uses an explicit imperative (e.g. «بله، بازش کن»).
    if any(marker in normalized for marker in _QUESTION_MARKERS) and not _STRONG_INTENT.search(normalized):
        return UNCLEAR

    # A confirmation is usually short; a long message that also asks a new question is
    # treated as a new request so we don't open a form by accident.
    if len(normalized) > 80 and any(marker in normalized for marker in _QUESTION_MARKERS):
        return UNCLEAR
    return CONFIRM


def looks_like_greeting(text: str) -> bool:
    normalized = normalize(text)
    return bool(re.fullmatch(r"(سلام|درود|وقت بخیر|سلام علیکم|hi|hello)[\!\s]*", normalized))


def classify_with_llm(state: dict, db) -> str:
    """Second gate for ambiguous replies; only used when a form was already pending."""
    message = last_human_content(state.get("messages", []))
    if not message or len(message) > 120:
        return UNCLEAR

    previous_question = last_ai_content(state.get("messages", []))
    if "؟" not in previous_question and "?" not in previous_question:
        return UNCLEAR  # the assistant never asked for confirmation

    llm = get_llm()
    if llm is None:
        return UNCLEAR

    prompt = CONFIRMATION_CLASSIFIER_PROMPT.format(
        form_title=DbBackend(db).form_title(state.get("pending_at_start")),
        last_question=previous_question[-500:],
        user_message=message,
    )
    try:
        response = llm.invoke([HumanMessage(content=prompt)])
    except Exception as exc:
        logger.warning("Confirmation classifier failed: %s", exc)
        return UNCLEAR

    raw = response.content if isinstance(response.content, str) else str(response.content)
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return UNCLEAR
    try:
        decision = str(json.loads(match.group(0)).get("decision", UNCLEAR)).lower()
    except json.JSONDecodeError:
        return UNCLEAR
    return decision if decision in {CONFIRM, DECLINE} else UNCLEAR


def confirmation_gate(state: dict, config: RunnableConfig) -> StateUpdates:
    """Decide whether the applicant confirmed or declined; sets exactly one flag."""
    db = session_for(config)
    intent = state.get("intent")
    pending = state.get("pending_form_id")

    if intent == "confirm":
        return {"confirmed": True}
    if intent == "decline":
        return {"declined": True}

    # Only an *already pending* form may be confirmed through the LLM fallback; a brand-new
    # form request in this same turn must never be auto-confirmed.
    if pending and pending == state.get("pending_at_start") and db is not None:
        decision = classify_with_llm(state, db)
        if decision == CONFIRM:
            return {"confirmed": True}
        if decision == DECLINE:
            return {"declined": True}
    return {}


class ConfirmationMiddleware(AgentMiddleware):
    """The single writer of ``confirmed`` / ``declined``."""

    name = "ConfirmationMiddleware"

    def run(self, state: dict, config: RunnableConfig) -> StateUpdates:
        return confirmation_gate(state, config)


__all__ = [
    "CONFIRM",
    "DECLINE",
    "UNCLEAR",
    "ConfirmationMiddleware",
    "classify_with_llm",
    "confirmation_gate",
    "detect_confirmation",
    "looks_like_greeting",
    "normalize",
]
