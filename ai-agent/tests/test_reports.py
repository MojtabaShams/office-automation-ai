"""Reports API: every number is aggregated from PostgreSQL.

Covers the landing summary, the four quick reports, the report-builder entity
feed, the audit event feed and the saved-definition round-trip (including the
soft-delete contract: the row stays in the table, hidden from list queries).
"""

from __future__ import annotations

import random
import uuid

import pytest


def _unique_mobile() -> str:
    return f"09{random.SystemRandom().randint(0, 999_999_999):09d}"


@pytest.fixture(scope="module")
def admin_headers(client) -> dict[str, str]:
    """Create (or promote) an admin and log in through the HTTP API."""
    from app.core.database import SessionLocal
    from app.services import auth_service

    mobile = _unique_mobile()
    password = "Report@12345"
    db = SessionLocal()
    try:
        auth_service.create_admin(db, mobile=mobile, password=password, full_name="مدیر گزارش‌ها")
    finally:
        db.close()

    response = client.post("/api/auth/login", json={"mobile": mobile, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_summary_is_database_backed(client, admin_headers) -> None:
    response = client.get("/api/admin/reports/summary", headers=admin_headers)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["status"] == "ok"
    assert len(body["weekly"]["labels"]) == 7
    assert len(body["weekly"]["series"]) == 3
    assert {item["key"] for item in body["weekly"]["series"]} == {"opened", "closed", "waiting"}
    assert {slice_["name"] for slice_ in body["statusPie"]} == {"باز", "بسته", "در انتظار"}
    assert set(body["quick"]) == {"requests", "employees", "processes", "messages"}
    assert {"total_requests", "active_cases", "active_employees"} <= set(body["kpis"])


@pytest.mark.parametrize("report_id", ["requests", "employees", "processes", "messages"])
def test_quick_report_shape(client, admin_headers, report_id: str) -> None:
    response = client.get(f"/api/admin/reports/quick/{report_id}", headers=admin_headers)
    assert response.status_code == 200, response.text
    report = response.json()["report"]

    assert report["id"] == report_id
    assert len(report["kpis"]) == 4
    assert len(report["series"]["labels"]) == 7
    assert report["series"]["series"]
    assert report["table"]["columns"]
    assert isinstance(report["table"]["rows"], list)
    assert isinstance(report["pie"]["data"], list)


def test_unknown_quick_report_returns_404(client, admin_headers) -> None:
    response = client.get("/api/admin/reports/quick/unknown-report", headers=admin_headers)
    assert response.status_code == 404
    assert response.json()["detail"]


def test_entities_expose_rows_and_fields(client, admin_headers) -> None:
    response = client.get("/api/admin/reports/entities", headers=admin_headers)
    assert response.status_code == 200, response.text
    entities = {item["id"]: item for item in response.json()["entities"]}

    assert {"employees", "requests"} <= set(entities)
    for entity in entities.values():
        assert entity["fields"]
        assert isinstance(entity["rows"], list)
        field_ids = {field["id"] for field in entity["fields"]}
        for row in entity["rows"]:
            assert set(row) - {"id", "groupLabel"} <= field_ids


def test_events_feed_respects_limit(client, admin_headers) -> None:
    response = client.get("/api/admin/reports/events?limit=5", headers=admin_headers)
    assert response.status_code == 200, response.text
    events = response.json()["events"]
    assert len(events) <= 5
    for event in events:
        assert {"userName", "action", "module", "recordId", "createdAt"} <= set(event)


def test_saved_report_round_trip_and_soft_delete(client, admin_headers) -> None:
    report_id = f"rpt-test-{uuid.uuid4().hex[:8]}"
    payload = {
        "id": report_id,
        "title": "گزارش آزمون",
        "description": "گزارش ساخته‌شده در تست",
        "category": "عمومی",
        "entityId": "employees",
        "groupBy": [{"fieldId": "role"}],
        "metrics": [{"id": "m-count", "kind": "aggregate", "fn": "count", "label": "تعداد"}],
        "display": {"type": "table", "xFieldId": "role", "yMetricIds": ["m-count"]},
        "updatedAt": "2026-10-25T10:00:00",
    }

    created = client.post("/api/admin/reports", json=payload, headers=admin_headers)
    assert created.status_code == 200, created.text
    report = created.json()["report"]
    assert report["id"] == report_id
    assert report["entityId"] == "employees"
    assert report["display"]["type"] == "table"

    listed = client.get("/api/admin/reports", headers=admin_headers)
    assert listed.status_code == 200, listed.text
    assert report_id in {item["id"] for item in listed.json()["reports"]}

    deleted = client.delete(f"/api/admin/reports/{report_id}", headers=admin_headers)
    assert deleted.status_code == 200, deleted.text

    listed = client.get("/api/admin/reports", headers=admin_headers)
    assert report_id not in {item["id"] for item in listed.json()["reports"]}

    # Soft delete: the definition stays in the table for audit.
    from app.core.database import SessionLocal
    from app.models.report import ReportDefinition

    db = SessionLocal()
    try:
        row = db.get(ReportDefinition, report_id)
        assert row is not None
        assert row.is_deleted is True
        assert row.deleted_at is not None
    finally:
        db.close()


def test_saving_the_same_id_restores_a_soft_deleted_report(client, admin_headers) -> None:
    report_id = f"rpt-restore-{uuid.uuid4().hex[:8]}"
    payload = {
        "id": report_id,
        "title": "گزارش بازگردانی",
        "entityId": "requests",
        "groupBy": [],
        "metrics": [{"id": "m-count", "kind": "aggregate", "fn": "count", "label": "تعداد"}],
        "display": {"type": "kpi", "yMetricIds": ["m-count"]},
        "updatedAt": "2026-10-25T10:00:00",
    }

    assert client.post("/api/admin/reports", json=payload, headers=admin_headers).status_code == 200
    assert client.delete(f"/api/admin/reports/{report_id}", headers=admin_headers).status_code == 200
    assert client.post("/api/admin/reports", json=payload, headers=admin_headers).status_code == 200

    listed = client.get("/api/admin/reports", headers=admin_headers)
    assert report_id in {item["id"] for item in listed.json()["reports"]}
