"""LangGraph nodes: intent routing, retrieval, advising, confirmation and presentation."""

from __future__ import annotations

import json
import logging
import re

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services import (
    consultation_service,
    form_service,
    knowledge_service,
    process_flow_service,
    submission_service,
)

from . import activity, guidance
from .confirmation import CONFIRM, DECLINE, UNCLEAR, detect_confirmation, looks_like_greeting
from .ensemble import describe as describe_ensemble, run_ensemble
from .agentscope_team import answer_with_agentscope_team
from .llm import get_llm
from .prompts import CONFIRMATION_CLASSIFIER_PROMPT, SYSTEM_PROMPT
from .state import AgentState
from .tools import TOOL_MAP, TOOLS, set_context

logger = logging.getLogger(__name__)

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
_ERROR_REPLY = "ارتباط با سرویس هوش مصنوعی برقرار نشد. لطفاً چند لحظه بعد دوباره تلاش کنید."


def _config_db(config: RunnableConfig) -> Session | None:
    configurable = (config or {}).get("configurable") or {}
    return configurable.get("db")


def _last_human_content(messages: list) -> str:
    for message in reversed(list(messages or [])):
        if isinstance(message, HumanMessage):
            return message.content if isinstance(message.content, str) else str(message.content)
    return ""


def _last_ai_content(messages: list, *, skip_tool_calls: bool = True) -> str:
    for message in reversed(list(messages or [])):
        if isinstance(message, AIMessage):
            if skip_tool_calls and getattr(message, "tool_calls", None):
                continue
            return message.content if isinstance(message.content, str) else str(message.content)
    return ""


def _form_title(db: Session, form_id: str | None) -> str:
    if not form_id or db is None:
        return "—"
    form = form_service.get_form(db, form_id)
    return form["title"] if form else form_id


def _process_title(db: Session, process_id: str | None) -> str:
    if not process_id or db is None:
        return "—"
    for row in consultation_service.list_published(db):
        if row["id"] == process_id:
            return f"{row['title']} ({process_id})"
    return process_id


# --------------------------------------------------------------------------- routing
def intent_router(state: AgentState, config: RunnableConfig) -> dict:
    db = _config_db(config)
    text = _last_human_content(state.get("messages", []))
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


def route_after_intent(state: AgentState) -> str:
    return "confirmation_gate" if state.get("intent") in {"confirm", "decline"} else "retrieve"


# ------------------------------------------------------------------------ retrieval
def retrieve(state: AgentState, config: RunnableConfig) -> dict:
    db = _config_db(config)
    if db is None:
        return {"context": "", "citations": []}

    message = _last_human_content(state.get("messages", []))
    if state.get("intent") in {"greeting", "track", "process_continue", "process_stop"}:
        # Greetings, tracking and guidance confirmations never benefit from a
        # knowledge round-trip.
        return {"context": "", "citations": []}
    if len(message.strip()) < 3:
        return {"context": "", "citations": []}

    pending_title = _form_title(db, state.get("pending_form_id"))
    query = message if pending_title == "—" else f"{message} {pending_title}"

    try:
        activity.record("knowledge")
        context, citations, _ = knowledge_service.search_context(db, query)
    except Exception as exc:  # retrieval failure should degrade, not crash the turn
        logger.warning("Knowledge retrieval failed: %s", exc)
        return {"context": "", "citations": [], "query": query}

    return {"context": context, "citations": citations, "query": query}


# --------------------------------------------------------------------------- advisor
def advisor(state: AgentState, config: RunnableConfig) -> dict:
    db = _config_db(config)

    # Progressive process guidance is deterministic: it reads the published snapshot and
    # asks one question at a time, whether or not an LLM is configured.
    if db is not None:
        guided = guidance.turn(db, state)
        if guided is not None:
            return {
                "messages": [AIMessage(content=guided["reply"])],
                "reply": guided["reply"],
                "pending_process_id": guided.get("pending_process_id"),
                "guidance_stage": guided.get("guidance_stage"),
                "pending_form_id": guided.get("pending_form_id"),
                "stepper_payload": guided.get("stepper"),
            }

    messages = list(state.get("messages", []))
    pending = state.get("pending_form_id")
    pending_title = _form_title(db, pending)

    system_prompt = SYSTEM_PROMPT.format(
        context=state.get("context") or "—",
        field_guidelines=state.get("field_guidelines") or "—",
        forms_summary=form_service.get_form_summary_text(db) if db is not None else "—",
        processes_summary=consultation_service.list_text(db) if db is not None else "—",
        summary=state.get("summary") or "—",
        pending_form=pending_title,
        asked_for_confirmation="بله" if pending else "خیر",
        pending_process=_process_title(db, state.get("pending_process_id")),
        guidance_stage=state.get("guidance_stage") or "—",
    )

    llm = get_llm()
    if settings.ensemble_enabled:
        # Multi-model ensemble: Gemini, ChatGPT and Claude answer in parallel through
        # GapGPT; structured actions are voted on and the prose is judged.
        turn = run_ensemble(
            system_prompt=system_prompt,
            messages=messages,
            tools=TOOLS,
            intent=state.get("intent") or "",
        )
        trace = describe_ensemble(turn)
        if turn.message is not None:
            logger.info("Advisor ensemble: %s", trace)
            return _finalize_advisor(
                turn.message,
                state,
                db,
                pending,
                messages,
                extra={
                    "answer_model": turn.answer_model,
                    "ensemble_trace": trace,
                    "used_judge": turn.judged,
                },
            )
        logger.warning("Every ensemble member failed; falling back. %s", trace)

    if llm is None:
        activity.record("model_fallback")
        reply = _fallback_reply(state, db)
        return {"messages": [AIMessage(content=reply)], "pending_form_id": pending}

    try:
        response = llm.bind_tools(list(TOOL_MAP.values())).invoke(
            [SystemMessage(content=system_prompt), *messages]
        )
    except Exception as exc:
        logger.exception("Advisor LLM call failed: %s", exc)
        return {"messages": [AIMessage(content=_ERROR_REPLY)], "pending_form_id": pending}

    return _finalize_advisor(response, state, db, pending, messages)


def _finalize_advisor(
    response: AIMessage,
    state: AgentState,
    db: Session | None,
    pending: str | None,
    messages: list,
    extra: dict | None = None,
) -> dict:
    """Shared post-processing for the ensemble and single-model paths."""
    content = response.content if isinstance(response.content, str) else str(response.content)
    if settings.AGENTSCOPETEAM_ENABLED:
        specialist_reply = answer_with_agentscope_team(
            f"پاسخ پیشنهادی فعلی را برای کاربر فارسی، دقیق و حرفه‌ای کامل کن؛ "
            f"اقدام‌های ساختاریافته را حذف یا تغییر نده:\n{content}",
        )
        if specialist_reply:
            response = AIMessage(
                content=specialist_reply,
                tool_calls=list(getattr(response, "tool_calls", None) or []),
            )
            content = specialist_reply
    tool_calls = list(getattr(response, "tool_calls", None) or [])
    if not content.strip():
        # An action-only answer must never reach the panel as an empty bubble.
        content = _fallback_reply(state, db)
        response = AIMessage(content=content, tool_calls=tool_calls)
    if not tool_calls:
        if not pending and state.get("intent") == "form_request" and db is not None:
            pending = form_service.find_form_id(db, _last_human_content(messages))
        # Deterministically guarantee a confirmation question when a form is pending.
        if pending and "؟" not in content and "?" not in content:
            content = f"{content.strip()}\n\nآیا فرم «{_form_title(db, pending)}» را برایتان باز کنم؟"
            response = AIMessage(content=content, tool_calls=tool_calls)

    return {"messages": [response], "pending_form_id": pending, **(extra or {})}


def route_after_advisor(state: AgentState) -> str:
    messages = state.get("messages", [])
    if not messages:
        return "confirmation_gate"
    last = messages[-1]
    tool_calls = getattr(last, "tool_calls", None) or []
    if tool_calls and state.get("tool_iterations", 0) < settings.AGENT_MAX_TOOL_ITERATIONS:
        return "tools"
    return "confirmation_gate"


# ---------------------------------------------------------------------------- tools
def tool_executor(state: AgentState, config: RunnableConfig) -> dict:
    db = _config_db(config)
    last = state.get("messages", [])[-1] if state.get("messages") else None
    tool_calls = getattr(last, "tool_calls", None) or []
    if db is None:
        return {"tool_iterations": state.get("tool_iterations", 0) + 1}

    set_context(db=db, user_id=state.get("user_id"), confirmed=bool(state.get("confirmed")))
    tool_messages: list[ToolMessage] = []
    form_payload = state.get("form_payload")
    process_payload = state.get("process_payload")
    stepper_process_id = state.get("stepper_process_id")
    pending = state.get("pending_form_id")

    for call in tool_calls:
        name = call.get("name")
        args = call.get("args") or {}
        call_id = call.get("id")
        tool = TOOL_MAP.get(name)

        failed = False
        if tool is None:
            output = f"ابزار ناشناخته: {name}"
            failed = True
        else:
            try:
                output = str(tool.invoke(args))
            except Exception as exc:
                logger.warning("Tool %s failed: %s", name, exc)
                output = f"خطا در اجرای ابزار: {exc}"
                failed = True

        if name == "get_form_requirements" and args.get("form_id"):
            pending = str(args["form_id"])
        if name == "get_process_consultation_summary" and args.get("process_id") and not failed:
            # The consultant summary prepares the confirmation; the applicant stage form is
            # what the panel renders after the user explicitly confirms.
            process_id = str(args["process_id"])
            resolved = consultation_service.process_payload(db, process_id)
            if resolved is not None:
                process_payload = resolved
                form = resolved.get("form") or {}
                pending = form.get("form_id") or pending
        if output.startswith("FORM_READY:"):
            parts = output.split(":", 2)
            form_id = parts[1]
            form = form_service.get_form(db, form_id)
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
            process_id = output.split(":", 1)[1]
            resolved = consultation_service.process_payload(db, process_id)
            if resolved and resolved.get("form"):
                process_payload = resolved
                form_payload = resolved["form"]
                pending = None
        if output.startswith("PROCESS_STARTED:"):
            # Structured action: the client opens the multi-step wizard for this process.
            stepper_process_id = output.split(":", 1)[1]
            pending = None

        tool_messages.append(ToolMessage(content=output, tool_call_id=call_id))

    return {
        "messages": tool_messages,
        "form_payload": form_payload,
        "process_payload": process_payload,
        "stepper_process_id": stepper_process_id,
        "pending_form_id": pending,
        "tool_iterations": state.get("tool_iterations", 0) + 1,
    }


# ------------------------------------------------------------------ confirmation gate
def _classify_with_llm(state: AgentState, db: Session) -> str:
    """Second gate for ambiguous replies; only used when a form was already pending."""
    message = _last_human_content(state.get("messages", []))
    if not message or len(message) > 120:
        return UNCLEAR

    previous_question = _last_ai_content(state.get("messages", []))
    if "؟" not in previous_question and "?" not in previous_question:
        return UNCLEAR  # the assistant never asked for confirmation

    llm = get_llm()
    if llm is None:
        return UNCLEAR

    prompt = CONFIRMATION_CLASSIFIER_PROMPT.format(
        form_title=_form_title(db, state.get("pending_at_start")),
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


def confirmation_gate(state: AgentState, config: RunnableConfig) -> dict:
    db = _config_db(config)
    intent = state.get("intent")
    pending = state.get("pending_form_id")

    if intent == "confirm":
        return {"confirmed": True}
    if intent == "decline":
        return {"declined": True}

    # Only an *already pending* form may be confirmed through the LLM fallback; a brand-new
    # form request in this same turn must never be auto-confirmed.
    if pending and pending == state.get("pending_at_start") and db is not None:
        decision = _classify_with_llm(state, db)
        if decision == CONFIRM:
            return {"confirmed": True}
        if decision == DECLINE:
            return {"declined": True}
    return {}


# --------------------------------------------------------------------------- presenter
def form_presenter(state: AgentState, config: RunnableConfig) -> dict:
    db = _config_db(config)
    pending = state.get("pending_form_id") or state.get("pending_at_start")

    if state.get("declined"):
        return {
            "reply": "خیلی خب، فرمی باز نمی‌کنم. هر وقت خواستید بگویید تا کمکتان کنم.",
            "pending_form_id": None,
            "pending_process_id": None,
            "guidance_stage": None,
            "form_payload": None,
            "process_payload": None,
            "stepper_payload": None,
        }

    if state.get("confirmed"):
        if db is None or not pending:
            return {"reply": "فرمی برای نمایش پیدا نشد. لطفاً بگویید کدام فرم را می‌خواهید.", "pending_form_id": None}
        activity.record("prepare")
        form = form_service.get_form(db, pending)
        if form is None:
            return {"reply": "این فرم در دسترس نیست یا غیرفعال شده است.", "pending_form_id": None}
        return {
            "reply": (
                f"«{form['title']}» را برایتان باز کردم. پس از تکمیل فیلدها، دکمه "
                f"«{form['submit_label']}» را بزنید."
            ),
            "form_payload": form,
            "pending_form_id": None,
        }

    if state.get("form_payload"):
        form = state["form_payload"]
        process = state.get("process_payload") or {}
        stages = process.get("stages") or []
        if stages:
            plan = "؛ ".join(f"{item['index']}. {item['title']}" for item in stages)
            reply = (
                f"«{form['title']}» را برایتان باز کردم. مسیر پرونده: {plan}. "
                f"پس از تکمیل فیلدها، دکمه «{form['submit_label']}» را بزنید."
            )
        else:
            reply = f"«{form['title']}» را برایتان باز کردم. لطفاً فیلدها را تکمیل کنید."
        return {"reply": reply, "pending_form_id": None}

    stepper = state.get("stepper_payload")
    if stepper is None and state.get("stepper_process_id") and db is not None:
        try:
            stepper = process_flow_service.stepper_payload(db, str(state["stepper_process_id"]))
        except Exception as exc:
            logger.warning("Stepper payload failed: %s", exc)
            stepper = None
        if stepper is not None:
            note = (
                f"فرایند «{stepper['title']}» را باز کردم؛ فرم‌ها را مرحله‌به‌مرحله پر کنید "
                "و در پایان ثبت کنید."
            )
            base = _last_ai_content(state.get("messages", [])).strip()
            return {
                "reply": f"{base}\n\n{note}" if base else note,
                "stepper_payload": stepper,
                "pending_process_id": stepper["process_id"],
                "guidance_stage": guidance.STAGE_STEPPER,
                "pending_form_id": None,
            }

    reply = _last_ai_content(state.get("messages", []))
    return {"reply": reply or "متوجه نشدم؛ می‌خواهید درباره کدام خدمت یا فرم راهنمایی بگیرید؟"}


# --------------------------------------------------------------------------- fallbacks
def _fallback_reply(state: AgentState, db: Session | None) -> str:
    """Deterministic answer when no LLM is configured (or the LLM call failed)."""
    intent = state.get("intent")
    pending = state.get("pending_form_id")

    if intent == "track" and db is not None and state.get("user_id"):
        return submission_service.summary_for_user(db, state["user_id"])

    # A file-only turn: acknowledge the upload instead of guessing an answer.
    human = _last_human_content(state.get("messages", []))
    if "[فایل‌های پیوست]" in human:
        question = human.split("[فایل‌های پیوست]", 1)[0].strip()
        if not question:
            return (
                "فایل شما دریافت و ذخیره شد. بگویید با آن چه کار کنم؛ مثلاً خلاصه‌اش کنم "
                "یا برای ثبت درخواست استفاده کنم."
            )

    if pending and db is not None:
        requirements = form_service.get_requirements_text(db, pending)
        if requirements:
            question = f"آیا فرم «{_form_title(db, pending)}» را برایتان باز کنم؟"
            return f"{requirements}\n\n{question}"

    context = (state.get("context") or "").strip()
    if context:
        excerpt = context[:700].rsplit("\n", 1)[0]
        return (
            f"{excerpt}\n\nاگر فرم مشخصی می‌خواهید نامش را بگویید تا مدارک و مراحلش را توضیح دهم."
        )

    if db is not None:
        forms = form_service.list_forms(db)
        if forms:
            titles = "، ".join(form["title"] for form in forms[:5])
            return f"می‌توانم درباره این فرم‌ها راهنمایی کنم: {titles}. کدام را می‌خواهید؟"
    return "در حال حاضر امکان پاسخ‌دهی هوشمند نیست. لطفاً بعداً تلاش کنید یا با کارشناس تماس بگیرید."
