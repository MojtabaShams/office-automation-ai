"""Shared pytest fixtures.

By default the tests use the configured ``DATABASE_URL`` but create a brand-new account per
run, so they never collide with development data. Point ``TEST_DATABASE_URL`` at a throwaway
database in CI to keep it fully isolated.
"""

from __future__ import annotations

import os
import random
import uuid

import pytest

if os.getenv("TEST_DATABASE_URL"):
    os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ.setdefault("SEED_ON_STARTUP", "true")
os.environ.setdefault("AUTO_RUN_MIGRATIONS", "true")


def _valid_national_id(seed: int) -> str:
    """Build a 10-digit Iranian national ID that satisfies the checksum."""
    digits = [int(char) for char in f"{seed:09d}"[-9:]]
    total = sum(digit * (10 - index) for index, digit in enumerate(digits))
    remainder = total % 11
    check = remainder if remainder < 2 else 11 - remainder
    return "".join(str(digit) for digit in digits) + str(check)


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def account() -> dict[str, str]:
    unique = uuid.uuid4().hex[:8]
    seed = int(unique, 16) % 1_000_000_000
    mobile_tail = f"{random.SystemRandom().randint(0, 999_999_999):09d}"
    return {
        "full_name": "کاربر آزمون",
        "national_id": _valid_national_id(seed),
        "mobile": f"09{mobile_tail}",
        "password": "Test@12345",
        "password_confirm": "Test@12345",
    }


@pytest.fixture(scope="session")
def auth(client, account) -> dict:
    """Register a fresh user and return ``{"headers", "token", "user"}``."""
    response = client.post("/api/auth/register", json=account)
    if response.status_code != 200:
        response = client.post(
            "/api/auth/login",
            json={"mobile": account["mobile"], "password": account["password"]},
        )
    assert response.status_code == 200, response.text
    payload = response.json()
    return {
        "headers": {"Authorization": f"Bearer {payload['token']}"},
        "token": payload["token"],
        "user": payload["user"],
    }
