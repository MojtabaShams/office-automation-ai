from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.base import utcnow
from app.models.chat import ChatMessage, ChatSession


# ------------------------------------------------------------------------- sessions
def create_chat_session(db: Session, user_id: str, *, title: str | None = None) -> ChatSession:
    session = ChatSession(user_id=user_id, title=title, last_activity_at=utcnow())
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_chat_session(db: Session, session_id: str, *, user_id: str | None = None) -> ChatSession | None:
    session = db.get(ChatSession, session_id)
    if session is None or session.is_deleted:
        return None
    if user_id is not None and session.user_id != user_id:
        return None
    return session


def get_latest_session(db: Session, user_id: str) -> ChatSession | None:
    return db.scalar(
        select(ChatSession)
        .where(
            ChatSession.user_id == user_id,
            ChatSession.status == "active",
            ChatSession.is_deleted.is_(False),
        )
        .order_by(ChatSession.last_activity_at.desc())
        .limit(1)
    )


def list_sessions(
    db: Session, user_id: str, *, limit: int = 30, offset: int = 0, query: str | None = None
) -> list[ChatSession]:
    stmt = select(ChatSession).where(
        ChatSession.user_id == user_id,
        ChatSession.status == "active",
        ChatSession.is_deleted.is_(False),
    )
    if query:
        stmt = stmt.where(ChatSession.title.ilike(f"%{query.strip()}%"))
    return list(db.scalars(stmt.order_by(ChatSession.last_activity_at.desc()).limit(limit).offset(offset)))


def count_sessions(db: Session, user_id: str) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(ChatSession)
            .where(
                ChatSession.user_id == user_id,
                ChatSession.status == "active",
                ChatSession.is_deleted.is_(False),
            )
        )
        or 0
    )


def delete_session(db: Session, session: ChatSession) -> None:
    """Archive a conversation. Messages stay in the table for audit."""
    session.is_deleted = True
    session.deleted_at = utcnow()
    session.status = "archived"
    db.commit()


def set_pending_form(db: Session, session: ChatSession, form_id: str | None) -> None:
    session.pending_form_id = form_id
    session.last_activity_at = utcnow()
    db.commit()


def set_guidance(
    db: Session,
    session: ChatSession,
    *,
    process_id: str | None,
    stage: str | None,
) -> None:
    """Remember where the progressive process guidance stopped."""
    session.pending_process_id = process_id
    session.guidance_stage = stage
    session.last_activity_at = utcnow()
    db.commit()


def clear_form_references(db: Session, user_id: str, session_id: str, form_id: str) -> int:
    """Forget a form after it has been submitted.

    The applicant must not be able to submit the same form twice from the restored
    conversation, so the pending marker and every ``form_id`` pointer in that session
    are cleared. The message text is kept; only the embedded form disappears.
    """
    session = get_chat_session(db, session_id, user_id=user_id)
    if session is None:
        return 0
    if session.pending_form_id == form_id:
        session.pending_form_id = None
    messages = list(
        db.scalars(
            select(ChatMessage).where(
                ChatMessage.session_id == session.id, ChatMessage.form_id == form_id
            )
        )
    )
    for message in messages:
        message.form_id = None
    db.commit()
    return len(messages)


def set_summary(db: Session, session: ChatSession, summary: str) -> None:
    session.summary = summary
    db.commit()


def set_status(db: Session, session: ChatSession, status: str) -> None:
    session.status = status
    db.commit()


# ------------------------------------------------------------------------- messages
def add_message(
    db: Session,
    session: ChatSession,
    *,
    role: str,
    content: str,
    intent: str | None = None,
    form_id: str | None = None,
    process_id: str | None = None,
    citations: list | None = None,
    meta: dict | None = None,
) -> ChatMessage:
    message = ChatMessage(
        session_id=session.id,
        role=role,
        content=content or "",
        intent=intent,
        form_id=form_id,
        process_id=process_id,
        citations=citations,
        meta=meta,
    )
    db.add(message)

    session.message_count = (session.message_count or 0) + 1
    session.last_activity_at = utcnow()
    if role == "user" and not session.title:
        title = " ".join((content or "").split())
        if not title and meta and meta.get("attachments"):
            names = "، ".join(str(item.get("name") or "فایل") for item in meta["attachments"])
            title = f"پیوست: {names}"
        session.title = title[: settings.CHAT_TITLE_MAX_CHARS] or "گفتگوی جدید"

    db.commit()
    db.refresh(message)
    return message


def load_messages(db: Session, session_id: str, *, limit: int | None = None) -> list[ChatMessage]:
    stmt = select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.id.asc())
    if limit is None:
        return list(db.scalars(stmt))
    rows = list(db.scalars(stmt))
    return rows[-limit:] if len(rows) > limit else rows


def last_message_preview(db: Session, session_id: str, *, max_chars: int = 160) -> str | None:
    message = db.scalar(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.id.desc())
        .limit(1)
    )
    if message is None:
        return None
    text = " ".join((message.content or "").split())
    if not text:
        attachments = (message.meta or {}).get("attachments") or []
        names = "، ".join(str(item.get("name") or "") for item in attachments if item.get("name"))
        text = f"پیوست: {names}" if names else ""
    return text[:max_chars] or None


def delete_empty_sessions(db: Session, user_id: str) -> int:
    """Archive sessions that were created but never used (e.g. failed LLM calls)."""
    empty = list(
        db.scalars(
            select(ChatSession).where(
                ChatSession.user_id == user_id,
                ChatSession.message_count == 0,
                ChatSession.is_deleted.is_(False),
            )
        )
    )
    if not empty:
        return 0
    now = utcnow()
    for session in empty:
        session.is_deleted = True
        session.deleted_at = now
        session.status = "archived"
    db.commit()
    return len(empty)
