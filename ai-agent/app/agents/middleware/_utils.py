"""Small helpers shared by several middleware.

Everything here used to be duplicated inside ``nodes.py``; keeping one copy keeps the
middleware modules readable and the message handling in a single place.
"""

from __future__ import annotations

from langchain_core.messages import AIMessage, HumanMessage


def last_human_content(messages: list) -> str:
    """Content of the newest user message (``""`` when there is none)."""
    for message in reversed(list(messages or [])):
        if isinstance(message, HumanMessage):
            return message.content if isinstance(message.content, str) else str(message.content)
    return ""


def last_ai_content(messages: list, *, skip_tool_calls: bool = True) -> str:
    """Content of the newest assistant message, optionally skipping action-only turns."""
    for message in reversed(list(messages or [])):
        if isinstance(message, AIMessage):
            if skip_tool_calls and getattr(message, "tool_calls", None):
                continue
            return message.content if isinstance(message.content, str) else str(message.content)
    return ""


__all__ = ["last_ai_content", "last_human_content"]
