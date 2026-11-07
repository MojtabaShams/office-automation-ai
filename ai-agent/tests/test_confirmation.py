"""The golden rule: a form is only opened after an explicit confirmation."""

from __future__ import annotations

import pytest

from app.agents.confirmation import CONFIRM, DECLINE, UNCLEAR, detect_confirmation, looks_like_greeting


@pytest.mark.parametrize(
    "text",
    ["بله", "بلی", "آره", "باشه", "حتماً", "تأیید می‌کنم", "ok", "yes", "بازش کن", "بله، بازش کن", "نمایش بده"],
)
def test_confirmations(text: str) -> None:
    assert detect_confirmation(text) == CONFIRM


@pytest.mark.parametrize("text", ["نه", "خیر", "نمی‌خوام", "انصراف", "بعداً", "فعلاً نه", "no"])
def test_declines(text: str) -> None:
    assert detect_confirmation(text) == DECLINE


@pytest.mark.parametrize(
    "text",
    [
        "فرم مرخصی می‌خوام",  # a request is not a confirmation
        "برای مرخصی چه مدارکی لازم است؟",
        "باشه ولی چرا؟",  # hesitation with a question
        "بله؟",
        "",
    ],
)
def test_non_confirmations(text: str) -> None:
    assert detect_confirmation(text) == UNCLEAR


def test_greeting_detection() -> None:
    assert looks_like_greeting("سلام")
    assert looks_like_greeting("وقت بخیر")
    assert not looks_like_greeting("سلام، فرم مرخصی می‌خوام")
