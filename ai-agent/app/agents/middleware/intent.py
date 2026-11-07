"""Intent routing: decide what kind of turn this is before anything else runs.

The service desk routes deterministically instead of letting a model choose, because the
golden rule ("never open a form without explicit confirmation") and the staged process
dialogue both depend on knowing the intent before the model is consulted.

Intent values, all consumed by later middleware:

``confirm`` / ``decline``
    A reply to a pending form or guidance question; goes straight to the gate.
``track``        An application tracking number or "status of my request".
``greeting``     A bare greeting; never worth a knowledge round-trip.
``process_continue`` / ``process_stop``
    Advancing or ending the staged process dialogue.
``process_request``
    A published process was named; the pending process id is set here.
``form_request``
    A form was named or asked for.
``knowledge``    A rules/documents question.
``general``      Everything else.
"""

from __future__ import annotations

import re

from langchain_core.runnables import RunnableConfig

from app.services import form_service

from ..backends import session_for
from . import guidance
from ._utils import last_human_content
from .base import AgentMiddleware, StateUpdates
from .confirmation import CONFIRM, DECLINE, UNCLEAR, detect_confirmation, looks_like_greeting

_TRACKING_RE = re.compile(r"\bR[0-9A-F]{8}\b", re.IGNORECASE)
_FORM_KEYWORDS = (
    "فرم",
    "درخواست",
    "ثبت نام",
    "ثبت‌نام",
    "مرخصی",
    "ماموریت",
    "اضافه کاری",
    "اضافه‌کاری",
    "شکایت",
    "پرونده",
    "خدمت",
)
_KNOWLEDGE_KEYWORDS = (
    "قانون",
    "مقررات",
    "آیین",
    "مدارک",
    "مراحل",
    "شرایط",
    "چطور",
    "چگونه",
    "راهنما",
    "چیست",
    "؟",
    "?",
)


def intent_router(state: dict, config: RunnableConfig) -> StateUpdates:
    """Classify the newest user message into one intent and set the pending ids."""
    db = session_for(config)
    text = last_human_content(state.get("messages", []))
    lowered = text.lower()
    pending = state.get("pending_form_id")
    pending_process = state.get("pending_process_id")
    stage = state.get("guidance_stage")

    decision = detect_confirmation(text) if pending else UNCLEAR
    mentioned = form_service.find_form_id(db, text) if db is not None else None
    switched = bool(mentioned and pending and mentioned != pending)

    if pending and decision == CONFIRM and not switched:
        return {"intent": "confirm"}
    if pending and decision == DECLINE and not switched:
        return {"intent": "decline"}

    if _TRACKING_RE.search(text) or "پیگیری" in lowered or "وضعیت درخواست" in lowered:
        return {"intent": "track"}

    if looks_like_greeting(text):
        return {"intent": "greeting"}

    # A process is waiting for progressive guidance: "بله" advances exactly one stage.
    if pending_process and stage:
        answer = detect_confirmation(text)
        if answer == CONFIRM:
            return {"intent": "process_continue"}
        if answer == DECLINE:
            return {"intent": "process_stop"}
        wants_next = {
            guidance.STAGE_OVERVIEW: ("مرحله", "مراحل", "گام"),
            guidance.STAGE_STEPS: ("فرم", "فرم‌ها", "مدارک", "مدرک", "هزینه"),
            guidance.STAGE_FORMS: ("شروع", "باز کن", "بازش کن"),
        }.get(stage, ())
        if wants_next and any(keyword in lowered for keyword in wants_next):
            return {"intent": "process_continue"}

    # An explicit form request always keeps the legacy per-form flow.
    explicit_form = "فرم" in lowered
    process_id = None
    if db is not None and not explicit_form:
        process_id = guidance.match_process(db, text)
    if process_id:
        return {"intent": "process_request", "pending_process_id": process_id}

    if mentioned or any(keyword in lowered for keyword in _FORM_KEYWORDS):
        return {"intent": "form_request", "pending_form_id": mentioned or pending}
    if any(keyword in lowered for keyword in _KNOWLEDGE_KEYWORDS):
        return {"intent": "knowledge"}
    return {"intent": "general"}


def route_after_intent(state: dict) -> str:
    """Confirmations skip retrieval and go straight to the gate."""
    return "confirmation_gate" if state.get("intent") in {"confirm", "decline"} else "retrieve"


class IntentMiddleware(AgentMiddleware):
    """Graph entry point: one intent per turn, decided without a model."""

    name = "IntentMiddleware"

    def run(self, state: dict, config: RunnableConfig) -> StateUpdates:
        return intent_router(state, config)


__all__ = ["IntentMiddleware", "intent_router", "route_after_intent"]
