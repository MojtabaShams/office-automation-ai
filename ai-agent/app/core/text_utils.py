"""Small input-normalisation helpers (Persian digits, mobile numbers, names)."""

from __future__ import annotations

import re

_DIGIT_MAP = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
_SPACES = re.compile(r"\s+")


def to_ascii_digits(value: str) -> str:
    return (value or "").translate(_DIGIT_MAP)


def normalize_mobile(value: str) -> str:
    """Return a canonical ``09xxxxxxxxx`` mobile number (or the trimmed input)."""
    digits = re.sub(r"\D", "", to_ascii_digits(value or ""))
    if digits.startswith("0098"):
        digits = "0" + digits[4:]
    elif digits.startswith("98") and len(digits) == 12:
        digits = "0" + digits[2:]
    elif digits.startswith("9") and len(digits) == 10:
        digits = "0" + digits
    return digits


def normalize_national_id(value: str) -> str:
    return re.sub(r"\D", "", to_ascii_digits(value or ""))


def normalize_person_name(value: str) -> str:
    return _SPACES.sub(" ", (value or "").strip())


def is_valid_mobile(value: str) -> bool:
    return bool(re.fullmatch(r"09\d{9}", value or ""))


def is_valid_national_id(value: str) -> bool:
    """Iranian national ID checksum validation."""
    code = normalize_national_id(value)
    if not re.fullmatch(r"\d{10}", code) or len(set(code)) == 1:
        return False
    check = int(code[9])
    total = sum(int(code[i]) * (10 - i) for i in range(9))
    remainder = total % 11
    return check == remainder if remainder < 2 else check == 11 - remainder
