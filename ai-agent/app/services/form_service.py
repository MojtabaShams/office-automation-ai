"""Dynamic form registry.

Source of truth is the ``forms/*.json`` directory (authored by admins). Files are
normalised, validated and mirrored into PostgreSQL so that the agent, the API and the
submission validator all read a single definition.
"""

from __future__ import annotations

import copy
import hashlib
import json
import logging
import re
import secrets
from dataclasses import dataclass, field
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import Conflict, NotFound, ValidationError
from app.models.form import Form
from app.repositories import form_repo

from . import field_rules, system_forms

logger = logging.getLogger(__name__)

FORM_ID_RE = re.compile(r"^[a-z][a-z0-9_]{2,63}$")
FIELD_NAME_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]{0,63}$")
SUPPORTED_FIELD_TYPES = {
    "text",
    "textarea",
    "number",
    "tel",
    "email",
    "password",
    "select",
    "checkbox",
    "date",
    "time",
    "section",
    "group",
    "repeater",
    "radio",
    "boolean",
    "file",
    "payment",
    "computed",
}


@dataclass(slots=True)
class FormDefinition:
    id: str
    title: str
    submit_label: str
    fields: list[dict] = field(default_factory=list)
    category: str = "general"
    description: str | None = None
    footer_links: list[dict] = field(default_factory=list)
    requirements: list[dict] = field(default_factory=list)
    sort_order: int = 0

    def to_schema(self) -> dict:
        """Canonical camelCase representation persisted in ``forms.schema_json``."""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "category": self.category,
            "submitLabel": self.submit_label,
            "footerLinks": self.footer_links,
            "requirements": self.requirements,
            "fields": self.fields,
        }

    def to_ui(self) -> dict:
        """Payload consumed by ``ChatPanel.tsx`` (``AgentForm`` type)."""
        return {
            "form_id": self.id,
            "title": self.title,
            "submit_label": self.submit_label,
            "description": self.description,
            "category": self.category,
            "fields": [
                {
                    "name": field_["name"],
                    "label": field_.get("label") or field_["name"],
                    "type": field_.get("type", "text"),
                    "required": bool(field_.get("required", False)),
                    "placeholder": field_.get("placeholder"),
                    "pattern": field_.get("pattern"),
                    "minLength": field_.get("minLength"),
                    "maxLength": field_.get("maxLength"),
                    "minValue": field_.get("minValue"),
                    "maxValue": field_.get("maxValue"),
                    "options": field_.get("options"),
                    "helpText": field_.get("helpText"),
                    "tooltip": field_.get("tooltip"),
                    "guidance": field_.get("guidance"),
                    "ragContext": field_.get("ragContext"),
                    "subFields": field_.get("subFields"),
                    "condition": field_.get("condition"),
                    "visibleIf": field_.get("visibleIf"),
                    "requiredIf": field_.get("requiredIf"),
                    "validation": field_.get("validation"),
                    "allowedFileTypes": field_.get("allowedFileTypes"),
                    "maxFileSizeMb": field_.get("maxFileSizeMb"),
                    "minFiles": field_.get("minFiles"),
                    "maxFiles": field_.get("maxFiles"),
                    "minRows": field_.get("minRows"),
                    "maxRows": field_.get("maxRows"),
                    "unit": field_.get("unit"),
                    "payment": field_.get("payment"),
                    "computed": field_.get("computed"),
                }
                for field_ in self.fields
            ],
            "footer_links": self.footer_links,
            "requirements": self.requirements,
        }


def _as_list(value) -> list:
    return value if isinstance(value, list) else []


def _first_value(raw: dict, *keys: str):
    """Return the first present (not ``None``) value so that ``0`` stays valid."""
    for key in keys:
        if raw.get(key) is not None:
            return raw[key]
    return None


def _normalize_field(raw: dict) -> dict:
    name = str(raw.get("name") or raw.get("slug") or raw.get("id") or "").strip()
    field_type = str(raw.get("type") or "text").strip().lower()
    canonical_type = {
        "radio": "select",
        "boolean": "checkbox",
        "tel": "tel",
        "email": "email",
    }.get(field_type, field_type)
    label = str(raw.get("label") or name).strip()
    if name and not FIELD_NAME_RE.match(name):
        name = re.sub(r"[^a-zA-Z0-9_]+", "_", name).strip("_")
    if not name or not FIELD_NAME_RE.match(name):
        raise ValidationError(f"نام فیلد «{name}» معتبر نیست (حروف انگلیسی، عدد و _ مجاز است).")
    if field_type not in SUPPORTED_FIELD_TYPES:
        raise ValidationError(f"نوع فیلد «{field_type}» پشتیبانی نمی‌شود.")

    options = raw.get("options")
    if field_type in {"select", "radio"}:
        options = [
            str(option.get("label") or option.get("value"))
            if isinstance(option, dict)
            else str(option)
            for option in _as_list(options)
            if str(option.get("label") or option.get("value") if isinstance(option, dict) else option).strip()
        ]
        if not options:
            raise ValidationError(f"فیلد انتخابی «{label}» باید گزینه داشته باشد.")

    # Nested / hierarchical sub-fields (sections, repeaters, groups).
    sub_raw = raw.get("subFields") or raw.get("sub_fields") or raw.get("children") or raw.get("fields")
    sub_fields = None
    if isinstance(sub_raw, list):
        sub_fields = []
        for item in sub_raw:
            if isinstance(item, dict):
                sub_fields.append(_normalize_field(item))

    # Conditional logic: show/hide or required based on other field values.
    condition = None
    for key in ("condition", "visibleIf", "visible_if", "showIf", "show_if", "displayIf"):
        if isinstance(raw.get(key), dict):
            condition = raw.get(key)
            break
    required_if = None
    for key in ("requiredIf", "required_if", "requiredWhen", "required_when"):
        if isinstance(raw.get(key), dict):
            required_if = raw.get(key)
            break

    # Tooltips & RAG-based guidance.
    tooltip = raw.get("tooltip") or raw.get("title")  # keep title as fallback? maybe no
    # avoid overwriting; if title is field label? Actually tooltip separate. Let's not fallback to title.
    tooltip = raw.get("tooltip") or raw.get("toolTip")
    rag_context = raw.get("ragContext") or raw.get("rag_context") or raw.get("rag")
    guidance = raw.get("guidance") or raw.get("help") 

    return {
        "name": name,
        "label": label,
        "type": canonical_type,
        "required": bool(raw.get("required", False)),
        "placeholder": raw.get("placeholder"),
        "helpText": raw.get("helpText") or raw.get("help_text"),
        "tooltip": tooltip,
        "guidance": guidance,
        "ragContext": rag_context,
        "pattern": raw.get("pattern"),
        "minLength": raw.get("minLength") or raw.get("min_length"),
        "maxLength": raw.get("maxLength") or raw.get("max_length"),
        "minValue": _first_value(raw, "minValue", "min_value", "min"),
        "maxValue": _first_value(raw, "maxValue", "max_value", "max"),
        "defaultValue": raw.get("defaultValue") or raw.get("default_value"),
        "options": options,
        "subFields": sub_fields,
        "condition": condition,
        "visibleIf": condition,
        "requiredIf": required_if,
        "validation": raw.get("validation") if isinstance(raw.get("validation"), dict) else None,
        "allowedFileTypes": raw.get("allowedFileTypes") or raw.get("allowed_file_types"),
        "maxFileSizeMb": raw.get("maxFileSizeMb"),
        "minFiles": raw.get("minFiles"),
        "maxFiles": raw.get("maxFiles"),
        "minRows": raw.get("minRows"),
        "maxRows": raw.get("maxRows"),
        "unit": raw.get("unit"),
        "payment": raw.get("payment") if isinstance(raw.get("payment"), dict) else None,
        "computed": raw.get("computed") if isinstance(raw.get("computed"), dict) else None,
    }


def normalize_definition(raw: dict, *, fallback_id: str | None = None) -> FormDefinition:
    form_id = str(raw.get("id") or fallback_id or "").strip()
    if not FORM_ID_RE.match(form_id):
        raise ValidationError(f"شناسه فرم «{form_id}» معتبر نیست (مثال: leave_request).")

    title = str(raw.get("title") or "").strip()
    if not title:
        raise ValidationError("عنوان فرم الزامی است.")

    raw_fields = _as_list(raw.get("fields"))
    if not raw_fields:
        raise ValidationError("فرم باید حداقل یک فیلد داشته باشد.")

    fields: list[dict] = []
    seen: set[str] = set()
    for raw_field in raw_fields:
        if not isinstance(raw_field, dict):
            raise ValidationError("تعریف هر فیلد باید یک شیء JSON باشد.")
        field_ = _normalize_field(raw_field)
        if field_["name"] in seen:
            raise ValidationError(f"نام فیلد «{field_['name']}» تکراری است.")
        seen.add(field_["name"])
        fields.append(field_)

    requirements = []
    for group in _as_list(raw.get("requirements")):
        if isinstance(group, dict) and group.get("title"):
            requirements.append(
                {
                    "title": str(group["title"]),
                    "items": [str(item) for item in _as_list(group.get("items"))],
                }
            )
        elif isinstance(group, str):
            requirements.append({"title": group, "items": []})

    footer_links = [
        {"action": str(link.get("action")), "label": str(link.get("label"))}
        for link in _as_list(raw.get("footerLinks") or raw.get("footer_links"))
        if isinstance(link, dict) and link.get("action") and link.get("label")
    ]

    return FormDefinition(
        id=form_id,
        title=title,
        submit_label=str(raw.get("submitLabel") or raw.get("submit_label") or "ارسال"),
        fields=fields,
        category=str(raw.get("category") or "general"),
        description=raw.get("description"),
        footer_links=footer_links,
        requirements=requirements,
        sort_order=int(raw.get("sortOrder") or raw.get("sort_order") or 0),
    )


def definition_from_model(form: Form) -> FormDefinition:
    schema = dict(form.schema_json or {})
    schema.setdefault("id", form.id)
    schema.setdefault("title", form.title)
    schema.setdefault("submitLabel", form.submit_label)
    schema.setdefault("category", form.category)
    schema.setdefault("description", form.description)
    schema.setdefault("footerLinks", form.footer_links or [])
    schema.setdefault("requirements", form.requirements or [])
    schema.setdefault("fields", [_field_to_dict(field_) for field_ in form.fields])
    try:
        return normalize_definition(schema, fallback_id=form.id)
    except ValidationError:
        logger.warning("Stored schema for form %s is invalid; falling back to columns.", form.id)
        return FormDefinition(
            id=form.id,
            title=form.title,
            submit_label=form.submit_label,
            category=form.category,
            description=form.description,
            footer_links=form.footer_links or [],
            requirements=form.requirements or [],
            fields=[_field_to_dict(field_) for field_ in form.fields],
        )


def _field_to_dict(field_) -> dict:
    return {
        "name": field_.name,
        "label": field_.label,
        "type": field_.type,
        "required": field_.required,
        "placeholder": field_.placeholder,
        "helpText": field_.help_text,
        "pattern": field_.pattern,
        "minLength": field_.min_length,
        "maxLength": field_.max_length,
        "defaultValue": field_.default_value,
        "options": field_.options,
    }


# ------------------------------------------------------------------------- syncing
def _checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sync_forms_from_disk(db: Session, *, forms_dir: Path | None = None) -> dict:
    """Import every ``*.json`` form definition; returns a summary for the admin API."""
    forms_dir = forms_dir or settings.FORMS_DIR
    summary = {"imported": 0, "updated": 0, "unchanged": 0, "failed": 0, "errors": []}
    if not forms_dir.exists():
        return summary

    active_ids: set[str] = set()
    for path in sorted(forms_dir.glob("*.json")):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            definition = normalize_definition(raw, fallback_id=path.stem)
            active_ids.add(definition.id)
            _, changed = form_repo.upsert_form(
                db,
                form_id=definition.id,
                title=definition.title,
                submit_label=definition.submit_label,
                category=definition.category,
                description=definition.description,
                schema=definition.to_schema(),
                footer_links=definition.footer_links,
                requirements=definition.requirements,
                fields=definition.fields,
                kind="dynamic",
                checksum=_checksum(path),
                sort_order=definition.sort_order,
            )
            summary["updated" if changed else "unchanged"] += 1
        except Exception as exc:
            summary["failed"] += 1
            summary["errors"].append(f"{path.name}: {exc}")
            logger.warning("Form file %s could not be loaded: %s", path.name, exc)

    form_repo.deactivate_except(db, active_ids)
    summary["imported"] = summary["updated"]
    return summary


# ---------------------------------------------------------------------- read APIs
def list_forms(db: Session, *, active_only: bool = True, query: str | None = None) -> list[dict]:
    forms = form_repo.list_forms(db, active_only=active_only, query=query)
    payloads: list[dict] = []
    for form in forms:
        payload = definition_from_model(form).to_ui()
        payload["is_active"] = bool(form.is_active and not form.is_deleted)
        payload["status"] = "active" if payload["is_active"] else "inactive"
        payloads.append(payload)
    return payloads


def get_form(db: Session, form_id: str, *, active_only: bool = True) -> dict | None:
    form = form_repo.get_form(db, form_id, active_only=active_only)
    if form is None:
        return None
    return definition_from_model(form).to_ui()


def get_definition(db: Session, form_id: str) -> FormDefinition | None:
    form = form_repo.get_form(db, form_id, active_only=True)
    return definition_from_model(form) if form else None


def get_form_summary_text(db: Session) -> str:
    """Compact catalogue injected into the system prompt."""
    forms = form_repo.list_forms(db, active_only=True)
    if not forms:
        return "هیچ فرم فعالی ثبت نشده است."
    lines = []
    for form in forms:
        definition = definition_from_model(form)
        required = ", ".join(field_["label"] for field_ in definition.fields if field_.get("required"))
        lines.append(
            f"- {definition.id} | {definition.title} ({definition.category})\n"
            f"  توضیح: {definition.description or '—'}\n"
            f"  فیلدهای الزامی: {required or '—'}"
        )
    return "\n".join(lines)


def get_requirements_text(db: Session, form_id: str) -> str | None:
    definition = get_definition(db, form_id)
    if definition is None:
        return None
    lines = [f"فرم «{definition.title}» (شناسه: {definition.id})"]
    if definition.description:
        lines.append(definition.description)
    for group in definition.requirements:
        lines.append(f"\n{group['title']}:")
        lines.extend(f"  - {item}" for item in group.get("items", []))
    lines.append("\nفیلدهای فرم:")
    for field_ in definition.fields:
        required = " (الزامی)" if field_.get("required") else ""
        lines.append(f"  - {field_['label']} [{field_['type']}]{required}")
        guidance = field_.get("helpText") or field_.get("help_text")
        if guidance:
            lines.append(f"    راهنمای فیلد: {guidance}")
    return "\n".join(lines)


def get_field_guideline(db: Session, form_id: str, field_query: str) -> dict | None:
    """Return persisted field guidance, falling back to helpText in the form schema."""
    from app.models.field_guideline import FieldGuideline

    query = (field_query or "").strip().lower()
    definition = get_definition(db, form_id)
    if definition is None:
        return None

    def flatten(fields: list[dict]) -> list[dict]:
        flattened: list[dict] = []
        for field in fields:
            children = field.get("subFields") or field.get("sub_fields") or field.get("children")
            if isinstance(children, list):
                flattened.extend(flatten([item for item in children if isinstance(item, dict)]))
            elif field.get("type") not in {"section", "group"}:
                flattened.append(field)
        return flattened

    fields_by_name = {
        str(field.get("name") or field.get("slug") or field.get("id") or "").strip().lower(): field
        for field in flatten(definition.fields)
    }
    rows = db.query(FieldGuideline).filter(FieldGuideline.form_id == form_id).all()

    def guideline_payload(row: FieldGuideline) -> dict:
        return {
            "field_name": row.field_name,
            "description": row.description,
            "filling_rules": row.filling_rules,
            "examples": row.examples,
        }

    query_terms = {token for token in re.split(r"\s+", query) if len(token) >= 2}
    for row in rows:
        field_name = row.field_name.lower()
        field = fields_by_name.get(field_name, {})
        label = str(field.get("label") or "").strip().lower()
        if query and (
            query in field_name
            or field_name in query
            or (label and (query in label or label in query))
        ):
            return guideline_payload(row)
    for row in rows:
        field = fields_by_name.get(row.field_name.lower(), {})
        label = str(field.get("label") or "").strip().lower()
        label_terms = {token for token in re.split(r"\s+", label) if len(token) >= 2}
        if query_terms & label_terms:
            return guideline_payload(row)

    fields = flatten(definition.fields)
    for field in fields:
        name = str(field.get("name") or "").lower()
        label = str(field.get("label") or "").lower()
        if query and (
            query in name
            or query in label
            or name in query
            or label in query
        ):
            return {
                "field_name": field.get("name"),
                "description": field.get("helpText") or field.get("help_text") or "",
                "filling_rules": field.get("helpText") or field.get("help_text"),
                "examples": None,
            }
    scored_fields = [
        (
            len(query_terms & {
                token for token in re.split(
                    r"\s+",
                    f"{field.get('name') or ''} {field.get('label') or ''}".lower(),
                )
                if len(token) >= 2
            }),
            field,
        )
        for field in fields
    ]
    if scored_fields:
        highest_score = max(score for score, _ in scored_fields)
        best_fields = [field for score, field in scored_fields if score == highest_score]
        if highest_score and len(best_fields) == 1:
            field = best_fields[0]
            return {
                "field_name": field.get("name"),
                "description": field.get("helpText") or field.get("help_text") or "",
                "filling_rules": field.get("helpText") or field.get("help_text"),
                "examples": None,
            }
    return None


def sync_field_guidelines(db: Session, *, forms_dir: Path | None = None) -> int:
    """Persist field help, completion rules, and examples for every stored form."""
    from app.models.field_guideline import FieldGuideline

    forms_dir = forms_dir or settings.FORMS_DIR
    sources: dict[str, list] = {}
    for path in forms_dir.glob("*.json"):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Form guidance file %s could not be loaded: %s", path.name, exc)
            continue
        form_id = str(raw.get("id") or raw.get("formId") or "").strip()
        fields = raw.get("fields")
        if form_id and isinstance(fields, list):
            sources[form_id] = fields

    for form in form_repo.list_forms(db, active_only=False):
        fields = (form.schema_json or {}).get("fields")
        if isinstance(fields, list):
            sources.setdefault(form.id, fields)

    def flatten(fields: list) -> list[dict]:
        flattened: list[dict] = []
        for field in fields:
            if not isinstance(field, dict):
                continue
            children = field.get("subFields") or field.get("sub_fields") or field.get("children")
            if isinstance(children, list):
                flattened.extend(flatten(children))
            elif field.get("type") not in {"section", "group"}:
                flattened.append(field)
        return flattened

    def stringify(value: object) -> str | None:
        if value is None or value == "":
            return None
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        return str(value).strip() or None

    synced = 0
    for form_id, source_fields in sources.items():
        for field in flatten(source_fields):
            field_name = str(field.get("name") or field.get("slug") or field.get("id") or "").strip()
            description = stringify(
                field.get("description") or field.get("helpText") or field.get("help_text")
            )
            filling_rules = stringify(
                field.get("fillingRules") or field.get("filling_rules")
                or field.get("guidance") or field.get("rules")
            ) or description
            examples = stringify(field.get("examples") or field.get("example"))
            if not field_name or not any((description, filling_rules, examples)):
                continue
            row = db.scalars(
                select(FieldGuideline).where(
                    FieldGuideline.form_id == form_id,
                    FieldGuideline.field_name == field_name,
                )
            ).first()
            if row is None:
                db.add(FieldGuideline(
                    form_id=form_id,
                    field_name=field_name,
                    description=description or "",
                    filling_rules=filling_rules,
                    examples=examples,
                ))
            else:
                row.description = description or ""
                row.filling_rules = filling_rules
                row.examples = examples
            synced += 1
    db.commit()
    return synced


def find_form_id(db: Session, text: str) -> str | None:
    """Best-effort mapping from a user utterance to a form id."""
    normalized = (text or "").strip().lower()
    if not normalized:
        return None
    forms = form_repo.list_forms(db, active_only=True)
    for form in forms:
        if form.id.lower() in normalized:
            return form.id
    for form in forms:
        if form.title.replace("فرم", "").strip() in normalized:
            return form.id
    keywords = {
        "مرخصی": "leave_request",
        "ماموریت": "mission_request",
        "اضافه کاری": "overtime_request",
        "اضافه‌کاری": "overtime_request",
        "شکایت": "complaint",
        "انتقاد": "complaint",
        "پیشنهاد": "complaint",
    }
    for keyword, form_id in keywords.items():
        if keyword in normalized and form_repo.get_form(db, form_id, active_only=True):
            return form_id
    return None


# --------------------------------------------------------------------- write APIs
def save_form(db: Session, payload: dict, *, kind: str = "dynamic") -> dict:
    """Create or update a form from an admin-supplied JSON definition."""
    definition = normalize_definition(payload)
    existing = form_repo.get_form(db, definition.id, active_only=False)
    if existing is not None and existing.kind != kind:
        raise Conflict("این شناسه متعلق به یک فرم سیستمی است.")
    form_repo.upsert_form(
        db,
        form_id=definition.id,
        title=definition.title,
        submit_label=definition.submit_label,
        category=definition.category,
        description=definition.description,
        schema=definition.to_schema(),
        footer_links=definition.footer_links,
        requirements=definition.requirements,
        fields=definition.fields,
        kind=kind,
        checksum=None,
        sort_order=definition.sort_order,
    )
    return definition.to_ui()


def set_form_active(db: Session, form_id: str, active: bool) -> None:
    if not form_repo.set_active(db, form_id, active):
        raise NotFound("فرم یافت نشد.")


def delete_form(db: Session, form_id: str) -> dict:
    """Archive a form (soft delete). Rows are kept so submissions stay traceable."""
    form = form_repo.get_form(db, form_id, active_only=False)
    if form is None:
        raise NotFound("فرم یافت نشد.")
    if form.kind == "system":
        raise ValidationError("فرم‌های سیستمی قابل حذف نیستند.")
    form_repo.delete_form(db, form_id)
    return {"deleted": True, "deactivated": True, "message": "فرم آرشیو شد."}


# ------------------------------------------------------------- admin builder API
ADMIN_FORM_KIND = "admin"
ADMIN_FORM_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$")
ADMIN_FORM_STATUSES = {"active", "inactive", "draft", "archived"}
_ADMIN_TO_SIMPLE_FIELD = {
    "text": "text",
    "textarea": "textarea",
    "number": "number",
    "date": "date",
    "time": "time",
    "select": "select",
    "radio": "select",
    "boolean": "checkbox",
    "tel": "tel",
    "email": "email",
    "password": "password",
}


def _as_dict(value) -> dict:
    return value if isinstance(value, dict) else {}


def _walk_admin_fields(raw_fields: list) -> list[dict]:
    """Flatten sections/repeaters into their leaf fields, keeping author order."""
    leaves: list[dict] = []
    for raw in raw_fields:
        if not isinstance(raw, dict):
            continue
        field_type = str(raw.get("type") or "text").lower()
        if field_type in {"section", "repeater"}:
            leaves.extend(_walk_admin_fields(_as_list(raw.get("subFields"))))
            continue
        leaves.append(raw)
    return leaves


def _safe_field_name(raw: dict, index: int) -> str:
    candidate = str(raw.get("slug") or raw.get("id") or f"field_{index + 1}").strip()
    candidate = re.sub(r"[^A-Za-z0-9_]+", "_", candidate).strip("_")
    if not candidate:
        candidate = f"field_{index + 1}"
    if not FIELD_NAME_RE.match(candidate):
        candidate = f"field_{candidate}"[:64]
    return candidate


def _project_admin_fields(raw_fields: list) -> list[dict]:
    """Project admin fields onto the flat ``form_fields`` table for search/validation."""
    projected: list[dict] = []
    seen: set[str] = set()
    for index, raw in enumerate(_walk_admin_fields(raw_fields)):
        target_type = _ADMIN_TO_SIMPLE_FIELD.get(str(raw.get("type") or "text").lower())
        if target_type is None:  # file / payment / computed live only in schema_json
            continue
        name = _safe_field_name(raw, index)
        if name in seen:
            name = f"{name}_{index + 1}"[:64]
        seen.add(name)
        validation = _as_dict(raw.get("validation"))
        options = [str(option) for option in _as_list(raw.get("options")) if str(option).strip()]
        projected.append(
            {
                "name": name,
                "label": str(raw.get("label") or name),
                "type": target_type,
                "required": bool(raw.get("required")),
                "placeholder": raw.get("placeholder"),
                "helpText": raw.get("helpText") or raw.get("help_text"),
                "pattern": validation.get("pattern"),
                "minLength": validation.get("minLength"),
                "maxLength": validation.get("maxLength"),
                "options": options if target_type == "select" and options else None,
            }
        )
    return projected


def _legacy_to_admin_fields(fields: list[dict]) -> list[dict]:
    """Wrap registry fields in one section so the builder can edit them."""
    if not fields:
        return []
    back_map = {
        "text": "text",
        "textarea": "text",
        "number": "number",
        "date": "date",
        "time": "text",
        "select": "select",
        "checkbox": "boolean",
        "tel": "text",
        "email": "text",
        "password": "text",
    }
    return [
        {
            "id": "form-info",
            "label": "اطلاعات فرم",
            "type": "section",
            "required": False,
            "subFields": [
                {
                    "id": field_["name"],
                    "slug": field_["name"],
                    "label": field_.get("label") or field_["name"],
                    "type": back_map.get(field_.get("type", "text"), "text"),
                    "required": bool(field_.get("required")),
                    **({"options": field_["options"]} if field_.get("options") else {}),
                    **({"helpText": field_["helpText"]} if field_.get("helpText") else {}),
                }
                for field_ in fields
            ],
        }
    ]


def admin_form_payload(form: Form) -> dict:
    """Rebuild the admin builder's ``FormDefinition`` from the stored row."""
    schema = _as_dict(form.schema_json)
    if form.kind == ADMIN_FORM_KIND:
        fields = _as_list(schema.get("fields"))
        rules = _as_list(schema.get("rules"))
        form_type = str(schema.get("formType") or "standard")
        version = str(schema.get("version") or f"{form.version}.0")
        code = str(schema.get("code") or form.id.upper())
        department = str(schema.get("department") or form.category or "عمومی")
        icon = str(schema.get("icon") or "file")
        guidance = str(schema.get("applicantGuidance") or "")
        status = str(schema.get("status") or ("active" if form.is_active else "draft"))
    else:
        definition = definition_from_model(form)
        fields = _legacy_to_admin_fields([field_ for field_ in definition.fields])
        rules = []
        form_type = "standard"
        version = f"{form.version}.0"
        code = form.id.upper()
        department = form.category or "عمومی"
        icon = "file"
        guidance = definition.description or ""
        status = "active" if form.is_active else "inactive"
    if status not in ADMIN_FORM_STATUSES:
        status = "active" if form.is_active else "draft"

    payload = {
        "id": form.id,
        "code": code,
        "title": form.title,
        "department": department,
        "description": form.description or "",
        "icon": icon,
        "status": status,
        "version": version,
        "updatedAt": form.updated_at.isoformat() if form.updated_at else None,
        "formType": form_type,
        "fields": fields,
        "rules": rules,
        "applicantGuidance": guidance,
        "directiveFileNames": _as_list(schema.get("directiveFileNames")),
        "referenceDocuments": _as_list(schema.get("referenceDocuments")),
        "versions": _as_list(schema.get("versions")),
    }
    payment = schema.get("payment")
    if isinstance(payment, dict) and (payment.get("gatewayId") or payment.get("defaultAmount") is not None):
        payload["payment"] = payment
    if schema.get("sourceFileName"):
        payload["sourceFileName"] = schema["sourceFileName"]
    return payload


def list_admin_forms(db: Session, *, query: str | None = None) -> list[dict]:
    forms = form_repo.list_forms(db, active_only=False, query=query)
    return [admin_form_payload(form) for form in forms]


def get_admin_form(db: Session, form_id: str) -> dict | None:
    form = form_repo.get_form(db, form_id, active_only=False)
    return admin_form_payload(form) if form is not None else None


def save_admin_form(db: Session, payload: dict, *, actor_id: str | None = None) -> dict:
    """Create/update a builder-authored form; the raw camelCase schema is kept as-is."""
    raw = payload if isinstance(payload, dict) else {}
    form_id = str(raw.get("id") or "").strip()
    if form_id and not ADMIN_FORM_ID_RE.match(form_id):
        raise ValidationError("شناسه فرم معتبر نیست؛ فقط حروف انگلیسی، عدد، - و _ مجاز است.")
    if not form_id:
        form_id = f"form-{secrets.token_hex(6)}"

    title = str(raw.get("title") or "").strip()
    if not title:
        raise ValidationError("عنوان فرم الزامی است.")
    fields = _as_list(raw.get("fields"))
    if not fields:
        raise ValidationError("فرم باید حداقل یک فیلد داشته باشد.")

    existing = form_repo.get_form(db, form_id, active_only=False, include_deleted=True)
    if existing is not None and existing.kind == "system":
        raise Conflict("این شناسه متعلق به یک فرم سیستمی است.")

    status = str(raw.get("status") or "draft").strip().lower()
    if status not in ADMIN_FORM_STATUSES:
        status = "draft"

    schema = copy.deepcopy(raw)
    schema["id"] = form_id
    schema["title"] = title
    schema["status"] = status
    schema.setdefault("formType", "standard")

    version = int(existing.version or 0) + 1 if existing is not None else 1
    form, _ = form_repo.upsert_form(
        db,
        form_id=form_id,
        title=title,
        submit_label=str(raw.get("submitLabel") or "ارسال"),
        category=str(raw.get("department") or "عمومی").strip() or "عمومی",
        description=str(raw.get("description") or "") or None,
        schema=schema,
        footer_links=None,
        requirements=None,
        fields=_project_admin_fields(fields),
        kind=ADMIN_FORM_KIND,
        checksum=None,
        sort_order=int(raw.get("sortOrder") or 0),
        is_active=status == "active",
        version=version,
    )
    logger.info("admin form saved: %s by %s (status=%s)", form_id, actor_id, status)
    return admin_form_payload(form)


def set_admin_form_status(db: Session, form_id: str, status: str) -> dict:
    """Flip the builder status stored in ``schema_json`` together with ``is_active``."""
    if status not in ADMIN_FORM_STATUSES:
        raise ValidationError("وضعیت فرم معتبر نیست.")
    form = form_repo.get_form(db, form_id, active_only=False)
    if form is None:
        raise NotFound("فرم یافت نشد.")
    schema = dict(form.schema_json or {})
    schema["status"] = status
    form.schema_json = schema
    form.is_active = status == "active"
    db.commit()
    db.refresh(form)
    return admin_form_payload(form)


# ---------------------------------------------------------------------- validation
def validate_submission(definition: FormDefinition, values: dict) -> dict:
    """Server-side validation mirroring the client rules; returns cleaned values."""
    if not isinstance(values, dict):
        raise ValidationError("ساختار مقادیر ارسالی معتبر نیست.")
    cleaned: dict = {}
    errors: list[str] = []

    # Flatten composite (section/group) fields into their leaves.
    flat_fields: list[dict] = []
    def _collect(fields):
        for f in fields or []:
            if isinstance(f, dict) and f.get("type") in {"section", "group"}:
                _collect(f.get("subFields") or [])
            else:
                flat_fields.append(f)
    _collect(definition.fields)

    for field_ in flat_fields:
        name = field_["name"]
        raw = values.get(name)
        # Conditional visibility: skip validation for hidden fields.
        visible_cond = field_.get("visibleIf") or field_.get("condition")
        if isinstance(visible_cond, dict) and not _eval_condition(visible_cond, values):
            cleaned[name] = "" if raw is None else raw
            continue
        # Required can be conditional.
        required = bool(field_.get("required"))
        required_if = field_.get("requiredIf")
        if isinstance(required_if, dict) and _eval_condition(required_if, values):
            required = True

        if field_["type"] == "repeater":
            rows = raw if isinstance(raw, list) else []
            minimum = field_.get("minRows")
            maximum = field_.get("maxRows")
            if required and not rows:
                errors.append(f"«{field_['label']}» حداقل یک ردیف دارد.")
            elif isinstance(minimum, int) and len(rows) < minimum:
                errors.append(f"«{field_['label']}» حداقل {minimum} ردیف باید داشته باشد.")
            elif isinstance(maximum, int) and len(rows) > maximum:
                errors.append(f"«{field_['label']}» حداکثر {maximum} ردیف می‌تواند داشته باشد.")
            for row_index, row in enumerate(rows):
                if not isinstance(row, dict):
                    errors.append(f"ردیف {row_index + 1} «{field_['label']}» معتبر نیست.")
                    continue
                for child in field_.get("subFields") or []:
                    if not isinstance(child, dict):
                        continue
                    child_name = str(child.get("name") or "").strip()
                    child_value = row.get(child_name)
                    if child.get("required") and (child_value is None or str(child_value).strip() == ""):
                        errors.append(f"«{child.get('label') or child_name}» در ردیف {row_index + 1} الزامی است.")
            cleaned[name] = rows
            continue

        if isinstance(raw, (list, dict)) or field_["type"] in {"file", "payment", "computed"}:
            if raw in (None, "", [], {}):
                if required:
                    errors.append(f"«{field_['label']}» الزامی است.")
                else:
                    cleaned[name] = raw or []
            else:
                cleaned[name] = raw
            continue

        value = "" if raw is None else str(raw).strip()

        if field_["type"] == "checkbox":
            checked = raw is True or value.lower() in {"true", "1", "on", "yes", "بله"}
            cleaned[name] = checked
            if required and not checked:
                errors.append(f"«{field_['label']}» باید تأیید شود.")
            continue

        if not value:
            if required:
                errors.append(f"«{field_['label']}» الزامی است.")
            else:
                cleaned[name] = ""
            continue

        if len(value) > 2000:
            errors.append(f"«{field_['label']}» بیش از حد طولانی است.")
            continue

        options = field_.get("options") or []
        if field_["type"] == "select" and options and value not in options:
            errors.append(f"مقدار «{field_['label']}» باید یکی از گزینه‌های مجاز باشد.")
            continue

        if field_["type"] == "number":
            cleaned_value, error = field_rules.check_field_value(field_, value)
            if error:
                errors.append(error)
                continue
            # Numbers stay strings in storage so existing submissions/tests are stable.
            cleaned[name] = value
            continue

        cleaned_value, error = field_rules.check_field_value(field_, value)
        if error:
            errors.append(error)
            continue

        cleaned[name] = cleaned_value

    if errors:
        raise ValidationError(" ".join(errors[:4]))
    return cleaned


def _eval_condition(condition: dict | None, values: dict) -> bool:
    """Evaluate a simple ConditionValue against a values dict."""
    if not isinstance(condition, dict):
        return True
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
        actual_str = "" if actual is None else str(actual).strip()
        expected_str = "" if expected is None else str(expected).strip()
        if op in {"equals", "eq", "equal"}:
            res = actual_str == expected_str
        elif op in {"notEquals", "ne", "notEqual"}:
            res = actual_str != expected_str
        elif op in {"greaterThan", "gt"}:
            try:
                res = float(actual_str) > float(expected_str)
            except (TypeError, ValueError):
                res = actual_str > expected_str
        elif op in {"lessThan", "lt"}:
            try:
                res = float(actual_str) < float(expected_str)
            except (TypeError, ValueError):
                res = actual_str < expected_str
        elif op in {"greaterThanOrEqual", "gte"}:
            try:
                res = float(actual_str) >= float(expected_str)
            except (TypeError, ValueError):
                res = actual_str >= expected_str
        elif op in {"lessThanOrEqual", "lte"}:
            try:
                res = float(actual_str) <= float(expected_str)
            except (TypeError, ValueError):
                res = actual_str <= expected_str
        elif op in {"contains"}:
            res = expected_str in actual_str
        elif op in {"isEmpty"}:
            res = actual_str == ""
        elif op in {"isNotEmpty"}:
            res = actual_str != ""
        else:
            res = True
        results.append(res)
    if logic == "or":
        return any(results) if results else True
    return all(results) if results else True


def builtin_form(kind: str) -> dict | None:
    if kind == "login":
        return system_forms.login_form()
    if kind == "register":
        return system_forms.register_form()
    return None
