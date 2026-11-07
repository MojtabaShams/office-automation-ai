"""Process definitions, publish validation and the case state machine.

The admin panel is the authoring surface; this module is the server-side authority for
three things:

1. **Publish validation** - mirror of ``apps/admin/app/lib/process-validation.ts``. A
   definition that fails here is never published, so a running case can never reference
   a missing stage, an unresolved assignee or a backward route.
2. **Snapshots** - every publish stores an immutable copy (stages, route rules, computed
   fields, ``onReject``, ``escalation`` and the locked form versions). Cases freeze that
   snapshot at start time.
3. **Case transitions** - approve-and-advance, reject/return, escalate and expire. The
   status vocabulary matches the Requests module in the admin app:

   * ``status``    : ``active`` | ``completed`` | ``expired``
   * ``substatus`` : ``registered`` | ``in-review`` | ``awaiting-user-documents`` |
     ``forwarded`` | ``approved`` | ``rejected`` | ``expired-user`` | ``escalation`` |
     ``cancelled``

   An applicant-stage timeout closes the case (``expired`` / ``expired-user``), while an
   employee-side delay only raises ``needs_escalation`` and keeps the case open.
"""

from __future__ import annotations

import copy
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import Conflict, NotFound, ValidationError
from app.models.process import ProcessCase, ProcessDefinitionRow, ProcessVersion

from .formula import FormulaError, evaluate_formula

ROUTE_COMPLETE = "__complete__"
ROUTE_REJECT = "__reject__"

STATUSES = ("active", "completed", "expired")
SUBSTATUSES = (
    "registered",
    "in-review",
    "awaiting-user-documents",
    "forwarded",
    "approved",
    "rejected",
    "expired-user",
    "escalation",
    "cancelled",
)

_STAGE_CODE_RE = re.compile(r"^[A-Za-z0-9-]{2,20}$")
_TERMINALS = {ROUTE_COMPLETE, ROUTE_REJECT}

logger = logging.getLogger(__name__)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- helpers
def _as_list(value: Any) -> list:
    return value if isinstance(value, list) else []


def _as_dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def stage_index(snapshot: dict, stage_id: str | None) -> int:
    if not stage_id:
        return -1
    for index, stage in enumerate(_as_list(snapshot.get("stages"))):
        if _as_dict(stage).get("id") == stage_id:
            return index
    return -1


def stage_by_id(snapshot: dict, stage_id: str | None) -> dict | None:
    index = stage_index(snapshot, stage_id)
    if index < 0:
        return None
    return _as_dict(_as_list(snapshot.get("stages"))[index])


def is_applicant_stage(stage: dict | None) -> bool:
    assignee = _as_dict((stage or {}).get("assignee"))
    return assignee.get("kind") == "applicant"


def is_forward_target(snapshot: dict, from_stage_id: str, target: str) -> bool:
    if target in _TERMINALS:
        return True
    source = stage_index(snapshot, from_stage_id)
    destination = stage_index(snapshot, target)
    return source >= 0 and destination > source


def _assignee_resolved(assignee: Any) -> bool:
    payload = _as_dict(assignee)
    kind = payload.get("kind")
    if kind == "applicant":
        return True
    if kind == "role":
        return bool(_text(payload.get("accessLevelId")))
    if kind == "employee":
        return bool(_text(payload.get("employeeId")))
    return False


# --------------------------------------------------------------- publish validation
def form_leaf_fields(form: dict | None) -> list[dict]:
    """Depth-first list of non-section fields of a form definition."""

    def walk(fields: list) -> list[dict]:
        output: list[dict] = []
        for field in fields:
            payload = _as_dict(field)
            if payload.get("type") != "section":
                output.append(payload)
            output.extend(walk(_as_list(payload.get("subFields"))))
        return output

    return walk(_as_list((form or {}).get("fields")))


def variables_at_stage(snapshot: dict, forms: dict[str, dict], index: int) -> set[str]:
    """``formId:fieldId`` variables available while ``index`` is the current stage."""
    if index < 0:
        return set()
    stages = _as_list(snapshot.get("stages"))[: index + 1]
    available: set[str] = set()
    for stage in stages:
        for form_id in _as_list(_as_dict(stage).get("formIds")):
            form = forms.get(str(form_id))
            for field in form_leaf_fields(form):
                available.add(f"{form_id}:{_as_dict(field).get('id')}")
    for computed in _as_list(snapshot.get("computedFields")):
        payload = _as_dict(computed)
        destination = _as_dict(payload.get("destination"))
        if destination.get("kind") == "internal":
            continue
        if stage_index(snapshot, destination.get("stageId")) <= index:
            available.add(f"calc:{payload.get('id')}")
    return available


def validate_definition(payload: dict, forms: dict[str, dict]) -> list[dict]:
    """Return blocking ``errors`` and non-blocking ``warnings`` (Persian messages)."""
    errors: list[dict] = []
    warnings: list[dict] = []

    def add(severity: str, message: str, panel: str = "process", **extra: Any) -> None:
        entry = {"severity": severity, "message": message, "panel": panel, **extra}
        (errors if severity == "error" else warnings).append(entry)

    if not _text(payload.get("title")):
        add("error", "عنوان پروسه را وارد کنید.", "process")
    if not _STAGE_CODE_RE.match(_text(payload.get("code"))):
        add("error", "کد شناسه باید ۲ تا ۲۰ نویسه انگلیسی، عدد یا خط تیره باشد.", "process")

    stages = _as_list(payload.get("stages"))
    if not stages:
        add("error", "حداقل یک مرحله تعریف کنید.", "process")
        return errors + warnings

    for index, raw_stage in enumerate(stages):
        stage = _as_dict(raw_stage)
        stage_id = str(stage.get("id") or "")
        label = f"مرحله {index + 1} ({_text(stage.get('title')) or 'بدون عنوان'})"

        if not _text(stage.get("title")):
            add("error", f"عنوان {label} را وارد کنید.", "stage", stageId=stage_id)

        assignee = stage.get("assignee")
        if not _assignee_resolved(assignee):
            legacy = _text(stage.get("legacyAssigneeLabel"))
            suffix = f" برچسب قدیمی: «{legacy}»." if legacy else ""
            add("error", f"مسئول {label} انتخاب نشده است.{suffix}", "stage", stageId=stage_id)

        form_ids = _as_list(stage.get("formIds"))
        if not form_ids and not _text(stage.get("guidance")):
            add("error", f"{label} نه فرم دارد و نه راهنمای متقاضی.", "stage", stageId=stage_id)

        for form_id in form_ids:
            form = forms.get(str(form_id))
            if form is None:
                add("error", f"{label} به فرم حذف‌شده «{form_id}» وصل است.", "stage", stageId=stage_id, formId=str(form_id))
                continue
            if not form.get("is_active", form.get("status") == "active"):
                add("error", f"فرم «{form.get('title')}» در {label} غیرفعال یا آرشیو شده است.", "stage", stageId=stage_id, formId=str(form_id))
            if not _as_dict(stage.get("formVersions")).get(str(form_id)):
                add("warning", f"نسخه‌ی قفل‌شده‌ی فرم «{form.get('title')}» در {label} ثبت نشده است.", "stage", stageId=stage_id, formId=str(form_id))

        available = variables_at_stage(payload, forms, index)
        for rule in _as_list(stage.get("routeRules")):
            rule_payload = _as_dict(rule)
            condition = _as_dict(rule_payload.get("condition"))
            clauses = _as_list(condition.get("clauses"))
            if not clauses or not any(_text(_as_dict(clause).get("variableId")) for clause in clauses):
                add("error", f"قانون مسیر {label} شرط معتبر ندارد.", "stage", stageId=stage_id)
            for clause in clauses:
                variable_id = _text(_as_dict(clause).get("variableId"))
                if variable_id and variable_id not in available:
                    add("error", f"قانون مسیر {label} به متغیر «{variable_id}» اشاره می‌کند که در این مرحله در دسترس نیست.", "stage", stageId=stage_id)
            target = _text(rule_payload.get("nextStageId"))
            if not target or not is_forward_target(payload, stage_id, target):
                add("error", f"مقصد قانون مسیر {label} باید یکی از مراحل بعدی یا پایانه باشد.", "stage", stageId=stage_id)

        default_target = _text(stage.get("defaultNextStageId"))
        if default_target and not is_forward_target(payload, stage_id, default_target):
            add("error", f"مسیر پیش‌فرض {label} باید یکی از مراحل بعدی یا پایانه باشد.", "stage", stageId=stage_id)

        escalation = _as_dict(stage.get("escalation"))
        if escalation:
            if not _assignee_resolved(escalation.get("to")):
                add("error", f"مقصد ارجاع {label} انتخاب نشده است.", "stage", stageId=stage_id)
            after_days = escalation.get("afterDays")
            sla_days = stage.get("slaDays")
            if isinstance(after_days, int) and isinstance(sla_days, int) and after_days > sla_days:
                add("warning", f"زمان ارجاع {label} ({after_days} روز) از مهلت مرحله ({sla_days} روز) بیشتر است.", "stage", stageId=stage_id)

    for computed in _as_list(payload.get("computedFields")):
        field = _as_dict(computed)
        name = _text(field.get("name")) or "بدون نام"
        if not _text(field.get("name")):
            add("error", "نام همه‌ی فیلدهای محاسباتی الزامی است.", "logic")
        tokens = _as_list(_as_dict(field.get("formula")).get("tokens"))
        if not tokens:
            add("error", f"فرمول محاسبه «{name}» خالی است.", "logic")
            continue
        destination = _as_dict(field.get("destination"))
        if destination.get("kind") == "internal":
            continue
        destination_index = stage_index(payload, destination.get("stageId"))
        if destination_index < 0:
            add("error", f"مرحله مقصد محاسبه «{name}» وجود ندارد.", "logic")
            continue
        form = forms.get(str(destination.get("formId")))
        if form is None:
            add("error", f"فرم مقصد محاسبه «{name}» وجود ندارد.", "logic")
            continue
        destination_stage = stage_by_id(payload, destination.get("stageId")) or {}
        if str(destination.get("formId")) not in [str(item) for item in _as_list(destination_stage.get("formIds"))]:
            add("error", f"فرم مقصد محاسبه «{name}» به مرحله مقصد وصل نیست.", "logic")
            continue
        target_field = next(
            (item for item in form_leaf_fields(form) if item.get("id") == destination.get("fieldId")),
            None,
        )
        if target_field is None:
            add("error", f"فیلد مقصد محاسبه «{name}» در فرم «{form.get('title')}» پیدا نشد.", "logic")
            continue
        if destination.get("kind") == "payment_amount" and target_field.get("type") != "payment":
            add("error", f"محاسبه «{name}» باید به یک فیلد پرداخت متصل شود.", "logic")
        allowed = variables_at_stage(payload, forms, destination_index - 1)
        for token in tokens:
            token_payload = _as_dict(token)
            if token_payload.get("kind") != "variable":
                continue
            variable_id = _text(token_payload.get("variableId"))
            if variable_id and variable_id not in allowed:
                add("error", f"فرمول «{name}» به متغیر «{variable_id}» اشاره می‌کند که مربوط به مراحل قبل نیست.", "logic")

    for form_id, form in forms.items():
        if not any(str(form_id) in [str(value) for value in _as_list(_as_dict(stage).get("formIds"))] for stage in stages):
            continue
        for field in form_leaf_fields(form):
            if field.get("type") == "payment":
                payment = _as_dict(field.get("payment"))
                if not _text(payment.get("gatewayId")):
                    add("error", f"فیلد پرداخت «{field.get('label')}» در فرم «{form.get('title')}» درگاه ندارد.", "form", formId=str(form_id), fieldId=str(field.get("id")))
                if not _text(payment.get("amountSource")):
                    add("error", f"منبع مبلغ فیلد پرداخت «{field.get('label')}» در فرم «{form.get('title')}» مشخص نیست.", "form", formId=str(form_id), fieldId=str(field.get("id")))
            validation = _as_dict(field.get("validation"))
            min_length, max_length = validation.get("minLength"), validation.get("maxLength")
            if isinstance(min_length, int) and isinstance(max_length, int) and min_length > max_length:
                add("error", f"قواعد اعتبارسنجی «{field.get('label')}» در فرم «{form.get('title')}» ناسازگار است.", "form", formId=str(form_id), fieldId=str(field.get("id")))
            if field.get("type") == "file":
                minimum, maximum = field.get("minFiles"), field.get("maxFiles")
                if isinstance(minimum, int) and isinstance(maximum, int) and minimum > maximum:
                    add("error", f"حداقل تعداد فایل «{field.get('label')}» از حداکثر آن بیشتر است.", "form", formId=str(form_id), fieldId=str(field.get("id")))

    return errors + warnings


# -------------------------------------------------------------------- definitions
def next_version_label(current: str | None) -> str:
    """First publish becomes ``1.0``; later publishes bump the minor component."""
    match = re.match(r"^(\d+)\.(\d+)$", _text(current))
    if not match:
        return "1.0"
    major, minor = int(match.group(1)), int(match.group(2))
    return f"{major}.{minor + 1}"


def get_definition(db: Session, process_id: str, *, include_deleted: bool = False) -> ProcessDefinitionRow:
    row = db.get(ProcessDefinitionRow, process_id)
    if row is None or (row.is_deleted and not include_deleted):
        raise NotFound("پروسه موردنظر یافت نشد.")
    return row


def upsert_definition(db: Session, payload: dict, actor_id: str | None) -> ProcessDefinitionRow:
    process_id = _text(payload.get("id")) or f"process-{secrets.token_hex(8)}"
    row = db.get(ProcessDefinitionRow, process_id)
    body = {**copy.deepcopy(payload), "id": process_id}
    if row is None:
        row = ProcessDefinitionRow(
            id=process_id,
            code=_text(payload.get("code")) or process_id[:20],
            title=_text(payload.get("title")) or "پروسه بدون عنوان",
            department=_text(payload.get("department")) or "عمومی",
            description=payload.get("description"),
            icon=payload.get("icon"),
            status=_text(payload.get("status")) or "draft",
            version_label=_text(payload.get("version")) or "0.1",
            draft_json=body,
            created_by=actor_id,
        )
        db.add(row)
    else:
        row.draft_json = body
        row.code = _text(payload.get("code")) or row.code
        row.title = _text(payload.get("title")) or row.title
        row.department = _text(payload.get("department")) or row.department
        row.description = payload.get("description")
        row.icon = payload.get("icon")
        if _text(payload.get("status")):
            row.status = _text(payload.get("status"))
        row.version_label = _text(payload.get("version")) or row.version_label
    # Saving a previously archived process (same id) restores it; the row was kept.
    row.is_deleted = False
    row.deleted_at = None
    db.flush()
    return row


def publish_definition(
    db: Session,
    process_id: str,
    payload: dict | None,
    actor_id: str | None,
    forms: dict[str, dict],
) -> ProcessDefinitionRow:
    row = get_definition(db, process_id)
    body = copy.deepcopy(payload) if payload else copy.deepcopy(row.draft_json)
    body["id"] = process_id

    issues = validate_definition(body, forms)
    blocking = [issue for issue in issues if issue["severity"] == "error"]
    if blocking:
        raise ValidationError(blocking[0]["message"])

    version_label = next_version_label(row.version_label)
    snapshot = {
        **body,
        "version": version_label,
        "publishedAt": utcnow().isoformat(),
        "stages": copy.deepcopy(_as_list(body.get("stages"))),
        "routeRules": [
            copy.deepcopy(_as_dict(stage).get("routeRules"))
            for stage in _as_list(body.get("stages"))
        ],
        "computedFields": copy.deepcopy(_as_list(body.get("computedFields"))),
        "lockedForms": [
            {"formId": form_id, "version": version, "title": forms.get(str(form_id), {}).get("title", "")}
            for stage in _as_list(body.get("stages"))
            for form_id, version in _as_dict(_as_dict(stage).get("formVersions")).items()
        ],
    }

    row.draft_json = body
    row.published_json = snapshot
    row.version_label = version_label
    row.status = "active"
    row.published_at = utcnow()
    row.published_by = actor_id
    db.add(
        ProcessVersion(
            process_id=row.id,
            version_label=version_label,
            snapshot=snapshot,
            published_by=actor_id,
        )
    )
    db.flush()
    return row


def definition_to_dict(row: ProcessDefinitionRow) -> dict:
    body = copy.deepcopy(row.draft_json) if row.draft_json else {}
    body.update(
        {
            "id": row.id,
            "code": row.code,
            "title": row.title,
            "department": row.department,
            "description": row.description or "",
            "icon": row.icon or "workflow",
            "status": row.status,
            "version": row.version_label,
            "publishedAt": row.published_at.isoformat() if row.published_at else None,
            "publishedBy": row.published_by,
            "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
        }
    )
    return body


def active_case_count(db: Session, process_id: str) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(ProcessCase)
            .where(
                ProcessCase.process_id == process_id,
                ProcessCase.status == "active",
                ProcessCase.is_deleted.is_(False),
            )
        )
        or 0
    )


def list_definitions(
    db: Session,
    *,
    status: str | None = None,
    published_only: bool = False,
    include_deleted: bool = False,
) -> list[dict]:
    statement = select(ProcessDefinitionRow).order_by(ProcessDefinitionRow.updated_at.desc())
    if not include_deleted:
        statement = statement.where(ProcessDefinitionRow.is_deleted.is_(False))
    if status:
        statement = statement.where(ProcessDefinitionRow.status == status)
    if published_only:
        statement = statement.where(ProcessDefinitionRow.published_json.is_not(None))
    rows = list(db.scalars(statement).all())
    counts = dict(
        db.execute(
            select(ProcessCase.process_id, func.count())
            .where(ProcessCase.status == "active", ProcessCase.is_deleted.is_(False))
            .group_by(ProcessCase.process_id)
        ).all()
    )
    return [
        {**definition_to_dict(row), "activeCases": int(counts.get(row.id, 0))} for row in rows
    ]


def delete_definition(db: Session, process_id: str, actor_id: str | None = None) -> None:
    """Archive a process. Running cases and history keep pointing at the definition."""
    row = get_definition(db, process_id)
    row.is_deleted = True
    row.deleted_at = utcnow()
    row.status = "archived"
    db.flush()
    logger.info("process archived: %s by %s", process_id, actor_id)


def list_versions(db: Session, process_id: str) -> list[dict]:
    rows = db.scalars(
        select(ProcessVersion)
        .where(ProcessVersion.process_id == process_id)
        .order_by(ProcessVersion.id.desc())
    ).all()
    return [
        {
            "id": row.id,
            "version": row.version_label,
            "publishedAt": row.published_at.isoformat() if row.published_at else None,
            "publishedBy": row.published_by,
        }
        for row in rows
    ]


# ------------------------------------------------------------------------ cases
def _tracking_code(db: Session, row: ProcessDefinitionRow) -> str:
    total = db.scalar(select(func.count()).select_from(ProcessCase)) or 0
    return f"{row.code.upper()}-{1000 + int(total) + 1}"


def _stage_state(entered_at: datetime, actor_id: str | None = None) -> dict:
    return {
        "state": "current",
        "enteredAt": entered_at.isoformat(),
        "assigneeId": actor_id,
    }


def _deadline(stage: dict | None, now: datetime) -> datetime | None:
    sla_days = _as_dict(stage or {}).get("slaDays")
    if not isinstance(sla_days, int) or sla_days <= 0:
        return now + timedelta(days=3)
    return now + timedelta(days=sla_days)


def _condition_matches(condition: dict, values: dict) -> bool:
    clauses = _as_list(condition.get("clauses"))
    if not clauses:
        return False

    def clause_matches(clause: dict) -> bool:
        variable_id = _text(clause.get("variableId"))
        if not variable_id:
            return False
        actual = values.get(variable_id)
        expected = clause.get("value")
        operator = _text(clause.get("operator")) or "equals"
        actual_text = "" if actual is None else str(actual).strip()
        expected_text = "" if expected is None else str(expected).strip()
        if operator == "isEmpty":
            return not actual_text
        if operator == "equals":
            return actual_text == expected_text
        if operator == "notEquals":
            return actual_text != expected_text
        if operator == "contains":
            return expected_text in actual_text
        try:
            left, right = float(actual_text or 0), float(expected_text or 0)
        except ValueError:
            return False
        if operator == "greaterThan":
            return left > right
        if operator == "lessThan":
            return left < right
        return False

    if (condition.get("logic") or "and") == "or":
        return any(clause_matches(_as_dict(clause)) for clause in clauses)
    return all(clause_matches(_as_dict(clause)) for clause in clauses)


def next_target(snapshot: dict, stage: dict, values: dict) -> str:
    for rule in _as_list(stage.get("routeRules")):
        rule_payload = _as_dict(rule)
        if _condition_matches(_as_dict(rule_payload.get("condition")), values):
            return _text(rule_payload.get("nextStageId")) or ROUTE_COMPLETE
    default_target = _text(stage.get("defaultNextStageId"))
    if default_target:
        return default_target
    stages = _as_list(snapshot.get("stages"))
    index = stage_index(snapshot, stage.get("id"))
    following = stages[index + 1] if 0 <= index < len(stages) - 1 else None
    if isinstance(following, dict):
        return _text(following.get("id"))
    return ROUTE_COMPLETE


def _run_computed(snapshot: dict, stage_id: str, values: dict, results: dict) -> None:
    for computed in _as_list(snapshot.get("computedFields")):
        field = _as_dict(computed)
        destination = _as_dict(field.get("destination"))
        if destination.get("kind") == "internal":
            continue
        if destination.get("stageId") != stage_id:
            continue
        field_id = _text(field.get("id"))
        if not field_id:
            continue
        try:
            results[field_id] = evaluate_formula(_as_dict(field.get("formula")), values)
        except FormulaError:
            results[field_id] = 0.0


def _append_timeline(case: ProcessCase, action: str, actor_id: str | None, description: str) -> None:
    entries = list(_as_list(case.timeline))
    entries.append(
        {
            "id": secrets.token_hex(6),
            "action": action,
            "actorId": actor_id or "system",
            "at": utcnow().isoformat(),
            "description": description,
        }
    )
    case.timeline = entries


def start_case(
    db: Session,
    row: ProcessDefinitionRow,
    *,
    applicant_id: str | None,
    title: str | None = None,
    form_id: str | None = None,
    values: dict | None = None,
) -> ProcessCase:
    if not row.published_json:
        raise Conflict("این پروسه هنوز منتشر نشده است و پرونده‌ای برای آن قابل ایجاد نیست.")
    snapshot = copy.deepcopy(row.published_json)
    stages = _as_list(snapshot.get("stages"))
    first = _as_dict(stages[0]) if stages else {}
    first_id = _text(first.get("id")) or None
    now = utcnow()
    case = ProcessCase(
        id=f"case-{secrets.token_hex(8)}",
        tracking_code=_tracking_code(db, row),
        process_id=row.id,
        process_version_label=row.version_label,
        snapshot=snapshot,
        applicant_id=applicant_id,
        form_id=form_id,
        title=_text(title) or row.title,
        status="active",
        substatus="awaiting-user-documents" if is_applicant_stage(first) else "in-review",
        current_stage_id=first_id,
        needs_escalation=False,
        stage_states={first_id: _stage_state(now)} if first_id else {},
        values=dict(values or {}),
        compute_results={},
        timeline=[],
        due_at=_deadline(first, now),
    )
    _append_timeline(case, "start", applicant_id, f"پرونده در مرحله «{_text(first.get('title'))}» آغاز شد.")
    db.add(case)
    db.flush()
    return case


def get_case(db: Session, case_id: str) -> ProcessCase:
    case = db.get(ProcessCase, case_id)
    if case is None or case.is_deleted:
        raise NotFound("پرونده موردنظر یافت نشد.")
    return case


def list_cases(
    db: Session,
    *,
    status: str | None = None,
    process_id: str | None = None,
    applicant_id: str | None = None,
) -> list[dict]:
    statement = (
        select(ProcessCase)
        .where(ProcessCase.is_deleted.is_(False))
        .order_by(ProcessCase.updated_at.desc())
    )
    if status:
        statement = statement.where(ProcessCase.status == status)
    if process_id:
        statement = statement.where(ProcessCase.process_id == process_id)
    if applicant_id:
        statement = statement.where(ProcessCase.applicant_id == applicant_id)
    return [case_to_dict(case) for case in db.scalars(statement).all()]


def delete_case(db: Session, case: ProcessCase, actor_id: str | None = None) -> ProcessCase:
    """Archive a case without removing its timeline (the only delete path)."""
    case.is_deleted = True
    case.deleted_at = utcnow()
    case.needs_escalation = False
    _append_timeline(case, "archive", actor_id, "پرونده آرشیو شد.")
    db.flush()
    return case


def _enter_stage(case: ProcessCase, snapshot: dict, stage_id: str) -> None:
    now = utcnow()
    stage = stage_by_id(snapshot, stage_id)
    states = dict(_as_dict(case.stage_states))
    states[stage_id] = _stage_state(now)
    case.stage_states = states
    case.current_stage_id = stage_id
    case.due_at = _deadline(stage, now)
    results = dict(_as_dict(case.compute_results))
    _run_computed(snapshot, stage_id, _as_dict(case.values), results)
    case.compute_results = results
    case.substatus = "awaiting-user-documents" if is_applicant_stage(stage) else "in-review"


def _finalise(case: ProcessCase, status: str, substatus: str) -> None:
    case.status = status
    case.substatus = substatus
    case.current_stage_id = None
    case.due_at = None
    case.needs_escalation = False


def advance_case(db: Session, case: ProcessCase, actor_id: str | None, note: str | None = None) -> ProcessCase:
    if case.status != "active":
        raise Conflict("فقط پرونده‌های در جریان قابل تأیید و ارسال به مرحله بعد هستند.")
    snapshot = _as_dict(case.snapshot)
    stage = stage_by_id(snapshot, case.current_stage_id)
    if stage is None:
        raise Conflict("مرحله جاری پرونده پیدا نشد؛ تعریف منتشرشده را بررسی کنید.")

    target = next_target(snapshot, stage, _as_dict(case.values))
    states = dict(_as_dict(case.stage_states))
    current_id = _text(stage.get("id"))
    states[current_id] = {
        **_as_dict(states.get(current_id)),
        "state": "approved",
        "actedAt": utcnow().isoformat(),
        "decision": "approved",
        "note": note or "",
    }
    case.stage_states = states
    case.needs_escalation = False
    _append_timeline(
        case,
        "approve",
        actor_id,
        f"مرحله «{_text(stage.get('title'))}» تأیید شد." + (f" یادداشت: {note}" if note else ""),
    )

    if target == ROUTE_REJECT:
        _finalise(case, "completed", "rejected")
        _append_timeline(case, "reject", actor_id, "پرونده بر اساس قانون مسیر به رد نهایی رسید.")
    elif target == ROUTE_COMPLETE or stage_index(snapshot, target) < 0:
        _finalise(case, "completed", "approved")
        _append_timeline(case, "complete", actor_id, "پرونده با موفقیت تکمیل شد.")
    else:
        _enter_stage(case, snapshot, target)
        entered = stage_by_id(snapshot, target) or {}
        _append_timeline(case, "advance", actor_id, f"پرونده به مرحله «{_text(entered.get('title'))}» ارسال شد.")
    db.flush()
    return case


def reject_case(
    db: Session,
    case: ProcessCase,
    actor_id: str | None,
    note: str | None = None,
    *,
    final: bool | None = None,
) -> ProcessCase:
    """Reject the current stage.

    ``onReject`` decides between re-opening the nearest previous applicant stage
    (``return_to_applicant``, the default for employee stages) and closing the case
    (``reject_final``).  Returning is *not* a backward route rule: conditional routes
    stay forward-only and cycle-free.
    """
    if case.status != "active":
        raise Conflict("فقط پرونده‌های در جریان قابل رد هستند.")
    snapshot = _as_dict(case.snapshot)
    stage = stage_by_id(snapshot, case.current_stage_id)
    if stage is None:
        raise Conflict("مرحله جاری پرونده پیدا نشد؛ تعریف منتشرشده را بررسی کنید.")

    policy = _text(stage.get("onReject")) or "return_to_applicant"
    should_finalise = final if final is not None else (policy == "reject_final" or is_applicant_stage(stage))

    current_id = _text(stage.get("id"))
    states = dict(_as_dict(case.stage_states))
    states[current_id] = {
        **_as_dict(states.get(current_id)),
        "state": "rejected",
        "actedAt": utcnow().isoformat(),
        "decision": "rejected",
        "note": note or "",
    }
    case.stage_states = states
    _append_timeline(
        case,
        "reject",
        actor_id,
        f"مرحله «{_text(stage.get('title'))}» رد شد." + (f" دلیل: {note}" if note else ""),
    )

    if should_finalise:
        _finalise(case, "completed", "rejected")
        db.flush()
        return case

    stages = _as_list(snapshot.get("stages"))
    target_index = -1
    for index in range(stage_index(snapshot, current_id) - 1, -1, -1):
        if is_applicant_stage(_as_dict(stages[index]) if index < len(stages) else {}):
            target_index = index
            break
    if target_index < 0:
        _finalise(case, "completed", "rejected")
        _append_timeline(case, "reject", actor_id, "مرحله متقاضی برای بازگشت پیدا نشد؛ پرونده بسته شد.")
        db.flush()
        return case

    target_stage = _as_dict(stages[target_index])
    target_id = _text(target_stage.get("id"))
    _enter_stage(case, snapshot, target_id)
    states = dict(_as_dict(case.stage_states))
    states[target_id] = {
        **states.get(target_id, {}),
        "state": "current",
        "note": note or "",
        "returnedFrom": current_id,
    }
    case.stage_states = states
    case.substatus = "awaiting-user-documents"
    _append_timeline(
        case,
        "return",
        actor_id,
        f"پرونده برای اصلاح به مرحله «{_text(target_stage.get('title'))}» بازگشت.",
    )
    db.flush()
    return case


def escalate_case(db: Session, case: ProcessCase, actor_id: str | None, note: str | None = None) -> ProcessCase:
    """Raise the escalation flag without closing the case."""
    if case.status != "active":
        raise Conflict("فقط پرونده‌های در جریان قابل ارجاع هستند.")
    snapshot = _as_dict(case.snapshot)
    stage = stage_by_id(snapshot, case.current_stage_id)
    escalation = _as_dict((stage or {}).get("escalation"))
    if not escalation:
        raise Conflict("برای مرحله جاری هیچ مقصد ارجاعی تعریف نشده است.")
    if not _assignee_resolved(escalation.get("to")):
        raise Conflict("مقصد ارجاع این مرحله انتخاب نشده است.")

    case.needs_escalation = True
    case.substatus = "escalation"
    states = dict(_as_dict(case.stage_states))
    current_id = _text((stage or {}).get("id"))
    states[current_id] = {
        **_as_dict(states.get(current_id)),
        "state": "current",
        "escalatedAt": utcnow().isoformat(),
        "escalatedTo": escalation.get("to"),
        "note": note or "",
    }
    case.stage_states = states
    _append_timeline(
        case,
        "escalate",
        actor_id,
        f"پرونده در مرحله «{_text((stage or {}).get('title'))}» ارجاع داده شد." + (f" یادداشت: {note}" if note else ""),
    )
    db.flush()
    return case


def expire_case(db: Session, case: ProcessCase, *, now: datetime | None = None) -> ProcessCase:
    """Apply the deadline rule for the current stage.

    * applicant stage → the case closes with ``expired`` / ``expired-user``;
    * employee stage → only ``needs_escalation`` is raised; the case stays open.
    """
    if case.status != "active":
        return case
    moment = now or utcnow()
    snapshot = _as_dict(case.snapshot)
    stage = stage_by_id(snapshot, case.current_stage_id)

    if is_applicant_stage(stage):
        _finalise(case, "expired", "expired-user")
        _append_timeline(
            case,
            "expire",
            None,
            f"مهلت تکمیل مرحله «{_text((stage or {}).get('title'))}» توسط متقاضی به پایان رسید و پرونده بسته شد.",
        )
    else:
        case.needs_escalation = True
        case.substatus = "escalation"
        _append_timeline(
            case,
            "deadline",
            None,
            f"مهلت مرحله «{_text((stage or {}).get('title'))}» سپری شد؛ پرونده نیازمند ارجاع است.",
        )
    case.updated_at = moment
    db.flush()
    return case


def scan_due_cases(db: Session, now: datetime | None = None) -> list[ProcessCase]:
    moment = now or utcnow()
    rows = db.scalars(
        select(ProcessCase).where(
            ProcessCase.status == "active",
            ProcessCase.is_deleted.is_(False),
            ProcessCase.due_at.is_not(None),
            ProcessCase.due_at <= moment,
        )
    ).all()
    for case in rows:
        expire_case(db, case, now=moment)
    return list(rows)


def _assignee_text(assignee: Any) -> str:
    """Human label for a stage assignee (applicant / role / named employee)."""
    data = _as_dict(assignee)
    kind = _text(data.get("kind"))
    if kind == "applicant":
        return "متقاضی"
    if kind == "role":
        return "کارشناس واحد"
    if kind == "employee":
        return "کارمند مسئول"
    return "نامشخص"


def stage_summaries(snapshot: dict) -> list[dict]:
    """Lightweight stage chain of the published snapshot a case runs on."""
    summaries: list[dict] = []
    for index, raw in enumerate(_as_list(snapshot.get("stages"))):
        stage = _as_dict(raw)
        summaries.append(
            {
                "id": _text(stage.get("id")) or f"stage-{index + 1}",
                "index": index + 1,
                "title": _text(stage.get("title")) or f"مرحله {index + 1}",
                "guidance": _text(stage.get("guidance")),
                "responsibleUnit": _assignee_text(stage.get("assignee")),
                "slaDays": stage.get("slaDays") if isinstance(stage.get("slaDays"), int) else 0,
                "isApplicantStage": is_applicant_stage(stage),
                "formIds": [str(item) for item in _as_list(stage.get("formIds"))],
            }
        )
    return summaries


def _stage_condition(stage: dict | None) -> dict | None:
    stage = _as_dict(stage)
    for key in ("condition", "executeIf", "execute_if", "visibleIf", "visible_if", "showIf"):
        value = stage.get(key)
        if isinstance(value, dict):
            return value
    return None


def _stage_skip_condition(stage: dict | None) -> dict | None:
    stage = _as_dict(stage)
    for key in ("skipIf", "skip_if", "skipWhen", "skip_when"):
        value = stage.get(key)
        if isinstance(value, dict):
            return value
    return None


def _eval_process_condition(condition: Any, values: dict) -> bool:
    if not isinstance(condition, dict):
        return True
    # Reuse form_service evaluator when available.
    try:
        from app.services import form_service

        if hasattr(form_service, "_eval_condition"):
            return bool(form_service._eval_condition(condition, values))
    except Exception:
        pass
    logic = str(condition.get("logic") or "and").lower()
    clauses = condition.get("clauses") or condition.get("conditions") or []
    if not isinstance(clauses, list) or not clauses:
        return True
    results = []
    for clause in clauses:
        if not isinstance(clause, dict):
            continue
        var = clause.get("variableId") or clause.get("field") or clause.get("name")
        op = str(clause.get("operator") or "equals")
        expected = clause.get("value")
        actual = values.get(var) if var is not None else None
        a = "" if actual is None else str(actual).strip()
        e = "" if expected is None else str(expected).strip()
        if op in {"equals", "eq", "equal"}:
            results.append(a == e)
        elif op in {"notEquals", "ne", "notEqual"}:
            results.append(a != e)
        elif op in {"greaterThan", "gt"}:
            try:
                results.append(float(a) > float(e))
            except (TypeError, ValueError):
                results.append(a > e)
        elif op in {"lessThan", "lt"}:
            try:
                results.append(float(a) < float(e))
            except (TypeError, ValueError):
                results.append(a < e)
        else:
            results.append(True)
    if logic == "or":
        return any(results) if results else True
    return all(results) if results else True


def stage_should_execute(stage: dict | None, values: dict | None = None) -> bool:
    values = _as_dict(values)
    cond = _stage_condition(stage)
    if cond is not None and not _eval_process_condition(cond, values):
        return False
    skip = _stage_skip_condition(stage)
    if skip is not None and _eval_process_condition(skip, values):
        return False
    return True


def should_skip_stage(stage: dict | None, values: dict | None = None) -> bool:
    return not stage_should_execute(stage, values)


def is_stage_visible(stage: dict | None, values: dict | None = None) -> bool:
    return stage_should_execute(stage, values)


def visible_stages(snapshot: dict | None, values: dict | None = None) -> list[dict]:
    values = _as_dict(values)
    snapshot = _as_dict(snapshot)
    output = []
    for stage in _as_list(snapshot.get("stages")):
        s = _as_dict(stage)
        if stage_should_execute(s, values):
            output.append(s)
    return output


def filter_stages(snapshot: dict | None, values: dict | None = None) -> list[dict]:
    return visible_stages(snapshot, values)


def stage_visibility(snapshot: dict | None, values: dict | None = None) -> list[dict]:
    return [
        {"id": _text(_as_dict(s).get("id")), "visible": stage_should_execute(_as_dict(s), _as_dict(values))}
        for s in _as_list(_as_dict(snapshot).get("stages"))
    ]
def case_to_dict(case: ProcessCase) -> dict:
    snapshot = _as_dict(case.snapshot)
    stages = _as_list(snapshot.get("stages"))
    index = stage_index(snapshot, case.current_stage_id)
    current = _as_dict(stages[index]) if 0 <= index < len(stages) else {}
    return {
        "id": case.id,
        "trackingCode": case.tracking_code,
        "processId": case.process_id,
        "processTitle": _text(snapshot.get("title")),
        "processVersion": case.process_version_label,
        "applicantId": case.applicant_id,
        "formId": case.form_id,
        "title": case.title,
        "status": case.status,
        "substatus": case.substatus,
        "needsEscalation": case.needs_escalation,
        "currentStageId": case.current_stage_id,
        "currentStageTitle": _text(current.get("title")),
        "currentAssignee": _as_dict(current.get("assignee")),
        "stages": stage_summaries(snapshot),
        "stageStates": _as_dict(case.stage_states),
        "values": _as_dict(case.values),
        "computed": _as_dict(case.compute_results),
        "timeline": _as_list(case.timeline),
        "dueAt": case.due_at.isoformat() if case.due_at else None,
        "createdAt": case.created_at.isoformat() if case.created_at else None,
        "updatedAt": case.updated_at.isoformat() if case.updated_at else None,
    }
