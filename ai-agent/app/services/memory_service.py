"""Conversation memory: rolling window + LLM-compacted summary.

Short-term memory is the last ``CHAT_HISTORY_LIMIT`` messages; long-term memory is a
rolling Persian summary persisted on ``chat_sessions.summary`` so context survives
process restarts and keeps prompts small.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.chat import ChatSession
from app.repositories import session_repo

logger = logging.getLogger(__name__)

_MIN_MESSAGES_TO_SUMMARIZE = 6


def history_for_agent(db: Session, session: ChatSession) -> list[dict]:
    messages = session_repo.load_messages(db, session.id, limit=settings.CHAT_HISTORY_LIMIT)
    return [
        {"role": message.role, "content": message.content}
        for message in messages
        if message.role in {"user", "assistant"} and message.content
    ]


def maybe_summarize(db: Session, session: ChatSession) -> None:
    """Compact older messages when the store grows beyond the rolling window."""
    if session.message_count < settings.CHAT_SUMMARY_TRIGGER:
        return

    all_messages = session_repo.load_messages(db, session.id)
    cutoff_id = session.summary_upto_message_id or 0
    older = [
        message
        for message in all_messages
        if message.id > cutoff_id and message.role in {"user", "assistant"} and message.content
    ]
    # Keep the newest messages verbatim for the rolling window.
    rolling = max(settings.CHAT_HISTORY_LIMIT // 2, _MIN_MESSAGES_TO_SUMMARIZE)
    older = older[:-rolling] if len(older) > rolling else []
    if len(older) < _MIN_MESSAGES_TO_SUMMARIZE:
        return

    transcript = "\n".join(
        f"{'کاربر' if message.role == 'user' else 'دستیار'}: {message.content}" for message in older
    )
    summary = _summarize(transcript, session.summary)
    if not summary:
        return

    session.summary = summary[: settings.CHAT_SUMMARY_MAX_CHARS]
    session.summary_upto_message_id = older[-1].id
    db.commit()
    logger.debug("Session %s summary updated up to message %s", session.id, older[-1].id)


def _summarize(transcript: str, previous_summary: str | None) -> str:
    """Ask the LLM for a compact summary; fall back to a deterministic truncation."""
    prompt = (
        "این گفتگوی یک میز خدمت اداری است. آن را در حداکثر ۵ خط فارسی خلاصه کن.\n"
        "موارد مهم: نیاز اصلی کاربر، فرم/خدمت موردنظر، اطلاعاتی که کاربر داده، "
        "وضعیت تأیید فرم. فقط خلاصه را بنویس.\n\n"
        f"خلاصه قبلی:\n{previous_summary or '—'}\n\n"
        f"گفتگو:\n{transcript[-6000:]}"
    )
    try:
        from app.agents.llm import get_llm

        llm = get_llm()
        if llm is not None:
            response = llm.invoke(prompt)
            content = response.content if isinstance(response.content, str) else str(response.content)
            if content.strip():
                return content.strip()
    except Exception as exc:  # summarisation must never break a chat turn
        logger.warning("LLM summarisation failed: %s", exc)

    # Deterministic fallback: keep the beginning and end of the transcript.
    compact = " ".join(transcript.split())
    if len(compact) <= settings.CHAT_SUMMARY_MAX_CHARS:
        return compact
    half = settings.CHAT_SUMMARY_MAX_CHARS // 2 - 3
    return f"{compact[:half]} … {compact[-half:]}"
