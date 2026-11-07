"""The progressive guidance flow, the stepper payload and soft deletion.

Covers section A (the agent never dumps the whole process, it asks before every next
block and emits activity indicators), section B (the structured stepper payload and the
applicant submission) and section E (delete = archive, the row is kept).
"""

from __future__ import annotations

import random
import uuid

import pytest

NOTE = "پاسخ آزمون راهنما"


def test_field_guidelines_tool_returns_seeded_rules_and_examples(client) -> None:
    from app.agents.tools import get_field_guidelines, set_context
    from app.core.database import SessionLocal
    from app.services import form_service

    db = SessionLocal()
    try:
        form_service.sync_field_guidelines(db)
        set_context(db=db, user_id=None)
        answer = get_field_guidelines.invoke(
            {"field_name": "دلیل مرخصی", "form_id": "leave_request"}
        )
    finally:
        db.close()

    assert "قاعده تکمیل" in answer
    assert "اطلاعات حساس پزشکی غیرضروری" in answer
    assert "امور خانوادگی" in answer


def test_chat_injects_specific_field_guidelines(client, auth, monkeypatch) -> None:
    from app.agents.runner import AgentTurnResult
    from app.core.database import SessionLocal
    from app.models.user import User
    from app.services import chat_service, form_service

    captured: dict = {}

    def fake_run_agent(**kwargs):
        captured.update(kwargs)
        return AgentTurnResult(reply="دلیل مرخصی را کوتاه و دقیق بنویسید.")

    monkeypatch.setattr(chat_service, "run_agent", fake_run_agent)
    db = SessionLocal()
    try:
        form_service.sync_field_guidelines(db)
        user = db.get(User, auth["user"]["id"])
        outcome = chat_service.handle_chat(
            db,
            user=user,
            message="منظور از دلیل مرخصی چیست؟",
            new_session=True,
        )
    finally:
        db.close()

    assert "دلیل کوتاه و دقیق" in captured["field_guidelines"]
    assert "امور خانوادگی" in captured["field_guidelines"]
    assert outcome.message == "دلیل مرخصی را کوتاه و دقیق بنویسید."


def _unique_mobile() -> str:
    return f"09{random.SystemRandom().randint(0, 999_999_999):09d}"


def _valid_national_id(seed: int) -> str:
    digits = [int(char) for char in f"{seed:09d}"[-9:]]
    total = sum(digit * (10 - index) for index, digit in enumerate(digits))
    remainder = total % 11
    check = remainder if remainder < 2 else 11 - remainder
    return "".join(str(digit) for digit in digits) + str(check)


@pytest.fixture(scope="module")
def admin_auth(client) -> dict:
    from app.core.database import SessionLocal
    from app.services import auth_service

    mobile = _unique_mobile()
    password = "Admin@12345"
    db = SessionLocal()
    try:
        auth_service.create_admin(db, mobile=mobile, password=password, full_name="مدیر راهنما")
    finally:
        db.close()
    response = client.post("/api/auth/login", json={"mobile": mobile, "password": password})
    assert response.status_code == 200, response.text
    return {"headers": {"Authorization": f"Bearer {response.json()['token']}"}}


@pytest.fixture(scope="module")
def applicant(client) -> dict:
    """A dedicated account: the daily quota allows exactly one request per day."""
    unique = uuid.uuid4().hex[:8]
    payload = {
        "full_name": "متقاضی آزمون راهنما",
        "national_id": _valid_national_id(int(unique, 16) % 1_000_000_000),
        "mobile": _unique_mobile(),
        "password": "Test@12345",
        "password_confirm": "Test@12345",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 200, response.text
    body = response.json()
    return {"headers": {"Authorization": f"Bearer {body['token']}"}, "user": body["user"]}


@pytest.fixture(scope="module")
def rich_form(client, admin_auth) -> dict:
    token = uuid.uuid4().hex[:6]
    payload = {
        "id": f"form-guide-{token}",
        "code": f"GUIDE-{token.upper()}",
        "title": f"فرم آزمون راهنما {token}",
        "department": "اداری",
        "description": "فرم آزمون برای جریان راهنمای پله‌ای.",
        "status": "active",
        "formType": "standard",
        "applicantGuidance": "پیش از تکمیل، رسید پرداخت را آماده کنید.",
        "fields": [
            {"id": "f_reason", "label": "دلیل درخواست", "type": "text", "required": True},
            {"id": "f_receipt", "label": "رسید پرداخت", "type": "file", "required": True},
            {"id": "f_note", "label": "توضیح تکمیلی", "type": "textarea", "required": False},
        ],
        "rules": [{"id": "r1", "text": "فقط یک درخواست در روز"}],
    }
    response = client.post("/api/admin/forms", json=payload, headers=admin_auth["headers"])
    assert response.status_code == 200, response.text
    return response.json()["form"]


@pytest.fixture(scope="module")
def published_process(client, admin_auth, rich_form) -> dict:
    token = uuid.uuid4().hex[:6]
    process_id = f"process-guide-{token}"
    title = f"خدمت راهنمای آزمون {token}"
    definition = {
        "id": process_id,
        "code": f"PG-{token.upper()}",
        "title": title,
        "department": "اداری",
        "description": "توضیح کوتاه خدمت آزمون برای مرور اولیه.",
        "status": "draft",
        "stages": [
            {
                "id": "s1",
                "title": "ثبت درخواست",
                "assignee": {"kind": "applicant"},
                "slaDays": 1,
                "formIds": [rich_form["id"]],
                "formVersions": {rich_form["id"]: "1.0"},
                "guidance": "همه فیلدهای الزامی را تکمیل کنید.",
                "defaultNextStageId": "s2",
            },
            {
                "id": "s2",
                "title": "بررسی کارشناس",
                "assignee": {"kind": "role", "accessLevelId": "role-employee"},
                "slaDays": 2,
                "guidance": "درخواست را بررسی و تأیید کنید.",
                "defaultNextStageId": "__complete__",
            },
        ],
        "computedFields": [],
    }
    saved = client.put(f"/api/processes/{process_id}", json=definition, headers=admin_auth["headers"])
    assert saved.status_code == 200, saved.text
    published = client.post(f"/api/processes/{process_id}/publish", headers=admin_auth["headers"])
    assert published.status_code == 200, published.text
    return {"id": process_id, "title": title, "form": rich_form, "definition": definition}


@pytest.fixture(scope="module")
def conversation(client, applicant, published_process) -> dict:
    """Four turns: overview -> steps -> forms -> stepper, each one on confirmation."""
    headers = applicant["headers"]
    first = client.post(
        "/api/chat",
        json={"message": f"می‌خواهم از {published_process['title']} استفاده کنم", "new_session": True},
        headers=headers,
    )
    assert first.status_code == 200, first.text
    session_id = first.json()["session_id"]

    turns = [first.json()]
    for _ in range(3):
        response = client.post(
            "/api/chat",
            json={"message": "بله", "session_id": session_id},
            headers=headers,
        )
        assert response.status_code == 200, response.text
        turns.append(response.json())
    return {"session_id": session_id, "turns": turns}


# ------------------------------------------------------------------ progressive flow
def test_overview_does_not_dump_the_process(conversation, published_process) -> None:
    first = conversation["turns"][0]
    assert first["status"] == "ok"
    assert "stepper" not in first and "form" not in first
    assert "؟" in first["message"]  # asks before continuing
    assert "مراحل این فرایند" in first["message"]
    # Neither the step guidance nor the form guidance leaks into the first answer.
    assert "بررسی کارشناس" not in first["message"]
    assert published_process["form"]["title"] not in first["message"]


def test_steps_are_explained_only_after_confirmation(conversation) -> None:
    second = conversation["turns"][1]
    assert "مراحل فرایند" in second["message"]
    assert "بررسی کارشناس" in second["message"]
    assert "درخواست را بررسی و تأیید کنید." in second["message"]  # step guidance from DB
    assert "آیا فرم‌ها" in second["message"]
    assert "stepper" not in second


def test_forms_are_listed_only_after_the_second_confirmation(conversation) -> None:
    third = conversation["turns"][2]
    assert "فرم‌هایی که" in third["message"]
    assert "فرم آزمون راهنما" in third["message"]
    assert "پیش از تکمیل، رسید پرداخت را آماده کنید." in third["message"]  # form guidance
    assert "رسید پرداخت (الزامی)" in third["message"]  # documents from file fields
    assert "آیا فرایند را باز کنم" in third["message"]
    assert "stepper" not in third


def test_final_confirmation_returns_the_structured_stepper(conversation, published_process) -> None:
    fourth = conversation["turns"][3]
    stepper = fourth["stepper"]
    assert stepper["process_id"] == published_process["id"]
    assert stepper["process_version_id"]
    assert [step["title"] for step in stepper["steps"]] == ["ثبت درخواست", "بررسی کارشناس"]
    assert stepper["steps"][0]["collectsInput"] is True
    assert stepper["steps"][1]["collectsInput"] is False
    form = stepper["steps"][0]["forms"][0]
    assert form["form_id"] == published_process["form"]["id"]
    assert form["guidance"] == "پیش از تکمیل، رسید پرداخت را آماده کنید."
    assert {field["id"] for field in form["fields"]} >= {"f_reason", "f_receipt", "f_note"}
    assert "باز کردم" in fourth["message"]


def test_activity_indicators_are_reported(conversation) -> None:
    first = conversation["turns"][0]
    assert first["activity"], "the applicant must see what the agent is doing"
    assert all({"key", "label"} <= set(item) for item in first["activity"])


def test_guidance_state_is_persisted_for_the_session(client, applicant, conversation) -> None:
    detail = client.get(
        f"/api/chat/sessions/{conversation['session_id']}", headers=applicant["headers"]
    ).json()
    assistant = [message for message in detail["messages"] if message["role"] == "assistant"]
    assert assistant[-1]["process_id"]
    assert assistant[-1]["activity"]


# ----------------------------------------------------------------------- submission
def test_applicant_submission_creates_case_and_request(
    client, applicant, admin_auth, published_process
) -> None:
    form_id = published_process["form"]["id"]
    process_id = published_process["id"]
    values = {form_id: {"f_reason": NOTE, "f_receipt": ["receipt.png"], "f_note": ""}}

    rejected = client.post(
        "/api/processes/applicant/submit",
        json={"processId": process_id, "values": {form_id: {"f_receipt": ["receipt.png"]}}},
        headers=applicant["headers"],
    )
    assert rejected.status_code == 422
    assert "دلیل درخواست" in rejected.json()["detail"]

    submitted = client.post(
        "/api/processes/applicant/submit",
        json={"processId": process_id, "values": values},
        headers=applicant["headers"],
    )
    assert submitted.status_code == 200, submitted.text
    body = submitted.json()
    assert body["trackingCode"]
    assert body["case"]["currentStageTitle"] == "بررسی کارشناس"
    assert body["submissions"][0]["processId"] == process_id

    listing = client.get(
        f"/api/admin/submissions?processId={process_id}", headers=admin_auth["headers"]
    )
    assert listing.status_code == 200, listing.text
    rows = listing.json()["submissions"]
    assert rows, "the request must appear under Admin -> Requests"
    row = rows[0]
    assert row["formId"] == form_id
    assert row["processId"] == process_id
    assert row["currentStageTitle"] == "بررسی کارشناس"
    assert row["values"]["f_reason"] == NOTE

    detail = client.get(f"/api/admin/submissions/{row['id']}", headers=admin_auth["headers"])
    assert detail.status_code == 200
    assert detail.json()["submission"]["events"]


def test_admin_can_read_the_case_of_a_request(client, applicant, admin_auth, published_process) -> None:
    cases = client.get(
        f"/api/processes/cases?processId={published_process['id']}", headers=admin_auth["headers"]
    )
    assert cases.status_code == 200, cases.text
    case = cases.json()["cases"][0]
    assert case["applicantId"] == applicant["user"]["id"]
    assert case["currentStageTitle"] == "بررسی کارشناس"
    assert case["values"]["f_reason"] == NOTE


# ----------------------------------------------------------------------- soft delete
def test_request_delete_is_a_soft_delete(client, admin_auth, published_process) -> None:
    from sqlalchemy import select

    from app.core.database import SessionLocal
    from app.models.submission import Submission

    listing = client.get(
        f"/api/admin/submissions?processId={published_process['id']}", headers=admin_auth["headers"]
    ).json()
    submission_id = listing["submissions"][0]["id"]

    deleted = client.delete(f"/api/admin/submissions/{submission_id}", headers=admin_auth["headers"])
    assert deleted.status_code == 200, deleted.text

    after = client.get(
        f"/api/admin/submissions?processId={published_process['id']}", headers=admin_auth["headers"]
    ).json()
    assert all(row["id"] != submission_id for row in after["submissions"])

    db = SessionLocal()
    try:
        row = db.scalar(select(Submission).where(Submission.id == submission_id))
        assert row is not None, "the row must be archived, never removed"
        assert row.is_deleted is True
        assert row.deleted_at is not None
    finally:
        db.close()


def test_form_delete_is_a_soft_delete(client, admin_auth, published_process) -> None:
    from sqlalchemy import select

    from app.core.database import SessionLocal
    from app.models.form import Form

    form_id = published_process["form"]["id"]
    deleted = client.delete(f"/api/admin/forms/{form_id}", headers=admin_auth["headers"])
    assert deleted.status_code == 200, deleted.text

    listing = client.get("/api/admin/forms", headers=admin_auth["headers"]).json()
    assert all(form["id"] != form_id for form in listing["forms"])

    db = SessionLocal()
    try:
        row = db.scalar(select(Form).where(Form.id == form_id))
        assert row is not None
        assert row.is_deleted is True
        assert row.is_active is False
    finally:
        db.close()
