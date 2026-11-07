"""Password hashing and opaque token helpers.

Tokens are random 256-bit values handed to the client; only their SHA-256 digest is
persisted, so a database leak does not expose usable session tokens.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

_PBKDF2_ALGORITHM = "sha256"
_PBKDF2_ITERATIONS = 600_000
_SALT_BYTES = 16


def hash_password(password: str) -> str:
    """Hash a password with PBKDF2-HMAC-SHA256 and return a self-describing string."""
    if not password:
        raise ValueError("رمز عبور نمی‌تواند خالی باشد.")
    salt = secrets.token_bytes(_SALT_BYTES)
    derived = hashlib.pbkdf2_hmac(_PBKDF2_ALGORITHM, password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        _PBKDF2_ITERATIONS,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(derived).decode("ascii"),
    )


def _verify_legacy(password: str, stored_hash: str) -> bool:
    """Verify hashes produced by the previous prototypes.

    Two formats are supported so that existing accounts keep working:
    ``base64(salt || derived_key)`` (PBKDF2, 100k iterations) and a bare
    SHA-256 hex digest from the very first JSON store.
    """
    stored_hash = (stored_hash or "").strip()
    candidate = hashlib.sha256(password.encode("utf-8")).hexdigest()
    if len(stored_hash) == len(candidate) and hmac.compare_digest(candidate, stored_hash.lower()):
        return True

    try:
        raw = base64.b64decode(stored_hash.encode("ascii"), validate=True)
    except Exception:
        return False
    if len(raw) <= _SALT_BYTES:
        return False
    salt, derived = raw[:_SALT_BYTES], raw[_SALT_BYTES:]
    calculated = hashlib.pbkdf2_hmac(_PBKDF2_ALGORITHM, password.encode("utf-8"), salt, 100_000)
    return hmac.compare_digest(calculated, derived)


def verify_password(password: str, stored_hash: str) -> bool:
    if not password or not stored_hash:
        return False
    if not stored_hash.startswith("pbkdf2_sha256$"):
        return _verify_legacy(password, stored_hash)
    try:
        _, iterations, salt_b64, digest_b64 = stored_hash.split("$", 3)
        salt = base64.b64decode(salt_b64.encode("ascii"), validate=True)
        expected = base64.b64decode(digest_b64.encode("ascii"), validate=True)
        calculated = hashlib.pbkdf2_hmac(_PBKDF2_ALGORITHM, password.encode("utf-8"), salt, int(iterations))
    except Exception:
        return False
    return hmac.compare_digest(calculated, expected)


def needs_rehash(stored_hash: str) -> bool:
    """True when the stored hash uses weaker parameters and should be upgraded on login."""
    if not stored_hash.startswith("pbkdf2_sha256$"):
        return True
    try:
        iterations = int(stored_hash.split("$", 2)[1])
    except (IndexError, ValueError):
        return True
    return iterations < _PBKDF2_ITERATIONS


def generate_token() -> str:
    """Generate an opaque bearer token (43 url-safe characters)."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Deterministic digest used as the primary key of the sessions table."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def validate_password_strength(password: str) -> str | None:
    """Return an error message, or ``None`` when the password is acceptable."""
    if len(password or "") < 8:
        return "رمز عبور باید حداقل ۸ کاراکتر باشد."
    if not any(char.isalpha() for char in password):
        return "رمز عبور باید حداقل یک حرف داشته باشد."
    if not any(char.isdigit() for char in password):
        return "رمز عبور باید حداقل یک رقم داشته باشد."
    return None
