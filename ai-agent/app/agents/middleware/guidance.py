"""Progressive, database-driven guidance towards starting a process.

The applicant must never receive the whole process in one burst. This module implements
the staged dialogue the product asks for and is **deterministic on purpose**: it works
with or without an LLM, always reads the published snapshot from PostgreSQL, and records
agent activity indicators along the way.

It is a middleware because the dialogue *replaces* the model call rather than feeding it:
:class:`GuidanceMiddleware` short-circuits the model phase and returns the next stage.

Stages (persisted on ``chat_sessions.guidance_stage``):

``overview_sent``
    A short overview + "shall I explain the steps?".
``steps_sent``
    The ordered stages with their guidance/responsible unit + "shall I list the forms?".
``forms_sent``
    The forms, required documents and fees per applicant stage + "shall I open it?".
``stepper_ready``
    The structured stepper payload is returned to the client, which renders the wizard.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig
from sqlalchemy.orm import Session

from app.services import process_flow_service

from .. import web_search
from ..backends import DbBackend
from . import activity
from .base import AgentMiddleware, StateUpdates

logger = logging.getLogger(__name__)

STAGE_OVERVIEW = "overview_sent"
STAGE_STEPS = "steps_sent"
STAGE_FORMS = "forms_sent"
STAGE_STEPPER = "stepper_ready"

_DECLINED_REPLY = (
    "خیلی خب، فرایند را باز نمی‌کنم. هر وقت خواستید بگویید تا از همین‌جا ادامه دهیم."
)

#: Generic words removed before matching a title inside a user message.
_GENERIC_WORDS = ("پروسه", "فرآیند", "فرایند", "فرم", "درخواست", "ثبت", "خدمت", "سامانه")


def _as_list(value: Any) -> list:
    return value if isinstance(value, list) else []


def _text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _normalize(text: str) -> str:
    return (
        (text or "")
        .replace("ي", "ی")
        .replace("ك", "ک")
        .replace("\u200c", " ")
        .replace("\u200f", "")
        .strip()
        .lower()
    )


def _title_key(title: str) -> str:
    key = _normalize(title)
    for word in _GENERIC_WORDS:
        key = key.replace(_normalize(word), " ")
    return " ".join(key.split())


# --------------------------------------------------------------------- matching
def match_process(db: Session, text: str) -> str | None:
    """Best-effort mapping from an utterance to a published, active process id."""
    normalized = _normalize(text)
    if len(normalized) < 4:
        return None

    activity.record("db_processes")
    candidates: list[tuple[int, str]] = []
    for row in process_flow_service.published_processes(db):
        code = _normalize(row.get("code") or "")
        if len(code) >= 3 and code in normalized:
            return str(row["id"])
        key = _title_key(row.get("title") or "")
        if len(key) >= 4 and key in normalized:
            candidates.append((len(key), str(row["id"])))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


# ---------------------------------------------------------------------- payload
def _payload(db: Session, process_id: str) -> dict | None:
    try:
        return process_flow_service.stepper_payload(db, process_id)
    except Exception as exc:  # unpublished / removed mid-conversation
        logger.info("Guidance payload unavailable for %s: %s", process_id, exc)
        return None


def _leaf_fields(fields: list) -> list[dict]:
    leaves: list[dict] = []
    for raw in fields:
        if not isinstance(raw, dict):
            continue
        if raw.get("type") == "section":
            leaves.extend(_leaf_fields(_as_list(raw.get("subFields"))))
            continue
        leaves.append(raw)
        leaves.extend(_leaf_fields(_as_list(raw.get("subFields"))))
    return leaves


def _documents(form: dict) -> list[str]:
    names: list[str] = []
    for field in _leaf_fields(_as_list(form.get("fields"))):
        if field.get("type") != "file":
            continue
        label = _text(field.get("label")) or _text(field.get("id"))
        if label:
            names.append(f"{label}{' (الزامی)' if field.get('required') else ''}")
    return names


def _overview_text(payload: dict) -> str:
    description = _text(payload.get("description")) or _text(payload.get("guidance"))
    steps = _as_list(payload.get("steps"))
    lines = [f"«{payload.get('title')}»" + (f" — {payload['department']}" if payload.get("department") else "")]
    if description:
        lines.append(description)
    if steps:
        lines.append(f"این فرایند {len(steps)} مرحله دارد.")

    general = web_search.search_text(f"{payload.get('title')} {payload.get('department') or ''}")
    if general:
        lines.append("")
        lines.append(general)

    lines.append("")
    lines.append("آیا مراحل این فرایند را برایتان توضیح بدهم؟")
    return "\n".join(lines)


def _steps_text(payload: dict) -> str:
    steps = _as_list(payload.get("steps"))
    lines = [f"مراحل فرایند «{payload.get('title')}»:"]
    for step in steps:
        head = f"{step.get('index')}. {step.get('title')} — {step.get('responsibleUnit')}"
        sla = step.get("slaDays")
        if isinstance(sla, int) and sla > 0:
            head += f" — حدود {sla} روز"
        if step.get("isApplicantStage"):
            head += " — نیازمند اقدام شما"
        lines.append(head)
        guidance_text = _text(step.get("guidance"))
        if guidance_text:
            lines.append(f"   راهنما: {guidance_text}")
    lines.append("")
    lines.append("آیا فرم‌ها و مدارک لازم هر مرحله را هم بگویم؟")
    return "\n".join(lines)


def _forms_text(payload: dict) -> str:
    lines = [f"فرم‌هایی که برای «{payload.get('title')}» باید تکمیل کنید:"]
    fees: list[str] = []
    for step in _as_list(payload.get("steps")):
        if not step.get("collectsInput"):
            continue
        forms = _as_list(step.get("forms"))
        if not forms:
            continue
        lines.append(f"مرحله {step.get('index')}: {step.get('title')}")
        for form in forms:
            title = _text(form.get("title")) or _text(form.get("form_id"))
            lines.append(f"- فرم «{title}»")
            guidance_text = _text(form.get("guidance"))
            if guidance_text:
                lines.append(f"  راهنما: {guidance_text}")
            documents = _documents(form)
            if documents:
                lines.append(f"  مدارک: {'، '.join(documents)}")
            payment = form.get("payment")
            if isinstance(payment, dict) and isinstance(payment.get("defaultAmount"), int):
                fees.append(f"{title}: {payment['defaultAmount']:,} تومان")
    if fees:
        lines.append(f"هزینه‌ها: {'؛ '.join(fees)}")
    lines.append("")
    lines.append("آیا فرایند را باز کنم تا فرم‌ها را مرحله‌به‌مرحله پر کنید؟")
    return "\n".join(lines)


def _stepper_reply(payload: dict) -> str:
    steps = [step for step in _as_list(payload.get("steps")) if step.get("collectsInput")]
    forms = sum(len(_as_list(step.get("forms"))) for step in steps)
    reply = (
        f"فرایند «{payload.get('title')}» را باز کردم: {len(steps)} مرحله و {forms} فرم. "
        "فرم‌ها را با راهنمای هر مرحله پر کنید و در پایان ثبت کنید."
    )
    general = web_search.search_text(f"{payload.get('title')} مدارک لازم")
    if general:
        reply += f"\n\n{general}"
    return reply


# ------------------------------------------------------------------- turn steps
def steps_text(db: Session, process_id: str) -> str | None:
    """Step list (DB guidance) as plain text; also used as an agent tool output."""
    payload = _payload(db, process_id)
    return _steps_text(payload) if payload is not None else None


def forms_text(db: Session, process_id: str) -> str | None:
    """Applicant forms, documents and fees as plain text; also used by an agent tool."""
    payload = _payload(db, process_id)
    return _forms_text(payload) if payload is not None else None


def start(db: Session, process_id: str) -> dict | None:
    """First guidance turn: short overview plus an offer to continue."""
    payload = _payload(db, process_id)
    if payload is None:
        return None
    return {
        "reply": _overview_text(payload),
        "pending_process_id": payload["process_id"],
        "guidance_stage": STAGE_OVERVIEW,
        "pending_form_id": None,
    }


def show_steps(db: Session, process_id: str) -> dict | None:
    activity.record("db_steps")
    payload = _payload(db, process_id)
    if payload is None:
        return None
    return {
        "reply": _steps_text(payload),
        "pending_process_id": payload["process_id"],
        "guidance_stage": STAGE_STEPS,
        "pending_form_id": None,
    }


def show_forms(db: Session, process_id: str) -> dict | None:
    activity.record("db_forms")
    payload = _payload(db, process_id)
    if payload is None:
        return None
    return {
        "reply": _forms_text(payload),
        "pending_process_id": payload["process_id"],
        "guidance_stage": STAGE_FORMS,
        "pending_form_id": None,
    }


def open_stepper(db: Session, process_id: str) -> dict | None:
    """Return the structured payload the client uses to render the wizard."""
    activity.record("stepper")
    payload = _payload(db, process_id)
    if payload is None:
        return None
    return {
        "reply": _stepper_reply(payload),
        "stepper": payload,
        "pending_process_id": payload["process_id"],
        "guidance_stage": STAGE_STEPPER,
        "pending_form_id": None,
    }


def decline() -> dict:
    return {
        "reply": _DECLINED_REPLY,
        "pending_process_id": None,
        "guidance_stage": None,
        "pending_form_id": None,
    }


def turn(db: Session, state: dict) -> dict | None:
    """Advance the dialogue; ``None`` means "let the LLM answer this turn".

    State is kept when the applicant asks a side question, so the offer still stands on
    the next turn.
    """
    intent = state.get("intent")
    pending = state.get("pending_process_id")
    stage = state.get("guidance_stage")

    if intent == "process_request" and pending:
        return start(db, pending)
    if not pending or not stage:
        return None
    if intent == "process_stop":
        return decline()
    if intent != "process_continue":
        return None

    if stage == STAGE_OVERVIEW:
        return show_steps(db, pending)
    if stage == STAGE_STEPS:
        return show_forms(db, pending)
    return open_stepper(db, pending)


class GuidanceMiddleware(AgentMiddleware):
    """Short-circuits the model phase while a process is being explained step by step."""

    name = "GuidanceMiddleware"

    def wrap_model_call(
        self,
        state: dict,
        config: RunnableConfig,
        call_next,
    ) -> StateUpdates:
        db = DbBackend.from_config(config).session()
        if db is None:
            return call_next()

        guided = turn(db, state)
        if guided is None:
            return call_next()

        return {
            "messages": [AIMessage(content=guided["reply"])],
            "reply": guided["reply"],
            "pending_process_id": guided.get("pending_process_id"),
            "guidance_stage": guided.get("guidance_stage"),
            "pending_form_id": guided.get("pending_form_id"),
            "stepper_payload": guided.get("stepper"),
        }


__all__ = [
    "STAGE_FORMS",
    "STAGE_OVERVIEW",
    "STAGE_STEPPER",
    "STAGE_STEPS",
    "GuidanceMiddleware",
    "decline",
    "forms_text",
    "match_process",
    "open_stepper",
    "show_forms",
    "show_steps",
    "start",
    "steps_text",
    "turn",
]
