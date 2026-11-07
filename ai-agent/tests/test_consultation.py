"""L4 - the applicant consultation summary.

Covers the derivation rules (documents, fees, duration, conditions), the manual
overrides stored in the definition, the HTTP contract and the confirmation gate of the
``show_process`` tool.
"""

from __future__ import annotations

import random
import uuid

import pytest

from app.services import consultation_service

FORMS = {
    "form_house": {
        "id": "form_house",
        "title": "فرم ملک",
        "is_active": True,
        "fields": [
            {"id": "owner", "label": "نام مالک", "type": "text", "required": True},
            {"id": "deed", "label": "سند مالکیت", "type": "file", "required": True},
            {"id": "survey", "label": "نقشه برداری", "type": "file", "required": False},
            {
                "id": "fee",
                "label": "هزینه کارشناسی",
                "type": "payment",
                "required": True,
                "payment": {"gatewayId": "gw-1", "amountSource": "fixed", "defaultAmount": 120_000},
            },
            {
                "id": "identity",
                "label": "اطلاعات هویتی",
                "type": "section",
                "subFields": [
                    {"id": "national_card", "label": "کارت ملی", "type": "file", "required": True}
                ],
            },
        ],
    },
    "form_spouse": {
        "id": "form_spouse",
        "title": "فرم تکمیل خانواده",
        "is_active": True,
        "fields": [
            {"id": "marriage", "label": "سند ازدواج", "type": "file", "required": True},
        ],
    },
}


def _definition(**overrides) -> dict:
    base = {
        "id": "process-construction",
        "code": "URB-1",
        "title": "پروانه ساختمانی",
        "department": "شهرسازی",
        "stages": [
            {
                "id": "s1",
                "title": "ثبت متقاضی",
                "assignee": {"kind": "applicant"},
                "slaDays": 2,
                "formIds": ["form_house"],
                "formVersions": {"form_house": "1.0"},
                "defaultNextStageId": "s2",
            },
            {
                "id": "s2",
                "title": "بازدید کارشناس",
                "assignee": {"kind": "role", "accessLevelId": "role-employee"},
                "slaDays": 4,
                "routeRules": [
                    {
                        "id": "r1",
                        "condition": {
                            "logic": "and",
                            "clauses": [
                                {"variableId": "form_house:owner", "operator": "isEmpty", "value": ""}
                            ],
                        },
                        "nextStageId": "__reject__",
                    }
                ],
                "defaultNextStageId": "s3",
            },
            {
                "id": "s3",
                "title": "صدور پروانه",
                "assignee": {"kind": "role", "accessLevelId": "role-employee"},
                "slaDays": 3,
                "formIds": ["form_spouse"],
                "formVersions": {"form_spouse": "1.0"},
                "defaultNextStageId": "__complete__",
            },
        ],
        "computedFields": [
            {
                "id": "calc-1",
                "name": "هزینه نهایی",
                "formula": {"tokens": []},
                "destination": {"kind": "payment_amount", "stageId": "s3", "formId": "form_spouse", "fieldId": "marriage"},
            }
        ],
    }
    base.update(overrides)
    return base


def _summary(definition: dict) -> dict:
    return consultation_service.build_summary(
        definition,
        FORMS,
        process_id="process-construction",
        code="URB-1",
        title="پروانه ساختمانی",
        department="شهرسازی",
        version="1.0",
        published=True,
    )


# ------------------------------------------------------------------ derivation
def test_required_documents_come_from_every_file_field() -> None:
    summary = _summary(_definition())
    labels = [item["label"] for item in summary["requiredDocuments"]]
    assert labels == ["سند مالکیت", "نقشه برداری", "کارت ملی", "سند ازدواج"]
    required = {item["label"]: item["required"] for item in summary["requiredDocuments"]}
    assert required["سند مالکیت"] is True
    assert required["نقشه برداری"] is False
    assert summary["requiredDocuments"][0]["formTitle"] == "فرم ملک"
    assert "سند مالکیت (الزامی)" in summary["requiredDocumentsText"]


def test_fees_cover_payment_fields_and_process_variables() -> None:
    summary = _summary(_definition())
    by_label = {fee["label"]: fee for fee in summary["fees"]}
    assert by_label["هزینه کارشناسی"]["amount"] == 120_000
    assert by_label["هزینه نهایی"]["amount"] is None
    assert "هزینه کارشناسی: 120,000 تومان" in summary["feesText"]


def test_duration_is_the_sum_of_the_default_path() -> None:
    summary = _summary(_definition())
    assert summary["estimatedDurationDays"] == 9
    assert summary["estimatedDurationBasis"] == "default-path"
    assert "مدت تقریبی: 9 روز" in summary["summaryText"]


def test_duration_ignores_cycles_and_falls_back_to_all_stages() -> None:
    definition = _definition()
    definition["stages"][1]["defaultNextStageId"] = "s1"
    assert _summary(definition)["estimatedDurationDays"] == 6

    flat = _definition()
    for stage in flat["stages"]:
        stage.pop("defaultNextStageId", None)
    summary = _summary(flat)
    assert summary["estimatedDurationDays"] == 9
    assert summary["estimatedDurationBasis"] == "all-stages"


def test_route_conditions_are_rendered_in_persian() -> None:
    summary = _summary(_definition())
    assert summary["conditions"] == ["در «بازدید کارشناس» اگر نام مالک خالی باشد → رد نهایی پرونده"]
    assert "پیش‌نیازها" not in summary["summaryText"]


# -------------------------------------------------------------------- overrides
def test_manual_overrides_win_field_by_field() -> None:
    definition = _definition(
        consultation={
            "requiredDocumentsText": "اصل سند مالکیت به همراه کپی برابر اصل",
            "feesText": "طبق تعرفه سال جاری",
            "estimatedDurationDays": 20,
            "prerequisites": "داشتن پایان‌کار ساختمان",
        }
    )
    summary = _summary(definition)
    assert summary["requiredDocumentsText"].startswith("اصل سند مالکیت")
    assert summary["feesText"] == "طبق تعرفه سال جاری"
    assert summary["estimatedDurationDays"] == 20
    assert summary["estimatedDurationBasis"] == "manual"
    assert summary["prerequisites"] == "داشتن پایان‌کار ساختمان"
    # The derived data is preserved for the inspector / audit trail.
    assert len(summary["requiredDocuments"]) == 4
    assert summary["overrides"]["estimatedDurationDays"] == 20


def test_invalid_override_values_are_ignored() -> None:
    summary = _summary(
        _definition(consultation={"estimatedDurationDays": 0, "prerequisites": "   "})
    )
    assert summary["estimatedDurationDays"] == 9
    assert summary["estimatedDurationBasis"] == "default-path"
    assert summary["prerequisites"] == ""
    assert "overrides" not in summary or "prerequisites" not in summary["overrides"]


# ------------------------------------------------------------------------ HTTP
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
    """A super-admin account so the endpoint passes its access-level gate."""
    from app.core.database import SessionLocal
    from app.services import auth_service

    mobile = _unique_mobile()
    password = "Admin@12345"
    db = SessionLocal()
    try:
        auth_service.create_admin(db, mobile=mobile, password=password, full_name="مدیر مشاوره")
    finally:
        db.close()

    response = client.post("/api/auth/login", json={"mobile": mobile, "password": password})
    assert response.status_code == 200, response.text
    return {"headers": {"Authorization": f"Bearer {response.json()['token']}"}}


@pytest.fixture(scope="module")
def process_id() -> str:
    return f"consult-{uuid.uuid4().hex[:8]}"


def _http_definition(process_id: str, *, consultation: dict | None = None) -> dict:
    body = {
        "id": process_id,
        "code": f"CONS-{process_id[-4:].upper()}",
        "title": "پروسه مشاوره آزمون",
        "department": "اداری",
        "status": "draft",
        "stages": [
            {
                "id": "s1",
                "title": "ثبت درخواست",
                "assignee": {"kind": "applicant"},
                "slaDays": 2,
                "formIds": ["leave_request"],
                "formVersions": {"leave_request": "1.0"},
                "defaultNextStageId": "s2",
            },
            {
                "id": "s2",
                "title": "بررسی مدیر",
                "assignee": {"kind": "role", "accessLevelId": "role-employee"},
                "slaDays": 3,
                "guidance": "درخواست را بررسی کنید.",
                "defaultNextStageId": "__complete__",
            },
        ],
        "payment": {"mode": "fixed", "provider": "gw-1", "amount": 50_000, "formula": ""},
        "computedFields": [],
    }
    if consultation is not None:
        body["consultation"] = consultation
    return body


def test_published_summary_is_served_by_the_api(client, admin_auth, process_id) -> None:
    headers = admin_auth["headers"]
    saved = client.put(f"/api/processes/{process_id}", json=_http_definition(process_id), headers=headers)
    assert saved.status_code == 200, saved.text

    published = client.post(f"/api/processes/{process_id}/publish", headers=headers)
    assert published.status_code == 200, published.text

    response = client.get(f"/api/processes/{process_id}/consultation-summary", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "ok"
    summary = body["summary"]
    assert body["published"] is True
    assert summary["published"] is True
    assert summary["estimatedDurationDays"] == 5
    assert [stage["title"] for stage in summary["stages"]] == ["ثبت درخواست", "بررسی مدیر"]
    assert summary["stages"][0]["forms"] == ["فرم درخواست مرخصی"]
    assert any(fee["label"] == "هزینه پروسه" and fee["amount"] == 50_000 for fee in summary["fees"])
    assert summary["summaryText"]


def test_overrides_apply_on_the_next_publish(client, admin_auth, process_id) -> None:
    headers = admin_auth["headers"]
    overrides = {"prerequisites": "حداقل یک سال سابقه کار", "estimatedDurationDays": 7}
    saved = client.put(
        f"/api/processes/{process_id}",
        json=_http_definition(process_id, consultation=overrides),
        headers=headers,
    )
    assert saved.status_code == 200, saved.text

    before = client.get(f"/api/processes/{process_id}/consultation-summary", headers=headers)
    assert before.json()["summary"]["prerequisites"] == ""  # published snapshot is immutable

    republished = client.post(f"/api/processes/{process_id}/publish", headers=headers)
    assert republished.status_code == 200, republished.text

    after = client.get(f"/api/processes/{process_id}/consultation-summary", headers=headers)
    summary = after.json()["summary"]
    assert summary["prerequisites"] == "حداقل یک سال سابقه کار"
    assert summary["estimatedDurationDays"] == 7
    assert summary["estimatedDurationBasis"] == "manual"


def test_summary_is_404_for_unknown_process(client, admin_auth) -> None:
    response = client.get("/api/processes/does-not-exist/consultation-summary", headers=admin_auth["headers"])
    assert response.status_code == 404
    assert response.json()["detail"]


def test_summary_is_forbidden_for_applicants(client, auth, process_id) -> None:
    response = client.get(f"/api/processes/{process_id}/consultation-summary", headers=auth["headers"])
    assert response.status_code == 403


def test_draft_summary_is_flagged_before_the_first_publish(client, admin_auth) -> None:
    headers = admin_auth["headers"]
    draft_id = f"consult-draft-{uuid.uuid4().hex[:6]}"
    saved = client.put(f"/api/processes/{draft_id}", json=_http_definition(draft_id), headers=headers)
    assert saved.status_code == 200, saved.text

    response = client.get(f"/api/processes/{draft_id}/consultation-summary", headers=headers)
    assert response.status_code == 200
    summary = response.json()["summary"]
    assert summary["published"] is False
    assert "منتشر نشده" in summary["summaryText"]


# ----------------------------------------------------------------- agent tools
def test_show_process_requires_explicit_confirmation(client, admin_auth, process_id) -> None:
    from app.agents.tools import TOOL_MAP, set_context
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        set_context(db=db, user_id=None, confirmed=False)
        blocked = TOOL_MAP["show_process"].invoke({"process_id": process_id})
        assert blocked.startswith("CONFIRMATION_REQUIRED")

        set_context(db=db, user_id=None, confirmed=True)
        allowed = TOOL_MAP["show_process"].invoke({"process_id": process_id})
        assert allowed == f"PROCESS_READY:{process_id}"

        summary = TOOL_MAP["get_process_consultation_summary"].invoke({"process_id": process_id})
        assert "مراحل" in summary
        assert "مدت تقریبی" in summary
    finally:
        set_context(db=db, user_id=None, confirmed=False)
        db.close()


def test_tools_never_expose_an_unpublished_process(client, admin_auth) -> None:
    from app.agents.tools import TOOL_MAP, set_context
    from app.core.database import SessionLocal

    headers = admin_auth["headers"]
    draft_id = f"consult-hidden-{uuid.uuid4().hex[:6]}"
    client.put(f"/api/processes/{draft_id}", json=_http_definition(draft_id), headers=headers)

    db = SessionLocal()
    try:
        set_context(db=db, user_id=None, confirmed=True)
        assert TOOL_MAP["show_process"].invoke({"process_id": draft_id}).startswith("پروسه")
        summary = TOOL_MAP["get_process_consultation_summary"].invoke({"process_id": draft_id})
        assert "منتشر نشده" in summary
        catalogue = TOOL_MAP["list_published_processes"].invoke({})
        assert draft_id not in catalogue
    finally:
        set_context(db=db, user_id=None, confirmed=False)
        db.close()
