"""Agent entry points: one chat turn, plus an anonymous advisory path."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services import knowledge_service

from . import activity
from .ensemble import run_ensemble
from .graph import build_graph
from .llm import get_llm
from .prompts import ANONYMOUS_PROMPT
from .tools import set_context

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class AgentTurnResult:
    reply: str
    form: dict | None = None
    process: dict | None = None
    stepper: dict | None = None
    intent: str = "general"
    pending_form_id: str | None = None
    pending_process_id: str | None = None
    guidance_stage: str | None = None
    citations: list[dict] = field(default_factory=list)
    activities: list[dict] = field(default_factory=list)
    used_llm: bool = False
    answer_model: str | None = None
    ensemble_trace: str | None = None
    error: str | None = None


def _to_messages(history: list[dict], message: str) -> list:
    converted: list = []
    for item in history:
        role = item.get("role")
        content = item.get("content") or ""
        if not content:
            continue
        if role == "user":
            converted.append(HumanMessage(content=content))
        elif role == "assistant":
            converted.append(AIMessage(content=content))
    converted.append(HumanMessage(content=message))
    return converted


def _last_ai_content(messages: list) -> str:
    for item in reversed(messages):
        if isinstance(item, AIMessage) and not getattr(item, "tool_calls", None):
            return item.content if isinstance(item.content, str) else str(item.content)
    return ""


def run_agent(
    *,
    db: Session,
    user_id: str,
    session_id: str,
    history: list[dict],
    summary: str | None,
    message: str,
    pending_form_id: str | None,
    pending_process_id: str | None = None,
    guidance_stage: str | None = None,
    field_guidelines: str = "",
    reset_activity: bool = True,
) -> AgentTurnResult:
    """Execute one graph turn. Never raises: failures become a friendly reply."""
    if reset_activity:
        activity.reset()
    set_context(db=db, user_id=user_id, confirmed=False)

    state = {
        "messages": _to_messages(history, message),
        "user_id": user_id,
        "session_id": session_id,
        "summary": summary or "",
        "field_guidelines": field_guidelines,
        "pending_form_id": pending_form_id,
        "pending_process_id": pending_process_id,
        "guidance_stage": guidance_stage,
        "pending_at_start": pending_form_id,
        "confirmed": False,
        "declined": False,
        "form_payload": None,
        "process_payload": None,
        "stepper_payload": None,
        "stepper_process_id": None,
        "tool_iterations": 0,
        "citations": [],
        "answer_model": None,
        "ensemble_trace": None,
        "used_judge": False,
    }

    try:
        result = build_graph().invoke(state, config={"configurable": {"db": db}})
    except Exception as exc:
        logger.exception("Agent turn failed for session %s", session_id)
        return AgentTurnResult(
            reply="متأسفانه در پردازش درخواست خطایی رخ داد. لطفاً دوباره تلاش کنید.",
            intent="error",
            pending_form_id=pending_form_id,
            pending_process_id=pending_process_id,
            guidance_stage=guidance_stage,
            activities=activity.collected(),
            error=str(exc),
        )

    messages = result.get("messages", [])
    reply = (result.get("reply") or _last_ai_content(messages) or "").strip()
    if not reply:
        reply = "متوجه نشدم؛ می‌توانید درخواستتان را واضح‌تر بنویسید؟"

    return AgentTurnResult(
        reply=reply,
        form=result.get("form_payload"),
        process=result.get("process_payload"),
        stepper=result.get("stepper_payload"),
        intent=result.get("intent") or "general",
        pending_form_id=result.get("pending_form_id"),
        pending_process_id=result.get("pending_process_id"),
        guidance_stage=result.get("guidance_stage"),
        citations=result.get("citations") or [],
        activities=activity.collected(),
        used_llm=bool(result.get("answer_model")) or get_llm() is not None,
        answer_model=result.get("answer_model"),
        ensemble_trace=result.get("ensemble_trace"),
    )


def _answer_with_llm(prompt: str, message: str) -> str:
    """Anonymous advisory answer: ensemble first, then the single-model fallback."""
    if settings.ensemble_enabled:
        turn = run_ensemble(system_prompt=prompt, messages=[HumanMessage(content=message)])
        if turn.message is not None and turn.reply.strip():
            return turn.reply.strip()

    llm = get_llm()
    if llm is None:
        return ""
    try:
        response = llm.invoke(
            [
                SystemMessage(content=prompt),
                HumanMessage(content=message),
            ]
        )
    except Exception as exc:
        logger.warning("Anonymous LLM call failed: %s", exc)
        return ""
    content = response.content if isinstance(response.content, str) else str(response.content)
    return content.strip()


def answer_anonymous(db: Session, message: str) -> tuple[str, list[dict]]:
    """Answer a general question without persisting anything (pre-login)."""
    try:
        context, citations, chunks = knowledge_service.search_context(db, message)
    except Exception as exc:
        logger.warning("Anonymous retrieval failed: %s", exc)
        context, citations, chunks = "", [], []

    content = _answer_with_llm(ANONYMOUS_PROMPT.format(context=context or "—"), message)
    if content:
        return content, citations

    if chunks:
        excerpt = chunks[0].content[:500]
        return (
            f"{excerpt}\n\nبرای ثبت درخواست یا مشاهده فرم‌ها، لطفاً وارد حساب کاربری خود شوید.",
            citations,
        )
    return (
        "برای ثبت درخواست یا مشاهده فرم‌ها ابتدا وارد حساب کاربری خود شوید. "
        "اگر سؤال عمومی دارید، آن را بپرسید تا راهنمایی‌تان کنم.",
        citations,
    )
