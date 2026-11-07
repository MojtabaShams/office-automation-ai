"""Presenter: turn the finished turn into exactly one reply plus optional payloads.

The presenter is the only place that decides what the applicant actually sees. It runs
after the gate, so it is where a confirmation becomes a rendered form (or the stepper
wizard) and where a decline becomes a polite no. Keeping it separate from the model phase
means the "never render a form without confirmation" rule is enforced by the shape of the
graph, not by prompt obedience.
"""

from __future__ import annotations

import logging

from langchain_core.runnables import RunnableConfig

from app.services import form_service, process_flow_service

from ..backends import session_for
from . import activity, guidance
from ._utils import last_ai_content
from .base import AgentMiddleware, StateUpdates

logger = logging.getLogger(__name__)


def form_presenter(state: dict, config: RunnableConfig) -> StateUpdates:
    """Assemble the final reply and the payloads the chat panel renders."""
    db = session_for(config)
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
            base = last_ai_content(state.get("messages", [])).strip()
            return {
                "reply": f"{base}\n\n{note}" if base else note,
                "stepper_payload": stepper,
                "pending_process_id": stepper["process_id"],
                "guidance_stage": guidance.STAGE_STEPPER,
                "pending_form_id": None,
            }

    reply = last_ai_content(state.get("messages", []))
    return {"reply": reply or "متوجه نشدم؛ می‌خواهید درباره کدام خدمت یا فرم راهنمایی بگیرید؟"}


class PresenterMiddleware(AgentMiddleware):
    """Terminal step: one reply, plus the form/process/stepper payloads."""

    name = "PresenterMiddleware"

    def run(self, state: dict, config: RunnableConfig) -> StateUpdates:
        return form_presenter(state, config)


__all__ = ["PresenterMiddleware", "form_presenter"]
