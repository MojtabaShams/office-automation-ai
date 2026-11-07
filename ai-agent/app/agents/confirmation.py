"""Deterministic explicit-confirmation detection.

The golden rule of this assistant is that a form is never rendered without an explicit
user confirmation. Relying on the LLM alone for that decision is fragile, so the first
gate is this deterministic classifier; the LLM is only consulted for ambiguous replies.
"""

from __future__ import annotations

import re
import unicodedata

CONFIRM = "confirm"
DECLINE = "decline"
UNCLEAR = "unclear"

_DECLINE_PATTERNS = (
    r"\bنه\b",
    r"\bخیر\b",
    r"\bنمی\s?خوام\b",
    r"\bنمی\s?خواهم\b",
    r"\bانصراف\b",
    r"\bلغو\b",
    r"\bبی\s?خیال\b",
    r"\bبعدا\b",
    r"\bبعداً\b",
    r"\bفعلا نه\b",
    r"\bفعلاً نه\b",
    r"\bno\b",
    r"\bnope\b",
)

_CONFIRM_PATTERNS = (
    r"\bبله\b",
    r"\bبلی\b",
    r"\bآره\b",
    r"\bاره\b",
    r"\bباشه\b",
    r"\bباشک?\b",
    r"\bحتما\b",
    r"\bحتماً\b",
    r"\bتایید\b",
    r"\bتأیید\b",
    r"\bتأیید می\s?کنم\b",
    r"\bموافقم\b",
    r"\bدرسته\b",
    r"\bصحیح\b",
    r"\bاوکی\b",
    r"\bok(ay)?\b",
    r"\byes\b",
    r"\bsure\b",
    r"باز\s?کن",
    r"بازش\s?کن",
    r"نمایش\s?بده",
    r"نشون\s?بده",
    r"ثبت\s?کن",
    r"پر\s?کن",
    r"ادامه\s?بده",
    r"می\s?خوام\s?(ثبت|ببینم|پر)",
)

_QUESTION_MARKERS = ("?", "؟", "چرا", "چطور", "چگونه", "یعنی", "فرق")

# Imperatives that unambiguously ask for the form, even when mixed with a question.
_STRONG_INTENT = re.compile(
    r"(باز|بازش|نمایش|نشون)\s?((می\s?)?کن|بده)|ثبت\s?کن|پر\s?کن|ادامه\s?بده"
)


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    text = text.replace("\u200c", " ").replace("ي", "ی").replace("ك", "ک")
    text = re.sub(r"[.,!؛;:\"'«»()\[\]]", " ", text)
    return re.sub(r"\s+", " ", text).strip().lower()


def detect_confirmation(text: str) -> str:
    """Classify a user reply as ``confirm``, ``decline`` or ``unclear``."""
    normalized = normalize(text)
    if not normalized or len(normalized) > 160:
        return UNCLEAR

    if any(re.search(pattern, normalized) for pattern in _DECLINE_PATTERNS):
        return DECLINE

    has_confirmation = any(re.search(pattern, normalized) for pattern in _CONFIRM_PATTERNS)
    if not has_confirmation:
        return UNCLEAR

    # A question mixed with a confirmation (e.g. «باشه ولی چرا؟») shows hesitation, so it
    # only counts when the user also uses an explicit imperative (e.g. «بله، بازش کن»).
    if any(marker in normalized for marker in _QUESTION_MARKERS) and not _STRONG_INTENT.search(normalized):
        return UNCLEAR

    # A confirmation is usually short; a long message that also asks a new question is
    # treated as a new request so we don't open a form by accident.
    if len(normalized) > 80 and any(marker in normalized for marker in _QUESTION_MARKERS):
        return UNCLEAR
    return CONFIRM


def looks_like_greeting(text: str) -> bool:
    normalized = normalize(text)
    return bool(re.fullmatch(r"(سلام|درود|وقت بخیر|سلام علیکم|hi|hello)[\!\s]*", normalized))
