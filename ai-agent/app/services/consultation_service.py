"""Applicant consultation summary (L4).

One place that answers "what does an applicant need to know before starting this
process?" for both the admin API and the chat agent:

* **required documents** - every ``file`` field of the forms attached to the stages,
* **fees** - payment fields, form-level payment defaults and process payment variables,
* **estimated duration** - sum of ``slaDays`` along the default path,
* **prerequisites / conditions** - manual text plus human-readable route-rule conditions.

Everything is derived from the *published* snapshot when one exists (draft otherwise),
so a summary can never drift from what applicants actually see. Manual overrides live in
the definition under ``consultation`` (edited in the process builder, saved with the
normal ``PUT /api/processes/{id}``) and win field by field over the derived values.
"""

from __future__ import annotations

import copy
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.process import ProcessDefinitionRow
from app.repositories import form_repo

from . import form_service, process_service

OPERATOR_LABELS = {
    "equals": "برابر با",
    "notEquals": "مخالف",
    "contains": "شامل",
    "isEmpty": "خالی باشد",
    "greaterThan": "بیشتر از",
    "lessThan": "کمتر از",
}

_ROUTE_LABELS = {
    process_service.ROUTE_COMPLETE: "پایان موفق پرونده",
    process_service.ROUTE_REJECT: "رد نهایی پرونده",
}

#: Field types the applicant chat panel can render today (see ``ChatPanel.tsx``).
UI_FIELD_TYPES = {"text", "textarea", "number", "tel", "email", "date", "select", "checkbox"}

_MAX_TEXT_LINES = 40


def _as_list(value: Any) -> list:
    return value if isinstance(value, list) else []


def _as_dict(value: Any) -> dict:
    return value if isinstance(value, dict) else {}


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _label(field: dict) -> str:
    return (
        _text(field.get("label"))
        or _text(field.get("title"))
        or _text(field.get("name"))
        or _text(field.get("id"))
        or "بدون عنوان"
    )


def _walk(fields: list) -> list[dict]:
    """Depth-first leaf fields, parents before their children (sections only group)."""
    output: list[dict] = []
    for raw in fields:
        field = _as_dict(raw)
        if field.get("type") != "section":
            output.append(field)
        output.extend(_walk(_as_list(field.get("subFields"))))
    return output


def forms_map(db: Session) -> dict[str, dict]:
    """Tolerant form map: rich ``schema_json`` first, flat rows as fallback."""
    output: dict[str, dict] = {}
    for form in form_repo.list_forms(db, active_only=False):
        schema = _as_dict(form.schema_json)
        fields = schema.get("fields")
        if not isinstance(fields, list) or not fields:
            fields = [
                {
                    "id": item.name,
                    "label": item.label,
                    "type": item.type,
                    "required": item.required,
                }
                for item in form.fields
            ]
        output[form.id] = {
            "id": form.id,
            "title": form.title,
            "is_active": bool(form.is_active),
            "fields": fields,
            "payment": _as_dict(schema.get("payment")),
        }
    return output


def _assignee_text(assignee: Any) -> str:
    payload = _as_dict(assignee)
    kind = payload.get("kind")
    if kind == "applicant":
        return "متقاضی"
    if kind == "role":
        return "نقش سازمانی"
    if kind == "employee":
        return "کارمند"
    return "نامشخص"


# ------------------------------------------------------------------- extraction
def _documents(stages: list[dict], forms: dict[str, dict]) -> list[dict]:
    documents: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for stage in stages:
        stage_title = _text(stage.get("title")) or "مرحله"
        for form_id in _as_list(stage.get("formIds")):
            form = forms.get(str(form_id)) or {}
            form_title = _text(form.get("title")) or str(form_id)
            for field in _walk(_as_list(form.get("fields"))):
                if field.get("type") != "file":
                    continue
                label = _label(field)
                key = (label, form_title)
                if key in seen:
                    continue
                seen.add(key)
                documents.append(
                    {
                        "label": label,
                        "required": bool(field.get("required")),
                        "formId": str(form_id),
                        "formTitle": form_title,
                        "stageTitle": stage_title,
                    }
                )
    return documents


def _fees(
    definition: dict, stages: list[dict], forms: dict[str, dict]
) -> list[dict]:
    fees: list[dict] = []
    seen: set[tuple[str, int | None]] = set()

    def add(label: str, amount: Any, note: str, form_title: str = "", stage_title: str = "") -> None:
        value = amount if isinstance(amount, int) and amount > 0 else None
        key = (label, value)
        if key in seen:
            return
        seen.add(key)
        fees.append(
            {
                "label": label,
                "amount": value,
                "note": note,
                "formTitle": form_title,
                "stageTitle": stage_title,
            }
        )

    for stage in stages:
        stage_title = _text(stage.get("title")) or "مرحله"
        for form_id in _as_list(stage.get("formIds")):
            form = forms.get(str(form_id)) or {}
            form_title = _text(form.get("title")) or str(form_id)
            form_payment = _as_dict(form.get("payment"))
            if isinstance(form_payment.get("defaultAmount"), int):
                add(
                    f"هزینه فرم «{form_title}»",
                    form_payment.get("defaultAmount"),
                    "مبلغ پیش‌فرض فرم",
                    form_title,
                    stage_title,
                )
            for field in _walk(_as_list(form.get("fields"))):
                if field.get("type") != "payment":
                    continue
                payment = _as_dict(field.get("payment"))
                source = _text(payment.get("amountSource")) or "fixed"
                if source == "fixed":
                    add(_label(field), payment.get("defaultAmount"), "مبلغ ثابت", form_title, stage_title)
                elif source == "process_variable":
                    add(_label(field), None, "از متغیر محاسباتی پروسه", form_title, stage_title)
                else:
                    add(_label(field), None, "محاسبه‌شده هنگام تکمیل فرم", form_title, stage_title)

    process_payment = _as_dict(definition.get("payment"))
    if _text(process_payment.get("mode")) == "fixed" and isinstance(process_payment.get("amount"), int):
        add("هزینه پروسه", process_payment.get("amount"), "مبلغ ثابت پروسه")

    for computed in _as_list(definition.get("computedFields")):
        payload = _as_dict(computed)
        if _as_dict(payload.get("destination")).get("kind") != "payment_amount":
            continue
        add(_text(payload.get("name")) or "مبلغ محاسبه‌شده", None, "محاسبه‌شده در جریان پرونده")

    return fees


def _duration(stages: list[dict]) -> tuple[int, str]:
    """Sum of SLA days along the default path (fallback: all stages, start to end)."""
    if not stages:
        return 0, "default-path"
    by_id = {_text(stage.get("id")): stage for stage in stages if _text(stage.get("id"))}
    total = 0
    visited: set[str] = set()
    current = _as_dict(stages[0])
    while current:
        stage_id = _text(current.get("id"))
        if stage_id and stage_id in visited:
            break
        if stage_id:
            visited.add(stage_id)
        sla = current.get("slaDays")
        total += sla if isinstance(sla, int) and sla > 0 else 0
        next_id = _text(current.get("defaultNextStageId"))
        if not next_id or next_id in _ROUTE_LABELS:
            break
        current = _as_dict(by_id.get(next_id))
    if visited and all(not _text(stage.get("defaultNextStageId")) for stage in stages):
        total = sum(
            stage.get("slaDays")
            for stage in stages
            if isinstance(stage.get("slaDays"), int) and stage.get("slaDays") > 0
        )
        return total, "all-stages"
    return total, "default-path"


def _variable_labels(stages: list[dict], forms: dict[str, dict], definition: dict) -> dict[str, str]:
    labels: dict[str, str] = {}
    for form_id, form in forms.items():
        for field in _walk(_as_list(form.get("fields"))):
            key = f"{form_id}:{_text(field.get('id'))}"
            labels[key] = _label(field)
    for computed in _as_list(definition.get("computedFields")):
        payload = _as_dict(computed)
        labels[f"calc:{_text(payload.get('id'))}"] = _text(payload.get("name")) or "محاسبه"
    return labels


def _conditions(definition: dict, stages: list[dict], forms: dict[str, dict]) -> list[str]:
    labels = _variable_labels(stages, forms, definition)
    stage_titles = {
        _text(stage.get("id")): _text(stage.get("title")) or "مرحله" for stage in stages
    }
    output: list[str] = []
    for stage in stages:
        stage_title = _text(stage.get("title")) or "مرحله"
        for rule in _as_list(stage.get("routeRules")):
            payload = _as_dict(rule)
            clauses = _as_list(_as_dict(payload.get("condition")).get("clauses"))
            if not clauses:
                continue
            pieces: list[str] = []
            for clause in clauses:
                item = _as_dict(clause)
                variable = _text(item.get("variableId"))
                operator = OPERATOR_LABELS.get(_text(item.get("operator")), "برابر با")
                value = _text(item.get("value"))
                name = labels.get(variable, variable or "متغیر")
                pieces.append(f"{name} {operator} «{value}»" if value else f"{name} {operator}")
            target_id = _text(payload.get("nextStageId"))
            target = _ROUTE_LABELS.get(target_id) or stage_titles.get(target_id, "مرحله بعد")
            connector = " یا " if _text(_as_dict(payload.get("condition")).get("logic")) == "or" else " و "
            output.append(f"در «{stage_title}» اگر {connector.join(pieces)} → {target}")
    return output


# --------------------------------------------------------------------- summary
def build_summary(
    definition: dict,
    forms: dict[str, dict],
    *,
    process_id: str,
    code: str = "",
    title: str = "",
    department: str = "",
    version: str = "",
    published: bool = False,
    published_at: str | None = None,
) -> dict:
    """Derived values + overrides, ready for the API and the agent."""
    definition = _as_dict(definition)
    stages = [_as_dict(stage) for stage in _as_list(definition.get("stages"))]

    stage_rows = [
        {
            "index": index + 1,
            "id": _text(stage.get("id")),
            "title": _text(stage.get("title")) or f"مرحله {index + 1}",
            "assignee": _assignee_text(stage.get("assignee")),
            "slaDays": stage.get("slaDays") if isinstance(stage.get("slaDays"), int) else 0,
            "forms": [
                _text((forms.get(str(form_id)) or {}).get("title")) or str(form_id)
                for form_id in _as_list(stage.get("formIds"))
            ],
        }
        for index, stage in enumerate(stages)
    ]

    documents = _documents(stages, forms)
    fees = _fees(definition, stages, forms)
    duration, duration_basis = _duration(stages)
    conditions = _conditions(definition, stages, forms)

    overrides = _as_dict(definition.get("consultation"))
    override_documents = _text(overrides.get("requiredDocumentsText"))
    override_fees = _text(overrides.get("feesText"))
    override_prerequisites = _text(overrides.get("prerequisites"))
    override_days = overrides.get("estimatedDurationDays")
    override_days = override_days if isinstance(override_days, int) and override_days > 0 else None

    auto_documents_text = "؛ ".join(
        f"{item['label']}{' (الزامی)' if item['required'] else ''}" for item in documents
    )
    auto_fees_text = "؛ ".join(
        f"{fee['label']}: {fee['amount']:,} تومان" if fee["amount"] else f"{fee['label']}: {fee['note']}"
        for fee in fees
    )

    summary = {
        "processId": process_id,
        "code": code,
        "title": title,
        "department": department,
        "version": version,
        "published": published,
        "publishedAt": published_at,
        "stages": stage_rows,
        "requiredDocuments": documents,
        "fees": fees,
        "conditions": conditions,
        "auto": {
            "requiredDocumentsText": auto_documents_text,
            "feesText": auto_fees_text,
            "estimatedDurationDays": duration,
            "estimatedDurationBasis": duration_basis,
        },
        "overrides": {
            key: value
            for key, value in {
                "requiredDocumentsText": override_documents or None,
                "feesText": override_fees or None,
                "estimatedDurationDays": override_days,
                "prerequisites": override_prerequisites or None,
            }.items()
            if value is not None
        },
        "requiredDocumentsText": override_documents or auto_documents_text,
        "feesText": override_fees or auto_fees_text,
        "estimatedDurationDays": override_days or duration,
        "estimatedDurationBasis": "manual" if override_days else duration_basis,
        "prerequisites": override_prerequisites,
    }
    summary["summaryText"] = summary_text(summary)
    return summary


def summary_text(summary: dict) -> str:
    """Compact Persian brief; this is what the LLM reads verbatim."""
    lines = [
        f"پروسه «{summary['title']}»"
        + (f" (کد {summary['code']})" if summary.get("code") else "")
        + (f" — واحد {summary['department']}" if summary.get("department") else "")
    ]
    if summary.get("published") is False:
        lines.append("توجه: این پروسه هنوز منتشر نشده است.")
    stages = summary.get("stages") or []
    if stages:
        lines.append("مراحل:")
        for stage in stages:
            forms = "، ".join(stage.get("forms") or []) or "بدون فرم"
            lines.append(
                f"  {stage['index']}. {stage['title']} — {stage['assignee']} — "
                f"{stage['slaDays']} روز — فرم: {forms}"
            )
    if summary.get("requiredDocumentsText"):
        lines.append(f"مدارک لازم: {summary['requiredDocumentsText']}")
    if summary.get("feesText"):
        lines.append(f"هزینه‌ها: {summary['feesText']}")
    if summary.get("estimatedDurationDays"):
        lines.append(f"مدت تقریبی: {summary['estimatedDurationDays']} روز")
    if summary.get("prerequisites"):
        lines.append(f"پیش‌نیازها: {summary['prerequisites']}")
    if summary.get("conditions"):
        lines.append("شرایط مسیر:")
        lines.extend(f"  - {condition}" for condition in summary["conditions"])
    return "\n".join(lines[:_MAX_TEXT_LINES])


def summary_for_definition(
    definition: dict,
    forms: dict[str, dict],
    *,
    process_id: str,
    code: str = "",
    title: str = "",
    department: str = "",
    version: str = "",
    published: bool = False,
    published_at: str | None = None,
) -> dict:
    return build_summary(
        definition,
        forms,
        process_id=process_id,
        code=code,
        title=title,
        department=department,
        version=version,
        published=published,
        published_at=published_at,
    )


def consultation_summary(db: Session, row: ProcessDefinitionRow) -> dict:
    """Published snapshot wins; drafts are served (flagged) until the first publish."""
    definition = _as_dict(row.published_json) or _as_dict(row.draft_json)
    return summary_for_definition(
        definition,
        forms_map(db),
        process_id=row.id,
        code=row.code,
        title=row.title,
        department=row.department,
        version=row.version_label,
        published=bool(row.published_json),
        published_at=row.published_at.isoformat() if row.published_at else None,
    )


def summary_text_for(db: Session, process_id: str) -> str | None:
    row = db.get(ProcessDefinitionRow, process_id)
    if row is None or row.is_deleted or not row.published_json:
        return None
    return consultation_summary(db, row)["summaryText"]


def list_published(db: Session) -> list[dict]:
    rows = db.scalars(
        select(ProcessDefinitionRow)
        .where(
            ProcessDefinitionRow.published_json.is_not(None),
            ProcessDefinitionRow.is_deleted.is_(False),
        )
        .order_by(ProcessDefinitionRow.title)
    ).all()
    return [
        {
            "id": row.id,
            "code": row.code,
            "title": row.title,
            "department": row.department,
            "version": row.version_label,
            "description": row.description or "",
            "publishedAt": row.published_at.isoformat() if row.published_at else None,
        }
        for row in rows
    ]


def list_text(db: Session) -> str:
    """Catalogue injected into the system prompt; details come from tool calls."""
    processes = list_published(db)
    if not processes:
        return "هیچ پروسه منتشرشده‌ای ثبت نشده است."
    return "\n".join(
        f"- {item['id']} | {item['title']} | {item['department']} | نسخه {item['version']}"
        for item in processes
    )


# ------------------------------------------------------------------ chat payload
def _ui_form(form_id: str, form: dict) -> dict | None:
    """Map a stored form definition to the payload ``ChatPanel`` understands."""
    fields: list[dict] = []
    for field in _walk(_as_list(form.get("fields"))):
        field_type = _text(field.get("type"))
        if field_type not in UI_FIELD_TYPES:
            continue
        fields.append(
            {
                "name": _text(field.get("id")) or _text(field.get("name")),
                "label": _label(field),
                "type": field_type,
                "required": bool(field.get("required")),
                "placeholder": field.get("placeholder"),
                "helpText": field.get("helpText"),
                "options": field.get("options"),
            }
        )
    if not fields:
        return None
    return {
        "form_id": form_id,
        "title": _text(form.get("title")) or form_id,
        "submit_label": _text(form.get("submitLabel")) or _text(form.get("submit_label")) or "ارسال",
        "description": form.get("description"),
        "fields": fields,
    }


def process_payload(db: Session, process_id: str) -> dict | None:
    """Stages plus the form the applicant must fill first (for the chat presenter)."""
    row = db.get(ProcessDefinitionRow, process_id)
    if row is None or row.is_deleted or not row.published_json:
        return None
    definition = _as_dict(row.published_json)
    forms = forms_map(db)
    stages = []
    for index, raw_stage in enumerate(_as_list(definition.get("stages"))):
        stage = _as_dict(raw_stage)
        stages.append(
            {
                "index": index + 1,
                "title": _text(stage.get("title")) or f"مرحله {index + 1}",
                "assignee": _assignee_text(stage.get("assignee")),
                "slaDays": stage.get("slaDays") if isinstance(stage.get("slaDays"), int) else 0,
                "forms": [
                    _text((forms.get(str(form_id)) or {}).get("title")) or str(form_id)
                    for form_id in _as_list(stage.get("formIds"))
                ],
            }
        )

    form: dict | None = None
    for stage in _as_list(definition.get("stages")):
        payload = _as_dict(stage)
        if _assignee_text(payload.get("assignee")) != "متقاضی":
            continue
        for form_id in _as_list(payload.get("formIds")):
            resolved = form_service.get_form(db, str(form_id))
            if resolved is not None and resolved.get("fields"):
                form = resolved
                break
            raw = forms.get(str(form_id)) or {}
            form = _ui_form(str(form_id), raw)
            if form is not None:
                break
        if form is not None:
            break

    return {
        "process_id": row.id,
        "title": row.title,
        "version": row.version_label,
        "stages": stages,
        "form": copy.deepcopy(form),
    }
