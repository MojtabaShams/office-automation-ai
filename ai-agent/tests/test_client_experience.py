"""Client-facing rules added with the profile/history/composer update.

Covers the avatar upload, the one-request-per-day quota, the removal of a submitted
form from the conversation, and the applicant file attachments.
"""

from __future__ import annotations

import random
import uuid

import pytest

LEAVE_VALUES = {
    "employee_name": "سارا محمدی",
    "employee_id": "12345",
    "leave_type": "استحقاقی",
    "start_date": "1403/05/12",
    "end_date": "1403/05/14",
    "days": "3",
    "reason": "سفر خانوادگی",
}

AVATAR = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def _valid_national_id(seed: int) -> str:
    digits = [int(char) for char in f"{seed:09d}"[-9:]]
    total = sum(digit * (10 - index) for index, digit in enumerate(digits))
    remainder = total % 11
    check = remainder if remainder < 2 else 11 - remainder
    return "".join(str(digit) for digit in digits) + str(check)


@pytest.fixture(scope="module")
def second_user(client) -> dict:
    unique = uuid.uuid4().hex[:8]
    payload = {
        "full_name": "کاربر دوم آزمون",
        "national_id": _valid_national_id(int(unique, 16) % 1_000_000_000),
        "mobile": f"09{random.SystemRandom().randint(0, 999_999_999):09d}",
        "password": "Test@12345",
        "password_confirm": "Test@12345",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 200, response.text
    body = response.json()
    return {"headers": {"Authorization": f"Bearer {body['token']}"}, "user": body["user"]}


# ------------------------------------------------------------------------- avatar
def test_avatar_is_saved_returned_and_cleared(client, auth) -> None:
    saved = client.patch(
        "/api/auth/profile", json={"avatar": AVATAR}, headers=auth["headers"]
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["user"]["avatar"] == AVATAR

    me = client.get("/api/auth/me", headers=auth["headers"])
    assert me.json()["user"]["avatar"] == AVATAR

    cleared = client.patch(
        "/api/auth/profile", json={"avatar": ""}, headers=auth["headers"]
    )
    assert cleared.status_code == 200
    assert cleared.json()["user"]["avatar"] == ""


def test_avatar_rejects_non_image_payloads(client, auth) -> None:
    response = client.patch(
        "/api/auth/profile",
        json={"avatar": "https://example.com/me.png"},
        headers=auth["headers"],
    )
    assert response.status_code == 422
    assert "تصویر پروفایل" in response.json()["detail"]


# --------------------------------------------------------------------- attachments
@pytest.fixture(scope="module")
def attachment(client, auth) -> dict:
    content = "صورت‌جلسه جلسه اداری: مرخصی استحقاقی تایید شد.".encode("utf-8")
    response = client.post(
        "/api/chat/attachments",
        files={"file": ("session-notes.txt", content, "text/plain")},
        headers=auth["headers"],
    )
    assert response.status_code == 200, response.text
    return {**response.json()["attachment"], "content": content}


def test_attachment_is_uploaded_and_used_in_the_chat(
    client, auth, attachment
) -> None:
    response = client.post(
        "/api/chat",
        json={
            "message": "",
            "attachment_ids": [attachment["id"]],
            "new_session": True,
        },
        headers=auth["headers"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "ok"
    assert body["message"]

    detail = client.get(
        f"/api/chat/sessions/{body['session_id']}", headers=auth["headers"]
    )
    messages = detail.json()["messages"]
    user_messages = [message for message in messages if message["role"] == "user"]
    assert user_messages, messages
    stored = user_messages[-1]
    assert stored["content"] == ""
    assert stored["attachments"][0]["id"] == attachment["id"]
    assert stored["attachments"][0]["name"] == "session-notes.txt"

    listing = client.get("/api/chat/sessions", headers=auth["headers"]).json()
    session = next(item for item in listing["sessions"] if item["id"] == body["session_id"])
    # A file-only turn still gets a readable session title from the attachment name.
    assert "session-notes.txt" in (session["title"] or "")


def test_attachment_can_be_downloaded_by_its_owner(client, auth, attachment) -> None:
    response = client.get(
        f"/api/chat/attachments/{attachment['id']}", headers=auth["headers"]
    )
    assert response.status_code == 200
    assert response.content == attachment["content"]


def test_attachment_is_private_to_its_owner(
    client, auth, second_user, attachment
) -> None:
    download = client.get(
        f"/api/chat/attachments/{attachment['id']}", headers=second_user["headers"]
    )
    assert download.status_code == 404

    chat = client.post(
        "/api/chat",
        json={"message": "فایل را بررسی کن", "attachment_ids": [attachment["id"]]},
        headers=second_user["headers"],
    )
    assert chat.status_code == 403


def test_attachment_rejects_unsupported_or_spoofed_files(client, auth) -> None:
    unsupported = client.post(
        "/api/chat/attachments",
        files={"file": ("setup.exe", b"MZ\x90\x00", "application/octet-stream")},
        headers=auth["headers"],
    )
    assert unsupported.status_code == 422

    spoofed = client.post(
        "/api/chat/attachments",
        files={"file": ("photo.png", b"this is not a png", "image/png")},
        headers=auth["headers"],
    )
    assert spoofed.status_code == 422
    assert "هم‌خوانی ندارد" in spoofed.json()["detail"]


# -------------------------------------------------------- daily quota + form cleanup
def test_one_request_per_day_and_form_is_removed_after_submit(
    client, second_user
) -> None:
    headers = second_user["headers"]

    first_turn = client.post(
        "/api/chat",
        json={"message": "فرم مرخصی می‌خوام", "new_session": True},
        headers=headers,
    )
    session_id = first_turn.json()["session_id"]
    presented = client.post(
        "/api/chat",
        json={"message": "بله، بازش کن", "session_id": session_id},
        headers=headers,
    )
    assert presented.json().get("form"), presented.text

    submitted = client.post(
        "/api/forms/submit",
        json={"form_id": "leave_request", "values": LEAVE_VALUES, "session_id": session_id},
        headers=headers,
    )
    assert submitted.status_code == 200, submitted.text

    duplicate = client.post(
        "/api/forms/submit",
        json={"form_id": "leave_request", "values": LEAVE_VALUES, "session_id": session_id},
        headers=headers,
    )
    assert duplicate.status_code == 422
    assert "هر کاربر در هر روز" in duplicate.json()["detail"]

    detail = client.get(f"/api/chat/sessions/{session_id}", headers=headers)
    messages = detail.json()["messages"]
    assert messages
    assert all(message.get("form_id") != "leave_request" for message in messages)
    assert any(message["role"] == "assistant" and message["content"] for message in messages)
