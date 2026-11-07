"""Applicant-facing process execution.

The admin panel defines a process once; this module turns the published snapshot into
the payload the client stepper renders and handles the final submission:

* :func:`stepper_payload` - stages, guidance, responsible units and the exact forms
  (including sections, repeaters, files and payment fields) linked to every stage.
* :func:`submit_application` - validates every applicant-stage form, creates the
  ``process_cases`` row, one ``submissions`` row per submitted form (so Admin → Requests
  lists the request with its process and step), and advances the case to the first
  staff stage.

Only soft-deleted rows and unpublished definitions are invisible here; the row itself is
always kept.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import Conflict, NotFound, ValidationError
from app.models.form import Form
from app.models.process import ProcessCase, ProcessVersion
from app.models.user import User
from app.repositories import form_repo, submission_repo
from app.services import form_service, intent_service, process_service, submission_service

logger = logging.getLogger(__name__)

#: Applicant-stage forms are the only ones the stepper can submit.
_MAX_APPLICANT_HOPS = 20


def _as_list(value: Any) -> list:
    return value if isinstance(value, list) else []


def _as_dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def _text(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _assignee_label(assignee: Any) -> str:
    payload = _as_dict(assignee)
    kind = payload.get("kind")
    if kind == "applicant":
        return "متقاضی"
    if kind == "role":
        return "کارشناس واحد"
    if kind == "employee":
        return "کارمند مسئول"
    return "نامشخص"


# ------------------------------------------------------------------ form payloads
def form_payload(form: Form) -> dict:
    """Render one stored form for the stepper without losing builder constructs."""
    data = form_service.admin_form_payload(form)
    rules = [
        _text(rule.get("text"))
        for rule in _as_list(data.get("rules"))
        if isinstance(rule, dict) and _text(rule.get("text"))
    ]
    return {
        "form_id": form.id,
        "code": data.get("code"),
        "title": data.get("title") or form.title,
        "description": data.get("description") or "",
        "guidance": data.get("applicantGuidance") or "",
        "formType": data.get("formType") or "standard",
        "version": data.get("version"),
        "fields": _as_list(data.get("fields")),
        "rules": rules,
        "payment": data.get("payment"),
    }


def _missing_form_payload(form_id: str) -> dict:
    return {
        "form_id": form_id,
        "title": form_id,
        "description": "",
        "guidance": "",
        "formType": "standard",
        "fields": [],
        "rules": [],
        "missing": True,
    }


# --------------------------------------------------------------------- stepper
def stepper_payload(
    db: Session,
    process_id: str,
    *,
    case: ProcessCase | None = None,
    prefill: dict | None = None,
) -> dict:
    """The whole process as the client stepper needs it."""
    row = process_service.get_definition(db, process_id)
    if not row.published_json:
        raise Conflict("این پروسه هنوز منتشر نشده است.")

    definition = _as_dict(row.published_json)
    forms = {form.id: form for form in form_repo.list_forms(db, active_only=False)}
    steps: list[dict] = []
    #: Only the first contiguous run of applicant stages is filled in one wizard; a
    #: later applicant stage is reopened by staff after a return.
    collecting = True
    for index, raw_stage in enumerate(_as_list(definition.get("stages"))):
        stage = _as_dict(raw_stage)
        is_applicant = process_service.is_applicant_stage(stage)
        collects_input = collecting and is_applicant
        if not is_applicant:
            collecting = False
        step_forms: list[dict] = []
        for form_id in _as_list(stage.get("formIds")):
            form = forms.get(str(form_id))
            payload_form = form_payload(form) if form is not None else _missing_form_payload(str(form_id))
            if form is not None and prefill:
                payload_form["prefill"] = intent_service.map_prefill_to_fields(
                    payload_form.get("fields") or [],
                    prefill,
                )
            step_forms.append(payload_form)
        steps.append(
            {
                "id": _text(stage.get("id")) or f"stage-{index + 1}",
                "index": index + 1,
                "title": _text(stage.get("title")) or f"مرحله {index + 1}",
                "guidance": _text(stage.get("guidance")),
                "responsibleUnit": _assignee_label(stage.get("assignee")),
                "slaDays": stage.get("slaDays") if isinstance(stage.get("slaDays"), int) else 0,
                "isApplicantStage": is_applicant,
                "collectsInput": collects_input,
                "forms": step_forms,
            }
        )

    version_row = db.scalar(
        select(ProcessVersion)
        .where(
            ProcessVersion.process_id == row.id,
            ProcessVersion.version_label == row.version_label,
        )
        .order_by(ProcessVersion.id.desc())
        .limit(1)
    )
    guidance = _text(definition.get("applicantGuidance")) or _text(row.description)
    return {
        "process_id": row.id,
        "process_version_id": version_row.id if version_row is not None else None,
        "version": row.version_label,
        "title": row.title,
        "department": row.department,
        "description": _text(row.description),
        "guidance": guidance,
        "steps": steps,
        "case": process_service.case_to_dict(case) if case is not None else None,
        "submittedToday": submission_service.submitted_today(db, case.applicant_id) if case and case.applicant_id else False,
    }


def published_processes(db: Session) -> list[dict]:
    """Active, published processes the agent may recommend."""
    return process_service.list_definitions(db, status="active", published_only=True)


# ------------------------------------------------------------------ validation
def _coerce_required(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict)):
        return len(value) > 0
    if isinstance(value, bool):
        return value
    return True


def _validate_fields(
    fields: list,
    values: dict,
    *,
    errors: list[str],
    path: str = "",
    row_label: str | None = None,
) -> None:
    for raw in fields:
        if not isinstance(raw, dict):
            continue
        field_type = _text(raw.get("type")) or "text"
        name = _text(raw.get("slug")) or _text(raw.get("id"))
        label = _text(raw.get("label")) or name or "فیلد"
        if not name and field_type not in {"section"}:
            continue
        prefix = f"{path}." if path else ""

        if field_type == "section":
            _validate_fields(
                _as_list(raw.get("subFields")), values, errors=errors, path=path, row_label=row_label
            )
            continue

        if field_type == "repeater":
            rows = values.get(name)
            rows = rows if isinstance(rows, list) else []
            if raw.get("required") and not rows:
                errors.append(f"«{label}» باید حداقل یک ردیف داشته باشد.")
            for index, row in enumerate(rows):
                _validate_fields(
                    _as_list(raw.get("subFields")),
                    _as_dict(row),
                    errors=errors,
                    path=f"{prefix}{name}[{index + 1}]",
                    row_label=label,
                )
            continue

        value = values.get(name)
        if not _coerce_required(value):
            if raw.get("required") and field_type != "boolean":
                errors.append(f"«{label}» الزامی است.")
            elif raw.get("required") and field_type == "boolean" and value is not True:
                errors.append(f"«{label}» باید تأیید شود.")
            continue

        if field_type in {"number", "computed"}:
            try:
                float(str(value))
            except (TypeError, ValueError):
                errors.append(f"«{label}» باید عدد باشد.")
            continue

        options = [str(option) for option in _as_list(raw.get("options")) if _text(option)]
        if field_type in {"select", "radio"} and options and str(value).strip() not in options:
            errors.append(f"«{label}» باید یکی از گزینه‌های مجاز باشد.")
            continue

        if field_type == "file":
            files = value if isinstance(value, list) else [value]
            max_files = raw.get("maxFiles")
            if isinstance(max_files, int) and max_files > 0 and len(files) > max_files:
                errors.append(f"تعداد فایل‌های «{label}» نباید بیشتر از {max_files} باشد.")


def validate_application(step_forms: list[tuple[dict, dict]]) -> dict[str, dict]:
    """Validate every applicant-step form; returns the cleaned per-form values."""
    errors: list[str] = []
    cleaned: dict[str, dict] = {}
    for payload, values in step_forms:
        title = _text(payload.get("title")) or _text(payload.get("form_id"))
        if payload.get("missing"):
            errors.append(f"فرم «{title}» در سامانه یافت نشد؛ با پشتیبانی تماس بگیرید.")
            continue
        before = len(errors)
        form_errors: list[str] = []
        _validate_fields(_as_list(payload.get("fields")), _as_dict(values), errors=form_errors)
        errors.extend(f"{title}: {message}" for message in form_errors)
        if len(errors) == before:
            cleaned[str(payload.get("form_id"))] = _as_dict(values)
    if errors:
        raise ValidationError(" ".join(errors[:4]))
    return cleaned


# ------------------------------------------------------------------- submission
def _case_values(cleaned: dict[str, dict]) -> dict:
    """Flatten every form's values into the case so route rules can read them."""
    flattened: dict[str, Any] = {}
    for values in cleaned.values():
        for key, value in values.items():
            flattened.setdefault(key, value)
    return flattened


def _advance_past_applicant(db: Session, case: ProcessCase, actor_id: str) -> ProcessCase:
    """Move the case to the first staff stage (or complete it)."""
    hops = 0
    while case.status == "active" and hops < _MAX_APPLICANT_HOPS:
        snapshot = _as_dict(case.snapshot)
        stage = process_service.stage_by_id(snapshot, case.current_stage_id)
        if not process_service.is_applicant_stage(stage):
            break
        case = process_service.advance_case(db, case, actor_id, "تکمیل مدارک توسط متقاضی")
        hops += 1
    return case


def submit_application(
    db: Session,
    user: User,
    *,
    process_id: str,
    values: dict[str, dict],
    session_id: str | None = None,
) -> dict:
    """Persist the applicant's answers as a case plus one submission per form."""
    row = process_service.get_definition(db, process_id)
    if not row.published_json:
        raise Conflict("این پروسه هنوز منتشر نشده است.")

    payload = stepper_payload(db, process_id)
    applicant_steps = [step for step in payload["steps"] if step["collectsInput"]]
    if not applicant_steps:
        raise Conflict("این پروسه مرحله‌ای برای تکمیل توسط متقاضی ندارد.")
    if submission_service.submitted_today(db, user.id):
        raise ValidationError(submission_service.DAILY_QUOTA_MESSAGE)

    step_forms: list[tuple[dict, dict]] = []
    for step in applicant_steps:
        for form in step["forms"]:
            step_forms.append((form, _as_dict(values.get(str(form.get("form_id"))))))
    if not step_forms:
        raise Conflict("برای این پروسه هیچ فرمی برای تکمیل تعریف نشده است.")
    cleaned = validate_application(step_forms)

    case = process_service.start_case(
        db,
        row,
        applicant_id=user.id,
        title=row.title,
        form_id=str(applicant_steps[0]["forms"][0]["form_id"]) if applicant_steps[0]["forms"] else None,
        values=_case_values(cleaned),
    )
    db.flush()

    first_stage = _as_dict(_as_list(_as_dict(case.snapshot).get("stages"))[0]) if case.snapshot else {}
    # The request is handed to staff before the rows are written, so Admin → Requests
    # shows the step that is actually waiting for an employee.
    case = _advance_past_applicant(db, case, user.id)
    current_stage = (
        process_service.stage_by_id(_as_dict(case.snapshot), case.current_stage_id)
        if case.current_stage_id
        else {}
    )
    stage_id = case.current_stage_id or _text(first_stage.get("id")) or None
    stage_title = _text(current_stage.get("title")) or _text(first_stage.get("title")) or None

    submissions = []
    for index, (form, _values) in enumerate(step_forms):
        form_values = cleaned.get(str(form.get("form_id"))) or {}
        snapshot = {
            "id": form.get("form_id"),
            "title": form.get("title"),
            "fields": form.get("fields"),
            "guidance": form.get("guidance"),
        }
        submissions.append(
            submission_repo.create_submission(
                db,
                form_id=str(form.get("form_id")),
                user_id=user.id,
                user_name=user.full_name,
                values=form_values,
                form_snapshot=snapshot,
                process_id=row.id,
                process_case_id=case.id,
                current_stage_id=stage_id,
                current_stage_title=stage_title,
                step_index=index + 1,
                step_count=len(step_forms),
                note=f"ثبت درخواست پروسه «{row.title}»",
            )
        )

    db.commit()
    db.refresh(case)
    logger.info(
        "applicant submitted process %s -> case %s (%d submissions) by %s",
        process_id,
        case.id,
        len(submissions),
        user.id,
    )
    return {
        "process": {"id": row.id, "title": row.title, "version": row.version_label},
        "case": process_service.case_to_dict(case),
        "submissions": [submission_service.to_dict(item, include_events=False) for item in submissions],
        "trackingCode": submissions[0].tracking_code if submissions else case.tracking_code,
        "sessionId": session_id,
    }


def count_cases_today(db: Session, user_id: str) -> int:
    start, end = submission_service.today_range()
    return int(
        db.scalar(
            select(func.count())
            .select_from(ProcessCase)
            .where(
                ProcessCase.applicant_id == user_id,
                ProcessCase.is_deleted.is_(False),
                ProcessCase.created_at >= start,
                ProcessCase.created_at < end,
            )
        )
        or 0
    )


def get_user_case(db: Session, case_id: str, user_id: str) -> ProcessCase:
    case = process_service.get_case(db, case_id)
    if case.applicant_id != user_id:
        raise NotFound("پرونده موردنظر یافت نشد.")
    return case


def case_payload(db: Session, case_id: str, user_id: str) -> dict:
    """A submitted case with its process steps and the applicant's submissions."""
    case = get_user_case(db, case_id, user_id)
    payload = stepper_payload(db, case.process_id, case=case)
    payload["submissions"] = [
        submission_service.to_dict(item, include_events=False)
        for item in submission_repo.list_submissions(
            db, process_case_id=case.id, user_id=user_id, limit=50
        )
    ]
    return payload
