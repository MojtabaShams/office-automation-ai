"""Post-model finalisation: the answer a model returns is not yet what the UI shows.

Two invariants live here, and they must hold for every model path (committee or single
model):

* an action-only answer never reaches the panel as an empty bubble;
* whenever a form is awaiting confirmation the reply actually asks the question.

Both used to sit inside the advisor node; they are a separate concern from calling a
model, so they are a module the model phase and the ensemble both call.
"""

from __future__ import annotations

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig
from sqlalchemy.orm import Session

from app.services import form_service, submission_service

from ..backends import DbBackend, session_for
from ._utils import last_human_content


def finalize_model_response(
    response: AIMessage,
    state: dict,
    config: RunnableConfig,
    extra: dict | None = None,
) -> dict:
    """Finalise ``response`` for the graph state, reading the session from ``config``."""
    return finalize_advisor(
        response,
        state,
        session_for(config),
        state.get("pending_form_id"),
        list(state.get("messages", [])),
        extra,
    )


def finalize_advisor(
    response: AIMessage,
    state: dict,
    db: Session | None,
    pending: str | None,
    messages: list,
    extra: dict | None = None,
) -> dict:
    """Guarantee a non-empty, action-consistent answer for one model response."""
    backend = DbBackend(db)
    content = response.content if isinstance(response.content, str) else str(response.content)
    tool_calls = list(getattr(response, "tool_calls", None) or [])
    if not content.strip():
        # An action-only answer must never reach the panel as an empty bubble.
        content = fallback_reply(state, db)
        response = AIMessage(content=content, tool_calls=tool_calls)
    if not tool_calls:
        if not pending and state.get("intent") == "form_request" and db is not None:
            pending = form_service.find_form_id(db, last_human_content(messages))
        # Deterministically guarantee a confirmation question when a form is pending.
        if pending and "؟" not in content and "?" not in content:
            content = f"{content.strip()}\n\nآیا فرم «{backend.form_title(pending)}» را برایتان باز کنم؟"
            response = AIMessage(content=content, tool_calls=tool_calls)

    return {"messages": [response], "pending_form_id": pending, **(extra or {})}


def fallback_reply(state: dict, db: Session | None) -> str:
    """Deterministic answer when no LLM is configured (or the LLM call failed)."""
    backend = DbBackend(db)
    intent = state.get("intent")
    pending = state.get("pending_form_id")

    if intent == "track" and db is not None and state.get("user_id"):
        return submission_service.summary_for_user(db, state["user_id"])

    # A file-only turn: acknowledge the upload instead of guessing an answer.
    human = last_human_content(state.get("messages", []))
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
            question = f"آیا فرم «{backend.form_title(pending)}» را برایتان باز کنم؟"
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


__all__ = ["fallback_reply", "finalize_advisor", "finalize_model_response"]
