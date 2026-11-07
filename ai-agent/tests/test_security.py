"""Unit tests for password hashing, token digests and Iranian identifier validation."""

from __future__ import annotations

from app.core.security import (
    generate_token,
    hash_password,
    hash_token,
    needs_rehash,
    validate_password_strength,
    verify_password,
)
from app.core.text_utils import (
    is_valid_mobile,
    is_valid_national_id,
    normalize_mobile,
    normalize_national_id,
)


def test_password_roundtrip_and_salt() -> None:
    first = hash_password("Secret#123")
    second = hash_password("Secret#123")

    assert first != second  # unique salt per hash
    assert first.startswith("pbkdf2_sha256$")
    assert verify_password("Secret#123", first)
    assert not verify_password("secret#123", first)
    assert not needs_rehash(first)


def test_legacy_password_hash_is_flagged_for_rehash() -> None:
    import hashlib

    legacy = hashlib.sha256(b"Secret#123").hexdigest()

    assert verify_password("Secret#123", legacy)
    assert needs_rehash(legacy)


def test_password_strength_policy() -> None:
    assert validate_password_strength("short") is not None
    assert validate_password_strength("12345678") is not None  # digits only
    assert validate_password_strength("Test@12345") is None


def test_tokens_are_random_and_hashed() -> None:
    token = generate_token()
    assert len(token) >= 32
    assert token != generate_token()
    digest = hash_token(token)
    assert len(digest) == 64
    assert digest != token


def test_mobile_normalization_and_validation() -> None:
    assert normalize_mobile("۰۹۱۲۱۲۳۴۵۶۷") == "09121234567"
    assert normalize_mobile("+98 912 123 4567") == "09121234567"
    assert is_valid_mobile("09121234567")
    assert not is_valid_mobile("08121234567")
    assert not is_valid_mobile("0912123456")


def test_national_id_checksum() -> None:
    assert normalize_national_id("۰۰۱۲۳۴۵۶۷۹") == "0012345679"
    assert is_valid_national_id("0012345679")
    assert not is_valid_national_id("0012345678")
    assert not is_valid_national_id("123")
