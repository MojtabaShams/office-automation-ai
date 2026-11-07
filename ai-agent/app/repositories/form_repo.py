from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.base import utcnow
from app.models.form import Form, FormField


def get_form(
    db: Session, form_id: str, *, active_only: bool = False, include_deleted: bool = False
) -> Form | None:
    stmt = select(Form).options(selectinload(Form.fields)).where(Form.id == form_id)
    if active_only:
        stmt = stmt.where(Form.is_active.is_(True))
    if not include_deleted:
        stmt = stmt.where(Form.is_deleted.is_(False))
    return db.scalar(stmt)


def list_forms(
    db: Session,
    *,
    active_only: bool = True,
    category: str | None = None,
    query: str | None = None,
    limit: int | None = None,
    include_deleted: bool = False,
) -> list[Form]:
    stmt = select(Form).options(selectinload(Form.fields))
    if active_only:
        stmt = stmt.where(Form.is_active.is_(True))
    if not include_deleted:
        stmt = stmt.where(Form.is_deleted.is_(False))
    if category:
        stmt = stmt.where(Form.category == category)
    if query:
        like = f"%{query.strip()}%"
        stmt = stmt.where(func.concat(Form.title, " ", func.coalesce(Form.description, "")).ilike(like))
    stmt = stmt.order_by(Form.sort_order, Form.title)
    if limit:
        stmt = stmt.limit(limit)
    return list(db.scalars(stmt))


def count_forms(db: Session, *, active_only: bool = True) -> int:
    stmt = select(func.count()).select_from(Form).where(Form.is_deleted.is_(False))
    if active_only:
        stmt = stmt.where(Form.is_active.is_(True))
    return int(db.scalar(stmt) or 0)


def upsert_form(
    db: Session,
    *,
    form_id: str,
    title: str,
    submit_label: str,
    category: str,
    description: str | None,
    schema: dict,
    footer_links: list | None,
    requirements: list | None,
    fields: list[dict],
    kind: str = "dynamic",
    checksum: str | None = None,
    sort_order: int = 0,
    replace_fields: bool = True,
    is_active: bool = True,
    version: int | None = None,
) -> tuple[Form, bool]:
    """Insert or update a form definition.

    Returns ``(form, changed)``; ``changed`` is ``False`` when the stored checksum matched
    so callers can skip re-indexing.
    """
    form = db.get(Form, form_id)
    changed = True

    if form is None:
        form = Form(id=form_id, kind=kind)
        db.add(form)
    elif checksum and form.checksum == checksum and form.kind == kind:
        changed = False

    form.title = title
    form.submit_label = submit_label
    form.category = category
    form.description = description
    form.schema_json = schema
    form.footer_links = footer_links
    form.requirements = requirements
    form.kind = kind
    form.checksum = checksum
    form.sort_order = sort_order
    form.is_active = is_active
    # Re-saving an archived form (same id) revives it; the row was never removed.
    form.is_deleted = False
    form.deleted_at = None
    if version is not None and version > 0:
        form.version = version
    elif changed and form.version:
        form.version = form.version + 1

    if changed and replace_fields:
        for existing in list(form.fields):
            db.delete(existing)
        db.flush()
        for index, field in enumerate(fields):
            db.add(
                FormField(
                    form_id=form_id,
                    name=field["name"],
                    label=field.get("label") or field["name"],
                    type=field.get("type") or "text",
                    required=bool(field.get("required", False)),
                    placeholder=field.get("placeholder"),
                    help_text=field.get("helpText") or field.get("help_text"),
                    pattern=field.get("pattern"),
                    min_length=field.get("minLength") or field.get("min_length"),
                    max_length=field.get("maxLength") or field.get("max_length"),
                    default_value=field.get("defaultValue") or field.get("default_value"),
                    options=field.get("options"),
                    order_index=index,
                )
            )

    db.commit()
    db.refresh(form)
    return form, changed


def set_active(db: Session, form_id: str, active: bool) -> bool:
    form = db.get(Form, form_id)
    if form is None or form.is_deleted:
        return False
    form.is_active = active
    db.commit()
    return True


def delete_form(db: Session, form_id: str) -> bool:
    """Archive a form. Business rows are never removed so submissions keep their form."""
    form = db.get(Form, form_id)
    if form is None or form.is_deleted:
        return False
    form.is_deleted = True
    form.is_active = False
    form.deleted_at = utcnow()
    db.commit()
    return True


def deactivate_except(db: Session, keep_ids: set[str]) -> int:
    """Hide forms that disappeared from the registry (e.g. a JSON file was removed)."""
    forms = list(
        db.scalars(
            select(Form).where(
                Form.kind == "dynamic", Form.is_active.is_(True), Form.is_deleted.is_(False)
            )
        )
    )
    changed = 0
    for form in forms:
        if form.id not in keep_ids:
            form.is_active = False
            changed += 1
    if changed:
        db.commit()
    return changed
