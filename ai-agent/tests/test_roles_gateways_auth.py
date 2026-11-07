"""Roles, permissions, payment gateways and the 15-minute session policy."""

from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.core import rate_limit


def _valid_national_id(seed: int) -> str:
    digits = [int(char) for char in f"{seed:09d}"[-9:]]
    total = sum(digit * (10 - index) for index, digit in enumerate(digits))
    remainder = total % 11
    check = remainder if remainder < 2 else 11 - remainder
    return "".join(str(digit) for digit in digits) + str(check)


def _unique_mobile() -> str:
    return f"09{random.SystemRandom().randint(0, 999_999_999):09d}"


def _unique_national_id() -> str:
    return _valid_national_id(int(uuid.uuid4().hex[:8], 16) % 1_000_000_000)


@pytest.fixture(autouse=True)
def _fresh_limiters():
    rate_limit.reset_all()
    yield
    rate_limit.reset_all()


@pytest.fixture(scope="session")
def admin_auth(client) -> dict:
    """A super-admin account created through the service, then logged in via HTTP."""
    from app.core.database import SessionLocal
    from app.services import auth_service

    mobile = _unique_mobile()
    password = "Admin@12345"
    db = SessionLocal()
    try:
        auth_service.create_admin(db, mobile=mobile, password=password, full_name="مدیر آزمون")
    finally:
        db.close()

    response = client.post("/api/auth/login", json={"mobile": mobile, "password": password})
    assert response.status_code == 200, response.text
    payload = response.json()
    return {
        "headers": {"Authorization": f"Bearer {payload['token']}"},
        "token": payload["token"],
        "user": payload["user"],
    }


@pytest.fixture(scope="session")
def employee_auth(client, admin_auth) -> dict:
    """An ``employee`` account created through the API by the super admin."""
    mobile = _unique_mobile()
    password = "Employee@12345"
    response = client.post(
        "/api/users",
        json={
            "fullName": "کارشناس آزمون",
            "mobile": mobile,
            "nationalId": _unique_national_id(),
            "password": password,
            "roleId": "role-employee",
            "email": f"{uuid.uuid4().hex[:8]}@example.com",
            "unit": "معاونت اداری",
        },
        headers=admin_auth["headers"],
    )
    assert response.status_code == 200, response.text

    login = client.post("/api/auth/login", json={"mobile": mobile, "password": password})
    assert login.status_code == 200, login.text
    payload = login.json()
    return {
        "headers": {"Authorization": f"Bearer {payload['token']}"},
        "user": payload["user"],
    }


# ---------------------------------------------------------------------------- TTL
def test_login_token_expires_in_thirty_minutes(client, account) -> None:
    response = client.post(
        "/api/auth/login", json={"mobile": account["mobile"], "password": account["password"]}
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["expires_in"] == 30 * 60
    expires_at = datetime.fromisoformat(body["expires_at"])
    remaining = (expires_at - datetime.now(timezone.utc)).total_seconds()
    assert 29 * 60 <= remaining <= 30 * 60 + 5


def test_expired_token_is_rejected_with_401(client, account) -> None:
    from app.core.database import SessionLocal
    from app.core.security import hash_token
    from app.models.base import utcnow
    from app.models.user import AuthSession

    login = client.post(
        "/api/auth/login", json={"mobile": account["mobile"], "password": account["password"]}
    )
    token = login.json()["token"]

    db = SessionLocal()
    try:
        db.query(AuthSession).filter(AuthSession.token_hash == hash_token(token)).update(
            {"expires_at": utcnow() - timedelta(minutes=1)}
        )
        db.commit()
    finally:
        db.close()

    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_logout_invalidates_the_token_on_the_server(client, account) -> None:
    login = client.post(
        "/api/auth/login", json={"mobile": account["mobile"], "password": account["password"]}
    )
    headers = {"Authorization": f"Bearer {login.json()['token']}"}

    assert client.get("/api/auth/me", headers=headers).status_code == 200
    assert client.post("/api/auth/logout", headers=headers).status_code == 200
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_login_errors_do_not_reveal_account_existence(client, account) -> None:
    wrong_password = client.post(
        "/api/auth/login", json={"mobile": account["mobile"], "password": "Wrong@12345"}
    )
    unknown_user = client.post(
        "/api/auth/login", json={"mobile": _unique_mobile(), "password": "Wrong@12345"}
    )

    assert wrong_password.status_code == unknown_user.status_code == 401
    assert wrong_password.json()["message"] == unknown_user.json()["message"]


def test_login_is_rate_limited(client) -> None:
    mobile = _unique_mobile()
    statuses = [
        client.post("/api/auth/login", json={"mobile": mobile, "password": "Wrong@12345"}).status_code
        for _ in range(9)
    ]
    assert statuses[-1] == 429
    assert 401 in statuses

    body = client.post("/api/auth/login", json={"mobile": mobile, "password": "Wrong@12345"}).json()
    assert body["code"] == "rate_limited"
    assert body["retry_after"] >= 1


def test_register_requires_matching_password_confirmation(client) -> None:
    mobile = _unique_mobile()
    response = client.post(
        "/api/auth/register",
        json={
            "full_name": "کاربر ناهمخوان",
            "national_id": _unique_national_id(),
            "mobile": mobile,
            "password": "Test@12345",
            "password_confirm": "Test@54321",
        },
    )
    assert response.status_code == 422
    assert "یکسان" in response.json()["message"]


def test_profile_can_be_updated(client, auth) -> None:
    email = f"profile-{uuid.uuid4().hex[:8]}@example.com"
    response = client.patch(
        "/api/auth/profile",
        json={"email": email, "unit": "واحد پشتیبانی"},
        headers=auth["headers"],
    )
    assert response.status_code == 200, response.text
    user = response.json()["user"]
    assert user["email"] == email
    assert user["unit"] == "واحد پشتیبانی"
    assert "password_hash" not in user


# --------------------------------------------------------------------- permissions
def test_applicant_cannot_open_admin_areas(client, auth) -> None:
    assert client.get("/api/roles", headers=auth["headers"]).status_code == 403
    assert client.get("/api/payment-gateways", headers=auth["headers"]).status_code == 403
    assert client.get("/api/users", headers=auth["headers"]).status_code == 403


def test_employee_has_scoped_permissions(client, employee_auth) -> None:
    headers = employee_auth["headers"]
    assert employee_auth["user"]["role"] == "employee"

    assert client.get("/api/roles/catalog", headers=headers).status_code == 200
    assert client.get("/api/payment-gateways", headers=headers).status_code == 200
    assert client.get("/api/users", headers=headers).status_code == 200
    assert client.get("/api/admin/overview", headers=headers).status_code == 200

    # An employee may look, but may not create roles or gateways.
    assert (
        client.post("/api/roles", json={"name": "نقش غیرمجاز", "code": "denied_role"}, headers=headers).status_code
        == 403
    )
    assert (
        client.post(
            "/api/payment-gateways",
            json={"bankName": "بانک غیرمجاز", "connectionKey": "12345678"},
            headers=headers,
        ).status_code
        == 403
    )


def test_super_admin_sees_the_full_permission_matrix(client, admin_auth) -> None:
    response = client.get("/api/auth/me", headers=admin_auth["headers"])
    assert response.status_code == 200
    user = response.json()["user"]
    assert user["role"] == "super_admin"
    permissions = user["permissions"]
    assert permissions["admin_panel"]["view"] is True
    assert permissions["roles"]["delete"] is True


# ------------------------------------------------------------------------- roles
def test_role_crud_and_permission_assignment(client, admin_auth) -> None:
    headers = admin_auth["headers"]
    code = f"supervisor_{uuid.uuid4().hex[:6]}"

    created = client.post(
        "/api/roles",
        json={
            "name": "ناظر فرم‌ها",
            "code": code,
            "description": "فقط مشاهده و انتشار فرم‌ها",
            "permissions": {
                "admin_panel": {"view": True},
                "forms": {"view": True, "publish": True},
            },
        },
        headers=headers,
    )
    assert created.status_code == 200, created.text
    role = created.json()["role"]
    assert role["code"] == code
    assert role["isSystem"] is False
    assert role["permissions"]["forms"]["publish"] is True
    assert role["permissions"]["forms"]["delete"] is False

    renamed = client.patch(
        f"/api/roles/{role['id']}", json={"name": "ناظر محتوا"}, headers=headers
    )
    assert renamed.status_code == 200
    assert renamed.json()["role"]["name"] == "ناظر محتوا"

    updated = client.put(
        f"/api/roles/{role['id']}/permissions",
        json={"permissions": {"admin_panel": {"view": True}, "requests": {"view": True}}},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    matrix = updated.json()["role"]["permissions"]
    assert matrix["requests"]["view"] is True
    assert matrix["forms"]["view"] is False

    listed = client.get("/api/roles", headers=headers)
    assert listed.status_code == 200
    assert any(item["id"] == role["id"] for item in listed.json()["roles"])

    deleted = client.delete(f"/api/roles/{role['id']}", headers=headers)
    assert deleted.status_code == 200
    assert not any(
        item["id"] == role["id"] for item in client.get("/api/roles", headers=headers).json()["roles"]
    )


def test_system_roles_are_protected(client, admin_auth) -> None:
    headers = admin_auth["headers"]

    assert client.delete("/api/roles/role-applicant", headers=headers).status_code == 422
    assert (
        client.put(
            "/api/roles/role-super-admin/permissions",
            json={"permissions": {"admin_panel": {"view": True}}},
            headers=headers,
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/roles",
            json={"name": "نقش تکراری", "code": "applicant"},
            headers=headers,
        ).status_code
        == 409
    )


def test_employee_list_never_exposes_password_hashes(client, admin_auth) -> None:
    response = client.get("/api/users", headers=admin_auth["headers"])
    assert response.status_code == 200
    for user in response.json()["users"]:
        assert "password_hash" not in user
        assert "password" not in user
        assert user["roleCode"] in {"super_admin", "employee", "applicant"}


# ---------------------------------------------------------------------- gateways
def test_payment_gateway_crud_masks_the_connection_key(client, admin_auth) -> None:
    from app.core.database import SessionLocal
    from app.models.payment_gateway import PaymentGateway

    headers = admin_auth["headers"]
    bank = f"بانک آزمون {uuid.uuid4().hex[:6]}"
    secret = "secret-key-123456789"

    created = client.post(
        "/api/payment-gateways",
        json={"bankName": bank, "connectionKey": secret, "description": "درگاه تست", "isActive": True},
        headers=headers,
    )
    assert created.status_code == 200, created.text
    assert secret not in created.text
    gateway = created.json()["gateway"]
    assert gateway["connectionKey"].endswith(secret[-4:])
    assert gateway["hasKey"] is True
    assert gateway["isActive"] is True

    listed = client.get("/api/payment-gateways", headers=headers)
    assert listed.status_code == 200
    assert secret not in listed.text
    assert any(item["id"] == gateway["id"] for item in listed.json()["gateways"])

    # The raw key is stored, only the representation is masked.
    db = SessionLocal()
    try:
        stored = db.get(PaymentGateway, gateway["id"])
        assert stored is not None and stored.connection_key == secret
    finally:
        db.close()

    # Updating without a key keeps the existing secret.
    updated = client.patch(
        f"/api/payment-gateways/{gateway['id']}",
        json={"bankName": bank, "description": "توضیح تازه"},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["gateway"]["connectionKey"].endswith(secret[-4:])

    toggled = client.patch(
        f"/api/payment-gateways/{gateway['id']}/status", json={"isActive": False}, headers=headers
    )
    assert toggled.status_code == 200
    assert toggled.json()["gateway"]["isActive"] is False

    assert (
        client.post(
            "/api/payment-gateways",
            json={"bankName": bank, "connectionKey": "another-key-0001"},
            headers=headers,
        ).status_code
        == 409
    )

    deleted = client.delete(f"/api/payment-gateways/{gateway['id']}", headers=headers)
    assert deleted.status_code == 200
    remaining = client.get("/api/payment-gateways", headers=headers).json()["gateways"]
    assert not any(item["id"] == gateway["id"] for item in remaining)


def test_gateway_rejects_a_blank_connection_key(client, admin_auth) -> None:
    response = client.post(
        "/api/payment-gateways",
        json={"bankName": "بانک کلید کوتاه", "connectionKey": "abc"},
        headers=admin_auth["headers"],
    )
    assert response.status_code == 422
    assert "کلید اتصال" in response.json()["message"]
