"""Process (workflow) management and case transitions.

Route order matters: the literal ``/cases`` routes are declared before ``/{process_id}``
so FastAPI never mistakes ``cases`` for a process id.

Every endpoint returns the project's ``{"status": "ok", ...}`` envelope and speaks
camelCase for payloads (the admin panel sends its own ``ProcessDefinition`` objects).
"""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import db_session, require_permission, require_user
from app.core.exceptions import NotFound
from app.models.user import User
from app.repositories import form_repo
from app.schemas.common import ok
from app.schemas.processes import ApplicantSubmitRequest, ProcessActionRequest, ProcessCaseStartRequest
from app.services import consultation_service, process_flow_service, process_service

router = APIRouter(prefix="/api/processes", tags=["processes"])


def _forms_map(db: Session) -> dict[str, dict]:
    """Definitions keyed by id, tolerating both the rich ``schema_json`` and the flat rows."""
    output: dict[str, dict] = {}
    for form in form_repo.list_forms(db, active_only=False):
        schema = form.schema_json if isinstance(form.schema_json, dict) else {}
        fields = schema.get("fields")
        if not isinstance(fields, list) or not fields:
            fields = [
                {
                    "id": field.name,
                    "label": field.label,
                    "type": field.type,
                    "required": field.required,
                    "validation": {
                        "pattern": field.pattern,
                        "minLength": field.min_length,
                        "maxLength": field.max_length,
                    },
                }
                for field in form.fields
            ]
        output[form.id] = {
            "id": form.id,
            "title": form.title,
            "is_active": bool(form.is_active),
            "status": "active" if form.is_active else "inactive",
            "fields": fields,
        }
    return output


# ------------------------------------------------------------------- case routes
@router.get("/cases")
def list_cases(
    status: str | None = Query(default=None),
    process_id: str | None = Query(default=None, alias="processId"),
    _: User = Depends(require_permission("processes", "view")),
    db: Session = Depends(db_session),
) -> dict:
    cases = process_service.list_cases(db, status=status, process_id=process_id)
    return ok("فهرست پرونده‌های پروسه", cases=cases, count=len(cases))


@router.post("/cases")
def start_case(
    req: ProcessCaseStartRequest,
    user: User = Depends(require_permission("processes", "create")),
    db: Session = Depends(db_session),
) -> dict:
    row = process_service.get_definition(db, req.process_id)
    case = process_service.start_case(
        db,
        row,
        applicant_id=req.applicant_id or user.id,
        title=req.title,
        form_id=req.form_id,
        values=req.values,
    )
    db.commit()
    return ok("پرونده با موفقیت ایجاد شد.", case=process_service.case_to_dict(case))


@router.post("/cases/scan-due")
def scan_due_cases(
    _: User = Depends(require_permission("processes", "update")),
    db: Session = Depends(db_session),
) -> dict:
    expired = process_service.scan_due_cases(db)
    db.commit()
    return ok(
        f"{len(expired)} پرونده بر اساس مهلت بررسی شد.",
        count=len(expired),
        cases=[process_service.case_to_dict(case) for case in expired],
    )


@router.get("/cases/{case_id}")
def get_case(
    case_id: str,
    _: User = Depends(require_permission("processes", "view")),
    db: Session = Depends(db_session),
) -> dict:
    case = process_service.get_case(db, case_id)
    return ok("جزئیات پرونده", case=process_service.case_to_dict(case))


@router.post("/cases/{case_id}/advance")
def advance_case(
    case_id: str,
    req: ProcessActionRequest,
    user: User = Depends(require_permission("processes", "update")),
    db: Session = Depends(db_session),
) -> dict:
    case = process_service.get_case(db, case_id)
    if req.values:
        case.values = {**case.values, **req.values}
    case = process_service.advance_case(db, case, user.id, req.note)
    db.commit()
    return ok("پرونده تأیید و به مرحله بعد ارسال شد.", case=process_service.case_to_dict(case))


@router.post("/cases/{case_id}/reject")
def reject_case(
    case_id: str,
    req: ProcessActionRequest,
    user: User = Depends(require_permission("processes", "update")),
    db: Session = Depends(db_session),
) -> dict:
    case = process_service.get_case(db, case_id)
    case = process_service.reject_case(db, case, user.id, req.note, final=req.final)
    db.commit()
    return ok("تصمیم رد ثبت شد.", case=process_service.case_to_dict(case))


@router.post("/cases/{case_id}/escalate")
def escalate_case(
    case_id: str,
    req: ProcessActionRequest,
    user: User = Depends(require_permission("processes", "update")),
    db: Session = Depends(db_session),
) -> dict:
    case = process_service.get_case(db, case_id)
    case = process_service.escalate_case(db, case, user.id, req.note)
    db.commit()
    return ok("پرونده ارجاع داده شد.", case=process_service.case_to_dict(case))


@router.post("/cases/{case_id}/expire")
def expire_case(
    case_id: str,
    user: User = Depends(require_permission("processes", "update")),
    db: Session = Depends(db_session),
) -> dict:
    case = process_service.get_case(db, case_id)
    case = process_service.expire_case(db, case)
    db.commit()
    message = (
        "پرونده به دلیل پایان مهلت متقاضی بسته شد."
        if case.status == "expired"
        else "مهلت سپری شد و پرونده نیازمند ارجاع است."
    )
    return ok(message, case=process_service.case_to_dict(case))


# ----------------------------------------------------------- applicant routes
@router.get("/applicant/processes")
def applicant_processes(
    _: User = Depends(require_user),
    db: Session = Depends(db_session),
) -> dict:
    """Published processes the applicant can start (stepper entry point)."""
    processes = process_flow_service.published_processes(db)
    return ok("پروسه‌های قابل استفاده", processes=processes, count=len(processes))


@router.get("/applicant/processes/{process_id}")
def applicant_process(
    process_id: str,
    _: User = Depends(require_user),
    db: Session = Depends(db_session),
) -> dict:
    """Stepper payload: stages, guidance, responsible units and the linked forms."""
    payload = process_flow_service.stepper_payload(db, process_id)
    return ok("فرم‌های پروسه", process=payload)


@router.post("/applicant/submit")
def applicant_submit(
    req: ApplicantSubmitRequest,
    user: User = Depends(require_user),
    db: Session = Depends(db_session),
) -> dict:
    """Persist the request as a process case plus one submission per form."""
    payload = process_flow_service.submit_application(
        db,
        user,
        process_id=req.process_id,
        values=req.values,
        session_id=req.session_id,
    )
    return ok("درخواست شما با موفقیت ثبت شد.", **payload)


@router.get("/applicant/cases/{case_id}")
def applicant_case(
    case_id: str,
    user: User = Depends(require_user),
    db: Session = Depends(db_session),
) -> dict:
    payload = process_flow_service.case_payload(db, case_id, user.id)
    return ok("جزئیات درخواست", process=payload)


# -------------------------------------------------------------- definition routes
@router.get("")
def list_processes(
    status: str | None = Query(default=None),
    _: User = Depends(require_permission("processes", "view")),
    db: Session = Depends(db_session),
) -> dict:
    processes = process_service.list_definitions(db, status=status)
    return ok("فهرست پروسه‌ها", processes=processes, count=len(processes))


@router.get("/{process_id}")
def get_process(
    process_id: str,
    _: User = Depends(require_permission("processes", "view")),
    db: Session = Depends(db_session),
) -> dict:
    row = process_service.get_definition(db, process_id)
    return ok("تعریف پروسه", process=process_service.definition_to_dict(row))


@router.delete("/{process_id}")
def delete_process(
    process_id: str,
    user: User = Depends(require_permission("processes", "delete")),
    db: Session = Depends(db_session),
) -> dict:
    """Archive a process (soft delete); running cases keep working."""
    process_service.delete_definition(db, process_id, user.id)
    db.commit()
    return ok("پروسه آرشیو شد.", process_id=process_id, deleted=True)


@router.get("/{process_id}/consultation-summary")
def get_consultation_summary(
    process_id: str,
    _: User = Depends(require_permission("processes", "view")),
    db: Session = Depends(db_session),
) -> dict:
    """خلاصه مشاوره متقاضی (L4).

    مدارک، هزینه‌ها، مدت تقریبی و شرایط از نسخه منتشرشده استخراج می‌شوند و
    بازنویسی‌های دستی (``consultation`` داخل تعریف پروسه) جای آن‌ها را می‌گیرند.
    اگر پروسه هنوز منتشر نشده باشد، خلاصه پیش‌نویس با ``published=false`` برمی‌گردد.
    """
    row = process_service.get_definition(db, process_id)
    summary = consultation_service.consultation_summary(db, row)
    return ok("خلاصه مشاوره پروسه", summary=summary, published=summary["published"])


@router.put("/{process_id}")
def upsert_process(
    process_id: str,
    payload: dict = Body(...),
    user: User = Depends(require_permission("processes", "update")),
    db: Session = Depends(db_session),
) -> dict:
    body = {**payload, "id": process_id}
    row = process_service.upsert_definition(db, body, user.id)
    db.commit()
    return ok("پیش‌نویس پروسه ذخیره شد.", process=process_service.definition_to_dict(row))


@router.post("/{process_id}/validate")
def validate_process(
    process_id: str,
    payload: dict | None = Body(default=None),
    _: User = Depends(require_permission("processes", "view")),
    db: Session = Depends(db_session),
) -> dict:
    row = process_service.get_definition(db, process_id)
    body = payload if payload else row.draft_json
    issues = process_service.validate_definition(body, _forms_map(db))
    errors = [issue for issue in issues if issue["severity"] == "error"]
    return ok(
        "تعریف پروسه قابل انتشار است." if not errors else "تعریف پروسه ایراد دارد.",
        issues=issues,
        errors=errors,
        warnings=[issue for issue in issues if issue["severity"] == "warning"],
    )


@router.post("/{process_id}/publish")
def publish_process(
    process_id: str,
    payload: dict | None = Body(default=None),
    user: User = Depends(require_permission("processes", "update")),
    db: Session = Depends(db_session),
) -> dict:
    row = process_service.publish_definition(db, process_id, payload, user.id, _forms_map(db))
    db.commit()
    return ok(
        f"پروسه با نسخه {row.version_label} منتشر شد.",
        process=process_service.definition_to_dict(row),
        version=row.version_label,
    )


@router.get("/{process_id}/versions")
def list_versions(
    process_id: str,
    _: User = Depends(require_permission("processes", "view")),
    db: Session = Depends(db_session),
) -> dict:
    process_service.get_definition(db, process_id)
    versions = process_service.list_versions(db, process_id)
    return ok("نسخه‌های منتشرشده", versions=versions, count=len(versions))


@router.get("/{process_id}/snapshot")
def get_published_snapshot(
    process_id: str,
    _: User = Depends(require_permission("processes", "view")),
    db: Session = Depends(db_session),
) -> dict:
    row = process_service.get_definition(db, process_id)
    if not row.published_json:
        raise NotFound("این پروسه هنوز نسخه منتشرشده ندارد.")
    return ok("نسخه منتشرشده", snapshot=row.published_json)
