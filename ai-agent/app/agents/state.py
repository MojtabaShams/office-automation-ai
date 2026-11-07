"""Shared graph state."""

from __future__ import annotations

from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict, total=False):
    messages: Annotated[list[BaseMessage], add_messages]
    user_id: str
    session_id: str
    summary: str
    intent: str
    query: str
    context: str
    field_guidelines: str
    citations: list[dict]
    pending_form_id: str | None
    pending_process_id: str | None
    guidance_stage: str | None
    pending_at_start: str | None
    confirmed: bool
    declined: bool
    form_payload: dict | None
    process_payload: dict | None
    stepper_payload: dict | None
    stepper_process_id: str | None
    reply: str
    tool_iterations: int
    #: Which committee member produced the final prose (set by the ensemble).
    answer_model: str | None
    #: Compact per-model trace stored with the assistant message.
    ensemble_trace: str | None
    #: True when the judge merged/selected across several answers.
    used_judge: bool
