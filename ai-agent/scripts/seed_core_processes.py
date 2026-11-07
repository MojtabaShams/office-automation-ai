"""Reset demo processes and publish the two core service-desk processes."""

from __future__ import annotations

from sqlalchemy import delete

from app.core.database import SessionLocal
from app.models.process import ProcessCase, ProcessDefinitionRow
from app.services import form_service, process_service


def _leave_process() -> dict:
    return {
        "id": "process-leave",
        "code": "LEAVE",
        "title": "درخواست مرخصی",
        "department": "منابع انسانی",
        "description": "ثبت و پیگیری درخواست مرخصی کارکنان.",
        "stages": [
            {
                "id": "leave-applicant",
                "title": "ثبت درخواست مرخصی",
                "guidance": "اطلاعات درخواست مرخصی را کامل کنید.",
                "assignee": {"kind": "applicant"},
                "slaDays": 1,
                "formIds": ["leave_request"],
                "formVersions": {"leave_request": "1.0"},
                "routeRules": [],
                "defaultNextStageId": "leave-review",
            },
            {
                "id": "leave-review",
                "title": "بررسی مدیر",
                "guidance": "مدیر درخواست را بررسی می‌کند.",
                "assignee": {"kind": "role", "accessLevelId": "role-manager"},
                "slaDays": 3,
                "formIds": [],
                "formVersions": {},
                "routeRules": [],
                "defaultNextStageId": process_service.ROUTE_COMPLETE,
            },
        ],
        "computedFields": [],
    }


def _construction_process() -> dict:
    return {
        "id": "process-construction-permit",
        "code": "CONSTRUCTION",
        "title": "پروانه ساختمانی",
        "department": "شهرداری",
        "description": "ثبت درخواست و پیگیری صدور پروانه ساختمانی.",
        "stages": [
            {
                "id": "permit-applicant",
                "title": "ثبت اطلاعات متقاضی",
                "guidance": "اطلاعات ملک و متقاضی را تکمیل کنید.",
                "assignee": {"kind": "applicant"},
                "slaDays": 2,
                "formIds": ["construction_permit"],
                "formVersions": {"construction_permit": "1.0"},
                "routeRules": [],
                "defaultNextStageId": "permit-document-review",
            },
            {
                "id": "permit-document-review",
                "title": "بررسی مدارک",
                "guidance": "کارشناسان مدارک ملک را بررسی می‌کنند.",
                "assignee": {"kind": "role", "accessLevelId": "role-employee"},
                "slaDays": 5,
                "formIds": [],
                "formVersions": {},
                "routeRules": [],
                "defaultNextStageId": "permit-technical-review",
            },
            {
                "id": "permit-technical-review",
                "title": "بازرسی فنی",
                "guidance": "نتیجه بازرسی فنی و نقشه‌های ساختمان بررسی می‌شود.",
                "assignee": {"kind": "role", "accessLevelId": "role-employee"},
                "slaDays": 7,
                "formIds": [],
                "formVersions": {},
                "routeRules": [],
                "defaultNextStageId": process_service.ROUTE_COMPLETE,
            },
        ],
        "computedFields": [],
    }


def main() -> None:
    db = SessionLocal()
    try:
        form_service.sync_forms_from_disk(db)
        db.execute(delete(ProcessCase))
        db.execute(delete(ProcessDefinitionRow))
        db.flush()

        forms = {form["form_id"]: form for form in form_service.list_forms(db, active_only=False)}
        for payload in (_leave_process(), _construction_process()):
            row = process_service.upsert_definition(db, payload, None)
            process_service.publish_definition(db, row.id, payload, None, forms)
        db.commit()
        print("Seeded processes: درخواست مرخصی, پروانه ساختمانی")
    finally:
        db.close()


if __name__ == "__main__":
    main()
