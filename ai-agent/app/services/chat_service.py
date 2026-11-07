"""Chat orchestration: session resolution, agent invocation and persistence."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.agents import activity, answer_anonymous, run_agent
from app.agents.tools import get_field_guidelines, set_context as set_agent_context
from app.core.config import settings
from app.core.exceptions import NotFound, ValidationError
from app.models.chat import ChatSession
from app.models.user import User
from app.repositories import session_repo

from . import chat_attachment_service, form_service, intent_service, memory_service, process_flow_service
from .auth_service import public_user

logger = logging.getLogger(__name__)

_FORM_REQUEST_MARKERS = (
    "فرم",
    "ثبت کن",
    "ثبت کنم",
    "درخواست بدم",
    "درخواست ثبت",
    "پیگیری",
    "پر کنم",
)


@dataclass(slots=True)
class ChatOutcome:
    status: str
    message: str
    form: dict | None = None
    process: dict | None = None
    stepper: dict | None = None
    user: dict | None = None
    session_id: str | None = None
    citations: list[dict] = field(default_factory=list)
    activity: list[dict] = field(default_factory=list)
    intent: str | None = None
    action: dict | None = None


def wants_authenticated_action(message: str) -> bool:
    lowered = (message or "").lower()
    return any(marker in lowered for marker in _FORM_REQUEST_MARKERS)


def _resolve_session(
    db: Session, user: User, *, session_id: str | None, new_session: bool
) -> ChatSession:
    if session_id:
        session = session_repo.get_chat_session(db, session_id, user_id=user.id)
        if session is None:
            raise NotFound("گفتگوی موردنظر یافت نشد.")
        return session
    if not new_session:
        existing = session_repo.get_latest_session(db, user.id)
        if existing is not None:
            return existing
    return session_repo.create_chat_session(db, user.id)


def _resolve_process_id(db: Session, keywords: tuple[str, ...]) -> str | None:
    try:
        from app.services import process_service

        processes = process_service.list_definitions(db, status="active", published_only=True)
    except Exception:
        return None
    for proc in processes:
        haystack = f"{proc.get('id', '')} {proc.get('title', '')} {proc.get('code', '')}".lower()
        if any(keyword.lower() in haystack for keyword in keywords):
            return proc.get("id")
    return processes[0].get("id") if processes else None


def _pending_leave_slots(db: Session, session: ChatSession | None) -> dict | None:
    if session is None:
        return None
    messages = session_repo.load_messages(db, session.id, limit=1)
    if not messages or messages[-1].role != "assistant":
        return None
    message = messages[-1]
    if message.intent != "leave_request_slots":
        return None
    slots = (message.meta or {}).get("slots")
    return dict(slots) if isinstance(slots, dict) else {}


def _looks_like_field_question(message: str) -> bool:
    lowered = message.lower()
    markers = (
        "فیلد", "منظور از", "چگونه پر", "چطور پر", "چی بنویسم", "چه چیزی بنویسم",
        "چه معنایی", "یعنی چی", "راهنمایی", "what does", "how should i fill",
        "how to fill", "field", "reason",
    )
    return any(marker in lowered for marker in markers)


def _resolve_field_form_id(db: Session, session: ChatSession | None, message: str) -> str | None:
    if session and session.pending_form_id:
        if form_service.get_form(db, session.pending_form_id):
            return session.pending_form_id
    form_id = form_service.find_form_id(db, message)
    if form_id:
        return form_id

    lowered = message.lower()
    forms = form_service.list_forms(db)
    matches = [
        form["form_id"]
        for form in forms
        if any(part in lowered for part in re.split(r"[_\s]+", form["form_id"]) if len(part) > 3)
    ]
    return matches[0] if len(matches) == 1 else None


def _looks_like_leave_date_answer(message: str, entities: dict) -> bool:
    if entities.get("start_date") or entities.get("end_date"):
        return True
    lowered = message.lower()
    return any(
        month in lowered
        for month in (
            "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
            "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند", "farvardin",
            "ordibehesht", "khordad", "tir", "mordad", "shahrivar",
            "mehr", "aban", "azar", "dey", "bahman", "esfand",
        )
    )
def handle_chat(
    db: Session,
    *,
    user: User | None,
    message: str,
    intent: str | None = None,
    session_id: str | None = None,
    new_session: bool = False,
    attachment_ids: list[str] | None = None,
) -> ChatOutcome:
    activity.reset()
    message = (message or "").strip()
    if attachment_ids and user is None:
        raise ValidationError("برای ارسال فایل ابتدا وارد حساب کاربری شوید.")
    attachments = (
        chat_attachment_service.resolve(user.id, attachment_ids)
        if user and attachment_ids
        else []
    )
    if not message and not attachments:
        raise ValidationError("متن پیام خالی است.")
    if len(message) > settings.MAX_MESSAGE_CHARS:
        raise ValidationError("متن پیام بیش از حد طولانی است.")
    session = (
        _resolve_session(db, user, session_id=session_id, new_session=new_session)
        if user is not None
        else None
    )

    # Explicit auth intents expressed in natural language (e.g. "میخوام وارد حسابم شوم").
    detected_auth = intent_service.detect_intent(message)
    if detected_auth == "auth_login":
        form = form_service.builtin_form("login")
        return ChatOutcome(
            status="auth_required" if user is None else "ok",
            message="فرم ورود را برایتان باز کردم." if user is None else "شما هم‌اکنون وارد شده‌اید.",
            form=form if user is None else None,
            user=public_user(user) if user else None,
            intent="auth_login",
            session_id=session.id if session else None,
        )
    if detected_auth == "auth_register":
        form = form_service.builtin_form("register")
        return ChatOutcome(
            status="auth_required" if user is None else "ok",
            message="فرم ثبت‌نام را برایتان باز کردم." if user is None else "شما هم‌اکنون وارد شده‌اید.",
            form=form if user is None else None,
            user=public_user(user) if user else None,
            intent="auth_register",
            session_id=session.id if session else None,
        )

    # Explicit requests for the auth forms (footer links in the chat UI).
    if intent in {"login", "register"}:
        form = form_service.builtin_form(intent)
        return ChatOutcome(
            status="auth_required" if user is None else "ok",
            message="برای ادامه وارد شوید." if user is None else "شما وارد شده‌اید.",
            form=form if user is None else None,
            user=public_user(user) if user else None,
            intent=f"auth_{intent}",
            session_id=session.id if session else None,
        )

    # Zero-friction form automation for clear actionable intents.
    detected = intent_service.detect_intent(message)
    is_field_question = _looks_like_field_question(message)
    pending_slots = _pending_leave_slots(db, session)
    if user is not None and not is_field_question and (
        detected == "leave_request" or pending_slots is not None
    ):
        activity.record("slot_filling")
        activity.record("duration")
    current_entities = intent_service.extract_entities(message)
    is_slot_continuation = bool(
        pending_slots is not None
        and _looks_like_leave_date_answer(message, current_entities)
    )
    if user is not None and not is_field_question and (
        detected == "leave_request" or is_slot_continuation
    ):
        process_id = _resolve_process_id(db, ("leave", "مرخصی"))
        if process_id:
            try:
                entities = dict(pending_slots or {})
                entities.update(current_entities)
                missing_dates = not entities.get("start_date") or not entities.get("end_date")
                if missing_dates:
                    session_repo.add_message(db, session, role="user", content=message, intent=detected)
                    duration = entities.get("duration_days")
                    question = (
                        f"حتماً. برای مرخصی {duration} روزه، از چه تاریخی تا چه تاریخی را می‌خواهید؟"
                        if duration
                        else "حتماً. برای درخواست مرخصی، بازه دقیق تاریخ را بفرمایید؛ مثلاً «از ۱۰ تا ۲۰ آذر»."
                    )
                    session_repo.add_message(
                        db,
                        session,
                        role="assistant",
                        content=question,
                        intent="leave_request_slots",
                        meta={"slots": entities},
                    )
                    return ChatOutcome(
                        status="ok",
                        message=question,
                        user=public_user(user),
                        session_id=session.id if session else None,
                        intent="leave_request_slots",
                        activity=activity.collected(),
                    )
                prefill = intent_service.build_prefill(
                    "leave_request",
                    entities,
                    intent_service.get_user_profile(db, user.id),
                )
                activity.record("populate_form")
                stepper = process_flow_service.stepper_payload(db, process_id, prefill=prefill)
            except Exception:
                logger.exception("Could not prepare the leave request form for user %s", user.id)
                return ChatOutcome(
                    status="error",
                    message="آماده‌سازی فرم مرخصی ناموفق بود. لطفاً کمی بعد دوباره تلاش کنید.",
                    user=public_user(user),
                    session_id=session.id if session else None,
                    activity=activity.collected(),
                    intent="leave_request",
                )
            if stepper:
                session_repo.add_message(db, session, role="user", content=message, intent=detected)
                session_repo.add_message(
                    db,
                    session,
                    role="assistant",
                    content="فرایند درخواست مرخصی را برایتان باز کردم؛ مراحل را تکمیل کنید.",
                    intent="leave_request",
                    process_id=process_id,
                )
                action_fields = {
                    key: prefill[key]
                    for key in (
                        "applicant_name", "full_name", "employee_name", "employee_id",
                        "start_date", "end_date", "duration_days",
                    )
                    if prefill.get(key) is not None
                }
                return ChatOutcome(
                    status="ok",
                    message="فرایند درخواست مرخصی را برایتان باز کردم؛ مراحل را تکمیل کنید.",
                    stepper=stepper,
                    user=public_user(user),
                    session_id=session.id if session else None,
                    activity=activity.collected(),
                    intent="leave_request",
                    action={"action": "OPEN_AND_FILL_FORM", "form_id": "leave_request", "fields": action_fields},
                )
    if user is not None and detected == "construction_permit":
        process_id = _resolve_process_id(db, ("construction", "پروانه", "ساختمان", "ساخت"))
        if process_id:
            try:
                entities = intent_service.extract_entities(message)
                prefill = intent_service.build_prefill(
                    "construction_permit",
                    entities,
                    intent_service.user_context(user),
                )
                stepper = process_flow_service.stepper_payload(db, process_id, prefill=prefill)
            except Exception:
                stepper = None
            if stepper:
                session_repo.add_message(db, session, role="user", content=message, intent=detected)
                session_repo.add_message(db, session, role="assistant", content="فرایند پروانه ساختمانی را برایتان باز کردم؛ مراحل را تکمیل کنید.", process_id=process_id)
                return ChatOutcome(
                    status="ok",
                    message="فرایند پروانه ساختمانی را برایتان باز کردم؛ مراحل را تکمیل کنید.",
                    stepper=stepper,
                    user=public_user(user),
                    session_id=session.id if session else None,
                )

    if user is None:
        if wants_authenticated_action(message):
            return ChatOutcome(
                status="auth_required",
                message="برای ثبت درخواست یا پیگیری آن، ابتدا وارد حساب کاربری خود شوید.",
                form=form_service.builtin_form("login"),
            )
        reply, citations = answer_anonymous(db, message)
        return ChatOutcome(status="ok", message=reply, citations=citations, intent="anonymous")

    assert session is not None
    history = memory_service.history_for_agent(db, session)
    previous_pending = session.pending_form_id
    previous_process = session.pending_process_id
    previous_stage = session.guidance_stage
    attachment_meta = chat_attachment_service.public_meta(attachments)
    session_repo.add_message(
        db,
        session,
        role="user",
        content=message,
        meta={"attachments": attachment_meta} if attachment_meta else None,
    )

    # The stored message stays clean; the agent additionally receives the file names and
    # any text that could be extracted from them.
    agent_message = message
    if attachments:
        block = chat_attachment_service.prompt_block(attachments)
        agent_message = f"{message}\n\n[فایل‌های پیوست]\n{block}" if message else f"[فایل‌های پیوست]\n{block}"

    field_guidelines = ""
    if is_field_question:
        form_id = _resolve_field_form_id(db, session, message)
        if form_id:
            set_agent_context(db=db, user_id=user.id)
            field_guidelines = get_field_guidelines.invoke(
                {"field_name": message, "form_id": form_id}
            )

    result = run_agent(
        db=db,
        user_id=user.id,
        session_id=session.id,
        history=history,
        summary=session.summary,
        message=agent_message,
        pending_form_id=previous_pending,
        pending_process_id=previous_process,
        guidance_stage=previous_stage,
        field_guidelines=field_guidelines,
        reset_activity=False,
    )

    form_id = result.form.get("form_id") if result.form else None
    stepper_process_id = result.stepper.get("process_id") if result.stepper else None
    session_repo.add_message(
        db,
        session,
        role="assistant",
        content=result.reply,
        intent=result.intent,
        form_id=form_id,
        process_id=stepper_process_id,
        citations=result.citations or None,
        meta={
            "pending_form_id": result.pending_form_id,
            "used_llm": result.used_llm,
            "activity": result.activities or None,
            "answer_model": result.answer_model,
            "ensemble_trace": result.ensemble_trace,
        },
    )

    if result.form is not None:
        # The legacy single-form flow and the guidance flow never coexist.
        if previous_pending is not None:
            session_repo.set_pending_form(db, session, None)
        if previous_process is not None or previous_stage is not None:
            session_repo.set_guidance(db, session, process_id=None, stage=None)
    elif result.pending_form_id != previous_pending:
        session_repo.set_pending_form(db, session, result.pending_form_id)

    if result.pending_process_id != previous_process or result.guidance_stage != previous_stage:
        session_repo.set_guidance(
            db, session, process_id=result.pending_process_id, stage=result.guidance_stage
        )

    memory_service.maybe_summarize(db, session)

    return ChatOutcome(
        status="ok",
        message=result.reply,
        form=result.form,
        process=result.process,
        stepper=result.stepper,
        user=public_user(user),
        session_id=session.id,
        citations=result.citations,
        activity=result.activities,
        intent=result.intent,
    )


# ------------------------------------------------------------------- history APIs
def list_sessions(db: Session, user_id: str, *, limit: int = 30, offset: int = 0) -> dict:
    sessions = session_repo.list_sessions(db, user_id, limit=limit, offset=offset)
    return {
        "sessions": [
            {
                "id": session.id,
                "title": session.title or "گفتگوی جدید",
                "message_count": session.message_count,
                "pending_form_id": session.pending_form_id,
                "pending_process_id": session.pending_process_id,
                "guidance_stage": session.guidance_stage,
                "snippet": session_repo.last_message_preview(db, session.id),
                "updated_at": session.last_activity_at.isoformat() if session.last_activity_at else None,
            }
            for session in sessions
        ],
        "total": session_repo.count_sessions(db, user_id),
    }


def session_messages(db: Session, user_id: str, session_id: str) -> dict:
    session = session_repo.get_chat_session(db, session_id, user_id=user_id)
    if session is None:
        raise NotFound("گفتگو یافت نشد.")
    messages = session_repo.load_messages(db, session_id)
    return {
        "session_id": session.id,
        "title": session.title,
        "messages": [
            {
                "id": message.id,
                "role": message.role,
                "content": message.content,
                "form_id": message.form_id,
                "process_id": message.process_id,
                "attachments": (message.meta or {}).get("attachments") or [],
                "activity": (message.meta or {}).get("activity") or [],
                "citations": message.citations,
                "created_at": message.created_at.isoformat() if message.created_at else None,
            }
            for message in messages
        ],
    }


def delete_session(db: Session, user_id: str, session_id: str) -> None:
    session = session_repo.get_chat_session(db, session_id, user_id=user_id)
    if session is None:
        raise NotFound("گفتگو یافت نشد.")
    session_repo.delete_session(db, session)


def rename_session(db: Session, user_id: str, session_id: str, title: str) -> dict:
    session = session_repo.get_chat_session(db, session_id, user_id=user_id)
    if session is None:
        raise NotFound("گفتگو یافت نشد.")
    session.title = title.strip()[:200] or session.title
    db.commit()
    return {"id": session.id, "title": session.title}
