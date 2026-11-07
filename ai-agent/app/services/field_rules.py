"""Machine-checkable field rules (H4) - the Python side of the contract.

The admin form builder writes::

    field.validation = {preset?, pattern?, patternMessage?, minLength?, maxLength?, min?, max?}

The flat ``form_fields`` projection keeps ``pattern``/``min_length``/``max_length`` at
the top level. :func:`resolve_rules` accepts **both** shapes so the same definition
validates identically in the live preview, in the applicant agent and here.

Presets are the single source of truth for Iranian identifiers:

* ``national_id``   - exactly 10 digits
* ``mobile_ir``     - ``^09\\d{9}$``
* ``postal_code_ir``- exactly 10 digits
* ``iban_ir``       - ``IR`` + 24 digits (spaces removed, uppercased)
"""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

_PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
_ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩"


def normalize_digits(value: str) -> str:
    """Convert Persian/Arabic-Indic digits to ASCII so the patterns stay simple."""
    for index, digit in enumerate(_PERSIAN_DIGITS):
        value = value.replace(digit, str(index))
    for index, digit in enumerate(_ARABIC_DIGITS):
        value = value.replace(digit, str(index))
    return value


def _normalize_iban(value: str) -> str:
    return re.sub(r"\s+", "", normalize_digits(value)).upper()


PRESETS: dict[str, dict[str, Any]] = {
    "national_id": {
        "pattern": r"^\d{10}$",
        "patternMessage": "کد ملی باید دقیقاً ۱۰ رقم باشد.",
        "minLength": 10,
        "maxLength": 10,
        "hint": "۱۰ رقم بدون خط تیره",
        "normalize": normalize_digits,
    },
    "mobile_ir": {
        "pattern": r"^09\d{9}$",
        "patternMessage": "شماره موبایل باید با ۰۹ شروع شود و ۱۱ رقم باشد.",
        "minLength": 11,
        "maxLength": 11,
        "hint": "مثال: ۰۹۱۲۳۴۵۶۷۸۹",
        "normalize": normalize_digits,
    },
    "postal_code_ir": {
        "pattern": r"^\d{10}$",
        "patternMessage": "کد پستی باید دقیقاً ۱۰ رقم باشد.",
        "minLength": 10,
        "maxLength": 10,
        "hint": "۱۰ رقم",
        "normalize": normalize_digits,
    },
    "iban_ir": {
        "pattern": r"^IR\d{24}$",
        "patternMessage": "شبا باید با IR شروع شود و ۲۴ رقم داشته باشد.",
        "minLength": 26,
        "maxLength": 26,
        "hint": "مثال: IR0600…",
        "normalize": _normalize_iban,
    },
}


def _first(*values: Any) -> Any:
    """Return the first non-``None`` value (so ``0`` survives)."""
    for value in values:
        if value is not None:
            return value
    return None


def resolve_rules(field: dict) -> dict:
    """Merge nested ``validation`` with the flat projection into one rule set."""
    nested = field.get("validation") if isinstance(field.get("validation"), dict) else {}
    preset_id = str(nested.get("preset") or "").strip()
    preset = PRESETS.get(preset_id, {})
    return {
        "preset": preset_id or None,
        "pattern": _first(nested.get("pattern"), field.get("pattern"), preset.get("pattern")),
        "patternMessage": _first(
            nested.get("patternMessage"), field.get("patternMessage"), preset.get("patternMessage")
        ),
        "minLength": _first(nested.get("minLength"), field.get("minLength"), preset.get("minLength")),
        "maxLength": _first(nested.get("maxLength"), field.get("maxLength"), preset.get("maxLength")),
        "min": _first(nested.get("min"), field.get("minValue")),
        "max": _first(nested.get("max"), field.get("maxValue")),
        "normalize": preset.get("normalize"),
    }


def is_config_valid(field: dict) -> bool:
    """``False`` when min > max or the regular expression does not compile."""
    rules = resolve_rules(field)
    min_length, max_length = rules["minLength"], rules["maxLength"]
    if isinstance(min_length, int) and isinstance(max_length, int) and min_length > max_length:
        return False
    minimum, maximum = rules["min"], rules["max"]
    if isinstance(minimum, (int, float)) and isinstance(maximum, (int, float)) and minimum > maximum:
        return False
    pattern = rules["pattern"]
    if pattern:
        try:
            re.compile(str(pattern))
        except re.error:
            return False
    return True


def check_field_value(field: dict, raw_value: Any) -> tuple[Any, str | None]:
    """Validate one value and return ``(cleaned_value, error_or_None)``.

    ``required`` stays the caller's responsibility; an empty optional value passes.
    """
    label = str(field.get("label") or field.get("name") or "این فیلد")
    rules = resolve_rules(field)
    normalize: Callable[[str], str] | None = rules["normalize"]

    if field.get("type") == "number":
        try:
            number = float(str(raw_value).strip())
        except (TypeError, ValueError):
            return raw_value, f"«{label}» باید عدد باشد."
        minimum, maximum = rules["min"], rules["max"]
        if isinstance(minimum, (int, float)) and number < float(minimum):
            return number, f"«{label}» نباید کمتر از {minimum} باشد."
        if isinstance(maximum, (int, float)) and number > float(maximum):
            return number, f"«{label}» نباید بیشتر از {maximum} باشد."
        return number, None

    value = "" if raw_value is None else str(raw_value).strip()
    if not value:
        return value, None
    if normalize:
        value = normalize(value)

    min_length, max_length = rules["minLength"], rules["maxLength"]
    if isinstance(min_length, int) and len(value) < min_length:
        return value, f"«{label}» باید حداقل {min_length} نویسه باشد."
    if isinstance(max_length, int) and len(value) > max_length:
        return value, f"«{label}» باید حداکثر {max_length} نویسه باشد."

    pattern = rules["pattern"]
    if pattern:
        try:
            if not re.fullmatch(str(pattern), value):
                return value, str(rules["patternMessage"] or f"قالب «{label}» معتبر نیست.")
        except re.error:
            # A malformed pattern must not block every submission; publish validation
            # reports it as an error instead.
            return value, None

    return value, None


def describe_rules(field: dict) -> list[str]:
    """Human-readable constraint list (used by the agent's form summary)."""
    rules = resolve_rules(field)
    lines: list[str] = []
    preset = PRESETS.get(str(rules["preset"] or ""))
    if preset:
        lines.append(f"{preset['hint']}")
    if rules["pattern"] and rules["patternMessage"]:
        lines.append(str(rules["patternMessage"]))
    if rules["minLength"] is not None:
        lines.append(f"حداقل {rules['minLength']} نویسه")
    if rules["maxLength"] is not None:
        lines.append(f"حداکثر {rules['maxLength']} نویسه")
    if rules["min"] is not None:
        lines.append(f"حداقل مقدار {rules['min']}")
    if rules["max"] is not None:
        lines.append(f"حداکثر مقدار {rules['max']}")
    return lines
