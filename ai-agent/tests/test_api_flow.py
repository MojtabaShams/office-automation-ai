"""End-to-end HTTP flow.

Covers the whole journey the chat panel drives: anonymous advice, the login prompt for a
form request, the advisory turn, the explicit confirmation that opens the form, submission
and tracking, plus the history and admin boundaries.
"""

from __future__ import annotations

import json

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


# ----------------------------------------------------------------------- anonymous
@pytest.fixture(scope="session")
def advice_turn(client) -> dict:
    response = client.post("/api/chat", json={"message": "برای مرخصی استعلاجی چه مدارکی لازم است؟"})
    assert response.status_code == 200, response.text
    return response.json()


def test_anonymous_advice_is_allowed(advice_turn: dict) -> None:
    assert advice_turn["status"] == "ok"
    assert advice_turn["message"].strip()


@pytest.fixture(scope="session")
def login_prompt(client) -> dict:
    response = client.post("/api/chat", json={"message": "می‌خوام فرم مرخصی بگیرم"})
    assert response.status_code == 200, response.text
    return response.json()


def test_anonymous_form_request_requires_login(login_prompt: dict) -> None:
    assert login_prompt["status"] == "auth_required"
    form = login_prompt["form"]
    assert form["form_id"] == "login"
    assert {field["name"] for field in form["fields"]} >= {"mobile", "password"}


def test_login_question_has_auth_intent_and_is_not_saved_as_pending_action(
    client,
) -> None:
    response = client.post(
        "/api/chat",
        json={"message": "چطور وارد حساب کاربری‌ام شوم؟"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "auth_required"
    assert body["form"]["form_id"] == "login"
    assert body["intent"] == "auth_login"


def test_empty_message_is_rejected_with_persian_error(client) -> None:
    response = client.post("/api/chat", json={"message": "   "})
    assert response.status_code == 422
    body = response.json()
    assert body["detail"]
    assert "پیام" in body["message"]


# ------------------------------------------------------------------------ identity
def test_profile_after_register(client, auth, account) -> None:
    response = client.get("/api/auth/me", headers=auth["headers"])
    assert response.status_code == 200, response.text
    assert response.json()["user"]["mobile"] == account["mobile"]


def test_protected_endpoint_rejects_bad_token(client) -> None:
    response = client.get("/api/submissions", headers={"Authorization": "Bearer invalid-token"})
    assert response.status_code == 401
    assert response.json()["detail"]


# ------------------------------------------------------------- advisory + confirmation
@pytest.fixture(scope="session")
def requirements_turn(client, auth) -> dict:
    response = client.post(
        "/api/chat",
        json={"message": "فرم مرخصی از ۱۰ تا ۱۲ آذر می‌خواهم", "new_session": True},
        headers=auth["headers"],
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_leave_slots_continue_across_turns_and_stream_activity(client, auth) -> None:
    first_response = client.post(
        "/api/chat/stream",
        json={"message": "I want 10 days of leave", "new_session": True},
        headers=auth["headers"],
    )
    assert first_response.status_code == 200, first_response.text
    events = [
        json.loads(line[6:])
        for frame in first_response.text.split("\n\n")
        for line in frame.splitlines()
        if line.startswith("data: ")
    ]
    assert any(event.get("key") == "thinking" for event in events)
    assert any(event.get("key") == "slot_filling" for event in events)
    assert any(event.get("key") == "duration" for event in events)
    first_turn = next(event["payload"] for event in events if event["type"] == "done")
    assert first_turn["intent"] == "leave_request_slots"
    assert "10 روزه" in first_turn["message"]
    session_id = first_turn["session_id"]

    second_response = client.post(
        "/api/chat",
        json={"message": "From 10 Azar to 20 Azar", "session_id": session_id},
        headers=auth["headers"],
    )
    assert second_response.status_code == 200, second_response.text
    second_turn = second_response.json()
    assert second_turn["action"]["action"] == "OPEN_AND_FILL_FORM"
    assert second_turn["action"]["form_id"] == "leave_request"
    fields = second_turn["action"]["fields"]
    assert fields["applicant_name"] == auth["user"]["full_name"]
    assert fields["employee_id"] == auth["user"]["national_id"]
    assert fields["start_date"].endswith("/09/10")
    assert fields["end_date"].endswith("/09/20")
    assert fields["duration_days"] == 11

    first_form = second_turn["stepper"]["steps"][0]["forms"][0]
    assert first_form["prefill"]["employee_name"] == auth["user"]["full_name"]
    assert first_form["prefill"]["start_date"] == fields["start_date"]
    assert first_form["prefill"]["end_date"] == fields["end_date"]
    assert first_form["prefill"]["days"] == 11


def test_advice_turn_does_not_reveal_the_form(requirements_turn: dict) -> None:
    assert requirements_turn["status"] == "ok"
    assert "form" not in requirements_turn  # golden rule: advice before the form
    assert requirements_turn["session_id"]
    assert requirements_turn["stepper"]["process_id"] == "process-leave"


@pytest.fixture(scope="session")
def presented_form(client, auth, requirements_turn) -> dict:
    client.post(
        "/api/chat",
        json={"message": "سلام", "session_id": requirements_turn["session_id"]},
        headers=auth["headers"],
    )
    return requirements_turn


def test_explicit_confirmation_opens_the_form(presented_form: dict) -> None:
    stepper = presented_form["stepper"]
    first_form = stepper["steps"][0]["forms"][0]
    assert first_form["form_id"] == "leave_request"
    assert first_form["fields"]


# ----------------------------------------------------------------------- submission
@pytest.fixture(scope="session")
def submission(client, auth) -> dict:
    response = client.post(
        "/api/forms/submit",
        json={"form_id": "leave_request", "values": LEAVE_VALUES},
        headers=auth["headers"],
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_submission_returns_a_tracking_code(submission: dict) -> None:
    assert submission["status"] == "ok"
    assert submission["submission_id"]
    assert submission["tracking_code"].startswith("R")
    assert submission["submission"]["values"]["leave_type"] == "استحقاقی"


def test_submission_rejects_out_of_range_values(client, auth) -> None:
    response = client.post(
        "/api/forms/submit",
        json={"form_id": "leave_request", "values": {**LEAVE_VALUES, "days": "0"}},
        headers=auth["headers"],
    )
    assert response.status_code == 422
    assert "کمتر از 1" in response.json()["detail"]


def test_submission_rejects_unknown_form(client, auth) -> None:
    response = client.post(
        "/api/forms/submit",
        json={"form_id": "missing_form", "values": {}},
        headers=auth["headers"],
    )
    assert response.status_code == 404


def test_user_can_list_and_track_submissions(client, auth, submission) -> None:
    listed = client.get("/api/submissions", headers=auth["headers"])
    assert listed.status_code == 200
    assert listed.json()["total"] >= 1

    tracked = client.get(
        f"/api/submissions/track/{submission['tracking_code']}",
        headers=auth["headers"],
    )
    assert tracked.status_code == 200
    assert tracked.json()["submission"]["id"] == submission["submission_id"]


# -------------------------------------------------------------------------- history
def test_session_history_is_persisted(client, auth, requirements_turn, presented_form) -> None:
    session_id = requirements_turn["session_id"]

    listing = client.get("/api/chat/sessions", headers=auth["headers"])
    assert listing.status_code == 200
    assert any(item["id"] == session_id for item in listing.json()["sessions"])

    detail = client.get(f"/api/chat/sessions/{session_id}", headers=auth["headers"])
    assert detail.status_code == 200
    messages = detail.json()["messages"]
    assert [message["role"] for message in messages][:4] == ["user", "assistant", "user", "assistant"]
    assert messages[1]["process_id"] == "process-leave"


# ---------------------------------------------------------------- registry + security
def test_forms_are_published_from_the_registry(client) -> None:
    response = client.get("/api/forms")
    assert response.status_code == 200
    form_ids = {form["form_id"] for form in response.json()["forms"]}
    assert {"leave_request", "mission_request", "overtime_request", "complaint"} <= form_ids


def test_knowledge_search_returns_citations(client, auth) -> None:
    response = client.post(
        "/api/knowledge/search",
        json={"query": "مرخصی استعلاجی چه مدارکی لازم دارد؟"},
        headers=auth["headers"],
    )
    assert response.status_code == 200
    body = response.json()
    assert body["count"] >= 1
    assert {"title", "source", "score"} <= set(body["results"][0])


def test_admin_area_is_forbidden_for_regular_users(client, auth) -> None:
    response = client.get("/api/admin/overview", headers=auth["headers"])
    assert response.status_code == 403
    assert response.json()["detail"]
