"""System-prompt assembly for one turn.

The prompt is a template over live database state (retrieved knowledge, the form and
process catalogues, the conversation summary, what is pending). Assembling it is a
separate concern from calling a model, and it is assembled **lazily**: the guidance
middleware may short-circuit the model phase entirely, in which case no catalogue query
must run.

The assembled string is cached on the turn dictionary, which is a copy owned by
:class:`~app.agents.middleware.model.ModelCallMiddleware`, so the ensemble and the
single-model path share one assembly.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.services import consultation_service, form_service

from ..backends import DbBackend
from ..prompts import SYSTEM_PROMPT

#: Key under which the assembled prompt is memoised for the duration of one turn.
PROMPT_KEY = "_system_prompt"
#: Key carrying a caller-supplied template (``create_service_agent(system_prompt=...)``).
PROMPT_TEMPLATE_KEY = "_prompt_template"


def system_prompt_for(state: dict, db: Session | None, *, template: str | None = None) -> str:
    """Render the system prompt for ``state``, reusing a previous render if present."""
    cached = state.get(PROMPT_KEY)
    if cached is not None:
        return cached

    backend = DbBackend(db)
    pending = state.get("pending_form_id")
    chosen = template or state.get(PROMPT_TEMPLATE_KEY) or SYSTEM_PROMPT
    prompt = chosen.format(
        context=state.get("context") or "—",
        forms_summary=form_service.get_form_summary_text(db) if db is not None else "—",
        processes_summary=consultation_service.list_text(db) if db is not None else "—",
        summary=state.get("summary") or "—",
        pending_form=backend.form_title(pending),
        asked_for_confirmation="بله" if pending else "خیر",
        pending_process=backend.process_title(state.get("pending_process_id")),
        guidance_stage=state.get("guidance_stage") or "—",
    )
    state[PROMPT_KEY] = prompt
    return prompt


__all__ = ["PROMPT_KEY", "PROMPT_TEMPLATE_KEY", "system_prompt_for"]
